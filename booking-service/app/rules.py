"""Règles métier pures (sans base de données ni HTTP) : faciles à tester unitairement."""

from datetime import date


def periods_overlap(start_a: date, end_a: date, start_b: date, end_b: date) -> bool:
    """Deux séjours se chevauchent si chacun commence avant la fin de l'autre.

    La date de fin est le jour du départ : un séjour peut commencer le jour même où
    le précédent se termine (même convention que la période [début, fin[ de PostgreSQL).
    """
    return start_a < end_b and start_b < end_a


def booking_error(start_date: date, end_date: date, today: date) -> str | None:
    """Message d'erreur si les dates demandées sont invalides, None sinon."""
    if end_date <= start_date:
        return "La date de départ doit être après la date d'arrivée"
    if start_date < today:
        return "La date d'arrivée est déjà passée"
    return None
