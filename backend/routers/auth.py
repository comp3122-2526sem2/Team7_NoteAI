import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select

from anythingllm import get_client
from auth_utils import create_access_token, hash_password, verify_password
from database import SessionLocal
from deps import CurrentUser, DbDep
from models import StudentUser, TeacherUser, User, UserRole
from schemas import RegisterRequest, TokenResponse, UserOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Auth"])


async def _provision_anythingllm_user(user_id: str, username: str, password: str) -> None:
    """
    Background task: create a matching user in AnythingLLM and store their
    AnythingLLM user ID so we can associate threads with them.
    """
    logger.debug("[AnythingLLM] Provisioning user '%s' (id=%s)…", username, user_id)
    db = SessionLocal()
    try:
        client = get_client()
        llm_user = await client.admin.create_user(username=username, password=password)
        if llm_user is None:
            logger.warning(
                "[AnythingLLM] create_user returned None for '%s' — "
                "AnythingLLM may not be in multi-user mode (got 401).",
                username,
            )
            return

        logger.debug(
            "[AnythingLLM] Created user '%s' → anythingllm_user_id=%s",
            username, llm_user.id,
        )

        from uuid import UUID
        user = db.get(User, UUID(user_id))
        if user:
            user.anythingllm_user_id = llm_user.id
            db.commit()
            logger.info(
                "[AnythingLLM] Stored anythingllm_user_id=%s for user '%s'",
                llm_user.id, username,
            )
        else:
            logger.error("[AnythingLLM] User id=%s not found in DB after register.", user_id)

    except Exception as exc:
        logger.exception("[AnythingLLM] Failed to provision user '%s': %s", username, exc)
    finally:
        db.close()


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, background_tasks: BackgroundTasks, db: DbDep):
    if db.scalar(select(User).where(User.username == body.username)):
        raise HTTPException(status_code=400, detail="Username already taken.")

    if body.role == UserRole.student and not body.student_id:
        raise HTTPException(status_code=400, detail="student_id is required for students.")
    if body.role == UserRole.teacher and not body.teacher_id:
        raise HTTPException(status_code=400, detail="teacher_id is required for teachers.")

    user = User(
        nickname=body.nickname,
        username=body.username,
        password=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    db.flush()

    if body.role == UserRole.student:
        db.add(StudentUser(id=user.id, student_id=body.student_id))
    elif body.role == UserRole.teacher:
        db.add(TeacherUser(id=user.id, teacher_id=body.teacher_id))

    db.commit()
    db.refresh(user)

    background_tasks.add_task(
        _provision_anythingllm_user,
        str(user.id),
        body.username,
        body.password,
    )

    return user


@router.post("/login", response_model=TokenResponse)
def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: DbDep,
):
    """
    Standard OAuth2 password flow. Send as form data:
      username=... & password=...
    Returns a Bearer token for use in the Authorization header.
    """
    user = db.scalar(select(User).where(User.username == form.username))
    if not user or not verify_password(form.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled.")

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    return TokenResponse(access_token=create_access_token(str(user.id), user.role.value))


@router.get("/me", response_model=UserOut)
def me(current_user: CurrentUser):
    return current_user
