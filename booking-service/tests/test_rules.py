"""Tests des règles métier pures (chevauchement des séjours, validité des dates)."""

from datetime import date

from app.rules import booking_error, periods_overlap

D = date.fromisoformat
TODAY = D("2026-11-01")


def test_sejours_qui_se_chevauchent():
    assert periods_overlap(D("2026-12-01"), D("2026-12-10"), D("2026-12-05"), D("2026-12-12"))


def test_sejour_inclus_dans_un_autre():
    assert periods_overlap(D("2026-12-01"), D("2026-12-20"), D("2026-12-05"), D("2026-12-08"))


def test_sejours_consecutifs_ne_se_chevauchent_pas():
    # Départ le 10 au matin, arrivée du suivant le 10 : autorisé
    assert not periods_overlap(D("2026-12-01"), D("2026-12-10"), D("2026-12-10"), D("2026-12-15"))


def test_sejours_disjoints():
    assert not periods_overlap(D("2026-12-01"), D("2026-12-05"), D("2026-12-20"), D("2026-12-25"))


def test_dates_valides():
    assert booking_error(D("2026-12-01"), D("2026-12-08"), TODAY) is None


def test_depart_avant_arrivee_refuse():
    error = booking_error(D("2026-12-08"), D("2026-12-01"), TODAY)
    assert error == "La date de départ doit être après la date d'arrivée"


def test_depart_le_jour_de_l_arrivee_refuse():
    assert booking_error(D("2026-12-01"), D("2026-12-01"), TODAY) is not None


def test_arrivee_dans_le_passe_refusee():
    assert booking_error(D("2026-10-01"), D("2026-10-05"), TODAY) == "La date d'arrivée est déjà passée"
