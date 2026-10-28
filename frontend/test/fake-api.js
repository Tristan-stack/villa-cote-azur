// Faux client API : simule les 3 backends en mémoire (aucun appel réseau dans les tests).
// Même interface que createApiClient() de src/api.js.

export class FakeApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createFakeApi() {
  const sessions = {
    'token-alice': { id: 1, email: 'alice@villa.fr', role: 'standard', createdAt: '2026-10-01T10:00:00.000Z' },
    'token-admin': { id: 2, email: 'admin@villa.fr', role: 'admin', createdAt: '2026-10-01T09:00:00.000Z' },
  };
  const passwords = { 'alice@villa.fr': 'alice1234', 'admin@villa.fr': 'admin1234' };
  const villas = [
    {
      id: 1,
      name: 'Villa Test',
      city: 'Nice',
      description: 'Une villa de test',
      price_per_night: 300,
      capacity: 6,
      bedrooms: 3,
      has_pool: true,
      sea_view: true,
    },
  ];
  const bookings = [];
  // Appels enregistrés, pour vérifier dans les tests ce que le frontend a demandé
  const calls = { logout: [], deleteMe: [], deleteUserBookings: [], deleteUser: [] };

  return {
    calls,
    bookings,

    async me(token) {
      return sessions[token] ?? null;
    },
    async login(email, password) {
      if (passwords[email] !== password) throw new FakeApiError(401, 'Email ou mot de passe incorrect');
      const token = Object.keys(sessions).find((t) => sessions[t].email === email) ?? `token-${email}`;
      sessions[token] ??= { id: 3, email, role: 'standard', createdAt: new Date().toISOString() };
      return { token };
    },
    async register(email, password) {
      if (passwords[email]) throw new FakeApiError(409, 'Un compte existe déjà avec cet email');
      passwords[email] = password;
      return { id: 3, email, role: 'standard' };
    },
    async logout(token) {
      calls.logout.push(token);
      return null;
    },
    async deleteMe(token) {
      calls.deleteMe.push(token);
      return null;
    },
    async listUsers() {
      return Object.values(sessions);
    },
    async deleteUser(token, id) {
      const target = Object.values(sessions).find((u) => u.id === Number(id));
      if (!target) throw new FakeApiError(404, 'Utilisateur introuvable');
      if (target.role !== 'standard') throw new FakeApiError(403, 'Seuls les comptes standard peuvent être supprimés');
      calls.deleteUser.push(Number(id));
      return null;
    },

    async listVillas(city) {
      return city ? villas.filter((v) => v.city === city) : villas;
    },
    async getVilla(id) {
      const villa = villas.find((v) => v.id === Number(id));
      if (!villa) throw new FakeApiError(404, 'Villa introuvable');
      return villa;
    },

    async villaBookings(villaId) {
      return bookings
        .filter((b) => b.villa_id === villaId)
        .map(({ start_date, end_date }) => ({ start_date, end_date }));
    },
    async myBookings(userId) {
      return bookings.filter((b) => b.user_id === userId);
    },
    async createBooking(userId, { villa_id, start_date, end_date }) {
      // Dates ISO (AAAA-MM-JJ) : la comparaison de chaînes suit l'ordre chronologique
      const overlap = bookings.some(
        (b) => b.villa_id === villa_id && b.start_date < end_date && start_date < b.end_date,
      );
      if (overlap) throw new FakeApiError(409, 'Ces dates sont déjà réservées pour cette villa');
      const booking = { id: bookings.length + 1, user_id: userId, villa_id, start_date, end_date };
      bookings.push(booking);
      return booking;
    },
    async cancelBooking() {
      return null;
    },
    async deleteUserBookings(userId) {
      calls.deleteUserBookings.push(Number(userId));
      return null;
    },
  };
}
