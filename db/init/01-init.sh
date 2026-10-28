#!/usr/bin/env bash
# =============================================================================
# Initialisation de PostgreSQL : une base + un utilisateur par micro-service.
#
# L'image officielle postgres exécute automatiquement les scripts placés dans
# /docker-entrypoint-initdb.d/, UNE SEULE FOIS : au premier démarrage, quand
# le volume de données est vide. Pour rejouer ce script, il faut supprimer le
# volume (docker compose down -v).
#
# Les mots de passe viennent des variables d'environnement du conteneur :
# aucun secret n'est écrit dans le dépôt.
# =============================================================================
set -e

# create_service_db <utilisateur> <mot_de_passe> <base>
# Crée l'utilisateur, puis sa base dont il est propriétaire. Le REVOKE retire
# le droit de connexion « public » : chaque service ne peut ouvrir QUE sa base.
create_service_db() {
  echo "init-db : création de la base '$3' (propriétaire : $1)"
  # -v passe les valeurs à psql : :"nom" les insère comme identifiant SQL,
  # :'valeur' comme chaîne SQL, avec un échappement correct dans les deux cas.
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
       -v db_user="$1" -v db_password="$2" -v db_name="$3" <<'EOSQL'
CREATE USER :"db_user" WITH PASSWORD :'db_password';
CREATE DATABASE :"db_name" OWNER :"db_user";
REVOKE ALL ON DATABASE :"db_name" FROM PUBLIC;
EOSQL
}

# ${VAR:?message} : arrête le script si la variable est absente ou vide.
create_service_db auth_user    "${AUTH_DB_PASSWORD:?AUTH_DB_PASSWORD manquant}"       auth_db
create_service_db villa_user   "${VILLA_DB_PASSWORD:?VILLA_DB_PASSWORD manquant}"     villa_db
create_service_db booking_user "${BOOKING_DB_PASSWORD:?BOOKING_DB_PASSWORD manquant}" booking_db
