// Tests unitaires de l'API : aucune base de données, on injecte le repository en mémoire.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp, ensureAdmin } from '../src/app.js';
import { createMemoryRepository } from './memory-repository.js';

const PASSWORD = 'motdepasse';
let repo;
let app;

beforeEach(() => {
  repo = createMemoryRepository();
  // Peu de tours de hachage : bcrypt est volontairement lent, on accélère les tests
  app = createApp({ repo, hashRounds: 4 });
});

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

function register(email, password = PASSWORD) {
  return request(app).post('/auth/register').send({ email, password });
}

async function login(email, password = PASSWORD) {
  const res = await request(app).post('/auth/login').send({ email, password });
  return res.body.token;
}

// Crée un compte standard connecté : renvoie { id, token }
async function standardUser(email) {
  const { body } = await register(email);
  return { id: body.id, token: await login(email) };
}

// Crée un compte admin connecté (directement dans le repository, l'API ne le permet pas)
async function adminUser(email) {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const user = await repo.createUser({ email, passwordHash, role: 'admin' });
  return { id: user.id, token: await login(email) };
}

test('/health répond ok', async () => {
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok' });
});

describe('inscription', () => {
  test('crée un compte standard, sans jamais renvoyer le hash du mot de passe', async () => {
    const res = await register('Alice@Villa.fr');
    assert.equal(res.status, 201);
    assert.equal(res.body.email, 'alice@villa.fr');
    assert.equal(res.body.role, 'standard');
    assert.equal(res.body.passwordHash, undefined);
  });

  test('ignore un rôle « admin » envoyé par le client', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'pirate@villa.fr', password: PASSWORD, role: 'admin' });
    assert.equal(res.status, 201);
    assert.equal(res.body.role, 'standard');
  });

  test('refuse un email déjà utilisé (409)', async () => {
    await register('alice@villa.fr');
    assert.equal((await register('ALICE@villa.fr')).status, 409);
  });

  test('refuse un email ou un mot de passe invalide (400)', async () => {
    assert.equal((await register('pas-un-email')).status, 400);
    assert.equal((await register('bob@villa.fr', 'court')).status, 400);
  });
});

describe('connexion et session', () => {
  test('la connexion renvoie un jeton, /auth/me renvoie l\'utilisateur', async () => {
    await register('alice@villa.fr');
    const token = await login('alice@villa.fr');
    assert.match(token, /^[0-9a-f]{64}$/);

    const res = await request(app).get('/auth/me').set(bearer(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.email, 'alice@villa.fr');
  });

  test('refuse un mauvais mot de passe (401)', async () => {
    await register('alice@villa.fr');
    const res = await request(app).post('/auth/login').send({ email: 'alice@villa.fr', password: 'mauvais-mdp' });
    assert.equal(res.status, 401);
    assert.equal(res.body.token, undefined);
  });

  test('/auth/me sans jeton ou avec un faux jeton : 401', async () => {
    assert.equal((await request(app).get('/auth/me')).status, 401);
    assert.equal((await request(app).get('/auth/me').set(bearer('faux-jeton'))).status, 401);
  });

  test('après la déconnexion, le jeton ne fonctionne plus', async () => {
    const alice = await standardUser('alice@villa.fr');
    assert.equal((await request(app).post('/auth/logout').set(bearer(alice.token))).status, 204);
    assert.equal((await request(app).get('/auth/me').set(bearer(alice.token))).status, 401);
  });

  test('une session expirée est refusée', async () => {
    app = createApp({ repo, hashRounds: 4, sessionTtlHours: 0 }); // la session expire aussitôt
    const alice = await standardUser('alice@villa.fr');
    assert.equal((await request(app).get('/auth/me').set(bearer(alice.token))).status, 401);
  });
});

describe('suppression de comptes', () => {
  test('un utilisateur standard supprime son propre compte', async () => {
    const alice = await standardUser('alice@villa.fr');
    assert.equal((await request(app).delete('/users/me').set(bearer(alice.token))).status, 204);
    assert.equal((await request(app).get('/auth/me').set(bearer(alice.token))).status, 401);
    assert.equal(await login('alice@villa.fr'), undefined);
  });

  test('un admin supprime son propre compte', async () => {
    const admin = await adminUser('admin@villa.fr');
    assert.equal((await request(app).delete('/users/me').set(bearer(admin.token))).status, 204);
    assert.equal(await repo.findUserById(admin.id), null);
  });

  test('un admin liste les comptes et supprime un compte standard', async () => {
    const admin = await adminUser('admin@villa.fr');
    const alice = await standardUser('alice@villa.fr');

    const list = await request(app).get('/users').set(bearer(admin.token));
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 2);

    assert.equal((await request(app).delete(`/users/${alice.id}`).set(bearer(admin.token))).status, 204);
    assert.equal(await repo.findUserById(alice.id), null);
  });

  test('un admin ne peut pas supprimer un autre admin (403)', async () => {
    const admin1 = await adminUser('admin1@villa.fr');
    const admin2 = await adminUser('admin2@villa.fr');
    const res = await request(app).delete(`/users/${admin2.id}`).set(bearer(admin1.token));
    assert.equal(res.status, 403);
    assert.notEqual(await repo.findUserById(admin2.id), null);
  });

  test('un compte standard ne peut ni lister ni supprimer les autres comptes (403)', async () => {
    const alice = await standardUser('alice@villa.fr');
    const bob = await standardUser('bob@villa.fr');
    assert.equal((await request(app).get('/users').set(bearer(alice.token))).status, 403);
    assert.equal((await request(app).delete(`/users/${bob.id}`).set(bearer(alice.token))).status, 403);
  });

  test('supprimer un compte inexistant : 404', async () => {
    const admin = await adminUser('admin@villa.fr');
    assert.equal((await request(app).delete('/users/999').set(bearer(admin.token))).status, 404);
  });
});

describe('admin initial (ensureAdmin)', () => {
  test('crée un admin s\'il n\'y en a aucun, et une seule fois', async () => {
    const options = { repo, email: 'admin@villa.fr', password: PASSWORD, hashRounds: 4 };
    assert.equal(await ensureAdmin(options), true);
    assert.equal(await ensureAdmin(options), false);
    assert.equal((await repo.findUserByEmail('admin@villa.fr')).role, 'admin');
  });
});
