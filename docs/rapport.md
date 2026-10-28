# Rapport de projet — Villa sur la Côte d'Azur

_Module « Dév avec Docker » — Master 2 — octobre 2026_
_Dépôt : https://github.com/Tristan-stack/projet-docker_

**Sommaire**
1. Architecture logicielle
2. Dockerfiles et docker-compose.yml
3. Dépôt Git et pipeline CI/CD
4. Gestion de projet
5. Rétrospective

---

## 1. Architecture logicielle

### 1.1 Vue d'ensemble

« Villa sur la Côte d'Azur » est un site de location de villas. Il est découpé en cinq
conteneurs : un frontend, trois backends et une base de données.

```
                 Navigateur
                     │  HTTP, port 8081 (seul port publié sur la machine hôte)
                     ▼
   ┌───────────── frontend ─────────────┐   réseau « public »
   │ Node.js 24 · Express 5 · EJS       │
   │ SANS ÉTAT : cookie = jeton opaque  │
   └──────┬────────────┬────────────┬───┘   réseau « backend » (internal)
          ▼            ▼            ▼
    auth-service  villa-service  booking-service
    Node.js       Python/FastAPI Python/FastAPI
       :3001         :8001          :8002
          └────────────┼────────────┘        réseau « data » (internal)
                       ▼
           PostgreSQL 17 (volume nommé)
     auth_db · villa_db · booking_db (un utilisateur SQL par base)
```

| Service | Technologie | Responsabilité | Données |
|---|---|---|---|
| frontend | Node.js 24, Express 5, EJS | pages HTML rendues côté serveur, contrôle d'accès, assemblage des réponses des API | aucune (sans état) |
| auth-service | Node.js 24, Express 5 | inscription, connexion, déconnexion, sessions, rôles, suppression de comptes | `auth_db` : `users`, `sessions` |
| villa-service | Python 3.13, FastAPI | catalogue des villas (liste, filtre par ville, détail) | `villa_db` : `villas` |
| booking-service | Python 3.13, FastAPI | réservations : création, liste, annulation, refus des chevauchements | `booking_db` : `bookings` |
| db | PostgreSQL 17 | une base et un utilisateur SQL par micro-service | volume nommé `db-data` |

### 1.2 Respect des contraintes du sujet

| Contrainte du sujet | Réponse apportée |
|---|---|
| Un frontend web dans un conteneur | `frontend` (Express + EJS) |
| Au moins 3 backends, chacun dans un conteneur | `auth-service`, `villa-service`, `booking-service` |
| Au moins 2 langages pour les backends | Node.js (auth) et Python (villas, réservations) |
| Frontend sans état | sessions stockées dans `auth_db` ; le frontend ne garde rien en mémoire (§ 1.3) |
| Backends exposant une API HTTP REST | API JSON (§ 1.4) |
| Base SQL pour les données persistantes | PostgreSQL 17, volume nommé |
| Frontend joignable par les clients | seul `ports:` du compose : `8081:3000` |
| Backends et base injoignables par les clients | aucun port publié, réseaux `internal: true` |
| Tests unitaires pour chaque backend | 17 (auth), 8 (villas), 21 (réservations), plus 24 pour le frontend |
| Création de compte, connexion, déconnexion | `/register`, `/login`, `/logout` |
| Comptes « standard » et « admin » | colonne `role` ; l'inscription crée toujours un compte standard |
| Chacun peut supprimer son compte | page « Mon compte » (`DELETE /users/me`) |
| Un admin peut supprimer les comptes standard | page « Administration » ; supprimer un autre admin est refusé (403) |
| Avant connexion : accueil et connexion uniquement | les autres pages redirigent vers `/login` |
| La connexion débloque des zones du site | catalogue, réservations, compte, administration |

### 1.3 Un frontend sans état (pattern « Backend For Frontend »)

Le frontend génère les pages HTML côté serveur. Le navigateur ne parle qu'à lui, et c'est lui qui
appelle les backends sur le réseau Docker interne. Les backends n'ont donc jamais besoin d'être
exposés.

Le frontend ne conserve **aucun état** :
- à la connexion, l'auth-service crée une session en base et renvoie un jeton aléatoire de 256 bits ;
- le frontend place ce jeton dans un cookie `HttpOnly` et `SameSite=Lax` (`Secure` en production) ;
- à chaque requête, il demande à l'auth-service à qui appartient le jeton (`GET /auth/me`) ;
- il n'utilise volontairement pas `express-session`, qui stocke les sessions en mémoire.

Conséquence vérifiée par le test de bout en bout : après `docker compose restart frontend`,
l'utilisateur est toujours connecté. On pourrait de même lancer plusieurs instances du frontend
derrière un répartiteur de charge.

L'identité de l'utilisateur est transmise aux autres services par le frontend, dans l'en-tête
`X-User-Id`. Les backends lui font confiance parce qu'ils ne sont joignables que depuis le réseau
interne. Le frontend fait aussi de la **composition d'API** : la page « Mes réservations » combine
les réservations du booking-service et les villas du villa-service pour afficher le prix total.

### 1.4 Les API REST

**auth-service**

| Route | Accès | Effet |
|---|---|---|
| `POST /auth/register` | public | crée un compte **standard** (201 ; 409 si l'email existe) |
| `POST /auth/login` | public | vérifie le mot de passe, crée une session et renvoie le jeton |
| `POST /auth/logout` | connecté | supprime la session |
| `GET /auth/me` | connecté | utilisateur associé au jeton |
| `DELETE /users/me` | connecté | supprime son propre compte (et ses sessions) |
| `GET /users` | admin | liste des comptes |
| `DELETE /users/:id` | admin | supprime un compte standard ; 403 si la cible est un admin |

**villa-service** : `GET /villas` (filtre `?city=`), `GET /villas/{id}`.

**booking-service** (identité dans l'en-tête `X-User-Id`) :

| Route | Effet |
|---|---|
| `GET /bookings` | réservations de l'utilisateur |
| `POST /bookings` | crée une réservation ; 400 si les dates sont invalides, 409 si elles chevauchent une autre réservation |
| `DELETE /bookings/{id}` | annulation, par le propriétaire uniquement (404 sinon) |
| `GET /villas/{id}/bookings` | périodes déjà réservées d'une villa, sans données personnelles |
| `DELETE /users/{id}/bookings` | supprime les réservations d'un compte supprimé |

Chaque service expose aussi `GET /health`, utilisé par le `HEALTHCHECK` Docker.

### 1.5 Données : une base par micro-service

Un seul conteneur PostgreSQL héberge **trois bases distinctes**, chacune avec son utilisateur SQL :

| Base | Utilisateur | Service propriétaire |
|---|---|---|
| `auth_db` | `auth_user` | auth-service |
| `villa_db` | `villa_user` | villa-service |
| `booking_db` | `booking_user` | booking-service |

- Le script `db/init/01-init.sh` crée ces bases et ces utilisateurs au premier démarrage.
- Il retire aussi le droit de connexion par défaut (`REVOKE ALL ... FROM PUBLIC`) : un service ne
  peut ouvrir que sa propre base (**moindre privilège**). Un service compromis n'expose que ses
  propres données.
- Les mots de passe arrivent par variables d'environnement, jamais écrits dans le dépôt.
- Chaque service crée lui-même ses tables au démarrage (`CREATE TABLE IF NOT EXISTS`), sous un
  verrou PostgreSQL (`pg_advisory_xact_lock`) : plusieurs instances peuvent démarrer en même temps
  sans conflit.
- Aucune clé étrangère ne relie deux bases. La cohérence passe par les API : quand un compte est
  supprimé, le frontend demande aussi au booking-service de supprimer ses réservations.
- Règle d'intégrité forte : deux réservations d'une même villa ne peuvent pas se chevaucher. Une
  contrainte `EXCLUDE USING gist (villa_id WITH =, daterange(start_date, end_date) WITH &&)` le
  garantit dans PostgreSQL, même si deux demandes arrivent au même instant.

### 1.6 Sécurité applicative

- **Mots de passe** hachés avec bcrypt (salés, volontairement lents), jamais renvoyés par l'API.
- **Requêtes SQL paramétrées** partout (`$1` en Node.js, `%s` avec psycopg) : pas d'injection SQL.
- **Cookie de session** :
  - `HttpOnly` : illisible par le JavaScript de la page, il ne peut pas être volé par une faille XSS ;
  - `SameSite=Lax` : non envoyé par les formulaires d'autres sites (protection CSRF) ;
  - `Secure` en production.
- **Échappement HTML** automatique des données affichées (`<%= %>` d'EJS) : pas de faille XSS.
- **Redirections** après connexion limitées aux chemins internes du site, et messages affichés
  choisis dans une liste fermée (jamais le texte de l'URL).
- **Messages d'erreur** :
  - même message, que l'email existe ou non, pour ne pas révéler quels comptes existent ;
  - pas de détail technique renvoyé au client.
- **Rôle admin** : jamais attribuable par l'inscription. Le premier administrateur est créé au
  démarrage à partir des variables `ADMIN_EMAIL` et `ADMIN_PASSWORD`.

### 1.7 Tests

Chaque service suit la même architecture : les routes reçoivent leur accès aux données en
paramètre (**injection de dépendance**). En production, c'est PostgreSQL ; dans les tests, un faux
« repository » en mémoire. Les tests unitaires ne nécessitent donc aucune base : ils durent environ
une seconde et s'exécutent dans le stage `test` des Dockerfiles.

| Service | Outils | Nombre de tests |
|---|---|---|
| auth-service | `node:test` + `supertest`, ESLint | 17 |
| villa-service | `pytest` + `TestClient` FastAPI, ruff | 8 |
| booking-service | `pytest` (règles métier pures + API), ruff | 21 |
| frontend | `node:test` + `supertest` (faux client API), ESLint | 24 |

En complément, le script `scripts/smoke-test.sh` teste l'application complète lancée par docker
compose, en 28 vérifications :
- parcours utilisateur et administrateur ;
- refus d'un chevauchement ;
- absence d'état du frontend ;
- isolation réseau : backends injoignables depuis l'hôte, base injoignable depuis le frontend,
  aucun accès Internet depuis les backends.

---

## 2. Dockerfiles et docker-compose.yml

### 2.1 Dockerfiles : construction multi-étapes

Les quatre Dockerfiles suivent le même modèle, en trois étapes (*multi-stage build*) :

| Stage | Contenu | Utilisé par |
|---|---|---|
| `deps` | dépendances de production seulement (`npm ci --omit=dev`, ou un venv Python) | stage `production` |
| `test` | dépendances de dev + code + **lint et tests unitaires** | la CI (`docker build --target test`) : un test qui échoue fait échouer le build |
| `production` | image finale : dépendances de production et code de l'application, rien d'autre | docker compose, la CI (publication) |

Bonnes pratiques appliquées (référence au cours entre parenthèses) :

| Pratique | Mise en œuvre |
|---|---|
| Image de base officielle et légère, version épinglée | `node:24.22-alpine3.24`, `python:3.13-slim-trixie`, `postgres:17.11-alpine3.24`, jamais `latest` |
| Version de base paramétrable (`ARG`) | `ARG NODE_VERSION` / `ARG PYTHON_VERSION` avant le `FROM` |
| Cache des couches | fichiers de dépendances copiés **avant** le code : modifier le code ne réinstalle pas les dépendances |
| Dépendances reproductibles | `npm ci` avec `package-lock.json` ; versions figées (`==`) dans `requirements.txt` |
| Contexte de build réduit (`.dockerignore`) | `node_modules`, caches, `.git`, `.env` exclus |
| Multi-staged build | ni outils de test ni dépendances de dev dans l'image finale |
| Utilisateur non-root (`USER`) | uid 1000 (Node, utilisateur `node`) et uid 10001 (Python, utilisateur `app` créé) |
| Surface d'attaque réduite | npm, npx, yarn et corepack retirés de l'image Node de production ; code appartenant à root, non modifiable par l'application |
| Sonde de santé (`HEALTHCHECK`) | interroge `/health` toutes les 10 s, en Node ou en Python (pas de `curl` dans les images minimales) |
| `CMD` en forme exec | l'application est le PID 1 et reçoit `SIGTERM` : arrêt propre (requêtes terminées, connexions fermées) |
| Métadonnées (`LABEL`, spécification OCI) | `org.opencontainers.image.title`, `description`, `source`, `version`, `revision`, `created` (renseignés par la CI) |
| Logs | sur la sortie standard, jamais dans un fichier du conteneur |
| `EXPOSE` | documente le port de chaque service |

Les quatre Dockerfiles passent **hadolint**, un linter de Dockerfile, sans aucun avertissement.

### 2.2 docker-compose.yml

Toute l'application démarre en une commande : `docker compose up -d --build --wait`.

- **Réseaux** (trois zones isolées) :
  - `public` : le frontend, seul à publier un port ;
  - `backend` (`internal: true`) : frontend ↔ backends, sans route vers l'extérieur ;
  - `data` (`internal: true`) : backends ↔ base. Le frontend n'y est pas : il ne peut pas lire la
    base directement.
- **Découverte des services** : les backends sont joints par leur nom (`http://auth-service:3001`),
  traduit en adresse IP par le DNS interne de Docker. Aucun `links` (option dépréciée) n'est
  nécessaire.
- **Ordre de démarrage** :
  - healthcheck `pg_isready` en TCP sur la base. Pendant son initialisation, PostgreSQL démarre un
    serveur temporaire qui n'écoute qu'en local : le test TCP ne répond « prêt » qu'une fois le
    script d'init terminé ;
  - `depends_on` avec `condition: service_healthy` : les backends attendent la base, le frontend
    attend les backends.
- **Persistance** : volume nommé `db-data` pour PostgreSQL. Le script d'init est monté en lecture
  seule (`:ro`) dans `/docker-entrypoint-initdb.d`.
- **Limites de ressources (cgroups)** : `cpus`, `mem_limit`, `mem_reservation`, paramétrables par
  environnement.
- **Redémarrage automatique** : `restart: unless-stopped`.
- **Durcissement des conteneurs applicatifs** :
  - `read_only: true` (système de fichiers en lecture seule, `/tmp` en tmpfs) ;
  - `cap_drop: [ALL]` (aucune capability Linux) ;
  - `security_opt: no-new-privileges`.
- **Logs** : pilote `json-file` avec rotation (`max-size: 10m`, `max-file: 3`).
- **Labels** en nom de domaine inversé (`com.villa-cote-azur.app`, `com.villa-cote-azur.env`), pour
  filtrer les ressources : `docker ps --filter "label=com.villa-cote-azur.env=test"`.
- **Ancres YAML** (`x-app-defaults`, `x-logging`, `x-labels`) : les réglages communs sont écrits une
  seule fois.

Les variables obligatoires utilisent la syntaxe `${VAR:?message}` : le lancement échoue clairement
si un secret manque, au lieu de démarrer avec une valeur vide.

### 2.3 Environnements TEST, UAT et PROD

Le même `docker-compose.yml` sert pour les trois environnements ; seules les variables changent.
Elles sont lues dans `.env` (par défaut) ou dans le fichier passé avec `--env-file`.

| Variable | TEST (`.env`) | UAT (`env/uat.env`) | PROD (`env/prod.env`) |
|---|---|---|---|
| `COMPOSE_PROJECT_NAME` | `villa-cote-azur-test` | `villa-cote-azur-uat` | `villa-cote-azur-prod` |
| Images (`REGISTRY`, `IMAGE_TAG`) | construites localement (`local`) | GHCR, version candidate | GHCR, version publiée |
| `FRONTEND_PORT` | 8081 | 8082 | 80 |
| `COOKIE_SECURE` | false | false | true (derrière HTTPS) |
| Limites CPU et mémoire | 0,5 CPU, 256 Mo | 0,5 CPU, 256 Mo | 1 CPU, 512 Mo |
| Secrets | valeurs factices, versionnées | non versionnés | non versionnés |

- Un nom de projet par environnement : les environnements peuvent tourner côte à côte sans se
  mélanger (conteneurs, réseaux et volumes distincts).
- Conformément au principe du cours « même image de conteneur du TEST vers UAT vers PROD », UAT
  et PROD utilisent les images construites et testées par la CI, désignées par leur tag.
- `docker compose --env-file env/uat.env config` affiche la configuration finale avant tout
  déploiement.

### 2.4 Dimensionnement des limites

Les limites ont été choisies d'après les mesures de `docker stats`, comme le recommande le cours :

| Conteneur | Mémoire utilisée au repos | Limite |
|---|---|---|
| frontend | ≈ 27 Mo | 256 Mo |
| auth-service | ≈ 24 Mo | 256 Mo |
| villa-service | ≈ 41 Mo | 256 Mo |
| booking-service | ≈ 41 Mo | 256 Mo |
| db | ≈ 45 Mo | 512 Mo |

### 2.5 Choix techniques

- **Alpine pour Node.js, Debian « slim » pour Python** : les paquets Python compilés (psycopg) sont
  distribués pour la glibc de Debian ; Alpine (musl) aurait demandé une compilation.
- **Python dans un venv copié entre étapes** : l'image finale ne contient ni pip-tools, ni pytest,
  ni ruff.
- **Variables d'environnement plutôt que secrets Docker** : les `docker secret` du cours sont
  propres à Swarm. En compose « simple », nous avons gardé des variables lues dans un fichier non
  versionné. Le passage aux secrets (fichiers dans `/run/secrets`, convention `_FILE`) est une
  évolution identifiée.
- **Pas de reverse-proxy (Traefik)** : il faudrait monter le socket Docker dans un conteneur, ce
  qui revient à lui donner les droits root sur l'hôte. Avec un seul frontend, le port publié
  suffit. Les backends, sans état et sans port publié, se multiplient déjà avec
  `docker compose up --scale villa-service=3` : le DNS de Docker répartit les appels entre les
  instances.

---

## 3. Dépôt Git et pipeline CI/CD

### 3.1 Organisation du dépôt

Nous avons choisi un **dépôt unique (monorepo)**, public sur GitHub, qui contient les quatre
micro-services, le script d'initialisation de la base, le `docker-compose.yml`, le pipeline et la
documentation.

- **Avantages** :
  - un seul `docker-compose.yml` référence le code de tous les services (champ `build`) ;
  - un seul pipeline traite chaque service grâce à une matrice ;
  - un même commit peut modifier une API et le service qui l'appelle.
- **Inconvénient** : moins d'indépendance qu'avec un dépôt par micro-service (droits d'accès et
  cycle de versions communs).

Conventions :
- **Commits** au format « type(portée): description » (`feat(frontend): …`, `ci: …`, `docs: …`),
  un commit par composant ;
- **Fins de ligne** : `.gitattributes` force LF, car un script shell en CRLF échoue dans un
  conteneur Linux ;
- **Fichiers ignorés** (`.gitignore`) : dépendances (`node_modules`, `.venv`), caches et secrets
  UAT/PROD.

### 3.2 Le pipeline

Le pipeline [.github/workflows/ci.yml](../.github/workflows/ci.yml) est déclenché :
- à **chaque commit et chaque tag poussés** (toutes les branches) ;
- chaque lundi (scan programmé) ;
- manuellement, depuis l'onglet « Actions ».

```
 push (commit ou tag)
   │
   ▼
 1. tests (×4 services, en parallèle)
      hadolint (lint du Dockerfile)
      docker build --target test   → lint du code + tests unitaires
   │  (tous doivent réussir)
   ▼
 2. e2e
      docker compose up -d --build --wait
      bash scripts/smoke-test.sh   → 28 vérifications sur l'application complète
   │
   ▼
 3. publication (×4 services, en parallèle)
      docker build --target production   (tag unique + labels OCI)
      Trivy : rapport HIGH/CRITICAL, puis échec si faille CRITICAL corrigeable
      Trivy : SBOM CycloneDX archivé comme artefact
      docker push ghcr.io/tristan-stack/projet-docker/<service>:<tag>
```

- **Identifiant unique de l'image** : le nom du tag git si l'on pousse un tag (ex. `v0.1.0`),
  sinon le SHA court du commit (ex. `0c2bba2`). Jamais `latest`, qui ne dit pas ce qui est déployé.
- **Échec immédiat** : dans un job, une étape en erreur arrête le job. `fail-fast` annule les autres
  services de la matrice, et les étapes suivantes (`needs`) ne démarrent pas. Une image n'est
  publiée que si les tests unitaires, le test de bout en bout et le contrôle de sécurité ont réussi.
- **Registre** : GitHub Container Registry (GHCR). La CI s'y authentifie avec le jeton
  `GITHUB_TOKEN` fourni automatiquement : aucun secret à créer. Seul le job de publication a le
  droit `packages: write` (moindre privilège).
- **Qualité et sécurité** (ajouts appréciés par le sujet) :
  - hadolint pour les Dockerfiles ;
  - ESLint et ruff pour le code ;
  - Trivy : scan des vulnérabilités du système et des dépendances de l'image ;
  - SBOM (inventaire des composants), recommandé par le cours ;
  - scan hebdomadaire, qui détecte les nouvelles failles des images de base sans republier d'image.

### 3.3 Mise en place

1. Création du dépôt public `Tristan-stack/projet-docker` et premier push.
2. Écriture du workflow ; vérification locale avec **actionlint** (linter de workflows GitHub) et
   **shellcheck** pour les scripts shell.
3. Droits du `GITHUB_TOKEN` déclarés dans le workflow : `contents: read` par défaut,
   `packages: write` pour la publication.
4. Noms d'images en minuscules (`${GITHUB_REPOSITORY,,}`), car GHCR refuse les majuscules et le
   compte GitHub en contient (`Tristan-stack`).
5. Les paquets créés par la CI sont automatiquement liés au dépôt et héritent de sa visibilité
   publique. Nous avons vérifié que les images sont téléchargeables sans authentification.
6. En cas d'échec de `docker login` ou de `docker push`, le message d'erreur de Docker est repris
   dans une annotation (`::error::`), visible directement dans l'interface GitHub.

---

## 4. Gestion de projet

**Équipe et répartition** : _à compléter (membres du groupe et répartition des tâches)._

### 4.1 Organisation

Le projet a été mené en étapes courtes. Chacune se terminait par une vérification concrète et un
commit :

| Étape | Contenu | Vérification |
|---|---|---|
| 0 | dépôt Git, conventions (`.gitignore`, `.gitattributes`) | premier push sur GitHub |
| 1 | script d'initialisation de PostgreSQL | `docker run` + `psql` : 3 bases, isolation entre utilisateurs |
| 2 | auth-service | 17 tests, puis essai réel contre la base |
| 3 | Dockerfile Node.js | `docker build --target test`, hadolint |
| 4–6 | villa-service, booking-service et leurs Dockerfiles | 8 + 21 tests, essais réels contre la base |
| 7 | frontend | 24 tests |
| 8 | docker-compose.yml et environnements | `docker compose config`, démarrage complet, test de bout en bout |
| 9 | pipeline CI/CD | pipeline vert sur GitHub, images publiées dans GHCR |
| 10 | documentation | rapport, fiche de révision, déroulé de la démo |

Planning : du 28 au 30 octobre 2026.
- **28/10** : étapes 0 à 9.
- **29/10** : vérifications, répétition de la démo, rapport.
- **30/10** : démo live à 9 h, puis rendu final.

Découpage par composant : chaque micro-service est développé, testé et conteneurisé de façon
indépendante avant l'intégration par docker compose. C'est l'intérêt de l'architecture en
micro-services.

### 4.2 Outils

- **Git** et **GitHub** (code, CI/CD avec GitHub Actions, registre GHCR) ;
- **VS Code** ;
- **Docker Desktop** (Windows, moteur Linux via WSL2).

**Usage de l'IA.** Le sujet tolère l'IA pour le développement et la CI/CD, et la déconseille pour
les Dockerfiles et le docker-compose.yml. Nous avons utilisé un assistant IA (Claude, d'Anthropic) :
- pour générer le code applicatif, les tests et le pipeline ;
- pour rédiger les Dockerfiles et le docker-compose.yml, en suivant les conventions du cours.

Tous ces fichiers ont été relus, testés (hadolint, `docker compose config`, test de bout en bout)
et documentés ligne par ligne dans le dépôt et dans la fiche de révision, afin de pouvoir expliquer
chaque choix.

---

## 5. Rétrospective

### 5.1 Difficultés rencontrées et solutions

- **Conflits de ports sur le poste de développement.**
  - Situation : quatre PostgreSQL installés sous Windows occupaient les ports 5432 à 5435, et le
    conteneur d'un autre TP occupait le 8080.
  - Piège : le message d'erreur était trompeur (« accès interdit » au lieu de « port déjà
    utilisé »), car PostgreSQL sous Windows réserve son port en mode exclusif.
  - Solution : base de dev publiée sur 15432, frontend sur 8081. Dans le `docker-compose.yml`, la
    base ne publie aucun port, ce qui fait disparaître ce type de conflit.
- **`docker run` = `docker create` + `docker start`.** Quand le démarrage échoue, le conteneur reste
  à l'état « Created » et garde son nom : il faut le supprimer avant de relancer.
- **Connexion bloquée à `localhost` depuis Windows.**
  - Cause : `localhost` est d'abord résolu en IPv6 (`::1`), alors que Docker ne publiait le port
    qu'en IPv4. La bibliothèque client de PostgreSQL essaie les adresses une par une, sans délai
    maximal par défaut ; Node.js, qui essaie IPv4 et IPv6 en parallèle, n'était pas touché.
  - Solutions : `127.0.0.1` en développement et dans les sondes de santé, et un délai maximal de
    connexion de 10 s dans les trois services.
- **Git Bash et les chemins.** Git Bash convertit automatiquement les arguments ressemblant à des
  chemins Unix (`/admin/users`) en chemins Windows. Le test de bout en bout désactive cette
  conversion (`MSYS_NO_PATHCONV=1`) et convertit explicitement ses fichiers temporaires
  (`cygpath`).
- **Fins de ligne Windows.** Prévenues dès le départ avec `.gitattributes` : le script
  d'initialisation de PostgreSQL aurait échoué en CRLF.
- **Démarrage lent.** Avec une sonde toutes les 30 s, chaque service attendait le précédent :
  plus d'une minute pour toute la pile. Avec un intervalle de 10 s, l'application démarre en
  environ 40 s.
- **Premier envoi vers le registre en échec.**
  - Situation : lors du tout premier pipeline, les tests, le test de bout en bout et le scan ont
    réussi, mais le `docker push` vers GHCR a échoué. Le log détaillé n'est consultable qu'avec un
    compte connecté.
  - Solution : nous avons fait reprendre le message d'erreur de Docker dans une annotation
    visible sur la page du pipeline. Le pipeline suivant a publié les 4 images sans erreur.
- **Outils qui évoluent.** Le client de test de FastAPI (Starlette) demandait `httpx2` au lieu de
  `httpx`, et hadolint signale désormais un `USER` non numérique : nous avons suivi ces
  recommandations.

### 5.2 Ce qui a bien fonctionné

- **L'injection de dépendance** dans chaque service : des tests unitaires rapides, sans base, qui
  s'exécutent aussi dans les conteneurs et dans la CI.
- **Le même modèle de Dockerfile** pour les services d'un même langage : facile à maintenir et à
  expliquer.
- **Le test de bout en bout**, utilisé à la fois localement, dans la CI et comme répétition de la
  démo.

### 5.3 Si c'était à refaire / améliorations possibles

- **Secrets** : utiliser des secrets Docker (fichiers dans `/run/secrets`, convention `_FILE`)
  plutôt que des variables d'environnement.
- **Montée en charge du frontend** : placer un reverse-proxy (Traefik ou nginx) devant plusieurs
  instances du frontend, avec HTTPS.
- **Promotion des images** : une promotion explicite TEST → UAT → PROD entre registres, avec
  validation manuelle, comme présenté dans le cours.
- **Migrations de schéma** : un outil dédié (Alembic, node-pg-migrate) au lieu de
  `CREATE TABLE IF NOT EXISTS`.
- **Dépendances Python** : un fichier de verrouillage complet (pip-tools ou uv), comme
  `package-lock.json` côté Node.js.
- **Production** : un orchestrateur (Docker Swarm ou Kubernetes) et une centralisation des logs.
