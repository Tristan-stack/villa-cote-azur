"""Accès aux données du villa-service, dans PostgreSQL (base villa_db).

Les routes n'utilisent que list_villas() et get_villa() : dans les tests, on les
remplace par une version en mémoire qui a exactement la même interface.
"""

from typing import Protocol

import psycopg
from psycopg.rows import dict_row

# Le service crée lui-même sa table au démarrage (IF NOT EXISTS : relançable sans risque)
SCHEMA = """
CREATE TABLE IF NOT EXISTS villas (
    id              SERIAL PRIMARY KEY,
    name            TEXT    NOT NULL,
    city            TEXT    NOT NULL,
    description     TEXT    NOT NULL,
    price_per_night INTEGER NOT NULL CHECK (price_per_night > 0),
    capacity        INTEGER NOT NULL CHECK (capacity > 0),
    bedrooms        INTEGER NOT NULL CHECK (bedrooms > 0),
    has_pool        BOOLEAN NOT NULL DEFAULT FALSE,
    sea_view        BOOLEAN NOT NULL DEFAULT FALSE
)
"""

# Catalogue de départ, inséré uniquement si la table est vide
SEED_VILLAS = [
    {
        "name": "Villa Les Oliviers",
        "city": "Nice",
        "description": "Villa provençale sur les hauteurs de Nice : terrasse ombragée, oliviers "
        "centenaires et vue sur la baie des Anges.",
        "price_per_night": 320,
        "capacity": 6,
        "bedrooms": 3,
        "has_pool": True,
        "sea_view": True,
    },
    {
        "name": "Villa Bleu Azur",
        "city": "Cannes",
        "description": "Villa contemporaine à deux pas de la Croisette, avec piscine à débordement "
        "et rooftop pour les soirées d'été.",
        "price_per_night": 480,
        "capacity": 8,
        "bedrooms": 4,
        "has_pool": True,
        "sea_view": True,
    },
    {
        "name": "Mas des Pins",
        "city": "Antibes",
        "description": "Mas rénové au cœur d'une pinède, à cinq minutes des criques du cap d'Antibes.",
        "price_per_night": 290,
        "capacity": 6,
        "bedrooms": 3,
        "has_pool": True,
        "sea_view": False,
    },
    {
        "name": "Villa Pampelonne",
        "city": "Saint-Tropez",
        "description": "Villa d'architecte face à la plage de Pampelonne, jardin méditerranéen et "
        "accès direct à la mer.",
        "price_per_night": 650,
        "capacity": 10,
        "bedrooms": 5,
        "has_pool": True,
        "sea_view": True,
    },
    {
        "name": "Villa Citronnelle",
        "city": "Menton",
        "description": "Maison ensoleillée entourée de citronniers, au calme, idéale pour une famille.",
        "price_per_night": 210,
        "capacity": 5,
        "bedrooms": 2,
        "has_pool": False,
        "sea_view": True,
    },
    {
        "name": "Villa Belvédère",
        "city": "Èze",
        "description": "Perchée au-dessus de la Méditerranée, vue panoramique sur toute la Riviera.",
        "price_per_night": 540,
        "capacity": 4,
        "bedrooms": 2,
        "has_pool": True,
        "sea_view": True,
    },
]


class VillaRepository(Protocol):
    """Interface commune à l'implémentation PostgreSQL et au faux repository des tests."""

    def list_villas(self, city: str | None = None) -> list[dict]: ...

    def get_villa(self, villa_id: int) -> dict | None: ...


class PgVillaRepository:
    """Implémentation PostgreSQL. Requêtes paramétrées (%s) : pas d'injection SQL possible."""

    def __init__(self, conninfo: str):
        self.conninfo = conninfo

    def _connect(self) -> psycopg.Connection:
        # « with connexion » : COMMIT automatique en fin de bloc, ROLLBACK en cas d'erreur.
        # connect_timeout : on échoue au bout de 10 s au lieu d'attendre indéfiniment.
        return psycopg.connect(self.conninfo, row_factory=dict_row, connect_timeout=10)

    def migrate(self) -> None:
        with self._connect() as conn:
            # Si plusieurs instances démarrent en même temps (--scale), une seule à la fois
            # crée la table et insère les villas de départ.
            conn.execute("SELECT pg_advisory_xact_lock(1)")
            conn.execute(SCHEMA)
            if conn.execute("SELECT count(*) AS n FROM villas").fetchone()["n"] == 0:
                conn.cursor().executemany(
                    """INSERT INTO villas (name, city, description, price_per_night,
                                           capacity, bedrooms, has_pool, sea_view)
                       VALUES (%(name)s, %(city)s, %(description)s, %(price_per_night)s,
                               %(capacity)s, %(bedrooms)s, %(has_pool)s, %(sea_view)s)""",
                    SEED_VILLAS,
                )

    def list_villas(self, city: str | None = None) -> list[dict]:
        with self._connect() as conn:
            if city:
                return conn.execute(
                    "SELECT * FROM villas WHERE lower(city) = lower(%s) ORDER BY id", (city,)
                ).fetchall()
            return conn.execute("SELECT * FROM villas ORDER BY id").fetchall()

    def get_villa(self, villa_id: int) -> dict | None:
        with self._connect() as conn:
            return conn.execute("SELECT * FROM villas WHERE id = %s", (villa_id,)).fetchone()
