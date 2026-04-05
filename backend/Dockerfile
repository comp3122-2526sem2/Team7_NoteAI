# Backend image — dependencies are fully declared here so `docker compose build` is
# reproducible on any machine (no reliance on local pip installs).
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
# PDF: lesson_plans uses MarkdownIt("commonmark").enable("table") — no gfm-like/linkify extras.

# System libs for WeasyPrint (PDF) + fonts; keep in sync with weasyprint docs for Debian.
# https://doc.courtbouillon.org/weasyprint/stable/first_steps.html
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libffi-dev \
    libgdk-pixbuf-2.0-0 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libpangoft2-1.0-0 \
    libharfbuzz0b \
    fontconfig \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Same URL as FastAPI /health — fails fast if the app never binds.
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).read()" || exit 1

# --reload matches dev workflow with compose volume mount ./backend:/app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
