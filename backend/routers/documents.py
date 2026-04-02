import os
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, status
from sqlalchemy import select

from anythingllm import ChatMode, get_client
from deps import DbDep, TeacherUser
from models import Document
from models.document import ConversionStatus, DocumentType
from schemas import AICheckRequest, DocumentOut, DocumentUpdate

router = APIRouter(prefix="/documents", tags=["Documents"])

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
    "text/plain": "txt",
    "text/markdown": "md",
}


@router.get("", response_model=list[DocumentOut])
def list_documents(current_user: TeacherUser, db: DbDep):
    return db.scalars(
        select(Document)
        .where(Document.uploaded_by == current_user.id)
        .order_by(Document.created_at.desc())
    ).all()


@router.post("/upload", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile,
    current_user: TeacherUser,
    db: DbDep,
    document_type: DocumentType = DocumentType.other,
    course_id: uuid.UUID | None = None,
):
    """
    Upload a PDF or Word file. The file is:
    1. Saved to local storage.
    2. Pushed to AnythingLLM for conversion and embedding.
    3. A Document record is created with conversion_status=pending.
    """
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{file.content_type}'. "
                   f"Allowed: {', '.join(ALLOWED_TYPES.keys())}",
        )

    ext = ALLOWED_TYPES[file.content_type]
    saved_name = f"{uuid.uuid4()}.{ext}"
    save_path = UPLOAD_DIR / saved_name
    file_bytes = await file.read()
    save_path.write_bytes(file_bytes)

    doc = Document(
        uploaded_by=current_user.id,
        course_id=course_id,
        document_type=document_type,
        original_filename=file.filename,
        original_file_type=ext,
        original_file_path=str(save_path),
        conversion_status=ConversionStatus.pending,
    )
    db.add(doc)
    db.flush()

    try:
        client = get_client()
        result = await client.document.upload_file(file_bytes, file.filename)
        if result.success and result.documents:
            await client.workspace.add_documents(
                "doc-checker", [result.documents[0].location]
            )
            doc.conversion_status = ConversionStatus.completed
        else:
            doc.conversion_status = ConversionStatus.failed
    except Exception:
        doc.conversion_status = ConversionStatus.failed

    db.commit()
    db.refresh(doc)
    return doc


@router.get("/{doc_id}", response_model=DocumentOut)
def get_document(doc_id: uuid.UUID, current_user: TeacherUser, db: DbDep):
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    if doc.uploaded_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")
    return doc


@router.put("/{doc_id}", response_model=DocumentOut)
def update_document(doc_id: uuid.UUID, body: DocumentUpdate, current_user: TeacherUser, db: DbDep):
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    if doc.uploaded_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(doc, field, value)
    db.commit()
    db.refresh(doc)
    return doc


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(doc_id: uuid.UUID, current_user: TeacherUser, db: DbDep):
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    if doc.uploaded_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")
    # Remove local file if it exists
    path = Path(doc.original_file_path)
    if path.exists():
        path.unlink(missing_ok=True)
    db.delete(doc)
    db.commit()


@router.post("/{doc_id}/ai-check", response_model=DocumentOut)
async def ai_format_check(
    doc_id: uuid.UUID,
    body: AICheckRequest,
    current_user: TeacherUser,
    db: DbDep,
):
    """
    Ask AnythingLLM to review the document's format, structure, and style.
    Saves AI feedback + AI-generated CSS to the document record.
    """
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    if doc.uploaded_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")
    if doc.conversion_status != ConversionStatus.completed:
        raise HTTPException(status_code=400, detail="Document has not been converted yet.")

    extra = f"\n\nAdditional instructions: {body.extra_instructions}" if body.extra_instructions else ""
    feedback_prompt = (
        f"Review the document '{doc.original_filename}' (type: {doc.document_type.value}).\n"
        f"Check for: formatting consistency, language clarity, structural issues, "
        f"and compliance with standard school document conventions.\n"
        f"Provide detailed feedback in markdown format.{extra}"
    )
    css_prompt = (
        f"Based on the document '{doc.original_filename}' (type: {doc.document_type.value}), "
        f"generate a clean CSS stylesheet suitable for rendering this document type as HTML. "
        f"Return only the CSS code, no explanation."
    )

    client = get_client()
    feedback_resp, css_resp = await _gather(
        client.workspace.chat(body.workspace_slug, feedback_prompt, mode=ChatMode.query),
        client.workspace.chat(body.workspace_slug, css_prompt, mode=ChatMode.query),
    )

    doc.ai_format_feedback = feedback_resp.textResponse
    doc.css_style = css_resp.textResponse
    db.commit()
    db.refresh(doc)
    return doc


async def _gather(*coros):
    import asyncio
    return await asyncio.gather(*coros)
