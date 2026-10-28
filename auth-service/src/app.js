// Application Express du service d'authentification : les routes de l'API REST.
// Elle ne parle jamais directement à PostgreSQL : elle reçoit un « repository »
// en paramètre (createApp({ repo })). En production, c'est PostgreSQL ; dans les
// tests, une version en mémoire. C'est ce qui permet des tests unitaires sans base.
import express from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Ce qu'on renvoie d'un utilisateur : jamais le hash du mot de passe.
const publicUser = ({ id, email, role, createdAt }) => ({ id, email, role, createdAt });

function validateCredentials(email, password) {
  if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    return 'Adresse email invalide';
  }
  // bcrypt ne prend en compte que les 72 premiers octets d'un mot de passe
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    return 'Le mot de passe doit contenir entre 8 et 72 caractères';
  }
  return null;
}

export function createApp({ repo, sessionTtlHours = 24, hashRounds = 10 }) {
  const app = express();
  app.disable('x-powered-by'); // ne pas annoncer « Express » dans les en-têtes HTTP
  app.use(express.json());

  // Retrouve l'utilisateur à partir de l'en-tête « Authorization: Bearer <jeton> »
  async function authenticate(req, res, next) {
    const [scheme, token] = (req.get('authorization') ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Authentification requise' });
    }
    const user = await repo.findUserBySessionToken(token);
    if (!user) {
      return res.status(401).json({ error: 'Session invalide ou expirée' });
    }
    req.user = user;
    req.token = token;
    next();
  }

  function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Réservé aux administrateurs' });
    }
    next();
  }

  // Sonde de santé, utilisée par le HEALTHCHECK Docker
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // Inscription : le rôle est TOUJOURS « standard », quoi que le client envoie
  app.post('/auth/register', async (req, res) => {
    const { email, password } = req.body ?? {};
    const error = validateCredentials(email, password);
    if (error) return res.status(400).json({ error });

    const passwordHash = await bcrypt.hash(password, hashRounds);
    const user = await repo.createUser({ email: email.trim().toLowerCase(), passwordHash, role: 'standard' });
    if (!user) return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
    res.status(201).json(publicUser(user));
  });

  // Connexion : crée une session en base et renvoie son jeton
  app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }
    const user = await repo.findUserByEmail(email.trim().toLowerCase());
    // Même réponse que l'email existe ou non : on ne révèle pas quels comptes existent
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    const token = randomBytes(32).toString('hex'); // 256 bits aléatoires : impossible à deviner
    const expiresAt = new Date(Date.now() + sessionTtlHours * 3_600_000);
    await repo.createSession({ token, userId: user.id, expiresAt });
    res.json({ token, expiresAt, user: publicUser(user) });
  });

  // Déconnexion : la session est supprimée de la base, le jeton devient inutilisable
  app.post('/auth/logout', authenticate, async (req, res) => {
    await repo.deleteSession(req.token);
    res.status(204).end();
  });

  app.get('/auth/me', authenticate, (req, res) => res.json(publicUser(req.user)));

  // Tout utilisateur, standard ou admin, peut supprimer son propre compte
  app.delete('/users/me', authenticate, async (req, res) => {
    await repo.deleteUser(req.user.id); // ses sessions sont supprimées en cascade
    res.status(204).end();
  });

  app.get('/users', authenticate, requireAdmin, async (req, res) => {
    const users = await repo.listUsers();
    res.json(users.map(publicUser));
  });

  // Un admin peut supprimer un compte standard, mais pas un autre admin
  app.delete('/users/:id', authenticate, requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const target = Number.isInteger(id) ? await repo.findUserById(id) : null;
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (target.role !== 'standard') {
      return res.status(403).json({ error: 'Seuls les comptes standard peuvent être supprimés' });
    }
    await repo.deleteUser(target.id);
    res.status(204).end();
  });

  // Erreurs : JSON mal formé → 400 ; erreur imprévue → 500, sans détail technique pour le client
  // (4 paramètres obligatoires pour qu'Express le reconnaisse comme gestionnaire d'erreurs)
  app.use((err, req, res, _next) => {
    const status = err.status ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Erreur interne' : 'Requête invalide' });
  });

  return app;
}

// Crée le premier compte admin (identifiants fournis par la configuration) s'il n'existe
// encore aucun admin. Renvoie true si un admin a été créé.
export async function ensureAdmin({ repo, email, password, hashRounds = 10 }) {
  if (await repo.adminExists()) return false;
  const passwordHash = await bcrypt.hash(password, hashRounds);
  const admin = await repo.createUser({ email: email.trim().toLowerCase(), passwordHash, role: 'admin' });
  return admin !== null;
}
