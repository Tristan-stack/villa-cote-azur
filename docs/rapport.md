# Rapport de projet — Villa sur la Côte d'Azur

_Module « Dév avec Docker » — Master 2 — 2026_

## 1. Architecture logicielle

_À rédiger (étapes 1 à 7)._

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
