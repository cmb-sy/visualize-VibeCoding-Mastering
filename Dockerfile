# Stage 1: フロントエンドビルド
FROM node:22-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: バックエンド + フロントエンド静的配信
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim
WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY api/ ./api/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

EXPOSE 8080
CMD ["uv", "run", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8080"]
