# Keyword Extraction Race Condition Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent two concurrent LLM calls from firing for the same document's keyword extraction by writing an `"extracting"` sentinel into `keyword_cache` before the LLM call begins, causing the GET endpoint to return empty results instead of spawning a duplicate call.

**Architecture:** A single new helper `_is_extracting(cache)` checks for the sentinel at the top of `get_or_compute_keyword_items`. The function `extract_and_cache_keywords` is restructured into two phases: Phase 1 writes the sentinel unconditionally (no try/except), Phase 2 runs the LLM call in the existing try/except and clears the sentinel on failure.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy (sync sessions), PostgreSQL JSONB. No schema migrations. No new dependencies.

---

## File Map

| File | Change |
|---|---|
| `backend/document_keywords.py` | Add constant + helper + restructure one function + add sentinel check |

No other files are touched.

---

## Task 1: Add sentinel constant and `_is_extracting` helper

**Files:**
- Modify: `backend/document_keywords.py`

### Context

`document_keywords.py` already has a constant block near the top (e.g. `KEYWORD_CACHE_VERSION = 6`, `FILE_LLM_MAX_ITEMS`, etc.). Add the new timeout constant there.

The helper `_is_extracting(cache)` must be placed **before** `get_or_compute_keyword_items` (line 520) because it is called from that function.

There is no test framework in this repo. Verification is `python3 -m py_compile backend/document_keywords.py`.

- [ ] **Step 1: Add the timeout constant**

Open `backend/document_keywords.py`. Find the block of module-level constants (near `KEYWORD_CACHE_VERSION`). Add this constant immediately after `KEYWORD_CACHE_VERSION`:

```python
EXTRACTING_SENTINEL_TIMEOUT_SECONDS = 600  # 10 minutes
```

- [ ] **Step 2: Add the `_is_extracting` helper**

Find the line immediately before `async def get_or_compute_keyword_items` (currently line 520). Insert the following function **above** it (with a blank line separator):

```python
def _is_extracting(cache: dict | None) -> bool:
    """Return True if cache holds a live extracting sentinel.

    A sentinel is considered live if it was written within
    EXTRACTING_SENTINEL_TIMEOUT_SECONDS seconds. After the timeout, the
    sentinel is treated as stale (background task crashed) and callers are
    allowed to re-extract.
    """
    if not isinstance(cache, dict):
        return False
    if cache.get("status") != "extracting":
        return False
    extracting_since_str = cache.get("extracting_since")
    if not extracting_since_str:
        return True  # sentinel present but no timestamp → treat as live
    from datetime import datetime, timezone
    try:
        extracting_since = datetime.fromisoformat(extracting_since_str)
        elapsed = (datetime.now(timezone.utc) - extracting_since).total_seconds()
        return elapsed < EXTRACTING_SENTINEL_TIMEOUT_SECONDS
    except Exception:
        return True  # malformed timestamp → be conservative, treat as live
```

- [ ] **Step 3: Verify syntax**

```bash
python3 -m py_compile backend/document_keywords.py && echo "OK"
```

Expected: `OK` with no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/document_keywords.py
git commit -m "feat: add _is_extracting sentinel helper and EXTRACTING_SENTINEL_TIMEOUT_SECONDS"
```

---

## Task 2: Add sentinel check to `get_or_compute_keyword_items`

**Files:**
- Modify: `backend/document_keywords.py`

### Context

`get_or_compute_keyword_items` starts at line 520 (approximately — it shifts after Task 1 inserts lines). Its first real statement after the docstring is:

```python
from datetime import datetime, timezone

cache = parse_keyword_cache(doc.keyword_cache)
file_path = Path(doc.original_file_path) if doc.original_file_path else None
```

The sentinel check must be inserted **after** `cache = parse_keyword_cache(doc.keyword_cache)` and **before** Branch 1 (`# ── 1. file_sha256 cache hit`). This ensures all four existing branches are bypassed when a live sentinel is present.

- [ ] **Step 1: Insert sentinel check**

Find this block inside `get_or_compute_keyword_items`:

```python
    cache = parse_keyword_cache(doc.keyword_cache)
    file_path = Path(doc.original_file_path) if doc.original_file_path else None

    # ── 1. file_sha256 cache hit ──────────────────────────────────────────────
```

Replace it with:

```python
    cache = parse_keyword_cache(doc.keyword_cache)
    file_path = Path(doc.original_file_path) if doc.original_file_path else None

    # ── 0. Sentinel check — extraction already in progress ───────────────────
    # If the background task wrote a sentinel before its LLM call, return empty
    # results immediately rather than spawning a duplicate LLM call. The sentinel
    # expires after EXTRACTING_SENTINEL_TIMEOUT_SECONDS to handle crashed tasks.
    if _is_extracting(cache):
        return [], False

    # ── 1. file_sha256 cache hit ──────────────────────────────────────────────
```

- [ ] **Step 2: Verify syntax**

```bash
python3 -m py_compile backend/document_keywords.py && echo "OK"
```

Expected: `OK` with no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/document_keywords.py
git commit -m "feat: short-circuit get_or_compute_keyword_items when extraction sentinel is live"
```

---

## Task 3: Restructure `extract_and_cache_keywords` to write sentinel before LLM call

**Files:**
- Modify: `backend/document_keywords.py`

### Context

The current `extract_and_cache_keywords` function (lines 437–484) has a **single `try` block that wraps everything**, including both the LLM call and the DB write. This must be restructured into two phases:

**Phase 1 (outside any try):** Write sentinel to `doc.keyword_cache` and `db.commit()`. This MUST always execute before the LLM call, with no exception handling that could skip it.

**Phase 2 (inside try/except):** LLM call → write real cache on success, clear sentinel to `NULL` on failure (so the GET endpoint can retry immediately without waiting for the timeout).

The current function body to replace is exactly:

```python
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
            doc.id,
            len(items),
            file_sha256,
        )
    except Exception:
        logger.exception(
            "extract_and_cache_keywords failed for doc_id=%s — keyword_cache unchanged",
            doc.id,
        )
```

Replace it with:

```python
    from datetime import datetime, timezone

    # ── Phase 1: write sentinel BEFORE any LLM call (no try/except) ──────────
    # This commit is intentionally outside any exception handler so the sentinel
    # is always visible to concurrent GET /keywords requests before the LLM call
    # begins. The GET endpoint checks _is_extracting() and returns [] instead of
    # spawning a duplicate LLM call.
    doc.keyword_cache = {
        "version": KEYWORD_CACHE_VERSION,
        "status": "extracting",
        "items": [],
        "extracting_since": datetime.now(timezone.utc).isoformat(),
    }
    db.add(doc)
    db.commit()

    # ── Phase 2: LLM call — wrapped in try/except so failures never raise ────
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
            doc.id,
            len(items),
            file_sha256,
        )
    except Exception:
        # Clear the sentinel so GET /keywords can retry its own LLM path
        # immediately without waiting for EXTRACTING_SENTINEL_TIMEOUT_SECONDS.
        doc.keyword_cache = None
        db.add(doc)
        db.commit()
        logger.exception(
            "extract_and_cache_keywords failed for doc_id=%s — sentinel cleared",
            doc.id,
        )
```

Also update the docstring of `extract_and_cache_keywords` to reflect the two-phase structure. Find the existing docstring:

```python
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
```

Replace with:

```python
    """
    Write an extracting sentinel, run file-bytes keyword extraction, then persist
    results to doc.keyword_cache.

    Two-phase execution:
      Phase 1 (outside try): write sentinel {status:"extracting"} and db.commit().
        This prevents concurrent GET /keywords calls from spawning duplicate LLM
        calls — they see the sentinel and return [] immediately.
      Phase 2 (inside try/except): LLM call → write real cache on success, or
        clear sentinel to NULL on failure so GET can retry immediately.

    Never raises — all exceptions in Phase 2 are logged and swallowed so callers
    (e.g. _process_document_upload) are never interrupted.

    Cache schema written on success:
      {
        "version": KEYWORD_CACHE_VERSION,   # int
        "file_sha256": "<hex>",
        "content_sha256": null,
        "items": ["..."],
        "updated_at": "<ISO datetime>"
      }
    """
```

- [ ] **Step 1: Replace the function body and docstring** as described above.

- [ ] **Step 2: Verify syntax**

```bash
python3 -m py_compile backend/document_keywords.py && echo "OK"
```

Expected: `OK` with no errors.

- [ ] **Step 3: Verify the sentinel is written before the LLM call**

Manually read the final function body and confirm:
- `doc.keyword_cache = { "status": "extracting", ... }` appears **before** `await extract_keyword_items_from_file_bytes(...)`
- The sentinel write and `db.commit()` are **outside** the `try:` block
- The `except Exception:` block sets `doc.keyword_cache = None` and commits

- [ ] **Step 4: Commit**

```bash
git add backend/document_keywords.py
git commit -m "feat: write extracting sentinel before LLM call in extract_and_cache_keywords"
```

---

## Verification Checklist

After all three tasks are committed, verify end-to-end logic by reading the final state of `backend/document_keywords.py` and confirming:

- [ ] `EXTRACTING_SENTINEL_TIMEOUT_SECONDS = 600` exists as a module-level constant
- [ ] `_is_extracting(cache)` exists and is defined **before** `get_or_compute_keyword_items`
- [ ] `get_or_compute_keyword_items` calls `_is_extracting(cache)` immediately after `cache = parse_keyword_cache(...)`, before Branch 1
- [ ] `extract_and_cache_keywords` writes `{status: "extracting"}` to `doc.keyword_cache` and calls `db.commit()` **before** the `try:` block
- [ ] `extract_and_cache_keywords` sets `doc.keyword_cache = None` and calls `db.commit()` in the `except Exception:` block
- [ ] `python3 -m py_compile backend/document_keywords.py` outputs `OK`
