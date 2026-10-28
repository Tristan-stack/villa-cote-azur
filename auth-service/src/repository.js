// Accès aux données du service, dans PostgreSQL (base auth_db).
// Les routes (app.js) n'utilisent QUE ces fonctions : dans les tests, on les remplace
// par une version en mémoire qui a exactement la même interface.

// Le service crée lui-même ses tables au démarrage. « IF NOT EXISTS » : sans effet si
// elles existent déjà, on peut donc relancer le service autant de fois qu'on veut.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('standard', 'admin')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
  );
`;

// Ligne SQL (colonnes en snake_case) → objet JavaScript (propriétés en camelCase)
const toUser = (row) =>
  row
    ? { id: row.id, email: row.email, passwordHash: row.password_hash, role: row.role, createdAt: row.created_at }
    : null;

// Toutes les requêtes sont paramétrées ($1, $2…) : les valeurs ne sont jamais collées
// dans le SQL, ce qui empêche les injections SQL.
export function createPgRepository(pool) {
  return {
    // Plusieurs instances du service peuvent démarrer en même temps (docker compose
    // up --scale) : le verrou « advisory » garantit qu'une seule crée les tables à la fois.
    async migrate() {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(1)');
        await client.query(SCHEMA);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    // Renvoie null si l'email est déjà pris (contrainte UNIQUE : code d'erreur 23505)
    async createUser({ email, passwordHash, role }) {
      try {
        const { rows } = await pool.query(
          'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING *',
          [email, passwordHash, role],
        );
        return toUser(rows[0]);
      } catch (err) {
        if (err.code === '23505') return null;
        throw err;
      }
    },

    async findUserByEmail(email) {
      const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      return toUser(rows[0]);
    },

    async findUserById(id) {
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      return toUser(rows[0]);
    },

    async listUsers() {
      const { rows } = await pool.query('SELECT * FROM users ORDER BY id');
      return rows.map(toUser);
    },

    async deleteUser(id) {
      const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [id]);
      return rowCount > 0;
    },

    async adminExists() {
      const { rows } = await pool.query("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1");
      return rows.length > 0;
    },

    async createSession({ token, userId, expiresAt }) {
      await pool.query(
        'INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)',
        [token, userId, expiresAt],
      );
    },

    // Retrouve l'utilisateur d'une session ; une session expirée est ignorée
    async findUserBySessionToken(token) {
      const { rows } = await pool.query(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token = $1 AND s.expires_at > now()`,
        [token],
      );
      return toUser(rows[0]);
    },

    async deleteSession(token) {
      await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
    },
  };
}
