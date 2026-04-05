# Design Spec: Keyword Extraction Race Condition Fix

**Date:** 2026-04-05  
**Status:** Approved  
**Approach:** Sentinel value in `keyword_cache` JSONB column (Plan A)

---

## Problem

A race condition exists between two code paths that both write to `document.keyword_cache`:

1. **Background task** (`_process_document_upload`) — fires an LLM call via `extract_and_cache_keywords` after `conversion_status` is committed as `completed`.
2. **Lazy GET endpoint** (`GET /{chapter_id}/documents/{doc_id}/keywords`) — calls `get_or_compute_keyword_items`, which fires its own LLM call if `keyword_cache` is `NULL` or stale.

The window between Commit 1 (`conversion_status = completed`) and Commit 2 (`keyword_cache` written by background task) allows the GET endpoint to observe a `NULL` cache and independently spawn a second LLM call. Both calls run concurrently. The last `db.commit()` wins, silently discarding the other result and wasting LLM tokens.

---

## Solution: `"extracting"` Sentinel in `keyword_cache`

Use the existing nullable JSONB `keyword_cache` column to store a sentinel value before the LLM call begins. The sentinel signals to all other code paths that extraction is already in progress.

### Sentinel Shape

```json
{
  "version": 6,
  "status": "extracting",
  "items": [],
  "extracting_since": "2026-04-05T12:00:00+00:00"
}
```

- `version` — must match `KEYWORD_CACHE_VERSION` (currently `6`) so cache-hit logic does not mis-read it.
- `status` — `"extracting"` signals in-progress; all completed entries have no `status` key (or `status != "extracting"`).
- `items` — empty list, safe to return if caller inspects the value directly.
- `extracting_since` — ISO timestamp used for stale-sentinel detection (timeout).

### Stale Sentinel Timeout

If the background task crashes after writing the sentinel but before writing the real result, the sentinel would block all future GET calls forever. Guard: if `extracting_since` is more than **10 minutes** in the past, the sentinel is considered stale and the GET endpoint is allowed to re-run extraction (as if no cache existed).

`EXTRACTING_SENTINEL_TIMEOUT_SECONDS = 600`

---

## Code Changes

### `backend/document_keywords.py`

#### New constant

```python
EXTRACTING_SENTINEL_TIMEOUT_SECONDS = 600  # 10 minutes
```

#### New helper: `_is_extracting(cache) -> bool`

```python
def _is_extracting(cache: dict | None) -> bool:
    """Return True if cache holds a live extracting sentinel."""
    if not isinstance(cache, dict):
        return False
    if cache.get("status") != "extracting":
        return False
    extracting_since_str = cache.get("extracting_since")
    if not extracting_since_str:
        return True  # sentinel present but no timestamp → treat as live
    try:
        extracting_since = datetime.fromisoformat(extracting_since_str)
        elapsed = (datetime.now(timezone.utc) - extracting_since).total_seconds()
        return elapsed < EXTRACTING_SENTINEL_TIMEOUT_SECONDS
    except Exception:
        return True  # malformed timestamp → be conservative, treat as live
```

#### Modified: `extract_and_cache_keywords`

The **current function** wraps its entire body in a single `try/except` block (lines 460–484 of the current file). This must be restructured into two distinct phases:

1. **Phase 1 (outside any try):** Write sentinel + `db.commit()` — this must always execute before the LLM call begins, with no exception handling that could skip it.
2. **Phase 2 (inside try/except):** LLM call → write real cache on success, clear sentinel to `NULL` on failure.

```python
async def extract_and_cache_keywords(doc, file_bytes, content_type, db) -> None:
    # Phase 1: write sentinel BEFORE any LLM call — no try/except here
    doc.keyword_cache = {
        "version": KEYWORD_CACHE_VERSION,
        "status": "extracting",
        "items": [],
        "extracting_since": datetime.now(timezone.utc).isoformat(),
    }
    db.add(doc)
    db.commit()

    # Phase 2: LLM call — wrapped in try/except so failures never raise
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
        logger.info(...)
    except Exception:
        # Clear the sentinel so GET endpoint can retry via its own LLM path immediately
        doc.keyword_cache = None
        db.add(doc)
        db.commit()
        logger.exception(...)
```

**Important:** On LLM failure, the sentinel is cleared (set to `NULL`) so the GET endpoint's stale-sentinel timeout does not apply — the GET endpoint will fall through to its own extraction path immediately.

**Branch 2 safety note:** The sentinel has `file_sha256` absent and `content_sha256` absent. Branch 2 of `get_or_compute_keyword_items` requires `cache.get("content_sha256") == content_hash` to match — this can never be true for the sentinel (whose `content_sha256` is absent/None). However, the sentinel check at the top of `get_or_compute_keyword_items` fires before branch 2 is evaluated, so branch 2 never sees the sentinel in practice.

#### Modified: `get_or_compute_keyword_items`

Add a sentinel check at the very top, before all existing cache branches:

```python
async def get_or_compute_keyword_items(doc, db) -> tuple[list[str], bool]:
    cache = doc.keyword_cache

    # NEW: sentinel check — extraction already in progress
    if _is_extracting(cache):
        return [], False  # return empty, not cached — caller shows loading state

    # ... existing branches 1–4 unchanged ...
```

No changes to branches 1–4. The sentinel check is purely additive.

---

## Data Flow After Fix

```
_process_document_upload (background task)           GET /keywords (user request)
─────────────────────────────────────────            ─────────────────────────────
Commit 1: conversion_status = completed
Commit 2: keyword_cache = {status:"extracting"}
  LLM call in-flight...                 ──────────►  _is_extracting() → True
                                                      return [], cached=False  ✓
Commit 3: keyword_cache = {items:[...]}
                                         ──────────►  branch 1 cache hit
                                                      return items, cached=True ✓
```

---

## Error Cases

| Scenario | Behaviour |
|---|---|
| Background task LLM fails | Sentinel cleared → GET falls through to its own LLM path (branch 3) |
| Background task crashes hard (process kill) | Sentinel stays; after 10 min timeout, GET re-extracts |
| GET fires after Commit 3 (happy path) | Branch 1 cache hit, no LLM call |
| GET fires before Commit 2 (sentinel not yet written) | `keyword_cache` still `NULL`, GET falls through to branch 3 — this tiny window (~1 DB round-trip) is acceptable and self-correcting |

---

## Constraints

- **Zero schema migrations** — changes only `keyword_cache` JSONB content, no new columns.
- **No changes to `backend/routers/courses.py`** or `backend/openai_client/__init__.py`.
- **Keyword extraction failure must never fail the upload flow** — maintained: sentinel is written in its own try/except-free block; the LLM call remains wrapped in `try/except`.
- **All work on `main` branch.**

---

## Files Changed

| File | Change |
|---|---|
| `backend/document_keywords.py` | Add `EXTRACTING_SENTINEL_TIMEOUT_SECONDS`, `_is_extracting()`, modify `extract_and_cache_keywords`, add sentinel check at top of `get_or_compute_keyword_items` |

No frontend changes required. The frontend already handles `items: []` with `cached: false` gracefully (shows loading/empty state).

---

## Out of Scope

- Polling / real-time update on the frontend (separate concern).
- `POST .../keywords/refresh` endpoint — already bypasses cache by calling `get_or_compute_keyword_items` with a forced recompute flag; sentinel check does not affect it since refresh explicitly clears cache first.
