# =============================================================================
# Image Docker du villa-service (Python / FastAPI) — construction multi-étapes :
#   deps        → environnement virtuel avec les dépendances de production
#   test        → lint (ruff) + tests unitaires (pytest). La CI construit cette
#                 cible : un test qui échoue fait échouer le build.
#   production  → image finale : légère, sans outils de test, non-root
# =============================================================================

# Version de l'image de base, modifiable au build : --build-arg PYTHON_VERSION=…
ARG PYTHON_VERSION=3.13-slim-trixie

# ---- Base commune : image officielle Python, variante « slim » (Debian minimale) -----
FROM python:${PYTHON_VERSION} AS base
# Pas de fichiers .pyc (système de fichiers en lecture seule) ; logs affichés immédiatement
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

# ---- Dépendances de production, dans un environnement virtuel (venv) ----------------
FROM base AS deps
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
# Fichier de dépendances copié seul d'abord : couche réutilisée en cache tant qu'il ne change pas
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---- Tests (cible de la CI : docker build --target test) ------------------------------
FROM deps AS test
COPY requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY . .
RUN ruff check . && pytest -q

# ---- Image de production ------------------------------------------------------------------
FROM base AS production
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="villa-service" \
      org.opencontainers.image.description="Villa sur la Côte d'Azur : catalogue des villas" \
      org.opencontainers.image.source="https://github.com/Tristan-stack/villa-cote-azur" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"
# Utilisateur système dédié, sans shell ni dossier personnel
RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin app
# Seulement le venv de production (ni pytest, ni ruff) et le code de l'application
COPY --from=deps /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY app ./app
USER 10001:10001
EXPOSE 8001
# Pas de curl dans l'image slim : la sonde de santé est écrite en Python
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
    CMD ["python", "-c", "import sys, urllib.request; sys.exit(urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=3).status != 200)"]
# Forme « exec » : uvicorn est le processus PID 1 et gère SIGTERM (arrêt propre)
CMD ["uvicorn", "app.main:create_production_app", "--factory", "--host", "0.0.0.0", "--port", "8001"]
