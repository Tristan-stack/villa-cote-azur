#!/usr/bin/env bash
# =============================================================================
# Test de bout en bout de l'application lancée avec docker compose.
#
#   docker compose up -d --build --wait
#   bash scripts/smoke-test.sh
#
# Autre environnement : ENV_FILE=env/uat.env bash scripts/smoke-test.sh
# (port du frontend et compte admin sont lus dans ce fichier de variables).
# Utilisé aussi par la CI (job « e2e »). Code de sortie 1 si une vérification échoue.
# =============================================================================
set -uo pipefail
# Sous Git Bash (Windows), empêche la conversion automatique de « /chemin » en « C:/… »
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/.." || exit 1

# Fichier de variables de l'environnement testé (chemin relatif à la racine du dépôt)
ENV_FILE="${ENV_FILE:-.env}"
set -a
# shellcheck source=/dev/null
. "./$ENV_FILE"
set +a
dc() { docker compose --env-file "./$ENV_FILE" "$@"; }

BASE_URL="${BASE_URL:-http://127.0.0.1:${FRONTEND_PORT:-8081}}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@villa.fr}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin1234}"
WORK="$(mktemp -d)"
# Sous Git Bash : chemin au format Windows, compris aussi par les programmes natifs (curl.exe)
if command -v cygpath >/dev/null 2>&1; then WORK="$(cygpath -m "$WORK")"; fi
trap 'rm -rf "$WORK"' EXIT

RUN_ID="$(date +%s)"
EMAIL="test-$RUN_ID@villa.fr"
PASSWORD="motdepasse123"
YEAR=$((2040 + RANDOM % 50)) # dates lointaines et différentes à chaque exécution
FAILURES=0

ok() { printf '  \033[32mOK\033[0m     %s\n' "$1"; }
ko() { printf '  \033[31mÉCHEC\033[0m  %s (obtenu : %s)\n' "$1" "$2"; FAILURES=$((FAILURES + 1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "$3"; fi; } # check <description> <attendu> <obtenu>

# http <fichier-cookies> <méthode> <chemin> [champ=valeur…]
# Affiche « code redirection » (ex. « 303 /villas ») ; la page reçue est dans $WORK/page.html
http() {
  local jar="$1" method="$2" path="$3"
  shift 3
  local args=(-s -o "$WORK/page.html" -w '%{http_code} %{redirect_url}' -b "$jar" -c "$jar" -X "$method")
  local field
  for field in "$@"; do args+=(--data-urlencode "$field"); done
  local result
  result="$(curl "${args[@]}" "$BASE_URL$path")"
  echo "${result/$BASE_URL/}"
}
page_contains() { if grep -q "$2" "$WORK/page.html"; then ok "$1"; else ko "$1" "texte « $2 » absent"; fi; }
# Identifiant d'un compte, lu dans le tableau de la page d'administration
user_id() { grep -B1 "<td>$1</td>" "$WORK/page.html" | head -1 | grep -o '[0-9]\+'; }

ANON="$WORK/anonyme.txt"
USER="$WORK/utilisateur.txt"
ADMIN="$WORK/admin.txt"
OTHER="$WORK/autre.txt"

echo "Test de bout en bout sur $BASE_URL"

echo "1. Pages publiques et contrôle d'accès"
check "accueil accessible sans compte" "200 " "$(http "$ANON" GET /)"
page_contains "pied de page avec l'environnement" "Environnement :"
check "/villas redirige vers la connexion" "302 /login?next=%2Fvillas" "$(http "$ANON" GET /villas)"
check "/bookings redirige vers la connexion" "302 /login?next=%2Fbookings" "$(http "$ANON" GET /bookings)"
check "/admin/users redirige vers la connexion" "302 /login?next=%2Fadmin%2Fusers" "$(http "$ANON" GET /admin/users)"

echo "2. Compte standard : inscription, catalogue, réservation"
check "création du compte $EMAIL (connexion automatique)" "303 /villas" \
  "$(http "$USER" POST /register "email=$EMAIL" "password=$PASSWORD")"
check "catalogue visible une fois connecté" "200 " "$(http "$USER" GET /villas)"
page_contains "les villas viennent du villa-service" "Villa Les Oliviers"
check "réservation de la villa 1 (7 nuits)" "303 /bookings?msg=booked" \
  "$(http "$USER" POST /villas/1/book "start_date=$YEAR-07-01" "end_date=$YEAR-07-08")"
check "réservation qui chevauche refusée" "409 " \
  "$(http "$USER" POST /villas/1/book "start_date=$YEAR-07-05" "end_date=$YEAR-07-10")"
check "page « mes réservations »" "200 " "$(http "$USER" GET /bookings)"
page_contains "prix total calculé (7 × 320 €)" "2[^0-9]*240 €"
check "un compte standard n'accède pas à l'administration" "403 " "$(http "$USER" GET /admin/users)"

echo "3. Frontend sans état : redémarrage sans perte de session"
dc restart frontend >/dev/null 2>&1
curl -s -o /dev/null --retry 30 --retry-connrefused --retry-all-errors --retry-delay 1 "$BASE_URL/health"
check "toujours connecté après « docker compose restart frontend »" "200 " "$(http "$USER" GET /bookings)"

echo "4. Administration"
check "connexion de l'administrateur" "303 /admin/users" \
  "$(http "$ADMIN" POST /login "email=$ADMIN_EMAIL" "password=$ADMIN_PASSWORD" "next=/admin/users")"
check "liste des comptes" "200 " "$(http "$ADMIN" GET /admin/users)"
USER_ID="$(user_id "$EMAIL")"
ADMIN_ID="$(user_id "$ADMIN_EMAIL")"
check "un admin ne peut pas supprimer un autre admin" "403 " "$(http "$ADMIN" POST "/admin/users/$ADMIN_ID/delete")"
check "un admin supprime le compte standard" "303 /admin/users?msg=user-deleted" \
  "$(http "$ADMIN" POST "/admin/users/$USER_ID/delete")"
check "la session du compte supprimé ne fonctionne plus" "302 /login?next=%2Fbookings" "$(http "$USER" GET /bookings)"
REMAINING="$(dc exec -T db psql -U postgres -d booking_db -tAc \
  "SELECT count(*) FROM bookings WHERE user_id = $USER_ID" 2>/dev/null | tr -d '[:space:]')"
check "ses réservations ont été supprimées dans booking_db" "0" "$REMAINING"

echo "5. Suppression de son propre compte et déconnexion"
check "création d'un second compte" "303 /villas" \
  "$(http "$OTHER" POST /register "email=autre-$EMAIL" "password=$PASSWORD")"
check "suppression de son propre compte" "303 /?msg=account-deleted" "$(http "$OTHER" POST /account/delete)"
check "reconnexion impossible" "401 " "$(http "$OTHER" POST /login "email=autre-$EMAIL" "password=$PASSWORD")"
check "déconnexion de l'administrateur" "303 /?msg=logged-out" "$(http "$ADMIN" POST /logout)"
check "page protégée après déconnexion" "302 /login?next=%2Fadmin%2Fusers" "$(http "$ADMIN" GET /admin/users)"

echo "6. Isolation réseau"
if curl -s -m 3 -o /dev/null "http://127.0.0.1:3001/health"; then
  ko "auth-service injoignable depuis la machine hôte" "joignable"
else
  ok "auth-service injoignable depuis la machine hôte (aucun port publié)"
fi
DB_FROM_FRONTEND="$(dc exec -T frontend node -e \
  "require('node:dns').lookup('db', (err) => console.log(err ? 'injoignable' : 'joignable'))" 2>/dev/null)"
check "la base est injoignable depuis le frontend (réseau data)" "injoignable" "$DB_FROM_FRONTEND"
INTERNET_FROM_BACKEND="$(dc exec -T villa-service python -c \
  "import urllib.request as u
try:
    u.urlopen('http://example.com', timeout=3); print('accessible')
except Exception:
    print('bloqué')" 2>/dev/null)"
check "pas d'accès Internet depuis un backend (réseau internal)" "bloqué" "$INTERNET_FROM_BACKEND"

echo
if [ "$FAILURES" -eq 0 ]; then
  printf '\033[32mToutes les vérifications sont passées.\033[0m\n'
else
  printf '\033[31m%s vérification(s) en échec.\033[0m\n' "$FAILURES"
  exit 1
fi
