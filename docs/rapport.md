# Rapport de projet — Villa sur la Côte d'Azur

_Module « Dév avec Docker » — Master 2 — 2026_

## 1. Architecture logicielle

### Données : une base par micro-service

Un seul conteneur PostgreSQL 17 héberge **trois bases distinctes**, chacune avec son propre
utilisateur SQL :

| Base | Utilisateur | Service propriétaire |
|---|---|---|
| `auth_db` | `auth_user` | auth-service |
| `villa_db` | `villa_user` | villa-service |
| `booking_db` | `booking_user` | booking-service |

Le script `db/init/01-init.sh` crée ces bases et ces utilisateurs au premier démarrage. Il retire
aussi le droit de connexion par défaut (`REVOKE ALL ... FROM PUBLIC`). Un service ne peut donc
ouvrir que sa propre base : c'est le principe du moindre privilège. Un service compromis n'expose
que ses propres données. Les mots de passe sont fournis par variables d'environnement et ne sont
jamais écrits dans le dépôt.

Chaque service crée lui-même ses tables au démarrage. Aucune clé étrangère ne relie deux bases : la
cohérence entre services passe par leurs API.

### auth-service (Node.js 24, Express 5)

Ce service gère les comptes, les sessions et les rôles. Il expose une API REST en JSON :

| Méthode et route | Accès | Effet |
|---|---|---|
| `POST /auth/register` | public | crée un compte **standard** (201 ; 409 si l'email existe déjà) |
| `POST /auth/login` | public | vérifie le mot de passe et crée une session, dont il renvoie le jeton |
| `POST /auth/logout` | connecté | supprime la session |
| `GET /auth/me` | connecté | renvoie l'utilisateur associé au jeton |
| `DELETE /users/me` | connecté | supprime son propre compte |
| `GET /users` | admin | liste les comptes |
| `DELETE /users/:id` | admin | supprime un compte standard (403 si la cible est un admin) |
| `GET /health` | — | sonde de santé pour Docker |

**Sessions.** Une session est un jeton aléatoire de 256 bits, enregistré en base avec une date
d'expiration. Le client le présente dans l'en-tête `Authorization: Bearer`. La déconnexion
supprime la session, ce qui rend le jeton inutilisable.

**Sécurité.**
- Les mots de passe sont hachés avec bcrypt.
- Les requêtes SQL sont paramétrées, ce qui empêche les injections.
- L'inscription publique ne crée que des comptes standard.
- Le premier administrateur est créé au démarrage à partir des variables `ADMIN_EMAIL` et
  `ADMIN_PASSWORD`, propres à chaque environnement.

**Tests.** Le code sépare les routes (`app.js`) de l'accès aux données (`repository.js`). Les
17 tests unitaires (`node:test` + `supertest`) injectent un repository en mémoire : ils
s'exécutent sans base de données.

_Autres services : à rédiger (étapes 4 à 7)._

## 2. Dockerfiles et docker-compose.yml

_À rédiger (étapes 3, 5 et 8)._

## 3. Dépôt Git et pipeline CI/CD

### Organisation du dépôt

Nous avons choisi un **dépôt unique (monorepo)** qui contient les quatre micro-services, le script
d'initialisation de la base, le `docker-compose.yml` et le pipeline CI/CD :

- un seul `docker-compose.yml` peut référencer le code de tous les services (champ `build`) ;
- un seul pipeline traite chaque service grâce à une matrice ;
- un même commit peut modifier une API et le service qui l'appelle, ce qui garde le tout cohérent.

L'inconvénient est une indépendance moindre : on ne peut pas donner des droits d'accès ou un
cycle de versions différent à chaque service, comme le permettrait un dépôt par micro-service.

Un fichier `.gitattributes` force les fins de ligne **LF**. Git pour Windows convertit par défaut
les fichiers en CRLF, et un script shell en CRLF échoue dans un conteneur Linux.

_Pipeline CI/CD : à rédiger (étape 9)._

## 4. Gestion de projet

_À rédiger._

## 5. Rétrospective

### Difficultés rencontrées

- **Conflits de ports sur le poste de développement.** Quatre PostgreSQL installés sous Windows
  occupaient les ports 5432 à 5435, et le conteneur d'un autre TP occupait le 8080. Le message
  d'erreur était trompeur : « accès interdit » au lieu de « port déjà utilisé », car PostgreSQL sous
  Windows réserve son port en mode exclusif. Solution : publier la base de dev sur un port libre
  (15432). Dans le `docker-compose.yml`, la base ne publie aucun port, ce qui fait disparaître ce
  type de conflit.

_Suite à rédiger à la fin du projet._
