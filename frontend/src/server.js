// Point d'entrée du frontend : configuration par variables d'environnement (12-factor app)
import { createApp } from './app.js';
import { createApiClient } from './api.js';

const {
  PORT = '3000',
  APP_ENV = 'test',
  AUTH_URL = 'http://127.0.0.1:3001',
  VILLA_URL = 'http://127.0.0.1:8001',
  BOOKING_URL = 'http://127.0.0.1:8002',
  COOKIE_SECURE = 'false',
  SESSION_TTL_HOURS = '24',
} = process.env;

const api = createApiClient({ authUrl: AUTH_URL, villaUrl: VILLA_URL, bookingUrl: BOOKING_URL });
const app = createApp({
  api,
  appEnv: APP_ENV,
  cookieSecure: COOKIE_SECURE === 'true',
  sessionTtlHours: Number(SESSION_TTL_HOURS),
});

const server = app.listen(Number(PORT), (error) => {
  if (error) throw error;
  console.log(`frontend (${APP_ENV}) à l'écoute sur le port ${PORT}`);
});

// Arrêt propre : « docker stop » envoie SIGTERM au processus principal du conteneur
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`${signal} reçu : arrêt du frontend`);
    server.close(() => process.exit(0));
  });
}
