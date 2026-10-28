"""Fixtures pytest : un client HTTP de test branché sur un repository en mémoire."""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.rules import periods_overlap

# Date du jour fixée : les tests ne dépendent pas du jour où on les lance
TODAY = date(2026, 11, 1)


class InMemoryBookingRepository:
    """Faux repository : même interface que PgBookingRepository, sans aucune base de données."""

    def __init__(self):
        self.bookings: list[dict] = []
        self._next_id = 1

    def list_for_user(self, user_id):
        return [b for b in self.bookings if b["user_id"] == user_id]

    def list_periods_for_villa(self, villa_id):
        return [
            {"start_date": b["start_date"], "end_date": b["end_date"]}
            for b in self.bookings
            if b["villa_id"] == villa_id
        ]

    def create(self, user_id, villa_id, start_date, end_date):
        # Même règle que la contrainte EXCLUDE de PostgreSQL
        for b in self.bookings:
            same_villa = b["villa_id"] == villa_id
            if same_villa and periods_overlap(b["start_date"], b["end_date"], start_date, end_date):
                return None
        booking = {
            "id": self._next_id,
            "user_id": user_id,
            "villa_id": villa_id,
            "start_date": start_date,
            "end_date": end_date,
            "created_at": None,
        }
        self._next_id += 1
        self.bookings.append(booking)
        return booking

    def delete(self, booking_id, user_id):
        for b in self.bookings:
            if b["id"] == booking_id and b["user_id"] == user_id:
                self.bookings.remove(b)
                return True
        return False

    def delete_all_for_user(self, user_id):
        self.bookings = [b for b in self.bookings if b["user_id"] != user_id]


@pytest.fixture
def repo() -> InMemoryBookingRepository:
    return InMemoryBookingRepository()


@pytest.fixture
def client(repo) -> TestClient:
    return TestClient(create_app(repo, today=lambda: TODAY))
