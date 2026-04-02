from .auth import router as auth_router
from .users import router as users_router
from .courses import router as courses_router
from .chapters import router as chapters_router
from .assignments import router as assignments_router
from .documents import router as documents_router
from .progress import router as progress_router

__all__ = [
    "auth_router",
    "users_router",
    "courses_router",
    "chapters_router",
    "assignments_router",
    "documents_router",
    "progress_router",
]
