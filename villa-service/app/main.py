"""API REST du villa-service : le catalogue des villas.

Même architecture que l'auth-service : create_app() reçoit un « repository »
(injection de dépendance). En production, c'est PostgreSQL ; dans les tests, une
version en mémoire. Les tests unitaires n'ont donc pas besoin de base de données.
"""

import os

from fastapi import FastAPI, HTTPException

from app.models import Villa
from app.repository import PgVillaRepository, VillaRepository


def create_app(repo: VillaRepository) -> FastAPI:
    app = FastAPI(title="villa-service", description="Catalogue des villas de la Côte d'Azur")

    @app.get("/health")
    def health() -> dict:
        """Sonde de santé, utilisée par le HEALTHCHECK Docker."""
        return {"status": "ok"}

    @app.get("/villas", response_model=list[Villa])
    def list_villas(city: str | None = None) -> list[dict]:
        """Toutes les villas, ou seulement celles d'une ville (?city=Nice)."""
        return repo.list_villas(city)

    @app.get("/villas/{villa_id}", response_model=Villa)
    def get_villa(villa_id: int) -> dict:
        villa = repo.get_villa(villa_id)
        if villa is None:
            raise HTTPException(status_code=404, detail="Villa introuvable")
        return villa

    return app


def create_production_app() -> FastAPI:
    """Point d'entrée d'uvicorn (option --factory) : configuration lue dans l'environnement."""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("Variable DATABASE_URL manquante")
    repo = PgVillaRepository(database_url)
    repo.migrate()  # crée la table et les villas de départ si besoin
    return create_app(repo)
