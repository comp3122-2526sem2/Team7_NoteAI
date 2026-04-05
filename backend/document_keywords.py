"""
Heading candidates from plain converted_markdown (no PDF layout / color).

Goal: list real *titles* (chapter / numbered section / short subsection labels), not
body sentences, notes, or page-number fragments.

Pipeline:
  1) Heuristic extraction (markdown headings, bold spans, line-based patterns).
  2) Strict filter: titles only (see reject_as_body_not_title).
  3) LLM verification of heuristic candidates; optional enrichment if count is low; same filters after.

Bump KEYWORD_CACHE_VERSION when extraction rules change.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# --- Cache --------------------------------------------------------------------

KEYWORD_CACHE_VERSION = 6
EXTRACTING_SENTINEL_TIMEOUT_SECONDS = 600  # 10 minutes

# --- Limits -------------------------------------------------------------------

MAX_HEADING_ITEMS = 30
FILE_LLM_MAX_ITEMS = (
    60  # cap for the file-bytes LLM path (full document, higher precision)
)

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

# Chapter lines can be long; everything else must stay short (subsection titles).
MAX_CHAPTER_LINE_CHARS = 72
MAX_PAREN_SECTION_LINE_CHARS = 60
MAX_SHORT_SUBTITLE_CHARS = 26

MIN_HEADING_CHARS = 2

LLM_INPUT_MAX_CHARS = 12_000
# After LLM verification, enrich from source when below this count.
MIN_ITEMS_AFTER_VERIFY_BEFORE_ENRICH = 3

# Non-structural lines (bold / loose line match) must be this short to count as a title.
MAX_NON_STRUCTURAL_CHARS = 26

# --- Broken conversion --------------------------------------------------------

REPLACEMENT_CHAR = "\ufffd"

# --- Structure detectors (format, not subject matter) -------------------------

RE_LINE_LOOKS_LIKE_CHAPTER_TITLE = re.compile(
    r"第\s*[一二三四五六七八九十百零〇\d]+\s*章",
)

RE_LINE_STARTS_WITH_PAREN_NUMBER = re.compile(
    r"^[（(]\s*\d{1,3}\s*[）)]\s*\S",
)

RE_MARKDOWN_HEADING = re.compile(r"^#{1,3}\s+(.+)$", re.MULTILINE)
RE_MARKDOWN_BOLD = re.compile(r"\*\*([^*]+)\*\*")

RE_STARTS_WITH_Q_OR_A = re.compile(r"^(問|答|問：|答：|(問|答)[：:])")
RE_STARTS_WITH_NUMERIC_LIST_STEP = re.compile(r"^\d{1,2}\s*[\.、．]\s+\S")
# Body numbered steps: N. or N、 with or without space (PDF line breaks often omit space).
RE_STARTS_WITH_DOT_NUMBER = re.compile(r"^\d{1,2}\s*[\.、．]")
RE_STARTS_WITH_CONTINUATION_PUNCT = re.compile(r"^[，、；：）】\]\)．\.]")
# Broken multi-line chapter title: line starts with 章 + dash (no 第… prefix).
RE_BARE_CHAPTER_FRAGMENT = re.compile(r"^章\s*[─—–\-]")

# Page-like: only ASCII digits (common footer noise).
RE_ONLY_DIGITS = re.compile(r"^\d{1,5}$")


def hash_converted_text(text: str) -> str:
    normalized = (text or "").replace("\r\n", "\n").strip()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _chapter_content_key(text: str) -> str | None:
    """Suffix after 第…章 for deduplicating near-duplicate chapter lines."""
    m = RE_LINE_LOOKS_LIKE_CHAPTER_TITLE.search(text.strip())
    if not m:
        return None
    after = text[m.end() :].strip().lstrip("–—─-：: ").strip()
    return after.casefold() if after else None


def _bare_chapter_fragment_key(text: str) -> str | None:
    """Suffix after a bare '章 ─' fragment (broken PDF line wrap)."""
    line = text.strip()
    m = RE_BARE_CHAPTER_FRAGMENT.match(line)
    if not m:
        return None
    rest = line[m.end() :].strip().lstrip("─—–-：: ").strip()
    return rest.casefold() if rest else None


def dedupe_preserve_order(
    items: list[str], max_items: int = MAX_HEADING_ITEMS
) -> list[str]:
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


def is_garbage_or_corrupt(text: str) -> bool:
    if not text or not text.strip():
        return True
    if REPLACEMENT_CHAR in text:
        return True
    if re.search(r"[\uE000-\uF8FF]", text):
        return True
    return False


def is_chapter_title_line(text: str) -> bool:
    return bool(RE_LINE_LOOKS_LIKE_CHAPTER_TITLE.search(text.strip()))


def is_paren_numbered_section_line(text: str) -> bool:
    return bool(RE_LINE_STARTS_WITH_PAREN_NUMBER.match(text.strip()))


def is_structural_title_line(text: str) -> bool:
    return is_chapter_title_line(text) or is_paren_numbered_section_line(text)


def is_likely_qa_or_list_body_line(text: str) -> bool:
    line = text.strip()
    if RE_STARTS_WITH_Q_OR_A.match(line):
        return True
    if RE_STARTS_WITH_DOT_NUMBER.match(line):
        return True
    if RE_STARTS_WITH_NUMERIC_LIST_STEP.match(line):
        return True
    if line.count("。") >= 1 and len(line) > 28:
        return True
    if line.count("；") >= 1 and len(line) > 30:
        return True
    if RE_STARTS_WITH_CONTINUATION_PUNCT.match(line):
        return True
    return False


def reject_as_body_not_title(text: str) -> bool:
    """
    Return True if this line should NOT appear as a selectable title.

    We only keep:
      - Chapter-style lines (pattern match), within length cap.
      - Parenthesized section labels, within length cap.
      - Very short non-structural lines (subsection labels), with almost no comma load.
    """
    line = text.strip()
    if not line:
        return True

    if RE_ONLY_DIGITS.match(line):
        return True

    # Numbered body steps (not (N) section headings).
    if RE_STARTS_WITH_DOT_NUMBER.match(line):
        return True

    # Broken PDF wrap: standalone "章 ─ …" without 第… prefix.
    if RE_BARE_CHAPTER_FRAGMENT.match(line):
        return True

    structural = is_structural_title_line(line)

    # Long lines without chapter / section structure are almost always body text.
    if not structural:
        if len(line) < 4:
            return True
        if len(line) > MAX_NON_STRUCTURAL_CHARS:
            return True
        if "。" in line:
            return True
        if "；" in line:
            return True
        if line.count("，") >= 1:
            return True
        if "：" in line and len(line) > 18:
            return True
        if "…" in line or "..." in line:
            return True
        # Body-style fragments (not standalone titles)
        if line.startswith("是否") or line.startswith("有無"):
            return True
        if line.count("的") >= 2:
            return True

    if is_chapter_title_line(line):
        if len(line) > MAX_CHAPTER_LINE_CHARS:
            return True
        if line.count("，") >= 3:
            return True
        return False

    if is_paren_numbered_section_line(line):
        if len(line) > MAX_PAREN_SECTION_LINE_CHARS:
            return True
        if line.count("，") >= 2 and len(line) > 36:
            return True
        return False

    # Non-structural: already capped length and punctuation above; double-check subtitle bound.
    if len(line) > MAX_SHORT_SUBTITLE_CHARS:
        return True

    return False


def filter_heading_candidates(
    items: list[str], max_items: int = MAX_HEADING_ITEMS
) -> list[str]:
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


def collect_heuristic_candidates(markdown_text: str) -> list[str]:
    if not (markdown_text or "").strip():
        return []

    candidates: list[str] = []

    for match in RE_MARKDOWN_HEADING.finditer(markdown_text):
        heading_text = match.group(1).strip()
        if is_garbage_or_corrupt(heading_text):
            continue
        candidates.append(heading_text)

    for match in RE_MARKDOWN_BOLD.finditer(markdown_text):
        inner = match.group(1).strip()
        if "\n" in inner:
            continue
        if is_garbage_or_corrupt(inner):
            continue
        if (
            not is_structural_title_line(inner)
            and len(inner) > MAX_NON_STRUCTURAL_CHARS
        ):
            continue
        candidates.append(inner)

    for raw_line in markdown_text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if is_garbage_or_corrupt(line):
            continue

        if RE_LINE_LOOKS_LIKE_CHAPTER_TITLE.search(line):
            candidates.append(line)
            continue

        if (
            RE_LINE_STARTS_WITH_PAREN_NUMBER.match(line)
            and len(line) <= MAX_PAREN_SECTION_LINE_CHARS
        ):
            candidates.append(line)
            continue

        # Standalone short subsection labels (plain text; no # or ** in source).
        if len(line) <= MAX_SHORT_SUBTITLE_CHARS:
            candidates.append(line)

    merged = dedupe_preserve_order(candidates)
    return filter_heading_candidates(merged)


def build_llm_heading_prompt(heuristic_seed: str, source_excerpt: str) -> str:
    return (
        "You extract ONLY section titles for a checklist UI. Plain text lost all formatting.\n\n"
        "INCLUDE only:\n"
        "- Lines that look like chapter openers (the document's usual chapter marker pattern).\n"
        "- Lines that start with a small parenthesized index then a short title.\n"
        "- Very short standalone labels (a few words), clearly not a full sentence.\n\n"
        "EXCLUDE completely:\n"
        "- Any sentence copied from notes, procedures, or explanations.\n"
        "- Lines longer than about 35 characters unless they are clearly a single chapter title line.\n"
        "- Number-only lines (page numbers).\n"
        "- Q/A lines, numbered steps, comma-heavy lines, fragments that mid-sentence.\n\n"
        f"Maximum {MAX_HEADING_ITEMS} strings. Prefer fewer, higher-precision titles.\n\n"
        f"Heuristic noise (ignore bad entries): {heuristic_seed}\n\n"
        f"Source excerpt:\n---\n{source_excerpt}\n---\n\n"
        "Output: JSON array of strings only. No markdown, no commentary."
    )


def build_llm_verify_prompt(candidates_json: str, source_excerpt: str) -> str:
    return (
        "You verify section titles for a checklist UI. Given candidate strings extracted from "
        "plain text (formatting was lost), return ONLY items that are genuine structural "
        "headings: chapter openers, parenthesized section labels such as (24) …, or very short "
        "subsection labels that are clearly titles—not full sentences.\n\n"
        "REMOVE: body sentences, numbered list steps (1. 2. …), Q/A lines, truncated words, "
        "fragments from mid-sentence line breaks, duplicates or near-duplicates.\n\n"
        f"Candidates (JSON array):\n{candidates_json}\n\n"
        f"Source excerpt for context only:\n---\n{source_excerpt}\n---\n\n"
        f"Output: JSON array of strings only (subset or reorder of valid titles; at most "
        f"{MAX_HEADING_ITEMS} items). No markdown, no commentary."
    )


async def verify_candidates_with_llm(
    text_sample: str,
    heuristic_items: list[str],
) -> list[str]:
    from openai_client import chat_complete

    candidates_json = json.dumps(heuristic_items, ensure_ascii=False)
    excerpt = (text_sample or "")[:LLM_INPUT_MAX_CHARS]
    user_prompt = build_llm_verify_prompt(candidates_json, excerpt)

    raw_response = await chat_complete(
        user_prompt,
        system="Reply with valid JSON only: a JSON array of strings.",
        temperature=0.1,
        max_tokens=700,
    )
    return parse_json_string_array(raw_response)


async def enrich_keywords_with_llm(
    text_sample: str,
    heuristic_items: list[str],
) -> list[str]:
    from openai_client import chat_complete

    seed = ", ".join(heuristic_items[:12]) if heuristic_items else "(none)"
    excerpt = (text_sample or "")[:LLM_INPUT_MAX_CHARS]
    user_prompt = build_llm_heading_prompt(seed, excerpt)

    raw_response = await chat_complete(
        user_prompt,
        system="Reply with valid JSON only: a JSON array of strings.",
        temperature=0.1,
        max_tokens=700,
    )
    parsed = parse_json_string_array(raw_response)
    combined = dedupe_preserve_order(heuristic_items + parsed)
    return filter_heading_candidates(combined)[:MAX_HEADING_ITEMS]


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
            doc.id,
            len(items),
            file_sha256,
        )
    except Exception:
        logger.exception(
            "extract_and_cache_keywords failed for doc_id=%s — keyword_cache unchanged",
            doc.id,
        )


def parse_json_string_array(raw: str) -> list[str]:
    text = (raw or "").strip()
    if not text:
        return []

    start = text.find("[")
    end = text.rfind("]")
    if start >= 0 and end > start:
        text = text[start : end + 1]

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return []

    if not isinstance(data, list):
        return []

    result: list[str] = []
    for item in data:
        if isinstance(item, str) and item.strip():
            result.append(item.strip())
    return result


def parse_keyword_cache(raw: Any) -> dict[str, Any] | None:
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    return None


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
                return filter_heading_candidates(
                    stored, max_items=FILE_LLM_MAX_ITEMS
                ), True
            # SHA mismatch → file changed → fall through to recompute below.
            # file_bytes is reused in branch 3 via local variable.
        except Exception:
            logger.warning(
                "Could not read file for sha256 check: %s — will recompute", file_path
            )
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
                "pdf": "application/pdf",
                "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "doc": "application/msword",
                "txt": "text/plain",
                "md": "text/markdown",
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
