# Design: Keyword Extraction via File Attachment (Chat Completions)

**Date:** 2026-04-05
**Status:** Approved
**Scope:** Backend + minimal frontend copy/query tweak

---

## Problem

The current keyword extraction pipeline (`document_keywords.py`) works by:
1. Heuristic regex mining of `converted_markdown`
2. LLM verification of candidates, passing only the first 12,000 characters of converted text

This means: (a) keywords depend on AnythingLLM's text conversion quality, (b) the LLM never sees the full document, and (c) keywords are only computed lazily on the first GET request, so opening the lesson plan editor always triggers a slow computation.

---

## Goal

Extract structural section headings (章節／小標題) **once at upload time** by sending the raw uploaded file bytes directly to OpenAI Chat Completions as a base64 inline file attachment — no RAG, no chunking, no dependency on `converted_markdown`. Results are persisted to `Document.keyword_cache` so the first GET is always a cache hit.

---

## Constraints

- **Zero changes** to `backend/routers/courses.py` or `backend/openai_client/__init__.py`
- `courses._call_llm_with_file` and `_generate_syllabus_bg` must keep working as-is; no import changes required from their perspective
- No DB schema migrations (new information goes into the existing `keyword_cache` JSONB column)
- Keyword extraction failure must never fail the document upload / embed flow

---

## Architecture

### New Module: `backend/openai_client/file_attachment.py`

A standalone helper that mirrors the wire format of `courses._call_llm_with_file`:

```python
async def chat_complete_with_file_bytes(
    file_bytes: bytes,
    content_type: str,       # e.g. "application/pdf"
    filename: str,
    prompt: str,
    *,
    system: str = "Reply with valid JSON only: a JSON array of strings.",
    temperature: float = 0.2,
    max_tokens: int | None = None,
) -> str:
```

**Wire format (identical to `_call_llm_with_file`):**
```python
user_content = [
    {
        "type": "file",
        "file": {
            "filename": filename,
            "file_data": f"data:{content_type};base64,{b64}",
        },
    },
    {"type": "text", "text": prompt},
]
```

`courses.py` and `openai_client/__init__.py` are **not touched**.

---

### Changes to `backend/document_keywords.py`

#### New constants

```python
FILE_LLM_MAX_ITEMS = 60   # larger cap for the file-bytes path (full document)
```

`MAX_HEADING_ITEMS = 30` is kept for the markdown/heuristic fallback path.

#### `dedupe_preserve_order` cap fix

`dedupe_preserve_order` currently hard-codes `MAX_HEADING_ITEMS` (30) as its loop exit. To support 60 items on the file-bytes path, add an optional `max_items` parameter:

```python
def dedupe_preserve_order(items: list[str], max_items: int = MAX_HEADING_ITEMS) -> list[str]:
    ...
    if len(result) >= max_items:
        break
```

`filter_heading_candidates` (which calls `dedupe_preserve_order`) also gets the same optional parameter and passes it through. All existing call-sites omit the parameter and continue to cap at 30. The file-bytes path calls `filter_heading_candidates(items, max_items=FILE_LLM_MAX_ITEMS)` to allow up to 60.

#### New function: `extract_keyword_items_from_file_bytes`

```python
async def extract_keyword_items_from_file_bytes(
    file_bytes: bytes,
    content_type: str,
    filename: str,
) -> list[str]:
```

1. Calls `chat_complete_with_file_bytes` with the keyword extraction prompt (see below)
2. Parses response with `parse_json_string_array`
3. Passes results through `filter_heading_candidates(items, max_items=FILE_LLM_MAX_ITEMS)` + `dedupe_preserve_order` (with the 60-item cap)
4. Returns at most `FILE_LLM_MAX_ITEMS` (60) items

**Keyword extraction prompt:**

- **System:** `"Reply with valid JSON only: a JSON array of strings."`
- **User:**
  ```
  Extract structural section titles from the attached document for a lesson planning checklist.

  INCLUDE only:
  - Chapter openers (e.g. 第一章..., Chapter 1...)
  - Numbered section labels (e.g. (1) ..., Section 2.3...)
  - Very short standalone subsection labels (a few words, clearly not a sentence)

  EXCLUDE completely:
  - Body sentences, explanations, notes
  - Q&A lines, numbered steps (1. 2. 3.)
  - Page numbers, footers, headers with page info
  - Lines longer than ~60 characters unless clearly a single chapter title

  Output at most 60 items. Language may match the document (Chinese/English mix is fine).
  Prefer completeness over brevity — include all genuine structural headings.
  Output: JSON array of strings only. No markdown, no commentary.
  ```

#### New function: `extract_and_cache_keywords`

```python
async def extract_and_cache_keywords(
    doc: Any,           # Document ORM object
    file_bytes: bytes,
    content_type: str,
    db: Any,
) -> None:
```

1. Computes `file_sha256 = hashlib.sha256(file_bytes).hexdigest()`
2. Calls `extract_keyword_items_from_file_bytes`
3. Writes to `doc.keyword_cache`:
   ```json
   {
     "version": 6,
     "file_sha256": "<hex>",
     "content_sha256": null,
     "items": ["..."],
     "updated_at": "<ISO datetime>"
   }
   ```
4. `db.add(doc)` + `db.commit()`
5. On any exception: `logger.exception(...)` and return silently (never raises)

#### Updated `KEYWORD_CACHE_VERSION`

Bumped from `5` → `6`. This invalidates all existing caches (which only contain `content_sha256`, not `file_sha256`), forcing re-computation on next GET.

#### Updated cache validity logic in `get_or_compute_keyword_items`

```
cache valid if:
  cache["version"] == KEYWORD_CACHE_VERSION (6)
  AND (
       (cache["file_sha256"] is set AND matches SHA256 of current file bytes read from disk)
    OR (cache["file_sha256"] is None AND cache["content_sha256"] matches converted_markdown hash)
  )

compute order (when cache invalid or missing):
  1. If doc.original_file_path exists on disk → Path(doc.original_file_path).read_bytes()
     → file-bytes LLM path (max 60) → write cache → return
  2. Else → existing markdown heuristic + LLM verify path (max 30) → write cache → return
```

For the cache-validity file-sha256 check, `get_or_compute_keyword_items` reads the file from disk
internally (`Path(doc.original_file_path).read_bytes()`) to compute the SHA256. If the file no
longer exists, the function skips the file-sha256 branch and falls through to the `content_sha256`
check (markdown hash). The function signature does not change.

#### Updated refresh path

`refresh_chapter_document_keywords` clears `keyword_cache`, then calls `get_or_compute_keyword_items`.
The updated compute logic will automatically use the file-bytes path (reading `doc.original_file_path`) if the file still exists on disk.

---

### Changes to `backend/routers/chapters.py`

#### `_process_document_upload` signature update

Add `content_type: str` parameter (passed from the upload endpoint where `file.content_type` is already validated):

```python
async def _process_document_upload(
    doc_id: uuid.UUID,
    chapter_id: uuid.UUID,
    file_bytes: bytes,
    original_filename: str,
    content_type: str,          # NEW
) -> None:
```

#### New step inside `_process_document_upload`

Looking at the actual code flow (chapters.py:385–415), the existing sequence is:
1. AnythingLLM upload → set `doc.converted_markdown` (line 399) — **no commit yet**
2. `_embed_with_verification` (line 403)
3. `doc.conversion_status = ConversionStatus.completed` + `db.commit()` (line 414–415)

Insert keyword extraction **after step 3** (after the first successful `db.commit()`). This ensures `converted_markdown` is already persisted (useful for the fallback path) and avoids holding up the embed step:

```python
# ── 2. Embed into teacher workspace ──────────────────────────────
teacher_slug = await _ensure_teacher_workspace(chapter, db)
teacher_ok = await _embed_with_verification(client, teacher_slug, location)
if not teacher_ok:
    ...
    return

doc.conversion_status = ConversionStatus.completed
db.commit()
logger.info("Document embedded successfully: doc_id=%s slug=%s", doc_id, teacher_slug)

# ── 2b. [NEW] Keyword extraction — failure never blocks student fan-out ──
try:
    from document_keywords import extract_and_cache_keywords
    await extract_and_cache_keywords(doc, file_bytes, content_type, db)
    logger.info("Keywords cached for doc_id=%s", doc_id)
except Exception:
    logger.exception("Keyword extraction failed for doc_id=%s — continuing", doc_id)

# ── 3. Best-effort fan-out to existing student workspaces ────────
...
```

The embed flow (`_embed_with_verification`, student fan-out) is unchanged and continues regardless of keyword success/failure.

#### `upload_chapter_document` endpoint

Update the `background_tasks.add_task` call to pass `file.content_type`:

```python
background_tasks.add_task(
    _process_document_upload,
    doc.id,
    chapter_id,
    file_bytes,
    file.filename,
    file.content_type,    # NEW
)
```

#### GET and refresh endpoints

No change to endpoint signatures or `DocumentKeywordsOut` schema. `get_or_compute_keyword_items` is updated internally; endpoints benefit automatically. The `content_sha256` field in the response continues to return `hash_converted_text(converted_markdown)` for backwards compatibility.

---

### Changes to Frontend

#### `frontend/components/lesson-plan/lesson-plan-materials-scope.tsx`

**Copy update** — description line:

Current:
> 下列候選以**章節／小標題**為主（唔係問答或內文摘句）；轉檔亂碼會自動略過。可按「重抽」用最新抽取規則重算。

New:
> 下列候選由**原始上傳檔直接分析**（唔係問答或內文摘句）；轉檔亂碼會自動略過。可按「重抽」重新分析。

**`staleTime` reduction:**

```diff
- staleTime: 1000 * 60 * 60 * 24,
+ staleTime: 1000 * 60 * 5,
```

#### Chapter page — post-upload invalidation

In the chapter page's upload handler (wherever `chaptersApi.uploadDocument` is called), after a successful upload response, invalidate the keywords query so the UI refetches once the background task completes:

```typescript
qc.invalidateQueries({
  queryKey: ["chapter-doc-keywords", courseId, chapterId],
});
```

---

## Data Flow

```
Teacher uploads PDF
       │
       ▼
POST /documents/upload
  ├─ save file_bytes to disk (UPLOAD_DIR)
  ├─ create Document (status=pending)
  └─ schedule _process_document_upload(doc_id, chapter_id, file_bytes, filename, content_type)

_process_document_upload [background task]
  │
  ├─ AnythingLLM upload → doc.converted_markdown, db.commit()  [existing]
  │
  ├─ [NEW] extract_and_cache_keywords(doc, file_bytes, content_type, db)
  │       │
  │       └─ chat_complete_with_file_bytes(file_bytes, content_type, filename, prompt)
  │               └─ base64 encode → OpenAI Chat Completions (file + text prompt)
  │                   ← JSON array of structural titles
  │       │
  │       └─ parse → filter_heading_candidates → dedupe (max 60)
  │       └─ doc.keyword_cache = {version:6, file_sha256:..., items:[...]}
  │       └─ db.commit()
  │       └─ on failure: logger.exception only — does NOT raise
  │
  └─ _embed_with_verification → student fan-out → conversion_status=completed  [existing]

GET /documents/{doc_id}/keywords
  ├─ cache valid (version=6, file_sha256 matches) → return immediately (cached=True)
  └─ cache miss → get_or_compute_keyword_items
       ├─ file on disk → file-bytes LLM path → write cache → return
       └─ no file on disk → markdown heuristic + LLM verify → write cache → return
```

---

## Files Changed

| File | Type | Description |
|---|---|---|
| `backend/openai_client/file_attachment.py` | **New** | `chat_complete_with_file_bytes` helper |
| `backend/document_keywords.py` | Modified | New functions, updated cache logic, version 5→6 |
| `backend/routers/chapters.py` | Modified | Add `content_type` param; keyword step in bg task |
| `frontend/components/lesson-plan/lesson-plan-materials-scope.tsx` | Modified | Copy tweak, staleTime 24h→5m |
| Chapter page upload handler | Modified | Invalidate keywords query after upload |

**Not touched:** `backend/routers/courses.py`, `backend/openai_client/__init__.py`, `backend/models/document.py`, no Alembic migration.

---

## Implementation Notes

- **`content_type` validation:** The upload endpoint already validates `file.content_type` against `ALLOWED_TYPES` and returns HTTP 400 for unsupported types before the background task is scheduled. `chat_complete_with_file_bytes` passes `content_type` through as-is; OpenAI rejects unsupported types on its end.
- **Disk read in async context:** The `get_or_compute_keyword_items` function reads the file from disk synchronously to compute SHA256 for cache validation. This blocking I/O should be wrapped with `asyncio.to_thread(Path(doc.original_file_path).read_bytes)` to avoid blocking the event loop. The same applies in `extract_and_cache_keywords` if it re-reads from disk rather than using the `file_bytes` already in memory.
- **Data flow diagram ordering note:** The diagram shows `conversion_status=completed` after the keyword step, but the prose (§ Changes to `_process_document_upload`) is correct: the first `db.commit()` (setting `conversion_status=completed`) happens **before** step 2b. Follow the prose.

---

## Verification Checklist

1. Upload a PDF → `Document.keyword_cache` populated in DB before lesson plan UI is opened
2. `GET /keywords` returns `cached: true` immediately after upload completes
3. Syllabus upload / `_generate_syllabus_bg` flow unchanged — smoke test syllabus generation
4. Refresh: clears cache → reads disk file → re-extracts → returns updated list
5. OpenAI failure: `keyword_cache` stays null/old; embed still succeeds; `conversion_status = completed`
6. File deleted from disk (edge case): fallback to markdown heuristic path without error
7. `courses.py` and `openai_client/__init__.py` — no diff before and after
