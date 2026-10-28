"""Format des données renvoyées par l'API (validé et documenté automatiquement par FastAPI)."""

from pydantic import BaseModel


class Villa(BaseModel):
    id: int
    name: str
    city: str
    description: str
    price_per_night: int
    capacity: int
    bedrooms: int
    has_pool: bool
    sea_view: bool
