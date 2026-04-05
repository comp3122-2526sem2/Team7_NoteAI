import io
import json
import logging
import os
import uuid
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from markdown_it import MarkdownIt
from sqlalchemy import func, select

from anythingllm import ChatMode, get_client
from deps import CurrentUser, DbDep, TeacherUser
from models import (
    Chapter,
    ConversionStatus,
    Course,
    Document,
    LessonPlan,
    LessonPlanGenerationPrompt,
    LessonPlanSectionPrompt,
    LessonPlanStatus,
    LessonPlanTemplate,
    LessonPlanTemplateType,
    LessonPlanVersion,
    UserRole,
    DEFAULT_LESSON_PLAN_GENERATION_PROMPT,
    DEFAULT_LESSON_PLAN_SECTION_PROMPT,
)
from openai_client import chat_complete
from routers.courses import _condense_for_prompt
from schemas import (
    AiGenerateRequest,
    AiRegenerateSectionOut,
    AiRegenerateSectionRequest,
    LessonPlanCreate,
    LessonPlanOut,
    LessonPlanUpdate,
    LessonPlanVersionDetailOut,
    LessonPlanVersionOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/courses/{course_id}/chapters/{chapter_id}/lesson-plan",
    tags=["Lesson Plans"],
)

# Caps to keep the LLM prompt within reasonable size while using full extracted text first.
_MAX_MATERIALS_TOTAL_CHARS = 48_000
_MAX_PER_UPLOADED_FILE_CHARS = 16_000
_MAX_VECTOR_SNIPPET_CHARS = 12_000
_MAX_SECTION_MATERIALS_CHARS = 12_000

_STYLE_PRESET_HINTS: dict[str, str] = {
    "balanced": "Balance direct teaching, guided practice, and short checks for understanding.",
    "activity_heavy": "Emphasize hands-on tasks, pair/group work, and minimal lecture time.",
    "lecture_focus": "Emphasize clear explanations, demonstrations, and whole-class Q&A.",
    "exam_prep": "Emphasize exam-style questions, key points recap, and timed practice.",
    "public_lesson": "Emphasize visible learning goals, smooth pacing, and concise transitions suitable for observers.",
}


def _lesson_plan_system_message(output_language: str, style_preset: str) -> str:
    lang = (
        "Write the entire lesson plan in Traditional Chinese (繁體中文), including headings and tables."
        if output_language == "zh"
        else "Write the entire lesson plan in English, including headings and tables."
    )
    style = _STYLE_PRESET_HINTS.get(style_preset, _STYLE_PRESET_HINTS["balanced"])
    return (
        "You are an expert teacher assistant. Ground objectives, examples, and "
        "activities in the PRIMARY chapter materials when present. Never substitute "
        "a generic unrelated topic (e.g. random software QA) unless that topic "
        f"explicitly appears in the materials. {lang} Style guidance: {style}"
    )


def _section_regenerate_system_message(output_language: str, style_preset: str) -> str:
    lang = (
        "Use Traditional Chinese (繁體中文) for the rewritten section."
        if output_language == "zh"
        else "Use English for the rewritten section."
    )
    style = _STYLE_PRESET_HINTS.get(style_preset, _STYLE_PRESET_HINTS["balanced"])
    return (
        "You improve teaching material sections. Ground content in the reference "
        "materials when provided. Keep markdown format and only return the rewritten section. "
        f"{lang} Tone: {style}"
    )


_DEFAULT_PDF_CSS = """
@page { size: A4; margin: 2cm; }
body {
  font-family: "Noto Sans CJK SC", "Noto Sans TC", "Noto Sans", sans-serif;
  font-size: 12pt;
  line-height: 1.6;
  color: #111827;
}
h1 {
  font-size: 18pt;
  border-bottom: 2px solid #1f2937;
  padding-bottom: 8px;
}
h2 { font-size: 14pt; color: #1d4ed8; margin-top: 20px; }
h3 { font-size: 12pt; color: #1f2937; margin-top: 16px; }
table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11pt; }
thead th { background: #f3f4f6; font-weight: 600; }
th, td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; vertical-align: top; }
tbody tr { page-break-inside: avoid; }
thead { display: table-header-group; }
tfoot { display: table-footer-group; }
tr { page-break-inside: avoid; page-break-after: auto; }
blockquote { border-left: 4px solid #d1d5db; margin: 8px 0; padding: 6px 12px; color: #4b5563; }
code { font-family: "JetBrains Mono", monospace; font-size: 11pt; }
"""


def _school_id() -> str:
    return os.getenv("SCHOOL_ID", "default-school")


def _markdown_to_html_for_pdf(markdown: str) -> str:
    """Render markdown for PDF with GFM-style pipe tables.

    Use ``commonmark`` + ``enable('table')`` — tables live in markdown-it-py core.
    Avoid preset ``gfm-like`` here: it enables linkify and needs optional linkify-it-py.
    """
    md = MarkdownIt("commonmark").enable("table")
    return md.render(markdown or "")


def _get_chapter_or_404(course_id: uuid.UUID, chapter_id: uuid.UUID, db: DbDep) -> Chapter:
    chapter = db.scalar(
        select(Chapter).where(
            Chapter.id == chapter_id,
            Chapter.course_id == course_id,
        )
    )
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found.")
    return chapter


def _get_plan_or_404(course_id: uuid.UUID, chapter_id: uuid.UUID, db: DbDep) -> LessonPlan:
    plan = db.scalar(
        select(LessonPlan).where(
            LessonPlan.course_id == course_id,
            LessonPlan.chapter_id == chapter_id,
        )
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Lesson plan not found.")
    return plan


def _template_visible_to_user(template: LessonPlanTemplate, user_id: uuid.UUID) -> bool:
    if template.template_type == LessonPlanTemplateType.system:
        return True
    if template.template_type == LessonPlanTemplateType.school:
        return template.school_id == _school_id()
    return template.created_by == user_id


def _create_version(db: DbDep, plan: LessonPlan, saved_by: uuid.UUID | None) -> LessonPlanVersion:
    latest = db.scalar(
        select(func.max(LessonPlanVersion.version_number)).where(
            LessonPlanVersion.lesson_plan_id == plan.id
        )
    )
    next_version = (latest or 0) + 1
    version = LessonPlanVersion(
        lesson_plan_id=plan.id,
        snapshot_content=plan.content,
        snapshot_config=plan.config,
        version_number=next_version,
        saved_by=saved_by,
    )
    db.add(version)
    return version


def _merge_instruction_and_keywords(
    instruction: str | None,
    focus_keywords: list[str] | None,
) -> str | None:
    parts: list[str] = []
    if instruction and instruction.strip():
        parts.append(instruction.strip())
    if focus_keywords:
        kws = [k.strip() for k in focus_keywords if k and k.strip()]
        if kws:
            parts.append("Focus on these subsection keywords / phrases: " + ", ".join(kws))
    if not parts:
        return None
    return "\n\n".join(parts)


def _extracted_text_from_chapter_documents(
    chapter: Chapter,
    db: DbDep,
    document_ids: list[uuid.UUID] | None = None,
) -> str:
    """
    Use text already persisted from AnythingLLM at upload time (`converted_markdown`).
    This is the reliable ground truth when embeddings/RAG chat return little or nothing.

    If ``document_ids`` is ``None``, include all completed chapter documents.
    If ``document_ids`` is an empty list, return no primary file text (teacher excluded all files).
    """
    if document_ids is not None and len(document_ids) == 0:
        return ""

    q = (
        select(Document)
        .where(
            Document.chapter_id == chapter.id,
            Document.conversion_status == ConversionStatus.completed,
        )
        .order_by(Document.created_at.asc())
    )
    if document_ids is not None:
        q = q.where(Document.id.in_(document_ids))
    docs = db.scalars(q).all()
    parts: list[str] = []
    budget = _MAX_MATERIALS_TOTAL_CHARS
    for doc in docs:
        text = (doc.converted_markdown or "").strip()
        if not text:
            continue
        take = min(len(text), _MAX_PER_UPLOADED_FILE_CHARS, budget)
        if take <= 0:
            break
        parts.append(f"### File: {doc.original_filename}\n\n{text[:take]}")
        budget -= take + 48
    return "\n\n".join(parts).strip()


async def _anythingllm_vector_excerpts(chapter: Chapter, query: str) -> str:
    if not chapter.workspace_slug:
        return ""
    try:
        client = get_client()
        resp = await client.workspace.vector_search(
            chapter.workspace_slug,
            query,
            top_n=10,
        )
        chunks: list[str] = []
        for r in resp.results:
            t = (r.text or "").strip()
            if t and t not in chunks:
                chunks.append(t)
        if not chunks:
            return ""
        return "\n\n---\n\n".join(chunks)[:_MAX_VECTOR_SNIPPET_CHARS]
    except Exception as exc:
        logger.warning("AnythingLLM vector_search failed for chapter %s: %s", chapter.id, exc)
        return ""


async def _anythingllm_query_summary(chapter: Chapter) -> str:
    if not chapter.workspace_slug:
        return ""
    try:
        client = get_client()
        response = await client.workspace.chat(
            chapter.workspace_slug,
            (
                "Summarize the most important teaching points, examples, and common "
                "student misconceptions from this chapter's materials. Be specific to "
                "the actual subject matter in the documents; do not invent topics not "
                "present in the sources."
            ),
            mode=ChatMode.query,
        )
        return (response.textResponse or "").strip()
    except Exception as exc:
        logger.warning("AnythingLLM workspace chat (query) failed for chapter %s: %s", chapter.id, exc)
        return ""


async def _build_rag_context(
    chapter: Chapter,
    db: DbDep,
    retrieval_focus: str | None = None,
    *,
    document_ids: list[uuid.UUID] | None = None,
) -> str:
    """
    Chapter context for lesson-plan generation.

    Previously this only called workspace `chat` in query mode, which often returned
    empty or generic text — the model then hallucinated unrelated lessons. We now:

    1. Prefer DB-stored `converted_markdown` from uploaded files (always populated on
       successful upload before embedding).
    2. Add vector search excerpts when a workspace exists (helps when DB text is short).
    3. Fall back to the legacy RAG chat summary only when combined text is still thin.
    """
    db_text = _extracted_text_from_chapter_documents(chapter, db, document_ids)
    parts: list[str] = []

    if db_text:
        parts.append("[PRIMARY — text extracted from uploaded chapter files]\n" + db_text)

    vs_query = (
        f"{chapter.title}. {chapter.description or ''} "
        "key concepts vocabulary activities assessment teaching points examples"
    )
    focus = (retrieval_focus or "").strip()
    if focus:
        vs_query = f"{focus}\n\n{vs_query}"
    vs_text = await _anythingllm_vector_excerpts(chapter, vs_query)

    if vs_text:
        if not db_text or len(db_text) < 12_000:
            parts.append("[SEMANTIC RETRIEVAL — excerpts from embedded workspace]\n" + vs_text)

    combined = "\n\n".join(parts).strip()
    if len(combined) < 2_500 and chapter.workspace_slug:
        summary = await _anythingllm_query_summary(chapter)
        if summary:
            parts.append("[WORKSPACE RAG SUMMARY]\n" + summary)
        combined = "\n\n".join(parts).strip()

    if not combined:
        logger.info(
            "No chapter materials context for chapter %s (no converted_markdown and no workspace snippets).",
            chapter.id,
        )
        return ""

    return combined


@router.get("", response_model=LessonPlanOut)
def get_lesson_plan(
    course_id: uuid.UUID,
    chapter_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbDep,
):
    _get_chapter_or_404(course_id, chapter_id, db)
    plan = _get_plan_or_404(course_id, chapter_id, db)
    if current_user.role == UserRole.student and plan.status != LessonPlanStatus.published:
        raise HTTPException(status_code=404, detail="Lesson plan not found.")
    return plan


@router.post("", response_model=LessonPlanOut, status_code=status.HTTP_201_CREATED)
def create_lesson_plan(
    course_id: uuid.UUID,
    chapter_id: uuid.UUID,
    body: LessonPlanCreate,
    current_user: TeacherUser,
    db: DbDep,
):
    chapter = _get_chapter_or_404(course_id, chapter_id, db)
    existing = db.scalar(
        select(LessonPlan).where(
            LessonPlan.course_id == course_id,
            LessonPlan.chapter_id == chapter_id,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Lesson plan already exists for this chapter.")

    content = ""
    config = body.config
    title = body.title

    if body.template_id:
        template = db.get(LessonPlanTemplate, body.template_id)
        if not template or not template.is_active:
            raise HTTPException(status_code=404, detail="Template not found.")
        if not _template_visible_to_user(template, current_user.id):
            raise HTTPException(status_code=403, detail="Template not accessible.")
        content = template.content
        if config is None:
            config = template.default_config
        if not title:
            title = template.name

    plan = LessonPlan(
        chapter_id=chapter.id,
        course_id=chapter.course_id,
        title=title,
        content=content,
        config=config,
        created_by=current_user.id,
    )
    db.add(plan)
    db.flush()
    _create_version(db, plan, current_user.id)
    db.commit()
    db.refresh(plan)
    return plan


@router.put("", response_model=LessonPlanOut)
def update_lesson_plan(
    course_id: uuid.UUID,
    chapter_id: uuid.UUID,
    body: LessonPlanUpdate,
    current_user: TeacherUser,
    db: DbDep,
):
    plan = _get_plan_or_404(course_id, chapter_id, db)
    data = body.model_dump(exclude_none=True)
    skip_version = bool(data.pop("skip_version", False))
    for field, value in data.items():
        setattr(plan, field, value)
    if not skip_version:
        _create_version(db, plan, current_user.id)
    db.commit()
    db.refresh(plan)
    return plan


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_lesson_plan(
    course_id: uuid.UUID,
    chapter_id: uuid.UUID,
    _: TeacherUser,
    db: DbDep,
):
    plan = _get_plan_or_404(course_id, chapter_id, db)
    db.delete(plan)
    db.commit()


@router.get("/versions", response_model=list[LessonPlanVersionOut])
def list_lesson_plan_versions(
    course_id: uuid.UUID,
    chapter_id: uuid.UUID,
    _: CurrentUser,
    db: DbDep,
):
    plan = _get_plan_or_404(course_id, chapter_id, db)
    return db.scalars(
        select(LessonPlanVersion)
        .where(LessonPlanVersion.lesson_plan_id == plan.id)
        .order_by(LessonPlanVersion.version_number.desc())
    ).all()


@router.get("/versions/{version_id}", response_model=LessonPlanVersionDetailOut)
def get_lesson_plan_version(
    course_id: uuid.UUID,
    chapter_id: uuid.UUID,
    version_id: uuid.UUID,
    _: CurrentUser,
    db: DbDep,
):
    plan = _get_plan_or_404(course_id, chapter_id, db)
    version = db.scalar(
        select(LessonPlanVersion).where(
            LessonPlanVersion.id == version_id,
            LessonPlanVersion.lesson_plan_id == plan.id,
        )
    )
    if not version:
        raise HTTPException(status_code=404, detail="Version not found.")
    return version


@router.delete("/versions/{version_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lesson_plan_version(
    course_id: uuid.UUID,
    chapter_id: uuid.UUID,
    version_id: uuid.UUID,
    _: TeacherUser,
    db: DbDep,
):
    """Remove one history snapshot. Does not change the current lesson plan body."""
    plan = _get_plan_or_404(course_id, chapter_id, db)
    version = db.scalar(
        select(LessonPlanVersion).where(
            LessonPlanVersion.id == version_id,
            LessonPlanVersion.lesson_plan_id == plan.id,
        )
    )
    if not version:
        raise HTTPException(status_code=404, detail="Version not found.")
    db.delete(version)
    db.commit()


@router.post("/versions/{version_id}/restore", response_model=LessonPlanOut)
def restore_lesson_plan_version(
    course_id: uuid.UUID,
    chapter_id: uuid.UUID,
    version_id: uuid.UUID,
    current_user: TeacherUser,
    db: DbDep,
):
    plan = _get_plan_or_404(course_id, chapter_id, db)
    version = db.scalar(
        select(LessonPlanVersion).where(
            LessonPlanVersion.id == version_id,
            LessonPlanVersion.lesson_plan_id == plan.id,
        )
    )
    if not version:
        raise HTTPException(status_code=404, detail="Version not found.")

    plan.content = version.snapshot_content
    plan.config = version.snapshot_config
    _create_version(db, plan, current_user.id)
    db.commit()
    db.refresh(plan)
    return plan


@router.post("/ai-generate", response_model=LessonPlanOut)
async def ai_generate_lesson_plan(
    course_id: uuid.UUID,
    chapter_id: uuid.UUID,
    body: AiGenerateRequest,
    current_user: TeacherUser,
    db: DbDep,
):
    row = db.execute(
        select(LessonPlan, Chapter, Course)
        .join(Chapter, Chapter.id == LessonPlan.chapter_id)
        .join(Course, Course.id == LessonPlan.course_id)
        .where(
            LessonPlan.course_id == course_id,
            LessonPlan.chapter_id == chapter_id,
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Lesson plan not found.")

    plan, chapter, course = row
    merged_focus = _merge_instruction_and_keywords(body.instruction, body.focus_keywords)
    rag_context = await _build_rag_context(
        chapter,
        db,
        merged_focus,
        document_ids=body.document_ids,
    )
    if not rag_context.strip():
        rag_context = (
            "[NO_CHAPTER_FILE_TEXT] No extracted text from chapter uploads and no usable "
            "workspace context. Align the lesson plan to the chapter title, description, "
            "syllabus snippet, and config only. In the Overview, state that source files "
            "were not available. Do not invent an unrelated detailed curriculum."
        )

    syllabus = await _condense_for_prompt(course.syllabus or "")

    row_prompt = db.scalar(select(LessonPlanGenerationPrompt))
    template = row_prompt.prompt if row_prompt else DEFAULT_LESSON_PLAN_GENERATION_PROMPT
    prompt = template.format(
        chapter_title=chapter.title,
        chapter_description=chapter.description or "N/A",
        syllabus=syllabus or "N/A",
        rag_context=rag_context,
        config_json=json.dumps(plan.config or {}, ensure_ascii=False, indent=2),
        instruction=merged_focus or "Generate a complete lesson plan.",
    )

    generated = await chat_complete(
        prompt,
        system=_lesson_plan_system_message(body.output_language, body.style_preset),
        temperature=0.35,
    )
    plan.content = generated
    _create_version(db, plan, current_user.id)
    db.commit()
    db.refresh(plan)
    return plan


@router.post("/ai-regenerate-section", response_model=AiRegenerateSectionOut)
async def ai_regenerate_section(
    course_id: uuid.UUID,
    chapter_id: uuid.UUID,
    body: AiRegenerateSectionRequest,
    _: TeacherUser,
    db: DbDep,
):
    _get_plan_or_404(course_id, chapter_id, db)
    chapter = _get_chapter_or_404(course_id, chapter_id, db)
    section_snippet = (body.original_section or "").strip()
    retrieval_focus = section_snippet[:900] if len(section_snippet) > 40 else None
    materials = await _build_rag_context(chapter, db, retrieval_focus)

    row_prompt = db.scalar(select(LessonPlanSectionPrompt))
    template = row_prompt.prompt if row_prompt else DEFAULT_LESSON_PLAN_SECTION_PROMPT
    prompt = template.format(
        original_section=body.original_section,
        instruction=body.instruction,
        config_json=json.dumps(body.context_config or {}, ensure_ascii=False, indent=2),
    )
    if materials.strip():
        prompt = (
            prompt
            + "\n\n---\nReference — chapter materials (keep the rewrite consistent with this):\n---\n"
            + materials[:_MAX_SECTION_MATERIALS_CHARS]
        )

    generated = await chat_complete(
        prompt,
        system=_section_regenerate_system_message(body.output_language, body.style_preset),
        temperature=0.35,
    )
    return AiRegenerateSectionOut(content=generated)


@router.get("/export-pdf")
def export_lesson_plan_pdf(
    course_id: uuid.UUID,
    chapter_id: uuid.UUID,
    _: TeacherUser,
    db: DbDep,
):
    from weasyprint import HTML

    plan = _get_plan_or_404(course_id, chapter_id, db)
    html_body = _markdown_to_html_for_pdf(plan.content or "")
    css_style = plan.css_style or _DEFAULT_PDF_CSS

    full_html = (
        "<!doctype html>"
        "<html><head><meta charset='utf-8'><style>"
        f"{css_style}"
        "</style></head><body>"
        f"{html_body}"
        "</body></html>"
    )

    pdf_bytes = HTML(string=full_html).write_pdf()
    file_obj = io.BytesIO(pdf_bytes)
    safe_title = "".join(c for c in plan.title if c.isalnum() or c in ("-", "_", " ")).strip() or "lesson-plan"
    filename = f"{safe_title}.pdf"
    # Starlette encodes headers as latin-1; use ASCII filename + RFC 5987 for Unicode titles.
    ascii_name = "lesson-plan.pdf"
    cd = (
        f'attachment; filename="{ascii_name}"; '
        f"filename*=UTF-8''{quote(filename)}"
    )

    return StreamingResponse(
        file_obj,
        media_type="application/pdf",
        headers={"Content-Disposition": cd},
    )
