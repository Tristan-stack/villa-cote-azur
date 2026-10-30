// Faux repository en mémoire, pour les tests unitaires : même interface que
// createPgRepository (src/repository.js), mais sans aucune base de données.
export function createMemoryRepository() {
  const users = [];
  const sessions = new Map(); // jeton → { token, userId, expiresAt }
  let nextId = 1;

  return {
    async migrate() {},

    async createUser({ email, passwordHash, role }) {
      if (users.some((u) => u.email === email)) return null; // comme la contrainte UNIQUE
      const user = { id: nextId++, email, passwordHash, role, createdAt: new Date() };
      users.push(user);
      return user;
    },
    

    async findUserByEmail(email) {
      return users.find((u) => u.email === email) ?? null;
    },

    async findUserById(id) {
      return users.find((u) => u.id === id) ?? null;
    },

    async listUsers() {
      return [...users];
    },

    async deleteUser(id) {
      const index = users.findIndex((u) => u.id === id);
      if (index === -1) return false;
      users.splice(index, 1);
      // comme ON DELETE CASCADE : les sessions de l'utilisateur disparaissent aussi
      for (const [token, session] of sessions) {
        if (session.userId === id) sessions.delete(token);
      }
      return true;
    },

    async adminExists() {
      return users.some((u) => u.role === 'admin');
    },

    async createSession(session) {
      sessions.set(session.token, session);
    },

    async findUserBySessionToken(token) {
      const session = sessions.get(token);
      if (!session || session.expiresAt <= new Date()) return null;
      return users.find((u) => u.id === session.userId) ?? null;
    },

    async deleteSession(token) {
      sessions.delete(token);
    },
  };
}
