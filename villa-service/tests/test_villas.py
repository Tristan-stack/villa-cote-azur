"""Tests unitaires de l'API du catalogue (aucune base de données : repository en mémoire)."""

from app.repository import SEED_VILLAS


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_liste_toutes_les_villas(client):
    response = client.get("/villas")
    assert response.status_code == 200
    assert [v["name"] for v in response.json()] == ["Villa Test Nice", "Villa Test Cannes"]


def test_filtre_par_ville_sans_tenir_compte_de_la_casse(client):
    response = client.get("/villas", params={"city": "nice"})
    assert [v["city"] for v in response.json()] == ["Nice"]


def test_ville_sans_villa_renvoie_une_liste_vide(client):
    assert client.get("/villas", params={"city": "Paris"}).json() == []


def test_detail_d_une_villa(client):
    response = client.get("/villas/2")
    assert response.status_code == 200
    assert response.json()["name"] == "Villa Test Cannes"
    assert response.json()["price_per_night"] == 450


def test_villa_inexistante_renvoie_404(client):
    response = client.get("/villas/999")
    assert response.status_code == 404
    assert response.json()["detail"] == "Villa introuvable"


def test_identifiant_non_numerique_refuse(client):
    # FastAPI valide automatiquement le type du paramètre : 422 Unprocessable Entity
    assert client.get("/villas/abc").status_code == 422


def test_catalogue_de_depart_coherent():
    assert len(SEED_VILLAS) >= 6
    for villa in SEED_VILLAS:
        assert villa["price_per_night"] > 0
        assert villa["capacity"] > 0
        assert villa["bedrooms"] > 0
        assert villa["name"] and villa["city"] and villa["description"]
