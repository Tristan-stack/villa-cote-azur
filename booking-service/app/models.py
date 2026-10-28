"""Format des données échangées avec l'API (validé et documenté automatiquement par FastAPI)."""

from datetime import date, datetime

from pydantic import BaseModel, Field


class BookingRequest(BaseModel):
    """Corps de la requête POST /bookings."""

    villa_id: int = Field(gt=0)
    start_date: date
    end_date: date


class Booking(BaseModel):
    id: int
    user_id: int
    villa_id: int
    start_date: date
    end_date: date
    created_at: datetime | None = None


class Period(BaseModel):
    """Période réservée d'une villa, sans dire par qui (aucune donnée personnelle)."""

    start_date: date
    end_date: date
