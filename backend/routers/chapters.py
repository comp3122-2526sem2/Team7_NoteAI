import json
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, status
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from anythingllm import ChatMode, get_client
from anythingllm.exceptions import AnythingLLMError
from database import SessionLocal
from deps import CurrentUser, DbDep, TeacherUser
from models import Course, Document, StudentUser, UserRole
from models.chapter import Chapter, ChapterAIComment
from models.chapter_thread import ChapterThread
from models.document import ConversionStatus, DocumentType
from schemas import ChapterCreate, ChapterOut, ChapterUpdate, ChapterAICommentOut, ThreadCreate, ThreadOut
from schemas.documents import DocumentOut

router = APIRouter(prefix="/courses/{course_id}/chapters", tags=["Chapters"])

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
    "text/plain": "txt",
    "text/markdown": "md",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_course_or_404(course_id: uuid.UUID, db) -> Course:
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found.")
    return course


def _get_chapter_or_404(chapter_id: uuid.UUID, course_id: uuid.UUID, db) -> Chapter:
    chapter = db.scalar(
        select(Chapter).where(
            Chapter.id == chapter_id,
            Chapter.course_id == course_id,
        )
    )
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found.")
    return chapter


async def _ensure_workspace(chapter: Chapter, db) -> str:
    """
    Return the chapter's AnythingLLM workspace slug, creating it first if needed.
    Stores the slug back to the DB on first creation.
    """
    if chapter.workspace_slug:
        return chapter.workspace_slug

    client = get_client()
    try:
        workspace = await client.workspace.create(name=f"chapter-{chapter.id}")
        chapter.workspace_slug = workspace.slug
        db.commit()
        db.refresh(chapter)
    except AnythingLLMError:
        # Degrade gracefully – AI features will still work with a fallback slug
        chapter.workspace_slug = f"chapter-{chapter.id}"
        db.commit()

    return chapter.workspace_slug


# ── Chapters ──────────────────────────────────────────────────────────────────

@router.get("", response_model=list[ChapterOut])
def list_chapters(course_id: uuid.UUID, _: CurrentUser, db: DbDep):
    _get_course_or_404(course_id, db)
    return db.scalars(
        select(Chapter)
        .where(Chapter.course_id == course_id)
        .order_by(Chapter.order, Chapter.created_at)
    ).all()


@router.post("", response_model=ChapterOut, status_code=status.HTTP_201_CREATED)
async def create_chapter(course_id: uuid.UUID, body: ChapterCreate, _: TeacherUser, db: DbDep):
    _get_course_or_404(course_id, db)
    chapter = Chapter(course_id=course_id, **body.model_dump())
    db.add(chapter)
    db.flush()

    # Provision a dedicated AnythingLLM workspace for this chapter
    client = get_client()
    try:
        workspace = await client.workspace.create(name=f"chapter-{chapter.id}")
        chapter.workspace_slug = workspace.slug
    except AnythingLLMError:
        pass  # workspace created later on first use

    db.commit()
    db.refresh(chapter)
    return chapter


@router.get("/{chapter_id}", response_model=ChapterOut)
def get_chapter(course_id: uuid.UUID, chapter_id: uuid.UUID, _: CurrentUser, db: DbDep):
    return _get_chapter_or_404(chapter_id, course_id, db)


@router.put("/{chapter_id}", response_model=ChapterOut)
def update_chapter(
    course_id: uuid.UUID, chapter_id: uuid.UUID, body: ChapterUpdate, _: TeacherUser, db: DbDep
):
    chapter = _get_chapter_or_404(chapter_id, course_id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(chapter, field, value)
    db.commit()
    db.refresh(chapter)
    return chapter


@router.delete("/{chapter_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chapter(course_id: uuid.UUID, chapter_id: uuid.UUID, _: TeacherUser, db: DbDep):
    chapter = _get_chapter_or_404(chapter_id, course_id, db)
    slug = chapter.workspace_slug
    db.delete(chapter)
    db.commit()

    # Clean up the AnythingLLM workspace
    if slug:
        client = get_client()
        try:
            await client.workspace.delete(slug)
        except AnythingLLMError:
            pass


# ── Chapter Documents ──────────────────────────────────────────────────────────

@router.get("/{chapter_id}/documents", response_model=list[DocumentOut])
def list_chapter_documents(
    course_id: uuid.UUID, chapter_id: uuid.UUID, _: CurrentUser, db: DbDep
):
    _get_chapter_or_404(chapter_id, course_id, db)
    return db.scalars(
        select(Document)
        .where(Document.chapter_id == chapter_id)
        .order_by(Document.created_at.desc())
    ).all()


async def _process_document_upload(
    doc_id: uuid.UUID,
    chapter_id: uuid.UUID,
    file_bytes: bytes,
    original_filename: str,
) -> None:
    """
    Background task: upload the file to AnythingLLM, embed it into the
    chapter's workspace, and update the document's conversion_status.
    Opens its own DB session since the request session is already closed.
    """
    db = SessionLocal()
    try:
        doc = db.get(Document, doc_id)
        if not doc:
            return

        chapter = db.get(Chapter, chapter_id)
        if not chapter:
            doc.conversion_status = ConversionStatus.failed
            db.commit()
            return

        client = get_client()
        result = await client.document.upload_file(file_bytes, original_filename)

        if result.success and result.documents:
            location = result.documents[0].location
            doc.anythingllm_location = location

            workspace_slug = await _ensure_workspace(chapter, db)
            await client.workspace.add_documents(workspace_slug, [location])
            doc.conversion_status = ConversionStatus.completed
        else:
            doc.conversion_status = ConversionStatus.failed

        db.commit()
    except Exception:
        try:
            doc = db.get(Document, doc_id)
            if doc:
                doc.conversion_status = ConversionStatus.failed
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


@router.post(
    "/{chapter_id}/documents/upload",
    response_model=DocumentOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_chapter_document(
    course_id: uuid.UUID,
    chapter_id: uuid.UUID,
    file: UploadFile,
    current_user: TeacherUser,
    db: DbDep,
    background_tasks: BackgroundTasks,
    document_type: DocumentType = DocumentType.other,
):
    """
    Save the file and return immediately with status=pending.
    AnythingLLM upload and workspace embedding run in the background.
    Poll GET /{chapter_id}/documents to watch conversion_status → completed / failed.
    """
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{file.content_type}'. "
                   f"Allowed: {', '.join(ALLOWED_TYPES.keys())}",
        )

    _get_chapter_or_404(chapter_id, course_id, db)

    ext = ALLOWED_TYPES[file.content_type]
    saved_name = f"{uuid.uuid4()}.{ext}"
    save_path = UPLOAD_DIR / saved_name
    file_bytes = await file.read()
    save_path.write_bytes(file_bytes)

    doc = Document(
        uploaded_by=current_user.id,
        course_id=course_id,
        chapter_id=chapter_id,
        document_type=document_type,
        original_filename=file.filename,
        original_file_type=ext,
        original_file_path=str(save_path),
        conversion_status=ConversionStatus.pending,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    background_tasks.add_task(
        _process_document_upload,
        doc.id,
        chapter_id,
        file_bytes,
        file.filename,
    )

    return doc


@router.delete(
    "/{chapter_id}/documents/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_chapter_document(
    course_id: uuid.UUID,
    chapter_id: uuid.UUID,
    doc_id: uuid.UUID,
    current_user: TeacherUser,
    db: DbDep,
):
    chapter = _get_chapter_or_404(chapter_id, course_id, db)
    doc = db.scalar(
        select(Document).where(
            Document.id == doc_id,
            Document.chapter_id == chapter_id,
        )
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    # Remove from AnythingLLM workspace
    if doc.anythingllm_location and chapter.workspace_slug:
        client = get_client()
        try:
            await client.workspace.remove_documents(
                chapter.workspace_slug, [doc.anythingllm_location]
            )
        except AnythingLLMError:
            pass

    # Remove local file
    path = Path(doc.original_file_path)
    path.unlink(missing_ok=True)
    db.delete(doc)
    db.commit()


# ── Chapter AI Comments ────────────────────────────────────────────────────────

@router.get("/{chapter_id}/ai-comment", response_model=ChapterAICommentOut | None)
def get_ai_comment(
    course_id: uuid.UUID,
    chapter_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbDep,
):
    """Return the current student's AI comment for this chapter, or null."""
    _get_chapter_or_404(chapter_id, course_id, db)
    if current_user.role != UserRole.student:
        raise HTTPException(status_code=403, detail="Only students have AI comments.")
    return db.scalar(
        select(ChapterAIComment).where(
            ChapterAIComment.chapter_id == chapter_id,
            ChapterAIComment.student_id == current_user.id,
        )
    )


@router.post("/{chapter_id}/ai-comment/generate", response_model=ChapterAICommentOut)
async def generate_ai_comment(
    course_id: uuid.UUID,
    chapter_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbDep,
):
    """Generate or refresh the AI comment for the current student on this chapter."""
    if current_user.role != UserRole.student:
        raise HTTPException(status_code=403, detail="Only students can generate chapter AI comments.")

    chapter = _get_chapter_or_404(chapter_id, course_id, db)
    student = db.get(StudentUser, current_user.id)
    student_name = student.user.nickname if student else "the student"
    workspace_slug = await _ensure_workspace(chapter, db)

    prompt = (
        f"Chapter: {chapter.title}\n"
        f"Description: {chapter.description or 'N/A'}\n\n"
        f"Based on the chapter content and {student_name}'s progress, provide a personalised, "
        f"encouraging AI study comment. Summarise key learning points, highlight any areas "
        f"that may need extra attention, and suggest next steps. "
        f"Keep it concise and formatted in markdown."
    )

    client = get_client()
    response = await client.workspace.chat(workspace_slug, prompt, mode=ChatMode.query)
    generated = response.textResponse

    existing = db.scalar(
        select(ChapterAIComment).where(
            ChapterAIComment.chapter_id == chapter_id,
            ChapterAIComment.student_id == current_user.id,
        )
    )
    if existing:
        existing.comment = generated
        db.commit()
        db.refresh(existing)
        return existing

    record = ChapterAIComment(
        chapter_id=chapter_id,
        student_id=current_user.id,
        comment=generated,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.post("/{chapter_id}/ai-comment/stream")
async def stream_ai_comment(
    course_id: uuid.UUID,
    chapter_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbDep,
):
    """SSE endpoint – streams the AI comment and persists the final result."""
    if current_user.role != UserRole.student:
        raise HTTPException(status_code=403, detail="Only students can stream chapter AI comments.")

    chapter = _get_chapter_or_404(chapter_id, course_id, db)
    student = db.get(StudentUser, current_user.id)
    student_name = student.user.nickname if student else "the student"
    workspace_slug = await _ensure_workspace(chapter, db)

    prompt = (
        f"Chapter: {chapter.title}\n"
        f"Description: {chapter.description or 'N/A'}\n\n"
        f"Based on the chapter content and {student_name}'s progress, provide a personalised, "
        f"encouraging AI study comment. Summarise key learning points, highlight any areas "
        f"that may need extra attention, and suggest next steps. "
        f"Keep it concise and formatted in markdown."
    )

    async def event_stream():
        accumulated = ""
        client = get_client()
        async for chunk in client.workspace.stream_chat(workspace_slug, prompt, mode=ChatMode.query):
            token = chunk.textResponse or ""
            if token:
                accumulated += token
                yield f"data: {token}\n\n"
        yield "data: [DONE]\n\n"

        existing = db.scalar(
            select(ChapterAIComment).where(
                ChapterAIComment.chapter_id == chapter_id,
                ChapterAIComment.student_id == current_user.id,
            )
        )
        if existing:
            existing.comment = accumulated
        else:
            db.add(ChapterAIComment(
                chapter_id=chapter_id,
                student_id=current_user.id,
                comment=accumulated,
            ))
        db.commit()

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ── Chapter Threads (Chatroom) ────────────────────────────────────────────────

class ChatMessageRequest(BaseModel):
    message: str


@router.get("/{chapter_id}/threads", response_model=list[ThreadOut])
def list_threads(
    course_id: uuid.UUID,
    chapter_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbDep,
):
    """List all chat threads the current user has in this chapter workspace."""
    _get_chapter_or_404(chapter_id, course_id, db)
    return db.scalars(
        select(ChapterThread).where(
            ChapterThread.chapter_id == chapter_id,
            ChapterThread.user_id == current_user.id,
        ).order_by(ChapterThread.created_at)
    ).all()


@router.post("/{chapter_id}/threads", response_model=ThreadOut, status_code=status.HTTP_201_CREATED)
async def create_thread(
    course_id: uuid.UUID,
    chapter_id: uuid.UUID,
    body: ThreadCreate,
    current_user: CurrentUser,
    db: DbDep,
):
    """Create a new named thread in the chapter's AnythingLLM workspace."""
    chapter = _get_chapter_or_404(chapter_id, course_id, db)
    workspace_slug = await _ensure_workspace(chapter, db)

    client = get_client()
    thread_info = await client.workspace.create_thread(
        workspace_slug,
        body.name,
        user_id=current_user.anythingllm_user_id if hasattr(current_user, "anythingllm_user_id") else None,
    )

    record = ChapterThread(
        chapter_id=chapter_id,
        user_id=current_user.id,
        thread_slug=thread_info.slug,
        name=body.name,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{chapter_id}/threads/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_thread(
    course_id: uuid.UUID,
    chapter_id: uuid.UUID,
    thread_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbDep,
):
    """Delete a thread from the chapter workspace and our DB."""
    chapter = _get_chapter_or_404(chapter_id, course_id, db)
    thread = db.scalar(
        select(ChapterThread).where(
            ChapterThread.id == thread_id,
            ChapterThread.user_id == current_user.id,
        )
    )
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found.")

    if chapter.workspace_slug:
        client = get_client()
        try:
            await client.workspace.delete_thread(chapter.workspace_slug, thread.thread_slug)
        except Exception:
            pass

    db.delete(thread)
    db.commit()


@router.get("/{chapter_id}/threads/{thread_id}/history")
async def get_thread_history(
    course_id: uuid.UUID,
    chapter_id: uuid.UUID,
    thread_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbDep,
):
    """Return chat history for a specific thread."""
    chapter = _get_chapter_or_404(chapter_id, course_id, db)
    thread = db.scalar(
        select(ChapterThread).where(
            ChapterThread.id == thread_id,
            ChapterThread.user_id == current_user.id,
        )
    )
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found.")

    workspace_slug = await _ensure_workspace(chapter, db)
    client = get_client()
    history = await client.workspace.get_thread_history(workspace_slug, thread.thread_slug)
    return {"history": [{"role": h.role, "content": h.content, "sentAt": h.sentAt} for h in history.history]}


@router.post("/{chapter_id}/threads/{thread_id}/stream")
async def stream_thread_chat(
    course_id: uuid.UUID,
    chapter_id: uuid.UUID,
    thread_id: uuid.UUID,
    body: ChatMessageRequest,
    current_user: CurrentUser,
    db: DbDep,
):
    """SSE stream – send a message to a specific thread and stream the reply."""
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    chapter = _get_chapter_or_404(chapter_id, course_id, db)
    thread = db.scalar(
        select(ChapterThread).where(
            ChapterThread.id == thread_id,
            ChapterThread.user_id == current_user.id,
        )
    )
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found.")

    workspace_slug = await _ensure_workspace(chapter, db)
    thread_slug = thread.thread_slug
    message = body.message

    async def event_stream():
        client = get_client()
        async for chunk in client.workspace.stream_thread_chat(
            workspace_slug, thread_slug, message, mode=ChatMode.chat
        ):
            token = chunk.textResponse or ""
            if token:
                yield f"data: {json.dumps(token)}\n\n"
            if chunk.close:
                break
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
