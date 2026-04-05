# Keyword Extraction Redesign, AI Rewrite Feedback & UI Translation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) Move keyword extraction from upload-time to on-demand background job; (B) add translucent editor overlay while AI rewrite is in-flight; (C) translate all Chinese UI strings in lesson plan files to English.

**Architecture:** Three fully independent sub-projects executed in order A → B → C. Sub-project A touches backend + frontend; B and C are frontend-only. All work is on `main`. No schema migrations; no new DB columns. BackgroundTasks (not asyncio.create_task) is the FastAPI pattern used for background work.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy, Pydantic v2; Next.js 16 (App Router), React 19, TypeScript (strict), Ant Design v6, TanStack Query v5

**Spec:** `docs/superpowers/specs/2026-04-05-keyword-redesign-rewrite-feedback-translation.md`

---

## File Map

| File | Change |
|---|---|
| `backend/routers/chapters.py` | Remove `extract_and_cache_keywords` call from `_process_document_upload`; change `refresh_chapter_document_keywords` to background job; add `_run_keyword_extraction_background`; update `get_chapter_document_keywords` to return `status` |
| `backend/document_keywords.py` | No changes needed — `_is_extracting`, `EXTRACTING_SENTINEL_TIMEOUT_SECONDS`, sentinel check in `get_or_compute_keyword_items` already exist after reverting |
| `backend/schemas/documents.py` | Add `status: str = "ready"` to `DocumentKeywordsOut` |
| `frontend/lib/api.ts` | Add `status: "extracting" \| "ready"` to `DocumentKeywordsOut` interface |
| `frontend/components/lesson-plan/lesson-plan-materials-scope.tsx` | Add `refetchInterval`, `LoadingOutlined` import, extracting indicator, translate strings |
| `frontend/app/(app)/courses/[id]/chapters/[cid]/lesson-plan/page.tsx` | Add overlay inside `editorWrapRef` div; translate all Chinese strings |
| `frontend/components/lesson-plan/lesson-plan-toolbar.tsx` | Translate all Chinese strings |
| `frontend/components/lesson-plan/lesson-plan-config-panel.tsx` | Translate all Chinese strings |
| `frontend/components/lesson-plan/lesson-plan-ai-settings.tsx` | Translate all Chinese strings |
| `frontend/components/lesson-plan/version-history-drawer.tsx` | Translate all Chinese strings |
| `frontend/components/lesson-plan/selection-ai-float.tsx` | Translate all Chinese strings |
| `frontend/app/(app)/courses/[id]/chapters/[cid]/page.tsx` | Translate lesson plan card section only (~lines 555–610) |

---

## Sub-project A: Keyword Extraction Redesign

### Task A1: Revert the 6 upload-time extraction commits

**Files:**
- (git history only — no file edits needed in this task)

**Context:** The 6 commits to revert (newest-first) are:
```
10068a5  docs: clarify extract_and_cache_keywords never-raises guarantee scope
214dac9  feat: write extracting sentinel before LLM call in extract_and_cache_keywords
1a9400f  feat: short-circuit get_or_compute_keyword_items when extraction sentinel is live
61092a4  style: move datetime import to top of _is_extracting body
cc652f0  feat: add _is_extracting sentinel helper and EXTRACTING_SENTINEL_TIMEOUT_SECONDS
c21de1b  feat: extract section headings from uploaded files at upload time via OpenAI file attachment
```

- [ ] **Step A1.1: Revert the 6 commits in order (newest → oldest)**

```bash
git revert 10068a5 --no-edit
git revert 214dac9 --no-edit
git revert 1a9400f --no-edit
git revert 61092a4 --no-edit
git revert cc652f0 --no-edit
git revert c21de1b --no-edit
```

Each `git revert` creates one commit automatically. Expect 6 new revert commits.

- [ ] **Step A1.2: Verify the reverts applied cleanly**

```bash
git log --oneline -8
python3 -m py_compile backend/document_keywords.py backend/routers/chapters.py
```

Expected:
- 6 revert commits at the top of `git log`
- `py_compile` exits 0 (no syntax errors)

After revert, `document_keywords.py` will NOT have `_is_extracting`, `EXTRACTING_SENTINEL_TIMEOUT_SECONDS`, or `extract_and_cache_keywords`. `chapters.py` will still have the dangling `extract_and_cache_keywords` call at lines ~472-480 — this is expected; it is removed in Task A2.

---

### Task A2: Remove dangling upload-time call site from chapters.py

**Files:**
- Modify: `backend/routers/chapters.py` (~lines 470–480)

**Context:** After the revert, `_process_document_upload` still contains a `try/except` block at around lines 470–480 that imports and calls `extract_and_cache_keywords`. That function no longer exists, so the block must be removed. The surrounding code is:

```python
        doc.conversion_status = ConversionStatus.completed
        db.commit()
        logger.info(...)

        # ── 2b. Keyword extraction (file-bytes → Chat Completions) ─────────────
        # Runs after embed commit. Failure is logged and never blocks fan-out.
        try:
            from document_keywords import extract_and_cache_keywords

            await extract_and_cache_keywords(doc, file_bytes, content_type, db)
        except Exception:
            logger.exception(
                "Keyword extraction failed for doc_id=%s — student fan-out continues",
                doc_id,
            )

        # ── 3. Best-effort fan-out to existing student workspaces ─────────────
```

- [ ] **Step A2.1: Remove the dangling extract_and_cache_keywords call block**

Open `backend/routers/chapters.py`. Find the block that starts with `# ── 2b. Keyword extraction` and ends just before `# ── 3. Best-effort fan-out`. Delete those ~10 lines entirely (including the comment header).

The resulting code should flow directly from:
```python
        doc.conversion_status = ConversionStatus.completed
        db.commit()
        logger.info(
            "Document embedded successfully: doc_id=%s slug=%s", doc_id, teacher_slug
        )

        # ── 3. Best-effort fan-out to existing student workspaces ─────────────
```

- [ ] **Step A2.2: Verify syntax**

```bash
python3 -m py_compile backend/routers/chapters.py
```

Expected: exits 0.

- [ ] **Step A2.3: Commit**

```bash
git add backend/routers/chapters.py
git commit -m "fix: remove dangling extract_and_cache_keywords call from _process_document_upload"
```

---

### Task A3: Re-add sentinel helpers and sentinel check to document_keywords.py

**Files:**
- Modify: `backend/document_keywords.py`

**Context:** After the revert, `document_keywords.py` does NOT have `EXTRACTING_SENTINEL_TIMEOUT_SECONDS`, `_is_extracting`, or the sentinel check inside `get_or_compute_keyword_items`. These need to be re-added so the new background job design works correctly.

- [ ] **Step A3.1: Add EXTRACTING_SENTINEL_TIMEOUT_SECONDS constant**

Find the block of constants near the top of `document_keywords.py` (after `KEYWORD_CACHE_VERSION = 6`). Add:

```python
EXTRACTING_SENTINEL_TIMEOUT_SECONDS = 600  # 10 minutes
```

Place it immediately after `KEYWORD_CACHE_VERSION = 6`.

- [ ] **Step A3.2: Add the _is_extracting helper function**

Add the following function after `parse_keyword_cache` (or anywhere logically near the cache utilities — before `get_or_compute_keyword_items`):

```python
def _is_extracting(cache: dict | None) -> bool:
    """Return True if cache holds a live extracting sentinel."""
    from datetime import datetime, timezone
    if not isinstance(cache, dict):
        return False
    if cache.get("status") != "extracting":
        return False
    extracting_since_str = cache.get("extracting_since")
    if not extracting_since_str:
        return True
    try:
        extracting_since = datetime.fromisoformat(extracting_since_str)
        elapsed = (datetime.now(timezone.utc) - extracting_since).total_seconds()
        return elapsed < EXTRACTING_SENTINEL_TIMEOUT_SECONDS
    except Exception:
        return True
```

- [ ] **Step A3.3: Add sentinel check at the top of get_or_compute_keyword_items**

Inside `get_or_compute_keyword_items`, immediately after `cache = parse_keyword_cache(doc.keyword_cache)`, add:

```python
    if _is_extracting(cache):
        return [], False
```

- [ ] **Step A3.4: Verify syntax**

```bash
python3 -m py_compile backend/document_keywords.py
```

Expected: exits 0.

- [ ] **Step A3.5: Commit**

```bash
git add backend/document_keywords.py
git commit -m "feat: re-add extracting sentinel constant, helper, and short-circuit check"
```

---

### Task A4: Add status field to DocumentKeywordsOut schema

**Files:**
- Modify: `backend/schemas/documents.py`

**Context:** Current `DocumentKeywordsOut`:
```python
class DocumentKeywordsOut(BaseModel):
    items: list[str]
    cached: bool
    content_sha256: str
```

Needs a `status` field with default `"ready"`.

- [ ] **Step A4.1: Add status field**

Change `DocumentKeywordsOut` to:
```python
class DocumentKeywordsOut(BaseModel):
    items: list[str]
    cached: bool
    content_sha256: str
    status: str = "ready"  # "extracting" | "ready"
```

- [ ] **Step A4.2: Verify syntax**

```bash
python3 -m py_compile backend/schemas/documents.py
```

Expected: exits 0.

- [ ] **Step A4.3: Commit**

```bash
git add backend/schemas/documents.py
git commit -m "feat: add status field to DocumentKeywordsOut schema"
```

---

### Task A5: Update chapters.py — background refresh + status in GET

**Files:**
- Modify: `backend/routers/chapters.py`

**Context:**

The import at line 44 currently reads:
```python
from document_keywords import get_or_compute_keyword_items, hash_converted_text
```

It needs to be expanded to include the new helpers.

The GET handler `get_chapter_document_keywords` currently returns:
```python
return DocumentKeywordsOut(items=items, cached=cached, content_sha256=h)
```
It needs to also compute and pass `status`.

The POST handler `refresh_chapter_document_keywords` currently runs synchronously. It needs to become a background job.

A new coroutine `_run_keyword_extraction_background` needs to be added.

- [ ] **Step A5.1: Expand the document_keywords import line**

Find this line near the top of `chapters.py`:
```python
from document_keywords import get_or_compute_keyword_items, hash_converted_text
```

Replace with:
```python
from document_keywords import (
    KEYWORD_CACHE_VERSION,
    _is_extracting,
    get_or_compute_keyword_items,
    hash_converted_text,
    parse_keyword_cache,
)
```

- [ ] **Step A5.2: Update get_chapter_document_keywords to return status**

Find the body of `get_chapter_document_keywords`. It currently ends with:
```python
    items, cached = await get_or_compute_keyword_items(doc, db)
    h = hash_converted_text((doc.converted_markdown or "").strip())
    return DocumentKeywordsOut(items=items, cached=cached, content_sha256=h)
```

Replace with:
```python
    items, cached = await get_or_compute_keyword_items(doc, db)
    h = hash_converted_text((doc.converted_markdown or "").strip())
    cache = parse_keyword_cache(doc.keyword_cache)
    status = "extracting" if _is_extracting(cache) else "ready"
    return DocumentKeywordsOut(items=items, cached=cached, content_sha256=h, status=status)
```

- [ ] **Step A5.3: Rewrite refresh_chapter_document_keywords as background job**

Find the entire body of `refresh_chapter_document_keywords`:
```python
    doc.keyword_cache = None
    db.commit()
    db.refresh(doc)
    items, cached = await get_or_compute_keyword_items(doc, db)
    h = hash_converted_text((doc.converted_markdown or "").strip())
    return DocumentKeywordsOut(items=items, cached=cached, content_sha256=h)
```

Replace with:
```python
    from datetime import datetime, timezone

    doc.keyword_cache = None
    db.commit()

    content_sha256 = hash_converted_text((doc.converted_markdown or "").strip())

    # Write extracting sentinel so GET /keywords returns status="extracting" immediately
    doc.keyword_cache = {
        "version": KEYWORD_CACHE_VERSION,
        "status": "extracting",
        "items": [],
        "extracting_since": datetime.now(timezone.utc).isoformat(),
    }
    db.add(doc)
    db.commit()

    background_tasks.add_task(_run_keyword_extraction_background, doc.id)
    return DocumentKeywordsOut(items=[], cached=False, content_sha256=content_sha256, status="extracting")
```

Also add `background_tasks: BackgroundTasks` as a parameter to `refresh_chapter_document_keywords`. The full updated signature should be:
```python
async def refresh_chapter_document_keywords(
    course_id: uuid.UUID,
    chapter_id: uuid.UUID,
    doc_id: uuid.UUID,
    _: TeacherUser,
    db: DbDep,
    background_tasks: BackgroundTasks,
):
```

(`BackgroundTasks` is already imported at line 10.)

- [ ] **Step A5.4: Add _run_keyword_extraction_background coroutine**

Add the following function somewhere in `chapters.py` before the routes that use it (e.g. just before the `@router.get(...)` for keywords, or right after the `refresh_chapter_document_keywords` function):

```python
async def _run_keyword_extraction_background(doc_id: uuid.UUID) -> None:
    """Background task: re-run keyword extraction for a single document."""
    from database import SessionLocal
    from document_keywords import get_or_compute_keyword_items

    db = SessionLocal()
    try:
        doc = db.get(Document, doc_id)
        if not doc:
            return
        # Clear sentinel so get_or_compute runs fresh
        doc.keyword_cache = None
        db.add(doc)
        db.commit()
        db.refresh(doc)
        await get_or_compute_keyword_items(doc, db)
    except Exception:
        logger.exception("Background keyword extraction failed for doc_id=%s", doc_id)
    finally:
        db.close()
```

- [ ] **Step A5.5: Verify syntax**

```bash
python3 -m py_compile backend/routers/chapters.py
```

Expected: exits 0. (LSP errors for fastapi/sqlalchemy imports are expected — ignore them. Only syntax errors matter.)

- [ ] **Step A5.6: Commit**

```bash
git add backend/routers/chapters.py
git commit -m "feat: make keyword refresh a background job; add status to GET /keywords response"
```

---

### Task A6: Frontend — update DocumentKeywordsOut type and add polling + extracting indicator

**Files:**
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/components/lesson-plan/lesson-plan-materials-scope.tsx`

**Context:**

`DocumentKeywordsOut` in `api.ts` (line 487) currently is:
```typescript
export interface DocumentKeywordsOut {
  items: string[];
  cached: boolean;
  content_sha256: string;
}
```

The `lesson-plan-materials-scope.tsx` queries use `staleTime` only, no `refetchInterval`. There is no `@ant-design/icons` import in that file.

- [ ] **Step A6.1: Add status field to DocumentKeywordsOut in api.ts**

Find the `DocumentKeywordsOut` interface and add `status`:
```typescript
export interface DocumentKeywordsOut {
  items: string[];
  cached: boolean;
  content_sha256: string;
  status: "extracting" | "ready";
}
```

- [ ] **Step A6.2: Add LoadingOutlined import to lesson-plan-materials-scope.tsx**

At the top of `lesson-plan-materials-scope.tsx`, after the existing imports, add:
```typescript
import { LoadingOutlined } from "@ant-design/icons";
```

- [ ] **Step A6.3: Add refetchInterval to each keyword query**

In `lesson-plan-materials-scope.tsx`, in the `useQueries` call, each query object currently has:
```typescript
      staleTime: 1000 * 60 * 5,
```

Add `refetchInterval` after `staleTime`:
```typescript
      staleTime: 1000 * 60 * 5,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (data?.status === "extracting") return 4000;
        return false;
      },
```

- [ ] **Step A6.4: Add extracting indicator next to doc label**

In the `{selectedDocumentIds.map(...)}` block, find where the doc label is rendered:
```tsx
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {label}
                    </Text>
```

Replace it with:
```tsx
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {label}
                      </Text>
                      {q.data?.status === "extracting" && (
                        <span style={{ marginLeft: 6 }}>
                          <LoadingOutlined spin style={{ fontSize: 12, color: "#1677ff" }} />
                          <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>
                            Extracting headings...
                          </Text>
                        </span>
                      )}
                    </span>
```

- [ ] **Step A6.5: TypeScript check**

```bash
npx tsc --noEmit
```
Run from `frontend/` directory. Expected: exits 0 (or only pre-existing errors unrelated to these changes).

- [ ] **Step A6.6: Commit**

```bash
git add frontend/lib/api.ts frontend/components/lesson-plan/lesson-plan-materials-scope.tsx
git commit -m "feat: add keyword extraction status polling and extracting indicator to materials scope"
```

---

## Sub-project B: AI Rewrite Visual Feedback

### Task B1: Add translucent overlay to editor while rewrite is in-flight

**Files:**
- Modify: `frontend/app/(app)/courses/[id]/chapters/[cid]/lesson-plan/page.tsx`

**Context:**

`Spin` is already imported from `antd` at line 15. `editorWrapRef` div already has `position: "relative"` at line 646. `regenerateSectionMutation.isPending` is already used at line 655. The overlay goes inside the `editorWrapRef` div, as a sibling of `<MarkdownInput>` and `<SelectionAiFloat>`.

- [ ] **Step B1.1: Add overlay inside the editorWrapRef div**

Find the `editorWrapRef` div contents. Currently:
```tsx
                      <div
                        ref={editorWrapRef}
                        style={{ position: "relative", width: "100%", minHeight: EDITOR_MIN_PX }}
                      >
                        <MarkdownInput
                          value={currentContent}
                          onChange={setContent}
                          minHeight={EDITOR_MIN_PX}
                        />
                        <SelectionAiFloat
                          containerRef={editorWrapRef}
                          loading={regenerateSectionMutation.isPending}
                          onRegenerate={(selectedText, instruction) =>
                            regenerateSectionMutation.mutate({
                              original_section: selectedText,
                              instruction,
                            })
                          }
                        />
                      </div>
```

Add the overlay after `<SelectionAiFloat .../>` and before the closing `</div>`:
```tsx
                        {regenerateSectionMutation.isPending && (
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              background: "rgba(255, 255, 255, 0.65)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              zIndex: 10,
                              borderRadius: 8,
                            }}
                          >
                            <Spin size="large" tip="Rewriting..." />
                          </div>
                        )}
```

- [ ] **Step B1.2: TypeScript check**

```bash
npx tsc --noEmit
```
Run from `frontend/`. Expected: exits 0.

- [ ] **Step B1.3: Commit**

```bash
git add frontend/app/\(app\)/courses/\[id\]/chapters/\[cid\]/lesson-plan/page.tsx
git commit -m "feat: add translucent overlay on editor while AI rewrite is in-flight"
```

---

## Sub-project C: English Translation

### Task C1: Translate lesson-plan/page.tsx

**Files:**
- Modify: `frontend/app/(app)/courses/[id]/chapters/[cid]/lesson-plan/page.tsx`

**Translation table** (full list from spec — apply ALL of these):

| Chinese | English |
|---|---|
| 已建立教案 | Lesson plan created |
| 無法建立教案 | Failed to create lesson plan |
| 已儲存 | Saved |
| 儲存失敗 | Save failed |
| AI 已產生教案 | Lesson plan generated |
| AI 產生失敗 | Generation failed |
| 已還原版本 | Version restored |
| 還原失敗 | Restore failed |
| 已重寫選取段落 | Selected section rewritten |
| 重寫失敗 | Rewrite failed |
| 已清空教案內容 | Lesson plan content cleared |
| 清空失敗 | Clear failed |
| 已刪除教案 | Lesson plan deleted |
| 刪除失敗 | Delete failed |
| 已刪除版本 | Version deleted |
| 刪除版本失敗 | Delete version failed |
| 已套用範本 | Template applied |
| 無法載入版本內容 | Failed to load version content |
| 教案 | Lesson Plan |
| 教案尚未發佈，或此章節尚未建立教案。 | This lesson plan has not been published, or no plan exists for this chapter. |
| 已發佈教案（唯讀） | Published lesson plan (read-only) |
| 教案尚未發佈。 | Lesson plan not yet published. |
| 教案編輯器 | Lesson Plan Editor |
| 每個章節一份教案。左邊編輯、右邊即時預覽（同寬）；右側為 AI 與選填設定。 | One lesson plan per chapter. Edit on the left, live preview on the right; AI and optional settings on the right panel. |
| 此章節尚未建立教案。 | No lesson plan found for this chapter. |
| 建立教案 | Create Lesson Plan |
| 仍有教材正在處理，完成後 AI 會更能對準你的檔案。 | Some materials are still processing. AI generation will be more accurate once they are ready. |
| 章節教材已就緒，AI 會優先使用上傳內容。 | Chapter materials are ready. AI will prioritise your uploaded content. |
| 尚未上傳章節教材；建議先於章節頁上傳檔案再產生教案。 | No chapter materials uploaded. Consider uploading files on the chapter page before generating. |
| 教案內容 | Lesson Plan Content |
| 左側編輯、右側即時預覽（同寬）。選取文字可浮動「AI 重寫」。 | Edit on the left, live preview on the right. Select text to float the AI Rewrite toolbar. |
| 確認覆寫？ | Overwrite existing content? |
| 目前已有內容，AI 產生會取代現有教案文字。 | There is existing content. AI generation will replace the current lesson plan text. |
| 產生 | Generate |
| 取消 | Cancel |
| 清空教案內容？ | Clear lesson plan content? |
| 會移除正文並將右側設定重設為預設；教案仍保留，可重新編輯。 | This will remove the content and reset the right-panel settings to defaults. The lesson plan record will remain and can be re-edited. |
| 清空 | Clear |
| 刪除整份教案？ | Delete entire lesson plan? |
| 此章節的教案與所有版本紀錄將一併刪除，無法復原。 | The lesson plan and all version history for this chapter will be permanently deleted. |
| 刪除 | Delete |
| 匯出 PDF 失敗 | Export PDF failed |
| 即時預覽 | Live Preview |
| 展開 AI 設定 | Expand AI settings |
| 同步中… | Syncing... |
| 已同步 | Synced |
| 同步失敗 | Sync failed |
| 設定會自動儲存 | Settings auto-saved |
| 收合 | Collapse |
| AI 產生 | Generate with AI |

Note on `預覽 v${n}`: the JSX uses a backtick template literal `` `Preview v${previewVersion.version_number}` `` — translate the surrounding text but keep the `${...}` variable.

- [ ] **Step C1.1: Apply all translations to page.tsx**

Open `frontend/app/(app)/courses/[id]/chapters/[cid]/lesson-plan/page.tsx` and find each Chinese string from the table above. Replace it with the English equivalent. Take care with:
- Template literals (keep `${...}` variable intact)
- Multi-occurrence strings like `刪除` or `取消` — context matters, ensure only UI-facing strings are changed, not variable names/values
- `aria-label` attributes also need translation

Do **not** change:
- Backend payload values (`value: "zh"`, `"balanced"`, etc.)
- Variable names, function names, query keys

- [ ] **Step C1.2: TypeScript check**

```bash
npx tsc --noEmit
```
Run from `frontend/`. Expected: exits 0.

- [ ] **Step C1.3: Commit**

```bash
git add frontend/app/\(app\)/courses/\[id\]/chapters/\[cid\]/lesson-plan/page.tsx
git commit -m "feat: translate lesson-plan page.tsx UI strings to English"
```

---

### Task C2: Translate lesson-plan-materials-scope.tsx

**Files:**
- Modify: `frontend/components/lesson-plan/lesson-plan-materials-scope.tsx`

**Translation table:**

| Chinese | English |
|---|---|
| 教材範圍（AI 讀取） | Materials Scope (AI context) |
| 勾選要納入教案產生嘅檔案。下列候選由原始上傳檔直接分析（唔係問答或內文摘句）；轉檔亂碼會自動略過。可按「重抽」重新分析。 | Select files to include in lesson plan generation. Headings are extracted directly from the original uploaded file (not from Q&A or text summaries). Garbled conversions are skipped automatically. Click "Refresh" to re-analyse. |
| 此章節尚未有已完成轉檔嘅教材；請先到章節頁上傳檔案。 | No completed documents for this chapter. Please upload files on the chapter page first. |
| 關鍵字／小節（選填） | Keywords / Sections (optional) |
| 重抽標題 | Refresh Headings |
| 無法載入關鍵字 | Failed to load keywords |

- [ ] **Step C2.1: Apply all translations**

Open `lesson-plan-materials-scope.tsx` and replace every Chinese string from the table with its English equivalent.

- [ ] **Step C2.2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: exits 0.

- [ ] **Step C2.3: Commit**

```bash
git add frontend/components/lesson-plan/lesson-plan-materials-scope.tsx
git commit -m "feat: translate lesson-plan-materials-scope.tsx UI strings to English"
```

---

### Task C3: Translate lesson-plan-toolbar.tsx

**Files:**
- Modify: `frontend/components/lesson-plan/lesson-plan-toolbar.tsx`

**Translation table:**

| Chinese | English |
|---|---|
| 清空教案內容 | Clear lesson plan content |
| 刪除整份教案 | Delete lesson plan |
| 返回章節 | Back to chapter |
| 教案標題 | Lesson plan title |
| 草稿 | Draft |
| 已發佈 | Published |
| 已封存 | Archived |
| 更多 | More |
| 範本 | Templates |
| 版本紀錄 | Version history |
| 匯出 PDF | Export PDF |
| 儲存 | Save |

- [ ] **Step C3.1: Apply all translations**

- [ ] **Step C3.2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: exits 0.

- [ ] **Step C3.3: Commit**

```bash
git add frontend/components/lesson-plan/lesson-plan-toolbar.tsx
git commit -m "feat: translate lesson-plan-toolbar.tsx UI strings to English"
```

---

### Task C4: Translate lesson-plan-config-panel.tsx

**Files:**
- Modify: `frontend/components/lesson-plan/lesson-plan-config-panel.tsx`

**Translation table:**

| Chinese | English |
|---|---|
| 講授 | Lecture |
| 小組討論 | Group discussion |
| 示範 | Demonstration |
| 探究活動 | Inquiry activity |
| 遊戲化學習 | Gamified learning |
| 問答 | Q&A |
| 工作紙 | Worksheet |
| 小測驗 | Quiz |
| 專題研習 | Project-based |
| 口頭匯報 | Oral presentation |
| 教案設定（可選） | Lesson Plan Settings (optional) |
| 最少填「課題」與「時長」即可產生；其餘愈完整，AI 越能配合你的班級。 | At minimum, fill in "Topic" and "Duration" to generate. The more complete, the better AI can tailor to your class. |
| 課題 | Topic |
| 例如：海圖與避碰規則 | e.g. Charts and Collision Avoidance Rules |
| 預設 35／40／80 分鐘，或自訂。 | Default: 35 / 40 / 80 minutes, or custom. |
| 課堂時長 | Duration |
| 自訂 | Custom |
| 分鐘 | min |
| 整體難度。 | Overall difficulty. |
| 難度 | Difficulty |
| 基礎 | Basic |
| 中等 | Intermediate |
| 進階 | Advanced |
| 教學法 | Teaching Methods |
| 教學內容重點 | Teaching Focus |
| 本課要涵蓋的概念或技能（可空） | Concepts or skills to cover this lesson (optional) |
| 學生程度 | Student Level |
| 較弱 | Low |
| 中等 | Medium |
| 較強 | High |
| 評量方式 | Assessment Methods |
| 學習目標 | Learning Objectives |
| 學習目標 (placeholder) | e.g. Students can identify... |
| 移除 | Remove |
| + 新增目標 | + Add objective |

Note: `中等` appears twice (Difficulty and Student Level). Both should be translated to the correct English in context (`Intermediate` for difficulty, `Medium` for student level).

- [ ] **Step C4.1: Apply all translations**

- [ ] **Step C4.2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: exits 0.

- [ ] **Step C4.3: Commit**

```bash
git add frontend/components/lesson-plan/lesson-plan-config-panel.tsx
git commit -m "feat: translate lesson-plan-config-panel.tsx UI strings to English"
```

---

### Task C5: Translate lesson-plan-ai-settings.tsx

**Files:**
- Modify: `frontend/components/lesson-plan/lesson-plan-ai-settings.tsx`

**Translation table:**

| Chinese | English |
|---|---|
| 均衡（講授＋活動） | Balanced (lecture + activity) |
| 活動為主（小組／操作） | Activity-heavy (group / hands-on) |
| 講授為主 | Lecture-focused |
| 測驗備戰 | Exam preparation |
| 公開課／觀課 | Open lesson / observation |
| AI 設定 | AI Settings |
| 語言與風格會套用於「AI 產生」與「選取重寫」。焦點／關鍵字會幫忙對準教材。 | Language and style apply to both "Generate" and "Rewrite". Focus / keywords help align with your materials. |
| 輸出語言 | Output language |
| 繁中 | Traditional Chinese |
| 課堂風格 | Classroom style |
| 本課焦點／關鍵字（選填） | Focus / keywords for this lesson (optional) |
| 例：代數式化簡、實驗安全、閱讀策略… | e.g. Simplifying expressions, lab safety, reading strategies... |

Do **not** change `value: "zh"`, `value: "balanced"`, etc. — those are backend payload values.

- [ ] **Step C5.1: Apply all translations**

- [ ] **Step C5.2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: exits 0.

- [ ] **Step C5.3: Commit**

```bash
git add frontend/components/lesson-plan/lesson-plan-ai-settings.tsx
git commit -m "feat: translate lesson-plan-ai-settings.tsx UI strings to English"
```

---

### Task C6: Translate version-history-drawer.tsx

**Files:**
- Modify: `frontend/components/lesson-plan/version-history-drawer.tsx`

**Translation table:**

| Chinese | English |
|---|---|
| 版本紀錄 | Version History |
| 預覽 | Preview |
| 還原 | Restore |
| 刪除此版本紀錄？ | Delete this version? |
| 只會刪除歷史快照，不會改動目前教案正文。 | This only deletes the historical snapshot and does not affect the current lesson plan. |
| 刪除 | Delete |
| 取消 | Cancel |
| 儲存者：未知 | Saved by: Unknown |

Note on `儲存者：${saved_by}`: this is a template literal — translate the fixed text but keep the variable. The resulting string should be `` `Saved by: ${...}` `` (exact variable name to be confirmed by reading the file).

- [ ] **Step C6.1: Read the file first to confirm exact template literal syntax**

Read `frontend/components/lesson-plan/version-history-drawer.tsx` to confirm the variable name used in the `儲存者：` template string before editing.

- [ ] **Step C6.2: Apply all translations**

- [ ] **Step C6.3: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: exits 0.

- [ ] **Step C6.4: Commit**

```bash
git add frontend/components/lesson-plan/version-history-drawer.tsx
git commit -m "feat: translate version-history-drawer.tsx UI strings to English"
```

---

### Task C7: Translate selection-ai-float.tsx

**Files:**
- Modify: `frontend/components/lesson-plan/selection-ai-float.tsx`

**Translation table:**

| Chinese | English |
|---|---|
| AI 重寫選取文字 | AI Rewrite Selected Text |
| 告訴 AI 想點改（例如：簡化、加例子、改成英文）。 | Tell the AI how to revise it (e.g. simplify, add examples, change to English). |
| 改寫指示… | Rewrite instructions... |
| 請改寫得更清晰、適合課堂使用。 | Please rewrite this to be clearer and suitable for classroom use. |
| 重寫 | Rewrite |
| AI 重寫 | AI Rewrite |

- [ ] **Step C7.1: Apply all translations**

- [ ] **Step C7.2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: exits 0.

- [ ] **Step C7.3: Commit**

```bash
git add frontend/components/lesson-plan/selection-ai-float.tsx
git commit -m "feat: translate selection-ai-float.tsx UI strings to English"
```

---

### Task C8: Translate chapters/[cid]/page.tsx — lesson plan card section only

**Files:**
- Modify: `frontend/app/(app)/courses/[id]/chapters/[cid]/page.tsx`

**Scope:** Only the lesson plan `<Card>` sections (teacher view ~line 560, student view ~line 591). Do **not** touch the Chapter Documents card or `handleUpload` messages.

**Translation table:**

| Chinese | English |
|---|---|
| 教案 | Lesson Plan |
| 開啟編輯器 | Open Editor |
| 狀態： | Status: |
| 載入中 | Loading |
| 尚未建立 | Not created |
| 草稿 | Draft |
| 已發佈 | Published |
| 已封存 | Archived |
| 老師尚未發佈教案，或此章節尚未建立教案。 | The teacher has not published a lesson plan, or no plan exists for this chapter. |
| 查看教案 | View Lesson Plan |
| 教案尚未發佈。 | Lesson plan not yet published. |

- [ ] **Step C8.1: Read the file to identify the exact lines to change**

Read `frontend/app/(app)/courses/[id]/chapters/[cid]/page.tsx` around lines 555–615 to confirm which strings appear in the lesson plan cards and identify exact positions.

- [ ] **Step C8.2: Apply all translations to lesson plan card section only**

- [ ] **Step C8.3: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: exits 0.

- [ ] **Step C8.4: Commit**

```bash
git add frontend/app/\(app\)/courses/\[id\]/chapters/\[cid\]/page.tsx
git commit -m "feat: translate lesson plan card section in chapters page to English"
```

---

## Final Verification

After all tasks are complete:

- [ ] Run `python3 -m py_compile backend/document_keywords.py backend/routers/chapters.py backend/schemas/documents.py` — expect exits 0
- [ ] Run `npx tsc --noEmit` from `frontend/` — expect exits 0
- [ ] Run `npm run lint` from `frontend/` — expect no new errors
- [ ] Run `git log --oneline` to confirm all commits are present
