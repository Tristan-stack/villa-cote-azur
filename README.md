# Villa sur la Côte d'Azur

Site de location de villas sur la Côte d'Azur, découpé en micro-services Docker.
Projet du module « Dév avec Docker » (Master 2).

## Architecture

```
Navigateur ──▶ frontend :8080 ──▶ auth-service · villa-service · booking-service ──▶ PostgreSQL
               (seul port publié)  (réseaux Docker internes, injoignables depuis l'extérieur)
```

| Service | Langage | Rôle | Port interne |
|---|---|---|---|
| `frontend` | Node.js 24 · Express 5 · EJS | site web rendu côté serveur, sans état | 3000 (publié sur 8080) |
| `auth-service` | Node.js 24 · Express 5 | comptes, connexion, sessions, rôles | 3001 |
| `villa-service` | Python 3.13 · FastAPI | catalogue des villas | 8001 |
| `booking-service` | Python 3.13 · FastAPI | réservations | 8002 |
| `db` | PostgreSQL 17 | une base et un utilisateur SQL par service | 5432 |

## Lancer l'application

_À compléter à l'étape 8 (docker-compose)._

## Documentation

- [Rapport de projet](docs/rapport.md)
- [Fiche de révision pour l'oral](docs/fiche-oral.md)
