"""Fixtures pytest : un client HTTP de test branché sur un repository en mémoire."""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

VILLAS = [
    {
        "id": 1,
        "name": "Villa Test Nice",
        "city": "Nice",
        "description": "Villa de test",
        "price_per_night": 300,
        "capacity": 6,
        "bedrooms": 3,
        "has_pool": True,
        "sea_view": True,
    },
    {
        "id": 2,
        "name": "Villa Test Cannes",
        "city": "Cannes",
        "description": "Autre villa de test",
        "price_per_night": 450,
        "capacity": 8,
        "bedrooms": 4,
        "has_pool": False,
        "sea_view": True,
    },
]


class InMemoryVillaRepository:
    """Faux repository : même interface que PgVillaRepository, sans aucune base de données."""

    def __init__(self, villas: list[dict]):
        self.villas = villas

    def list_villas(self, city: str | None = None) -> list[dict]:
        return [v for v in self.villas if city is None or v["city"].lower() == city.lower()]

    def get_villa(self, villa_id: int) -> dict | None:
        return next((v for v in self.villas if v["id"] == villa_id), None)


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app(InMemoryVillaRepository(VILLAS)))
