# Villa sur la Côte d'Azur

[![CI/CD](https://github.com/Tristan-stack/villa-cote-azur/actions/workflows/ci.yml/badge.svg)](https://github.com/Tristan-stack/villa-cote-azur/actions/workflows/ci.yml)

Site de location de villas sur la Côte d'Azur, découpé en micro-services Docker.
Projet du module « Dév avec Docker » (Master 2).

## Architecture

```
                 Navigateur
                     │  http://localhost:8081   (seul port publié)
                     ▼
   ┌───────────── frontend ─────────────┐   réseau « public »
   │ Node.js · Express · EJS, SANS ÉTAT │
   └──────┬────────────┬────────────┬───┘   réseau « backend » (internal)
          ▼            ▼            ▼
    auth-service  villa-service  booking-service
    Node.js       Python         Python
          └────────────┼────────────┘        réseau « data » (internal)
                       ▼
          PostgreSQL : auth_db · villa_db · booking_db
```

| Service | Technologie | Rôle | Port interne |
|---|---|---|---|
| `frontend` | Node.js 24, Express 5, EJS | site web rendu côté serveur, sans état | 3000, publié sur 8081 |
| `auth-service` | Node.js 24, Express 5 | comptes, connexion, sessions, rôles | 3001 |
| `villa-service` | Python 3.13, FastAPI | catalogue des villas | 8001 |
| `booking-service` | Python 3.13, FastAPI | réservations | 8002 |
| `db` | PostgreSQL 17 | une base et un utilisateur SQL par service | 5432 |

Seul le frontend est joignable depuis l'extérieur. Les backends et la base sont sur des réseaux
Docker `internal`, sans aucun port publié.

L'interface est minimaliste, dans le style de shadcn/ui :
- thème « neutral », police Geist ;
- mode sombre automatique.

Elle n'utilise aucune ressource externe. Pages compressées en gzip : environ 37 Ko pour l'accueil,
police comprise.

## Lancer l'application (environnement TEST)

Prérequis : Docker Engine ou Docker Desktop, avec Docker Compose v2.

Toutes les commandes de ce dépôt sont écrites pour **bash** : Git Bash sous Windows, ou le
terminal de Linux et macOS.

```bash
docker compose up -d --build --wait
```

Puis ouvrir **http://localhost:8081**.

- **Compte administrateur de TEST** : `admin@villa.fr` / `admin1234` (défini dans `.env`).
- **Compte standard** : à créer depuis la page « Créer un compte ».

Pour arrêter :
- `docker compose down` conserve les données ;
- `docker compose down -v` supprime aussi le volume de la base, pour repartir de zéro.

## Environnements TEST / UAT / PROD

Le même `docker-compose.yml` sert pour les trois environnements. Seul le fichier de variables
change :

| Environnement | Fichier de variables | Images | Port | Projet compose |
|---|---|---|---|---|
| TEST | `.env` (lu par défaut, valeurs factices) | construites localement (`build`) | 8081 | `villa-cote-azur-test` |
| UAT | `env/uat.env` (créé depuis `env/uat.env.example`) | GHCR, version candidate | 8082 | `villa-cote-azur-uat` |
| PROD | `env/prod.env` (créé depuis `env/prod.env.example`) | GHCR, version publiée | 80 | `villa-cote-azur-prod` |

Les fichiers `env/*.env`, qui contiennent les vrais secrets, ne sont jamais versionnés.

```bash
cp env/uat.env.example env/uat.env                   # puis remplacer les CHANGE_ME
docker compose --env-file env/uat.env config         # vérifier la configuration finale
docker compose --env-file env/uat.env pull           # récupérer les images publiées par la CI
docker compose --env-file env/uat.env up -d --no-build --wait
```

## Commandes utiles

| Commande | Effet |
|---|---|
| `docker compose ps` | état et santé (*healthy*) des conteneurs |
| `docker compose logs -f frontend` | logs d'un service (sortie standard) |
| `docker compose config` | configuration réellement appliquée (variables remplacées) |
| `docker stats` | consommation CPU et mémoire face aux limites |
| `docker compose restart frontend` | redémarre le frontend : les utilisateurs restent connectés |
| `docker compose up -d --scale villa-service=3 --no-recreate` | 3 instances d'un backend sans état |
| `docker ps --filter "label=com.villa-cote-azur.env=test"` | conteneurs du projet, filtrés par label |
| `docker compose exec db psql -U postgres -d auth_db` | console SQL dans la base des comptes |

Dans la fenêtre Git Bash classique (hors du terminal de VS Code), une commande interactive comme
`psql` peut rester sans invite ou afficher « the input device is not a TTY ». Il suffit alors de la
préfixer par `winpty`, fourni avec Git Bash :

```bash
winpty docker compose exec db psql -U postgres -d auth_db
```

## Tests

```bash
# Tests unitaires (et lint) d'un service, dans un conteneur : comme dans la CI
docker build --target test ./auth-service

# Tests unitaires en local, sans Docker (Node.js 24 et Python 3.13 installés)
(cd auth-service && npm ci && npm test)            # idem pour frontend
# Python dans un environnement virtuel ; sous Linux et macOS : source .venv/bin/activate
(cd villa-service && python -m venv .venv && source .venv/Scripts/activate \
  && pip install -r requirements-dev.txt && pytest)   # idem pour booking-service

# Test de bout en bout de l'application lancée (28 vérifications)
bash scripts/smoke-test.sh
```

## CI/CD

À chaque commit et à chaque tag poussés, GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml))
enchaîne trois étapes :
1. **tests** des 4 services ;
2. **test de bout en bout** de l'application lancée avec docker compose ;
3. **publication** des images dans GHCR, avec un tag unique (nom du tag git ou SHA court du
   commit), après un scan de vulnérabilités Trivy et la génération d'un SBOM.

Images publiées : `ghcr.io/tristan-stack/villa-cote-azur/<service>:<tag>`.

## Sauvegarde de la base

```bash
docker compose exec -T db pg_dumpall -U postgres > sauvegarde.sql        # sauvegarde
docker compose exec -T db psql -U postgres < sauvegarde.sql              # restauration
```

## Structure du dépôt

```
auth-service/      Node.js : src/, test/, Dockerfile
villa-service/     Python  : app/, tests/, Dockerfile
booking-service/   Python  : app/, tests/, Dockerfile
frontend/          Node.js : src/, views/, public/, test/, Dockerfile
db/init/           script d'initialisation PostgreSQL (bases + utilisateurs)
env/               modèles de configuration UAT et PROD
scripts/           test de bout en bout
docs/              rapport de projet et ses images
docker-compose.yml, .env, .github/workflows/ci.yml
```

## Documentation

- [Rapport de projet](docs/rapport.md)
