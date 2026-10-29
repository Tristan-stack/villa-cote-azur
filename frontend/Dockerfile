# =============================================================================
# Image Docker du frontend (Node.js, Express + EJS) — construction multi-étapes :
#   deps        → dépendances de production uniquement
#   test        → lint + tests unitaires. La CI construit cette cible :
#                 un test qui échoue fait échouer le build.
#   production  → image finale : légère, sans outils de test, non-root
# =============================================================================

# Version de l'image de base, modifiable au build sans toucher au fichier :
#   docker build --build-arg NODE_VERSION=24.22-alpine3.24 .
ARG NODE_VERSION=24.22-alpine3.24

# ---- Base commune : image officielle Node.js, variante Alpine (légère) -------
FROM node:${NODE_VERSION} AS base
WORKDIR /app

# ---- Dépendances de production -------------------------------------------------
FROM base AS deps
# On copie d'abord UNIQUEMENT les fichiers de dépendances : tant qu'ils ne
# changent pas, Docker réutilise cette couche en cache (pas de réinstallation).
COPY package.json package-lock.json ./
# npm ci installe exactement les versions figées dans package-lock.json
RUN npm ci --omit=dev

# ---- Tests (cible de la CI : docker build --target test) ------------------------
FROM base AS test
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run lint && npm test

# ---- Image de production ----------------------------------------------------------
FROM base AS production
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="frontend" \
      org.opencontainers.image.description="Villa sur la Côte d'Azur : site web sans état (rendu côté serveur)" \
      org.opencontainers.image.source="https://github.com/Tristan-stack/villa-cote-azur" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"
# NODE_ENV=production : Express met les pages en cache et masque les détails d'erreur
ENV NODE_ENV=production
# Seuls les fichiers nécessaires à l'exécution : ni tests, ni outils de dev.
# Ils appartiennent à root : l'application ne peut pas modifier son propre code.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY views ./views
COPY public ./public
# npm, npx, yarn et corepack ne servent pas à l'exécution : on les retire pour
# réduire la surface d'attaque (et les alertes du scanner de vulnérabilités).
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx \
           /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
# Utilisateur non-root « node » de l'image officielle, désigné par son uid:gid
# numérique (vérifiable par l'hôte et par les orchestrateurs)
USER 1000:1000
# Seul port publié sur la machine hôte (voir docker-compose.yml)
EXPOSE 3000
# Docker interroge /health toutes les 10 s ; après 3 échecs, le conteneur est « unhealthy »
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
# Forme « exec » : node est le processus PID 1 et reçoit directement SIGTERM (arrêt propre)
CMD ["node", "src/server.js"]
