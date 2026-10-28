"""Tests unitaires de l'API des réservations (aucune base de données : repository en mémoire)."""

USER = {"X-User-Id": "1"}
OTHER_USER = {"X-User-Id": "2"}


def book(client, headers=USER, villa_id=1, start="2026-12-01", end="2026-12-08"):
    return client.post(
        "/bookings", json={"villa_id": villa_id, "start_date": start, "end_date": end}, headers=headers
    )


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_sans_identifiant_utilisateur_401(client):
    assert book(client, headers={}).status_code == 401
    assert client.get("/bookings").status_code == 401


def test_creer_une_reservation(client):
    response = book(client)
    assert response.status_code == 201
    body = response.json()
    assert body["user_id"] == 1
    assert body["villa_id"] == 1
    assert (body["start_date"], body["end_date"]) == ("2026-12-01", "2026-12-08")


def test_dates_inversees_400(client):
    response = book(client, start="2026-12-08", end="2026-12-01")
    assert response.status_code == 400
    assert response.json()["detail"] == "La date de départ doit être après la date d'arrivée"


def test_arrivee_dans_le_passe_400(client):
    assert book(client, start="2026-10-01", end="2026-10-05").status_code == 400


def test_chevauchement_409(client):
    book(client)
    response = book(client, headers=OTHER_USER, start="2026-12-05", end="2026-12-10")
    assert response.status_code == 409
    assert response.json()["detail"] == "Ces dates sont déjà réservées pour cette villa"


def test_sejours_consecutifs_acceptes(client):
    book(client, start="2026-12-01", end="2026-12-08")
    assert book(client, start="2026-12-08", end="2026-12-15").status_code == 201


def test_memes_dates_dans_une_autre_villa(client):
    book(client, villa_id=1)
    assert book(client, villa_id=2).status_code == 201


def test_liste_uniquement_mes_reservations(client):
    book(client, villa_id=1)
    book(client, headers=OTHER_USER, villa_id=2)
    mine = client.get("/bookings", headers=USER).json()
    assert len(mine) == 1
    assert mine[0]["user_id"] == 1


def test_annuler_sa_reservation(client):
    booking_id = book(client).json()["id"]
    assert client.delete(f"/bookings/{booking_id}", headers=USER).status_code == 204
    assert client.get("/bookings", headers=USER).json() == []


def test_impossible_d_annuler_la_reservation_d_un_autre(client):
    booking_id = book(client).json()["id"]
    assert client.delete(f"/bookings/{booking_id}", headers=OTHER_USER).status_code == 404
    assert len(client.get("/bookings", headers=USER).json()) == 1


def test_periodes_reservees_d_une_villa_sans_donnees_personnelles(client):
    book(client)
    periods = client.get("/villas/1/bookings").json()
    assert periods == [{"start_date": "2026-12-01", "end_date": "2026-12-08"}]


def test_suppression_des_reservations_d_un_compte(client):
    book(client, villa_id=1)
    book(client, villa_id=2)
    book(client, headers=OTHER_USER, villa_id=3)
    assert client.delete("/users/1/bookings").status_code == 204
    assert client.get("/bookings", headers=USER).json() == []
    assert len(client.get("/bookings", headers=OTHER_USER).json()) == 1
