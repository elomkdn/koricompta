# ── Backend Django + frontend pré-compilé ─────────────────────────────────────
# Le frontend est compilé localement avant déploiement (npm run build),
# puis le dist/ est copié directement dans l'image. Plus rapide, pas de cache stale.
FROM python:3.12-slim
WORKDIR /app

RUN apt-get update && apt-get install -y \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY frontend/dist/ ./frontend/dist/

WORKDIR /app/backend

RUN python manage.py collectstatic --noinput

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/docker-entrypoint.sh"]
