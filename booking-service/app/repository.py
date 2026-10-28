"""Accès aux données du booking-service, dans PostgreSQL (base booking_db).

Les routes n'utilisent que les méthodes de BookingRepository : dans les tests, on les
remplace par une version en mémoire qui a exactement la même interface.
"""

from datetime import date
from typing import Protocol

import psycopg
from psycopg.rows import dict_row

# Le service crée lui-même son schéma au démarrage (IF NOT EXISTS : relançable sans risque).
# Pas de clé étrangère vers les utilisateurs ou les villas : ils vivent dans d'autres bases.
SCHEMA = """
-- Extension qui permet de combiner « = » (entier) et « && » (période) dans EXCLUDE
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS bookings (
    id         SERIAL      PRIMARY KEY,
    user_id    INTEGER     NOT NULL,
    villa_id   INTEGER     NOT NULL,
    start_date DATE        NOT NULL,
    end_date   DATE        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_date > start_date),
    -- Deux réservations d'une même villa ne peuvent pas se chevaucher : PostgreSQL le
    -- garantit lui-même, même si deux demandes arrivent exactement en même temps.
    EXCLUDE USING gist (villa_id WITH =, daterange(start_date, end_date) WITH &&)
);
"""


class BookingRepository(Protocol):
    """Interface commune à l'implémentation PostgreSQL et au faux repository des tests."""

    def list_for_user(self, user_id: int) -> list[dict]: ...

    def list_periods_for_villa(self, villa_id: int) -> list[dict]: ...

    def create(self, user_id: int, villa_id: int, start_date: date, end_date: date) -> dict | None: ...

    def delete(self, booking_id: int, user_id: int) -> bool: ...

    def delete_all_for_user(self, user_id: int) -> None: ...


class PgBookingRepository:
    """Implémentation PostgreSQL. Requêtes paramétrées (%s) : pas d'injection SQL possible."""

    def __init__(self, conninfo: str):
        self.conninfo = conninfo

    def _connect(self) -> psycopg.Connection:
        # « with connexion » : COMMIT automatique en fin de bloc, ROLLBACK en cas d'erreur.
        # connect_timeout : on échoue au bout de 10 s au lieu d'attendre indéfiniment.
        return psycopg.connect(self.conninfo, row_factory=dict_row, connect_timeout=10)

    def migrate(self) -> None:
        with self._connect() as conn:
            # Une seule instance à la fois crée le schéma si plusieurs démarrent ensemble (--scale)
            conn.execute("SELECT pg_advisory_xact_lock(1)")
            conn.execute(SCHEMA)

    def list_for_user(self, user_id: int) -> list[dict]:
        with self._connect() as conn:
            return conn.execute(
                "SELECT * FROM bookings WHERE user_id = %s ORDER BY start_date", (user_id,)
            ).fetchall()

    def list_periods_for_villa(self, villa_id: int) -> list[dict]:
        with self._connect() as conn:
            return conn.execute(
                """SELECT start_date, end_date FROM bookings
                   WHERE villa_id = %s AND end_date > current_date ORDER BY start_date""",
                (villa_id,),
            ).fetchall()

    def create(self, user_id: int, villa_id: int, start_date: date, end_date: date) -> dict | None:
        try:
            with self._connect() as conn:
                return conn.execute(
                    """INSERT INTO bookings (user_id, villa_id, start_date, end_date)
                       VALUES (%s, %s, %s, %s) RETURNING *""",
                    (user_id, villa_id, start_date, end_date),
                ).fetchone()
        except psycopg.errors.ExclusionViolation:
            return None  # chevauchement refusé par la contrainte EXCLUDE

    def delete(self, booking_id: int, user_id: int) -> bool:
        with self._connect() as conn:
            cursor = conn.execute(
                "DELETE FROM bookings WHERE id = %s AND user_id = %s", (booking_id, user_id)
            )
            return cursor.rowcount > 0

    def delete_all_for_user(self, user_id: int) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM bookings WHERE user_id = %s", (user_id,))
