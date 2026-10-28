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

_Services applicatifs : à rédiger (étapes 2 à 7)._

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

_À rédiger à la fin du projet._
