from contextlib import asynccontextmanager

from fastapi import FastAPI

from anythingllm import get_client
from database import engine
from models import Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield
    await get_client().close()


app = FastAPI(title="NoteAI", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok"}
