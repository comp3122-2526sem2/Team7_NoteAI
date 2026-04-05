# Keyword File-Attachment Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract structural section headings from uploaded documents by sending raw file bytes directly to OpenAI Chat Completions (base64 inline attachment), persisting results in `Document.keyword_cache` at upload time, so the lesson plan UI always gets a cache hit.

**Architecture:** New `openai_client/file_attachment.py` provides a standalone `chat_complete_with_file_bytes` helper (same wire format as `courses._call_llm_with_file`, zero changes to that file). `document_keywords.py` gains two new functions: `extract_keyword_items_from_file_bytes` (single LLM call, up to 60 items) and `extract_and_cache_keywords` (writes to DB, never raises). `_process_document_upload` in `chapters.py` calls the new function after embed succeeds. The lazy GET and refresh paths fall back to reading the original file from disk before attempting the legacy markdown path.

**Cost optimisation:** The new file-bytes path makes **one** LLM call per upload (vs. the existing lazy path which makes up to two — `verify` + possibly `enrich`). Cache keying is by `file_sha256` so a re-upload of the same bytes is a cache hit. The `dedupe_preserve_order` function gains a `max_items` parameter so the 60-item cap is applied in the same pass as deduplication, not in a second truncation.

**N+1 prevention:** `get_or_compute_keyword_items` reads the file from disk with `asyncio.to_thread` (one non-blocking read). No loop over documents is introduced.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy (sync session in bg task), OpenAI Python SDK (async), `asyncio.to_thread` for disk I/O.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| **Create** | `backend/openai_client/file_attachment.py` | `chat_complete_with_file_bytes` — base64 file attachment helper |
| **Modify** | `backend/document_keywords.py` | New extraction functions, `max_items` param, version bump, updated cache logic |
| **Modify** | `backend/routers/chapters.py` | Add `content_type` to bg task signature; keyword step after embed commit |
| **Modify** | `frontend/components/lesson-plan/lesson-plan-materials-scope.tsx` | Copy tweak, staleTime 24h→5m |
| **Modify** | Chapter page upload handler (identified below) | Invalidate `chapter-doc-keywords` query after upload |

---

## Task 1: New OpenAI file-attachment helper

**Files:**
- Create: `backend/openai_client/file_attachment.py`

- [ ] **Step 1: Create the file**

```python
# backend/openai_client/file_attachment.py
"""
OpenAI Chat Completions helper for inline file attachments.

Mirrors the base64 file-attachment wire format used by courses._call_llm_with_file,
extracted here so document_keywords and other modules can share it without
importing from routers.

courses.py and openai_client/__init__.py are NOT touched.
"""
from __future__ import annotations

import base64
from typing import Any

from openai_client import get_client, get_model

__all__ = ["chat_complete_with_file_bytes"]


async def chat_complete_with_file_bytes(
    file_bytes: bytes,
    content_type: str,
    filename: str,
    prompt: str,
    *,
    system: str = "Reply with valid JSON only: a JSON array of strings.",
    temperature: float = 0.2,
    max_tokens: int | None = None,
) -> str:
    """
    Send *file_bytes* as a base64 inline file attachment to Chat Completions.

    Wire format is identical to courses._call_llm_with_file — no chunking,
    no summarisation: the model reads the full document in a single request.

    Args:
        file_bytes:   Raw bytes of the file (PDF, DOCX, TXT, …).
        content_type: MIME type, e.g. "application/pdf".
        filename:     Original filename (used by the API for format detection).
        prompt:       User-turn text that accompanies the file.
        system:       System message.
        temperature:  Sampling temperature (default 0.2 for structured output).
        max_tokens:   Optional output token cap.

    Returns:
        The assistant reply as a plain string.
    """
    client = get_client()

    b64 = base64.b64encode(file_bytes).decode("utf-8")
    user_content: list[Any] = [
        {
            "type": "file",
            "file": {
                "filename": filename,
                "file_data": f"data:{content_type};base64,{b64}",
            },
        },
        {"type": "text", "text": prompt},
    ]

    kwargs: dict[str, Any] = {
        "model": get_model(),
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
        "temperature": temperature,
    }
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens

    resp = await client.chat.completions.create(**kwargs)
    return resp.choices[0].message.content or ""
```

- [ ] **Step 2: Verify import works**

From the repo root, confirm there are no syntax errors:
```bash
cd backend && python -c "from openai_client.file_attachment import chat_complete_with_file_bytes; print('OK')"
```
Expected: `OK` (will fail if OPENAI_API_KEY is missing at runtime, but import itself succeeds).

- [ ] **Step 3: Verify courses.py and openai_client/__init__.py are unchanged**

```bash
git diff backend/routers/courses.py backend/openai_client/__init__.py
```
Expected: no output (zero diff).

- [ ] **Step 4: Commit**

```bash
git add backend/openai_client/file_attachment.py
git commit -m "feat: add chat_complete_with_file_bytes helper in openai_client/file_attachment.py"
```

---

## Task 2: Update `dedupe_preserve_order` and `filter_heading_candidates` for configurable cap

**Files:**
- Modify: `backend/document_keywords.py` (functions `dedupe_preserve_order` and `filter_heading_candidates`)

**Context:** Both functions currently hard-code `MAX_HEADING_ITEMS = 30` as the loop exit. Adding an optional `max_items` parameter lets the file-bytes path request 60 items without a second truncation pass. All existing call-sites omit the parameter and continue to cap at 30.

- [ ] **Step 1: Update `dedupe_preserve_order`**

Find the function (line ~100) and change its signature and loop condition:

```python
def dedupe_preserve_order(items: list[str], max_items: int = MAX_HEADING_ITEMS) -> list[str]:
    seen_exact: set[str] = set()
    seen_chapter_suffixes: set[str] = set()
    result: list[str] = []
    for raw in items:
        text = " ".join(raw.split())
        if len(text) < MIN_HEADING_CHARS:
            continue
        if len(text) > MAX_CHAPTER_LINE_CHARS:
            continue
        cf = text.casefold()
        if cf in seen_exact:
            continue

        ch_key = _chapter_content_key(text)
        if ch_key:
            if ch_key in seen_chapter_suffixes:
                continue
            seen_chapter_suffixes.add(ch_key)
            seen_exact.add(cf)
            result.append(text)
            if len(result) >= max_items:
                break
            continue

        bare_key = _bare_chapter_fragment_key(text)
        if bare_key and bare_key in seen_chapter_suffixes:
            continue

        seen_exact.add(cf)
        result.append(text)
        if len(result) >= max_items:
            break
    return result
```

- [ ] **Step 2: Update `filter_heading_candidates`**

```python
def filter_heading_candidates(items: list[str], max_items: int = MAX_HEADING_ITEMS) -> list[str]:
    kept: list[str] = []
    for raw in items:
        line = " ".join(raw.split()).strip()
        if is_garbage_or_corrupt(line):
            continue
        if is_likely_qa_or_list_body_line(line):
            continue
        if reject_as_body_not_title(line):
            continue
        kept.append(line)

    return dedupe_preserve_order(kept, max_items=max_items)
```

- [ ] **Step 3: Verify existing call-sites still work**

All existing callers pass no `max_items`, so the default of `MAX_HEADING_ITEMS = 30` applies. Check none of the other callers in the file pass the old positional-only style:

```bash
grep -n "filter_heading_candidates\|dedupe_preserve_order" backend/document_keywords.py
```

Confirm every call is either:
- `filter_heading_candidates(items)` — uses default 30
- `dedupe_preserve_order(items)` — uses default 30

If any call passes a second positional argument, update it to use `max_items=`.

- [ ] **Step 4: Commit**

```bash
git add backend/document_keywords.py
git commit -m "refactor: add optional max_items param to dedupe_preserve_order and filter_heading_candidates"
```

---

## Task 3: New keyword extraction functions in `document_keywords.py`

**Files:**
- Modify: `backend/document_keywords.py`

Add at the top of the file (after existing imports):
```python
import asyncio
from pathlib import Path
```
(Only add if not already present.)

Add the new constant after `MAX_HEADING_ITEMS`:
```python
FILE_LLM_MAX_ITEMS = 60  # cap for the file-bytes LLM path (full document, higher precision)
```

- [ ] **Step 1: Add `_KEYWORD_EXTRACTION_PROMPT` constant**

Add this constant near the other module-level constants (after `FILE_LLM_MAX_ITEMS`):

```python
_KEYWORD_EXTRACTION_SYSTEM = "Reply with valid JSON only: a JSON array of strings."

_KEYWORD_EXTRACTION_PROMPT = (
    "Extract structural section titles from the attached document for a lesson planning checklist.\n\n"
    "INCLUDE only:\n"
    "- Chapter openers (e.g. 第一章..., Chapter 1..., Unit 1...)\n"
    "- Numbered section labels (e.g. (1) ..., Section 2.3..., 第一節...)\n"
    "- Very short standalone subsection labels (a few words, clearly not a full sentence)\n\n"
    "EXCLUDE completely:\n"
    "- Body sentences, explanations, and notes\n"
    "- Q&A lines, numbered steps (1. 2. 3.), procedure lists\n"
    "- Page numbers, footers, running headers with page info\n"
    "- Lines longer than ~60 characters unless clearly a single chapter title\n\n"
    f"Output at most {FILE_LLM_MAX_ITEMS} items. Language may match the document "
    "(Chinese/English mix is fine). Prefer completeness over brevity — include all genuine "
    "structural headings rather than a curated short list.\n"
    "Output: JSON array of strings only. No markdown, no commentary."
)
```

- [ ] **Step 2: Add `extract_keyword_items_from_file_bytes`**

Add after the existing `enrich_keywords_with_llm` function:

```python
async def extract_keyword_items_from_file_bytes(
    file_bytes: bytes,
    content_type: str,
    filename: str,
) -> list[str]:
    """
    Extract structural section titles from raw file bytes via Chat Completions file attachment.

    One LLM call — no chunking, no RAG, no dependency on converted_markdown.
    Returns at most FILE_LLM_MAX_ITEMS (60) filtered, deduped title strings.
    """
    from openai_client.file_attachment import chat_complete_with_file_bytes

    raw_response = await chat_complete_with_file_bytes(
        file_bytes,
        content_type,
        filename,
        _KEYWORD_EXTRACTION_PROMPT,
        system=_KEYWORD_EXTRACTION_SYSTEM,
        temperature=0.2,
    )
    parsed = parse_json_string_array(raw_response)
    return filter_heading_candidates(parsed, max_items=FILE_LLM_MAX_ITEMS)
```

- [ ] **Step 3: Add `extract_and_cache_keywords`**

Add immediately after `extract_keyword_items_from_file_bytes`:

```python
async def extract_and_cache_keywords(
    doc: Any,
    file_bytes: bytes,
    content_type: str,
    db: Any,
) -> None:
    """
    Run file-bytes keyword extraction and persist results to doc.keyword_cache.

    Never raises — all exceptions are logged and swallowed so callers
    (e.g. _process_document_upload) can continue without interruption.

    Cache schema written:
      {
        "version": KEYWORD_CACHE_VERSION,   # int
        "file_sha256": "<hex>",
        "content_sha256": null,
        "items": ["..."],
        "updated_at": "<ISO datetime>"
      }
    """
    from datetime import datetime, timezone

    try:
        file_sha256 = hashlib.sha256(file_bytes).hexdigest()
        items = await extract_keyword_items_from_file_bytes(
            file_bytes, content_type, doc.original_filename
        )
        doc.keyword_cache = {
            "version": KEYWORD_CACHE_VERSION,
            "file_sha256": file_sha256,
            "content_sha256": None,
            "items": items,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        db.add(doc)
        db.commit()
        logger.info(
            "keyword_cache written: doc_id=%s items=%d file_sha256=%.8s",
            doc.id, len(items), file_sha256,
        )
    except Exception:
        logger.exception(
            "extract_and_cache_keywords failed for doc_id=%s — keyword_cache unchanged",
            doc.id,
        )
```

- [ ] **Step 4: Commit**

```bash
git add backend/document_keywords.py
git commit -m "feat: add extract_keyword_items_from_file_bytes and extract_and_cache_keywords"
```

---

## Task 4: Bump cache version and update `get_or_compute_keyword_items`

**Files:**
- Modify: `backend/document_keywords.py`

**Context:** `KEYWORD_CACHE_VERSION` must go from 5 → 6 so existing `content_sha256`-only caches are automatically invalidated. The cache check gains a `file_sha256` branch; the compute path prefers reading the original file from disk.

- [ ] **Step 1: Bump `KEYWORD_CACHE_VERSION`**

Change line:
```python
KEYWORD_CACHE_VERSION = 5
```
to:
```python
KEYWORD_CACHE_VERSION = 6
```

- [ ] **Step 2: Replace `get_or_compute_keyword_items`**

Replace the entire existing function with:

```python
async def get_or_compute_keyword_items(doc: Any, db: Any) -> tuple[list[str], bool]:
    """
    Return (items, cached) for a document.

    Cache validity (version 6):
      - Branch 1 (file_sha256): cache["file_sha256"] is set AND the file on disk hashes
        to the same value. This is the normal path after upload-time extraction.
      - Branch 2 (content_sha256): cache["file_sha256"] is None AND
        cache["content_sha256"] matches hash of converted_markdown.
        Used only for legacy caches (written before version 6) or when the file
        no longer exists on disk and keywords were derived from markdown.
        NOTE: a cache entry written by extract_and_cache_keywords always has
        file_sha256 set (not None), so it will never match branch 2. Branch 2
        exists only for backwards-compat. If branch 1 fails due to a transient
        read error, execution falls through to recompute (branch 3) — this is
        intentional: we never serve a stale file-sha256 cache on a read error.

    Compute order when cache is invalid/missing:
      1. If doc.original_file_path exists on disk → file-bytes LLM path (max 60 items).
         The file is read once with asyncio.to_thread; the SHA256 is computed from those
         same bytes (no second read).
      2. Else → markdown heuristic + LLM verify path (max 30 items).

    Disk I/O uses asyncio.to_thread to avoid blocking the event loop.
    """
    from datetime import datetime, timezone
    from pathlib import Path

    cache = parse_keyword_cache(doc.keyword_cache)
    file_path = Path(doc.original_file_path) if doc.original_file_path else None

    # ── 1. file_sha256 cache hit ──────────────────────────────────────────────
    # Only enter this branch when cache has a file_sha256 and the file still exists.
    if (
        cache is not None
        and cache.get("version") == KEYWORD_CACHE_VERSION
        and cache.get("file_sha256")  # not None / not empty
        and isinstance(cache.get("items"), list)
        and file_path is not None
        and file_path.exists()
    ):
        try:
            file_bytes = await asyncio.to_thread(file_path.read_bytes)
            if hashlib.sha256(file_bytes).hexdigest() == cache["file_sha256"]:
                stored = [str(x) for x in cache["items"] if isinstance(x, str)]
                return filter_heading_candidates(stored, max_items=FILE_LLM_MAX_ITEMS), True
            # SHA mismatch → file changed → fall through to recompute below.
            # file_bytes is reused in branch 3 via local variable.
        except Exception:
            logger.warning("Could not read file for sha256 check: %s — will recompute", file_path)
            file_bytes = None  # type: ignore[assignment]
    else:
        file_bytes = None  # type: ignore[assignment]

    # ── 2. content_sha256 cache hit (legacy: file_sha256 is None in cache) ────
    body = (doc.converted_markdown or "").strip()
    content_hash = hash_converted_text(body)

    if (
        cache is not None
        and cache.get("version") == KEYWORD_CACHE_VERSION
        and not cache.get("file_sha256")  # None or missing — legacy entry
        and cache.get("content_sha256") == content_hash
        and isinstance(cache.get("items"), list)
    ):
        stored = [str(x) for x in cache["items"] if isinstance(x, str)]
        return filter_heading_candidates(stored), True

    # ── 3. Compute: prefer file-bytes LLM path ────────────────────────────────
    # Re-use file_bytes read above (branch 1 partial read); if it was None (read
    # failed or file didn't exist then), try reading again now.
    if file_path is not None and file_path.exists():
        try:
            if file_bytes is None:
                file_bytes = await asyncio.to_thread(file_path.read_bytes)
            ext_to_mime = {
                "pdf":  "application/pdf",
                "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "doc":  "application/msword",
                "txt":  "text/plain",
                "md":   "text/markdown",
            }
            ext = (doc.original_file_type or "").lower()
            content_type = ext_to_mime.get(ext, "application/octet-stream")
            items = await extract_keyword_items_from_file_bytes(
                file_bytes, content_type, doc.original_filename or "document"
            )
            # Compute SHA from the bytes we already have — no second disk read.
            file_sha256 = hashlib.sha256(file_bytes).hexdigest()
            doc.keyword_cache = {
                "version": KEYWORD_CACHE_VERSION,
                "file_sha256": file_sha256,
                "content_sha256": None,
                "items": items,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            db.add(doc)
            db.commit()
            db.refresh(doc)
            return items, False
        except Exception:
            logger.exception(
                "File-bytes keyword extraction failed for doc_id=%s; falling back to markdown",
                doc.id,
            )

    # ── 4. Markdown heuristic + LLM verify (legacy fallback) ─────────────────
    if not body:
        return [], True

    items = collect_heuristic_candidates(body)

    try:
        if len(items) > 0:
            items = await verify_candidates_with_llm(body, items)
        items = filter_heading_candidates(items)
        if len(items) < MIN_ITEMS_AFTER_VERIFY_BEFORE_ENRICH:
            items = await enrich_keywords_with_llm(body, items)
        else:
            items = items[:MAX_HEADING_ITEMS]
    except Exception:
        logger.exception("LLM keyword verify/enrich failed; using heuristic list only.")
        items = filter_heading_candidates(items)[:MAX_HEADING_ITEMS]

    items = filter_heading_candidates(items)[:MAX_HEADING_ITEMS]

    doc.keyword_cache = {
        "version": KEYWORD_CACHE_VERSION,
        "file_sha256": None,
        "content_sha256": content_hash,
        "items": items,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return items, False
```

- [ ] **Step 3: Verify syntax**

```bash
cd backend && python -c "import document_keywords; print('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/document_keywords.py
git commit -m "feat: update get_or_compute_keyword_items — file-bytes path, file_sha256 cache key, version 6"
```

---

## Task 5: Hook keyword extraction into `_process_document_upload`

**Files:**
- Modify: `backend/routers/chapters.py`

**Context:** `_process_document_upload` currently has this signature:
```python
async def _process_document_upload(
    doc_id: uuid.UUID,
    chapter_id: uuid.UUID,
    file_bytes: bytes,
    original_filename: str,
) -> None:
```

We add `content_type: str` as a fifth parameter, and insert a keyword extraction step **after** `doc.conversion_status = ConversionStatus.completed` + `db.commit()` (line ~414) but **before** the student fan-out loop.

- [ ] **Step 1: Update `_process_document_upload` signature**

```python
async def _process_document_upload(
    doc_id: uuid.UUID,
    chapter_id: uuid.UUID,
    file_bytes: bytes,
    original_filename: str,
    content_type: str,
) -> None:
```

- [ ] **Step 2: Insert keyword extraction step**

Find the block (around line 414–418 in the original file):
```python
        doc.conversion_status = ConversionStatus.completed
        db.commit()
        logger.info("Document embedded successfully: doc_id=%s slug=%s", doc_id, teacher_slug)

        # ── 3. Best-effort fan-out to existing student workspaces ─────────────
```

Insert after the `logger.info(...)` line:

```python
        # ── 2b. Keyword extraction (file-bytes → Chat Completions) ─────────────
        # Runs after embed commit. Failure is logged and never blocks fan-out.
        try:
            from document_keywords import extract_and_cache_keywords
            await extract_and_cache_keywords(doc, file_bytes, content_type, db)
        except Exception:
            logger.exception(
                "Keyword extraction failed for doc_id=%s — student fan-out continues", doc_id
            )
```

- [ ] **Step 3: Update `upload_chapter_document` endpoint call-site**

Find the `background_tasks.add_task(...)` call (around line 493–499):

```python
    background_tasks.add_task(
        _process_document_upload,
        doc.id,
        chapter_id,
        file_bytes,
        file.filename,
    )
```

Change to:

```python
    background_tasks.add_task(
        _process_document_upload,
        doc.id,
        chapter_id,
        file_bytes,
        file.filename,
        file.content_type,
    )
```

- [ ] **Step 4: Verify syntax**

```bash
cd backend && python -c "from routers.chapters import _process_document_upload; print('OK')"
```
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/routers/chapters.py
git commit -m "feat: extract keywords at upload time in _process_document_upload"
```

---

## Task 6: Frontend — copy tweak, staleTime reduction, post-upload invalidation

**Files:**
- Modify: `frontend/components/lesson-plan/lesson-plan-materials-scope.tsx`
- Modify: Chapter page (find upload handler below)

### Part A — `lesson-plan-materials-scope.tsx`

- [ ] **Step 1: Update description copy**

Find the `<Text type="secondary"...>` block that currently reads:
```
勾選要納入教案產生嘅檔案。下列候選以<strong>章節／小標題</strong>為主（唔係問答或內文摘句）；轉檔亂碼會自動略過。可按「重抽」用最新抽取規則重算。
```

Replace with:
```tsx
        <Text type="secondary" style={{ fontSize: 13, display: "block", marginBottom: 10 }}>
          勾選要納入教案產生嘅檔案。下列候選由<strong>原始上傳檔直接分析</strong>（唔係問答或內文摘句）；轉檔亂碼會自動略過。可按「重抽」重新分析。
        </Text>
```

- [ ] **Step 2: Reduce `staleTime`**

Find:
```typescript
      staleTime: 1000 * 60 * 60 * 24,
```
Change to:
```typescript
      staleTime: 1000 * 60 * 5,
```

### Part B — Post-upload invalidation in chapter page

- [ ] **Step 3: Find the chapter page upload handler**

Run:
```bash
grep -rn "uploadDocument\|upload.*document\|chaptersApi.*upload" frontend/app --include="*.tsx" -l
```

Open the file(s) returned. Find the handler where `chaptersApi.uploadDocument` (or equivalent) is called and the response is handled after success.

- [ ] **Step 4: Add post-upload invalidation**

In the upload success handler, after the upload mutation's `onSuccess` (or after the `await` call succeeds), add:

```typescript
qc.invalidateQueries({
  queryKey: ["chapter-doc-keywords", courseId, chapterId],
});
```

If using a TanStack Query `useMutation`, add inside `onSuccess`:
```typescript
onSuccess: () => {
  message.success("上傳成功");
  qc.invalidateQueries({ queryKey: ["documents", courseId, chapterId] });
  qc.invalidateQueries({ queryKey: ["chapter-doc-keywords", courseId, chapterId] });
},
```

- [ ] **Step 5: Lint check**

```bash
cd frontend && npm run lint
```
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/lesson-plan/lesson-plan-materials-scope.tsx
git add frontend/app   # or the specific chapter page file
git commit -m "feat: update keywords UI copy, reduce staleTime, invalidate on upload"
```

---

## Task 7: Smoke test end-to-end

This is a manual verification checklist. No automated tests exist in this repo.

- [ ] **Step 1: Start the stack**

```bash
docker compose up
```

- [ ] **Step 2: Upload a PDF to a chapter**

Via the UI or `curl`:
```bash
curl -X POST http://localhost:8000/courses/{course_id}/chapters/{chapter_id}/documents/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/test.pdf" \
  -F "document_type=other"
```
Note the returned `doc.id`.

- [ ] **Step 3: Verify keyword_cache is populated in DB**

Wait ~10–30 seconds for the background task to complete, then:
```bash
docker compose exec postgres psql -U noteai -d noteai -c \
  "SELECT id, conversion_status, keyword_cache->>'file_sha256' as sha, \
   jsonb_array_length(keyword_cache->'items') as item_count \
   FROM document WHERE id = '<doc_id>';"
```
Expected: `conversion_status = completed`, `sha` = 64-char hex string, `item_count` > 0.

- [ ] **Step 4: Verify GET /keywords returns cache hit**

```bash
curl -s http://localhost:8000/courses/{course_id}/chapters/{chapter_id}/documents/{doc_id}/keywords \
  -H "Authorization: Bearer <token>" | python -m json.tool
```
Expected: `"cached": true`, `"items": [...]` with structural headings.

- [ ] **Step 5: Verify syllabus generation is unaffected**

Upload a course syllabus file and trigger syllabus generation. Confirm it completes normally.

- [ ] **Step 6: Test refresh**

```bash
curl -X POST http://localhost:8000/courses/{course_id}/chapters/{chapter_id}/documents/{doc_id}/keywords/refresh \
  -H "Authorization: Bearer <token>" | python -m json.tool
```
Expected: `"cached": false` on first call (freshly computed), new `items` list returned.

- [ ] **Step 7: Test OpenAI failure resilience (optional)**

Temporarily set `OPENAI_API_KEY=invalid` in the backend container, upload a new document, verify `conversion_status = completed` (embed succeeded) and `keyword_cache = null` in DB. Restore the key.

---

## Constraints Checklist (verify before merging)

- [ ] `git diff backend/routers/courses.py` — no changes
- [ ] `git diff backend/openai_client/__init__.py` — no changes
- [ ] No new Alembic migration files
- [ ] `npm run lint` passes with no new errors
- [ ] All existing keyword GET / refresh endpoints return valid `DocumentKeywordsOut` JSON
