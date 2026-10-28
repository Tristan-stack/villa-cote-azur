// Point d'entrée du service : lit la configuration (variables d'environnement),
// prépare la base, crée l'admin initial, puis démarre le serveur HTTP.
import pg from 'pg';
import { createApp, ensureAdmin } from './app.js';
import { createPgRepository } from './repository.js';

const { PORT = '3001', DATABASE_URL, SESSION_TTL_HOURS = '24', ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

if (!DATABASE_URL) {
  console.error('Variable DATABASE_URL manquante');
  process.exit(1);
}

// connectionTimeoutMillis : on échoue au bout de 10 s au lieu d'attendre indéfiniment
const pool = new pg.Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 10_000 });
const repo = createPgRepository(pool);
await repo.migrate();

if (ADMIN_EMAIL && ADMIN_PASSWORD) {
  if (await ensureAdmin({ repo, email: ADMIN_EMAIL, password: ADMIN_PASSWORD })) {
    console.log(`Compte admin initial créé : ${ADMIN_EMAIL}`);
  }
}

const app = createApp({ repo, sessionTtlHours: Number(SESSION_TTL_HOURS) });
const server = app.listen(Number(PORT), (error) => {
  if (error) throw error;
  console.log(`auth-service à l'écoute sur le port ${PORT}`);
});

// Arrêt propre : « docker stop » envoie le signal SIGTERM au processus principal du
// conteneur. On termine les requêtes en cours et on ferme les connexions à la base.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`${signal} reçu : arrêt du service`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  });
}
