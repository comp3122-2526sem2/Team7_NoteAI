# Keyword Extraction, AI Rewrite Feedback & UI Translation — Design Spec

**Date:** 2026-04-05
**Status:** Approved

---

## Overview

Three independent sub-projects:

- **A:** Keyword extraction redesign — on-demand background job (triggered by button, not upload)
- **B:** AI rewrite visual feedback — editor overlay while rewrite POST is in-flight
- **C:** English translation — convert all Chinese UI strings in lesson plan files

---

## Sub-project A: Keyword Extraction Redesign

### Goal

Remove keyword extraction from the upload pipeline entirely. Make it on-demand only, triggered by the "Refresh Headings" button. The refresh fires as a background job so the user can leave the page and see results when they return.

### Git Revert

Revert the following commits in order (newest first). These are the sentinel/upload-time extraction commits to undo:

```
10068a5  docs: clarify extract_and_cache_keywords never-raises guarantee scope
214dac9  feat: write extracting sentinel before LLM call in extract_and_cache_keywords
1a9400f  feat: short-circuit get_or_compute_keyword_items when extraction sentinel is live
61092a4  style: move datetime import to top of _is_extracting body
cc652f0  feat: add _is_extracting sentinel helper and EXTRACTING_SENTINEL_TIMEOUT_SECONDS
c21de1b  feat: extract section headings from uploaded files at upload time via OpenAI file attachment
```

Use `git revert <sha> --no-edit` for each. Do NOT use `git revert --hard` or reset — revert commits preserve history.

After reverting, the codebase is back to the state before any keyword extraction work. This means:
- `document_keywords.py` no longer has `extract_and_cache_keywords`, `_is_extracting`, or `EXTRACTING_SENTINEL_TIMEOUT_SECONDS`
- `backend/routers/chapters.py` still has a call to `extract_and_cache_keywords` inside `_process_document_upload` (around line 472-480) — **this call site must be manually removed** after the revert, since the function no longer exists. Remove the entire `try/except` block that imports and calls `extract_and_cache_keywords` from `_process_document_upload`.
- `frontend/components/lesson-plan/lesson-plan-materials-scope.tsx` still exists (it was tracked before these commits)

### Re-introduce: sentinel constant + `_is_extracting` helper

After reverting, re-add only these two items to `backend/document_keywords.py` (they are needed for the new design):

```python
EXTRACTING_SENTINEL_TIMEOUT_SECONDS = 600  # 10 minutes
```

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

Also add sentinel check at the top of `get_or_compute_keyword_items`, after `cache = parse_keyword_cache(doc.keyword_cache)`:

```python
if _is_extracting(cache):
    return [], False
```

### Backend: `POST .../keywords/refresh` — becomes async

**File:** `backend/routers/chapters.py`

**Current behaviour:** Clears `keyword_cache`, calls `get_or_compute_keyword_items` synchronously (blocks until LLM done), returns result.

**New behaviour:** Add `background_tasks: BackgroundTasks` as a route dependency (already imported in `chapters.py`). Then:
1. Clear `keyword_cache` — set to `None`, commit
2. Compute `content_sha256 = hash_converted_text((doc.converted_markdown or "").strip())` — needed for the immediate return value
3. Write sentinel: `keyword_cache = {"version": KEYWORD_CACHE_VERSION, "status": "extracting", "items": [], "extracting_since": <ISO>}`, commit. `KEYWORD_CACHE_VERSION` must be imported: `from document_keywords import KEYWORD_CACHE_VERSION, _is_extracting, parse_keyword_cache, get_or_compute_keyword_items, hash_converted_text` — add to the existing import from `document_keywords` at the top of `chapters.py`.
4. Register the background task: `background_tasks.add_task(_run_keyword_extraction_background, doc.id)` — do NOT use `asyncio.create_task` (unreliable in FastAPI production workers; `BackgroundTasks` is the established pattern in this codebase)
5. Return immediately with `DocumentKeywordsOut(items=[], cached=False, content_sha256=content_sha256, status="extracting")`

**New background coroutine in `chapters.py`:**

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

### Backend: `DocumentKeywordsOut` response shape

**File:** `backend/schemas/` (wherever `DocumentKeywordsOut` is defined) — add optional `status` field:

```python
class DocumentKeywordsOut(BaseModel):
    items: list[str]
    cached: bool
    content_sha256: str
    status: str = "ready"  # "extracting" | "ready"
```

`GET .../keywords` must also return `status="extracting"` when `_is_extracting(doc.keyword_cache)` is True. Update `get_chapter_document_keywords`:

```python
items, cached = await get_or_compute_keyword_items(doc, db)
h = hash_converted_text((doc.converted_markdown or "").strip())
cache = parse_keyword_cache(doc.keyword_cache)
status = "extracting" if _is_extracting(cache) else "ready"
return DocumentKeywordsOut(items=items, cached=cached, content_sha256=h, status=status)
```

Note: `_is_extracting`, `parse_keyword_cache`, `KEYWORD_CACHE_VERSION`, `get_or_compute_keyword_items`, and `hash_converted_text` must all be imported in `chapters.py` from `document_keywords`. Update the existing import line for that module.

### Frontend: `DocumentKeywordsOut` type

**File:** `frontend/lib/api.ts`

Add `status` field to the interface:

```typescript
export interface DocumentKeywordsOut {
  items: string[];
  cached: boolean;
  content_sha256: string;
  status: "extracting" | "ready";
}
```

### Frontend: `lesson-plan-materials-scope.tsx`

**Polling:** Each keyword `useQuery` gets `refetchInterval`:

```typescript
refetchInterval: (query) => {
  const data = query.state.data;
  if (data?.status === "extracting") return 4000;  // poll every 4s while extracting
  return false;  // stop polling once done
},
```

**重抽標題 button change:** Currently awaits the POST (which was slow). New behaviour: fire POST → returns immediately with `status: "extracting"` → `invalidateQueries` → `useQuery` picks up `status: "extracting"` → polling starts automatically. The button does NOT need `refreshingDocId` loading state anymore — the polling indicator replaces it. Keep `refreshingDocId` state only for the brief moment between click and first poll response (≤1s).

The current button uses a raw `async onClick` with `try/finally` — keep this pattern. Change it to:
1. `setRefreshingDocId(docId)` at the start
2. `await chaptersApi.refreshDocumentKeywords(...)` inside `try`
3. `await qc.invalidateQueries(...)` inside `try` (after the POST returns)
4. `setRefreshingDocId(null)` in `finally` — existing `finally` already does this, no change needed

Polling takes over from there — `refetchInterval` fires because `status === "extracting"`.

**LoadingOutlined import:** `lesson-plan-materials-scope.tsx` has no `@ant-design/icons` import. Add `import { LoadingOutlined } from "@ant-design/icons";` at the top of the file alongside the other imports.

**Loading indicator per doc:** When `keywordData.status === "extracting"`, show next to the doc name:

```tsx
{status === "extracting" && (
  <span style={{ marginLeft: 6 }}>
    <LoadingOutlined spin style={{ fontSize: 12, color: "#1677ff" }} />
    <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>
      Extracting headings...
    </Text>
  </span>
)}
```

---

## Sub-project B: AI Rewrite Visual Feedback

### Goal

Show a translucent overlay on the editor area while `regenerateSectionMutation.isPending` is true.

### File: `frontend/app/(app)/courses/[id]/chapters/[cid]/lesson-plan/page.tsx`

The editor area is wrapped in a `div` referenced by `editorWrapRef`. Verify that `position: "relative"` is already on that wrapper's inline style (it should be at `page.tsx:646`); add it if missing. `Spin` should already be imported from `antd` (`page.tsx:15`); add it if missing.

Add the overlay as a sibling inside that wrapper, rendered conditionally:

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

Import `Spin` from `antd` if not already imported.

No changes to `SelectionAiFloat`.

---

## Sub-project C: English Translation

### Goal

Replace all Chinese UI strings in the listed files with English equivalents. Do not change:
- Backend-facing values (e.g. `value: "zh"`, `value: "balanced"`)
- API payload keys/values
- Code logic

### Translation Reference

**`lesson-plan/page.tsx`**

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
| 預覽 v${n} | Preview v${n} (keep template variable — the JSX uses a backtick template literal: `` `Preview v${previewVersion.version_number}` ``) |

**`lesson-plan-materials-scope.tsx`**

| Chinese | English |
|---|---|
| 教材範圍（AI 讀取） | Materials Scope (AI context) |
| 勾選要納入教案產生嘅檔案。下列候選由原始上傳檔直接分析（唔係問答或內文摘句）；轉檔亂碼會自動略過。可按「重抽」重新分析。 | Select files to include in lesson plan generation. Headings are extracted directly from the original uploaded file (not from Q&A or text summaries). Garbled conversions are skipped automatically. Click "Refresh" to re-analyse. |
| 此章節尚未有已完成轉檔嘅教材；請先到章節頁上傳檔案。 | No completed documents for this chapter. Please upload files on the chapter page first. |
| 關鍵字／小節（選填） | Keywords / Sections (optional) |
| 重抽標題 | Refresh Headings |
| 無法載入關鍵字 | Failed to load keywords |

**`lesson-plan-toolbar.tsx`**

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

**`lesson-plan-config-panel.tsx`**

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

**`lesson-plan-ai-settings.tsx`**

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

**`version-history-drawer.tsx`**

| Chinese | English |
|---|---|
| 版本紀錄 | Version History |
| 預覽 | Preview |
| 還原 | Restore |
| 刪除此版本紀錄？ | Delete this version? |
| 只會刪除歷史快照，不會改動目前教案正文。 | This only deletes the historical snapshot and does not affect the current lesson plan. |
| 刪除 | Delete |
| 取消 | Cancel |
| 儲存者：${saved_by} | Saved by: ${saved_by} (keep template variable) |
| 儲存者：未知 | Saved by: Unknown |

**`selection-ai-float.tsx`**

| Chinese | English |
|---|---|
| AI 重寫選取文字 | AI Rewrite Selected Text |
| 告訴 AI 想點改（例如：簡化、加例子、改成英文）。 | Tell the AI how to revise it (e.g. simplify, add examples, change to English). |
| 改寫指示… | Rewrite instructions... |
| 請改寫得更清晰、適合課堂使用。 | Please rewrite this to be clearer and suitable for classroom use. |
| 重寫 | Rewrite |
| AI 重寫 | AI Rewrite |

**`chapters/[cid]/page.tsx` (lesson plan card section only — lines ~555–610)**

Only translate the two lesson plan `<Card>` sections (teacher view around line 560, student view around line 591). Do NOT translate the "Chapter Documents" card or the `handleUpload` messages — those are already in English.

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

---

## Constraints

- No changes to backend API routes or auth
- No schema migrations
- `output_language` values (`"zh"`, `"en"`) and all backend-facing payload keys remain unchanged
- All work on `main` branch
- Three sub-projects are independent and can be implemented in any order
