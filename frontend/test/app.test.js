// Tests unitaires du frontend : contrôle d'accès, session par cookie, parcours principaux.
// Les backends sont remplacés par un faux client API en mémoire (test/fake-api.js).
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createFakeApi } from './fake-api.js';

let api;
let app;

beforeEach(() => {
  api = createFakeApi();
  app = createApp({ api, appEnv: 'test' });
});

const asAlice = (req) => req.set('Cookie', 'session=token-alice'); // compte standard
const asAdmin = (req) => req.set('Cookie', 'session=token-admin');

describe('pages publiques', () => {
  test("l'accueil est accessible sans être connecté", async () => {
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.match(res.text, /Villa sur la Côte d'Azur/);
  });

  test("le pied de page affiche l'environnement", async () => {
    const res = await request(app).get('/');
    assert.match(res.text, /Environnement : TEST/);
  });

  test('les pages de connexion et de création de compte sont accessibles', async () => {
    assert.equal((await request(app).get('/login')).status, 200);
    assert.equal((await request(app).get('/register')).status, 200);
  });

  test('une page inconnue renvoie 404', async () => {
    assert.equal((await request(app).get('/nexiste-pas')).status, 404);
  });

  test("l'accueil présente une sélection de villas", async () => {
    const res = await request(app).get('/');
    assert.match(res.text, /Notre sélection/);
    assert.match(res.text, /Villa Test/);
  });

  test("l'accueil reste disponible si le catalogue ne répond pas", async () => {
    api.listVillas = async () => {
      throw new Error('villa-service injoignable');
    };
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /Notre sélection/);
  });

  test('les polices sont servies par le frontend (aucun service externe)', async () => {
    const res = await request(app).get('/fonts/geist/geist-latin-wght-normal.woff2');
    assert.equal(res.status, 200);
    assert.match(res.headers['cache-control'], /immutable/);
  });
});

describe("contrôle d'accès", () => {
  for (const path of ['/villas', '/villas/1', '/bookings', '/account', '/admin/users']) {
    test(`${path} redirige vers la connexion si on n'est pas connecté`, async () => {
      const res = await request(app).get(path);
      assert.equal(res.status, 302);
      assert.equal(res.headers.location, `/login?next=${encodeURIComponent(path)}`);
    });
  }

  test('un cookie de session invalide est effacé', async () => {
    const res = await request(app).get('/villas').set('Cookie', 'session=faux-jeton');
    assert.equal(res.status, 302);
    assert.match(res.headers['set-cookie'][0], /^session=;/);
  });

  test('un utilisateur connecté voit le catalogue', async () => {
    const res = await asAlice(request(app).get('/villas'));
    assert.equal(res.status, 200);
    assert.match(res.text, /Villa Test/);
  });

  test("un compte standard n'accède pas à l'administration (403)", async () => {
    const res = await asAlice(request(app).get('/admin/users'));
    assert.equal(res.status, 403);
  });

  test("un administrateur accède à l'administration", async () => {
    const res = await asAdmin(request(app).get('/admin/users'));
    assert.equal(res.status, 200);
    assert.match(res.text, /alice@villa\.fr/);
  });
});

describe('connexion et déconnexion', () => {
  test('une connexion réussie pose un cookie HttpOnly et redirige vers la page demandée', async () => {
    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'alice@villa.fr', password: 'alice1234', next: '/bookings' });
    assert.equal(res.status, 303);
    assert.equal(res.headers.location, '/bookings');
    const cookie = res.headers['set-cookie'][0];
    assert.match(cookie, /^session=token-alice/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
  });

  test('un mauvais mot de passe réaffiche le formulaire (401)', async () => {
    const res = await request(app).post('/login').type('form').send({ email: 'alice@villa.fr', password: 'faux' });
    assert.equal(res.status, 401);
    assert.match(res.text, /Email ou mot de passe incorrect/);
  });

  test('une redirection vers un autre site est refusée', async () => {
    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'alice@villa.fr', password: 'alice1234', next: '//site-pirate.com' });
    assert.equal(res.headers.location, '/villas');
  });

  test('la création de compte connecte directement le nouvel utilisateur', async () => {
    const res = await request(app).post('/register').type('form').send({ email: 'bob@villa.fr', password: 'bob12345' });
    assert.equal(res.status, 303);
    assert.equal(res.headers.location, '/villas');
    assert.match(res.headers['set-cookie'][0], /^session=/);
  });

  test('un email déjà utilisé est refusé (409)', async () => {
    const res = await request(app).post('/register').type('form').send({ email: 'alice@villa.fr', password: 'x1234567' });
    assert.equal(res.status, 409);
  });

  test('la déconnexion supprime la session et efface le cookie', async () => {
    const res = await asAlice(request(app).post('/logout'));
    assert.equal(res.status, 303);
    assert.deepEqual(api.calls.logout, ['token-alice']);
    assert.match(res.headers['set-cookie'][0], /^session=;/);
  });
});

describe('réservations et comptes', () => {
  test('réserver une villa redirige vers « mes réservations »', async () => {
    const res = await asAlice(request(app).post('/villas/1/book'))
      .type('form')
      .send({ start_date: '2030-07-01', end_date: '2030-07-08' });
    assert.equal(res.status, 303);
    assert.equal(res.headers.location, '/bookings?msg=booked');
    const page = await asAlice(request(app).get('/bookings?msg=booked'));
    assert.match(page.text, /Réservation confirmée/);
    assert.match(page.text, /2\s?100 €/); // 7 nuits × 300 €
  });

  test('des dates déjà réservées affichent une erreur (409)', async () => {
    await asAlice(request(app).post('/villas/1/book')).type('form').send({ start_date: '2030-07-01', end_date: '2030-07-08' });
    const res = await asAdmin(request(app).post('/villas/1/book'))
      .type('form')
      .send({ start_date: '2030-07-05', end_date: '2030-07-10' });
    assert.equal(res.status, 409);
    assert.match(res.text, /déjà réservées/);
  });

  test('supprimer son compte supprime aussi ses réservations', async () => {
    const res = await asAlice(request(app).post('/account/delete'));
    assert.equal(res.status, 303);
    assert.deepEqual(api.calls.deleteMe, ['token-alice']);
    assert.deepEqual(api.calls.deleteUserBookings, [1]);
  });

  test("un admin ne peut pas supprimer un autre admin (403)", async () => {
    const res = await asAdmin(request(app).post('/admin/users/2/delete'));
    assert.equal(res.status, 403);
    assert.deepEqual(api.calls.deleteUser, []);
  });

  test('un admin supprime un compte standard et ses réservations', async () => {
    const res = await asAdmin(request(app).post('/admin/users/1/delete'));
    assert.equal(res.status, 303);
    assert.deepEqual(api.calls.deleteUser, [1]);
    assert.deepEqual(api.calls.deleteUserBookings, [1]);
  });
});
