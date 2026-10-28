"""API REST du booking-service : les réservations des villas.

L'identité de l'utilisateur arrive dans l'en-tête X-User-Id, ajouté par le frontend
après avoir vérifié la session auprès de l'auth-service. Ce service n'est joignable
que par le réseau Docker interne : seul le frontend peut l'appeler.
"""

import os
from collections.abc import Callable
from datetime import date
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Response

from app.models import Booking, BookingRequest, Period
from app.repository import BookingRepository, PgBookingRepository
from app.rules import booking_error


def current_user_id(x_user_id: Annotated[int | None, Header()] = None) -> int:
    """Identifiant de l'utilisateur connecté, transmis par le frontend (en-tête X-User-Id)."""
    if x_user_id is None:
        raise HTTPException(status_code=401, detail="Utilisateur non identifié (en-tête X-User-Id manquant)")
    return x_user_id


UserId = Annotated[int, Depends(current_user_id)]


def create_app(repo: BookingRepository, today: Callable[[], date] = date.today) -> FastAPI:
    """« today » est injectable pour que les tests ne dépendent pas de la date du jour."""
    app = FastAPI(title="booking-service", description="Réservations des villas")

    @app.get("/health")
    def health() -> dict:
        """Sonde de santé, utilisée par le HEALTHCHECK Docker."""
        return {"status": "ok"}

    @app.get("/bookings", response_model=list[Booking])
    def my_bookings(user_id: UserId) -> list[dict]:
        """Réservations de l'utilisateur connecté."""
        return repo.list_for_user(user_id)

    @app.post("/bookings", response_model=Booking, status_code=201)
    def create_booking(request: BookingRequest, user_id: UserId) -> dict:
        error = booking_error(request.start_date, request.end_date, today())
        if error:
            raise HTTPException(status_code=400, detail=error)
        booking = repo.create(user_id, request.villa_id, request.start_date, request.end_date)
        if booking is None:
            raise HTTPException(status_code=409, detail="Ces dates sont déjà réservées pour cette villa")
        return booking

    @app.delete("/bookings/{booking_id}", status_code=204)
    def cancel_booking(booking_id: int, user_id: UserId) -> Response:
        # Seul le propriétaire peut annuler. Sinon 404 : on ne révèle pas l'existence
        # des réservations des autres utilisateurs.
        if not repo.delete(booking_id, user_id):
            raise HTTPException(status_code=404, detail="Réservation introuvable")
        return Response(status_code=204)

    @app.get("/villas/{villa_id}/bookings", response_model=list[Period])
    def villa_periods(villa_id: int) -> list[dict]:
        """Périodes déjà réservées d'une villa, pour afficher ses disponibilités."""
        return repo.list_periods_for_villa(villa_id)

    @app.delete("/users/{user_id}/bookings", status_code=204)
    def delete_user_bookings(user_id: int) -> Response:
        """Appelé par le frontend quand un compte est supprimé (pas de clé étrangère entre services)."""
        repo.delete_all_for_user(user_id)
        return Response(status_code=204)

    return app


def create_production_app() -> FastAPI:
    """Point d'entrée d'uvicorn (option --factory) : configuration lue dans l'environnement."""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("Variable DATABASE_URL manquante")
    repo = PgBookingRepository(database_url)
    repo.migrate()  # crée l'extension et la table si besoin
    return create_app(repo)
