// Application Express du frontend : pages HTML rendues côté serveur (EJS).
//
// Le frontend est SANS ÉTAT : il ne garde aucune session en mémoire. Le navigateur ne
// stocke qu'un jeton (cookie « session ») et, à chaque requête, le frontend demande à
// l'auth-service à qui appartient ce jeton. On peut donc redémarrer ou dupliquer ce
// conteneur sans déconnecter personne.
//
// Le navigateur ne parle qu'au frontend : c'est lui qui appelle les backends sur le
// réseau Docker interne (pattern « Backend For Frontend »).
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { paletteFor } from './postcards.js';

const SESSION_COOKIE = 'session';

// Villa d'illustration des pages de connexion, et de l'accueil si le catalogue ne répond pas
const SHOWCASE_VILLA = { id: 0, name: 'Villa Bleu Azur', city: 'Cannes', has_pool: true, sea_view: true };

// Messages affichés après une redirection (?msg=…) : liste fermée, le texte ne vient
// jamais de l'URL (aucune injection possible).
const MESSAGES = {
  booked: 'Réservation confirmée. Bonnes vacances !',
  cancelled: 'Réservation annulée.',
  'logged-out': 'Vous êtes déconnecté. À bientôt !',
  'account-deleted': 'Votre compte et vos réservations ont été supprimés.',
  'user-deleted': 'Le compte a été supprimé.',
};

// N'accepte que des chemins internes (« /villas ») : pas de redirection vers un autre site
const safeNext = (next) =>
  typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/villas';

const nightsBetween = (start, end) => Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
const todayIso = () => new Date().toISOString().slice(0, 10);

export function createApp({ api, appEnv = 'test', cookieSecure = false, sessionTtlHours = 24 }) {
  const app = express();
  app.disable('x-powered-by'); // ne pas annoncer « Express » dans les en-têtes HTTP
  app.set('view engine', 'ejs');
  app.set('views', path.join(import.meta.dirname, '..', 'views'));

  // Valeurs et fonctions disponibles dans toutes les pages
  Object.assign(app.locals, {
    appEnv: appEnv.toUpperCase(),
    user: null,
    message: null,
    assetVersion: Date.now().toString(36), // « ?v=… » : le navigateur recharge CSS et JS après un déploiement
    showcaseVilla: SHOWCASE_VILLA,
    paletteFor, // couleurs des illustrations SVG, selon la ville
    formatDate: (iso) => iso.split('-').reverse().join('/'), // 2026-12-24 → 24/12/2026
    formatPrice: (euros) => `${euros.toLocaleString('fr-FR')} €`,
  });

  app.use(compression()); // pages, CSS et JS compressés (gzip) : chargement plus rapide

  // Polices auto-hébergées (paquets npm @fontsource) : aucun appel à un service externe,
  // et fichiers mis en cache un an par le navigateur
  const fonts = path.join(import.meta.dirname, '..', 'node_modules', '@fontsource-variable');
  const cachedForever = { maxAge: '1y', immutable: true };
  app.use('/fonts/fraunces', express.static(path.join(fonts, 'fraunces', 'files'), cachedForever));
  app.use('/fonts/manrope', express.static(path.join(fonts, 'manrope', 'files'), cachedForever));
  app.use(express.static(path.join(import.meta.dirname, '..', 'public'), { maxAge: '1d' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  // Sonde de santé, utilisée par le HEALTHCHECK Docker
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // À chaque page : retrouve l'utilisateur connecté en demandant à l'auth-service
  app.use(async (req, res, next) => {
    const msg = req.query.msg;
    res.locals.message = typeof msg === 'string' && Object.hasOwn(MESSAGES, msg) ? MESSAGES[msg] : null;
    const token = req.cookies[SESSION_COOKIE];
    if (token) {
      const user = await api.me(token);
      if (user) {
        req.user = user;
        req.token = token;
        res.locals.user = user;
      } else {
        res.clearCookie(SESSION_COOKIE); // jeton expiré ou invalide
      }
    }
    next();
  });

  // Non connecté → page de connexion, puis retour à la page demandée
  const requireAuth = (req, res, next) => {
    if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    next();
  };
  const requireAdmin = (req, res, next) => {
    if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    if (req.user.role !== 'admin') {
      return res.status(403).render('error', { status: 403, detail: 'Cette page est réservée aux administrateurs.' });
    }
    next();
  };

  const setSessionCookie = (res, token) =>
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true, // illisible par le JavaScript de la page (protection contre le vol par XSS)
      sameSite: 'lax', // non envoyé par les formulaires d'autres sites (protection CSRF)
      secure: cookieSecure, // HTTPS uniquement, activé en production
      maxAge: sessionTtlHours * 3_600_000,
    });

  // ---------------------------------------------------------------------------
  // Pages publiques : accueil, connexion, création de compte
  // ---------------------------------------------------------------------------
  app.get('/', async (req, res) => {
    // Sélection présentée sur l'accueil public : si le catalogue ne répond pas, la page
    // s'affiche quand même, sans la sélection.
    const villas = await api.listVillas().catch(() => []);
    const byPrice = [...villas].sort((a, b) => b.price_per_night - a.price_per_night);
    res.render('home', {
      featured: villas.slice(0, 3),
      villaCount: villas.length,
      cityCount: new Set(villas.map((v) => v.city)).size,
      minPrice: byPrice.at(-1)?.price_per_night ?? null,
      heroVilla: byPrice[0] ?? SHOWCASE_VILLA, // la villa la plus prestigieuse en vitrine
    });
  });

  app.get('/login', (req, res) => res.render('login', { error: null, email: '', next: safeNext(req.query.next) }));

  app.post('/login', async (req, res) => {
    const { email = '', password = '' } = req.body;
    const next = safeNext(req.body.next);
    try {
      const { token } = await api.login(email, password);
      setSessionCookie(res, token);
      res.redirect(303, next);
    } catch (error) {
      if (![400, 401].includes(error.status)) throw error;
      res.status(401).render('login', { error: 'Email ou mot de passe incorrect.', email, next });
    }
  });

  app.get('/register', (req, res) => res.render('register', { error: null, email: '' }));

  app.post('/register', async (req, res) => {
    const { email = '', password = '' } = req.body;
    try {
      await api.register(email, password);
      // Compte créé : on connecte directement l'utilisateur
      const { token } = await api.login(email, password);
      setSessionCookie(res, token);
      res.redirect(303, '/villas');
    } catch (error) {
      if (![400, 409].includes(error.status)) throw error;
      res.status(error.status).render('register', { error: error.message, email });
    }
  });

  app.post('/logout', async (req, res) => {
    if (req.token) await api.logout(req.token); // la session est supprimée côté serveur
    res.clearCookie(SESSION_COOKIE);
    res.redirect(303, '/?msg=logged-out');
  });

  // ---------------------------------------------------------------------------
  // Pages réservées aux utilisateurs connectés
  // ---------------------------------------------------------------------------
  app.get('/villas', requireAuth, async (req, res) => {
    const city = typeof req.query.city === 'string' ? req.query.city : '';
    const allVillas = await api.listVillas();
    const villas = city ? allVillas.filter((v) => v.city === city) : allVillas;
    const cities = [...new Set(allVillas.map((v) => v.city))].sort((a, b) => a.localeCompare(b, 'fr'));
    res.render('villas', { villas, cities, city, total: allVillas.length });
  });

  async function renderVilla(req, res, { error = null, form = {}, status = 200 } = {}) {
    let villa;
    try {
      villa = await api.getVilla(req.params.id);
    } catch (e) {
      if (![404, 422].includes(e.status)) throw e;
      return res.status(404).render('error', { status: 404, detail: "Cette villa n'existe pas." });
    }
    const periods = await api.villaBookings(villa.id);
    res.status(status).render('villa', { villa, periods, error, form, minDate: todayIso() });
  }

  app.get('/villas/:id', requireAuth, (req, res) => renderVilla(req, res));

  app.post('/villas/:id/book', requireAuth, async (req, res) => {
    const { start_date = '', end_date = '' } = req.body;
    try {
      await api.createBooking(req.user.id, { villa_id: Number(req.params.id), start_date, end_date });
      res.redirect(303, '/bookings?msg=booked');
    } catch (error) {
      if (![400, 409, 422].includes(error.status)) throw error;
      // 422 : dates absentes ou mal formées, refusées par la validation de FastAPI
      const message = error.status === 422 ? 'Merci de choisir des dates valides.' : error.message;
      await renderVilla(req, res, {
        error: message,
        form: { start_date, end_date },
        status: error.status === 409 ? 409 : 400,
      });
    }
  });

  app.get('/bookings', requireAuth, async (req, res) => {
    const [bookings, villas] = await Promise.all([api.myBookings(req.user.id), api.listVillas()]);
    // Composition d'API : les réservations viennent d'un service, les villas d'un autre
    const villasById = new Map(villas.map((v) => [v.id, v]));
    const rows = bookings.map((b) => {
      const villa = villasById.get(b.villa_id) ?? null;
      const nights = nightsBetween(b.start_date, b.end_date);
      return { ...b, villa, nights, total: villa ? nights * villa.price_per_night : null };
    });
    res.render('bookings', { bookings: rows });
  });

  app.post('/bookings/:id/cancel', requireAuth, async (req, res) => {
    try {
      await api.cancelBooking(req.user.id, req.params.id);
    } catch (error) {
      if (![404, 422].includes(error.status)) throw error;
    }
    res.redirect(303, '/bookings?msg=cancelled');
  });

  app.get('/account', requireAuth, (req, res) => res.render('account'));

  app.post('/account/delete', requireAuth, async (req, res) => {
    await api.deleteMe(req.token);
    // Pas de clé étrangère entre les bases des services : le frontend supprime aussi les réservations
    await api.deleteUserBookings(req.user.id);
    res.clearCookie(SESSION_COOKIE);
    res.redirect(303, '/?msg=account-deleted');
  });

  // ---------------------------------------------------------------------------
  // Administration : réservée aux comptes « admin »
  // ---------------------------------------------------------------------------
  app.get('/admin/users', requireAdmin, async (req, res) => {
    const users = await api.listUsers(req.token);
    res.render('admin-users', { users, error: null });
  });

  app.post('/admin/users/:id/delete', requireAdmin, async (req, res) => {
    try {
      await api.deleteUser(req.token, req.params.id); // l'auth-service refuse de supprimer un admin (403)
      await api.deleteUserBookings(req.params.id);
      res.redirect(303, '/admin/users?msg=user-deleted');
    } catch (error) {
      if (![403, 404].includes(error.status)) throw error;
      const users = await api.listUsers(req.token);
      res.status(error.status).render('admin-users', { users, error: error.message });
    }
  });

  // ---------------------------------------------------------------------------
  // Erreurs
  // ---------------------------------------------------------------------------
  app.use((req, res) => res.status(404).render('error', { status: 404, detail: "Cette page n'existe pas." }));

  // Erreur imprévue (backend injoignable…) : page d'erreur, détails uniquement dans les logs
  // (4 paramètres obligatoires pour qu'Express le reconnaisse comme gestionnaire d'erreurs)
  app.use((err, req, res, _next) => {
    console.error(err);
    res.status(500).render('error', {
      status: 500,
      detail: 'Une erreur est survenue : un service est peut-être momentanément indisponible.',
    });
  });

  return app;
}
