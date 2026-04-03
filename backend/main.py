import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

from anythingllm import get_client
from database import engine
from models import Base
from routers import (
    assignments_router,
    auth_router,
    chapters_router,
    courses_router,
    documents_router,
    progress_router,
    prompts_router,
    users_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield
    await get_client().close()


app = FastAPI(title="NoteAI", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(courses_router)
app.include_router(chapters_router)
app.include_router(assignments_router)
app.include_router(documents_router)
app.include_router(progress_router)
app.include_router(prompts_router)


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
