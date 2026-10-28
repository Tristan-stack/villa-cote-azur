// Client HTTP vers les 3 backends, appelés sur le réseau Docker interne.
// Le navigateur ne les contacte jamais : seul le frontend connaît leur adresse.

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(baseUrl, path, { method = 'GET', token, userId, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`; // session, vérifiée par l'auth-service
  if (userId !== undefined) headers['X-User-Id'] = String(userId); // identité pour le booking-service
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5_000), // un backend lent ne bloque pas la page indéfiniment
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // Express renvoie { error }, FastAPI renvoie { detail }
    const message = data?.error ?? (typeof data?.detail === 'string' ? data.detail : 'Requête invalide');
    throw new ApiError(response.status, message);
  }
  return data;
}

export function createApiClient({ authUrl, villaUrl, bookingUrl }) {
  return {
    // ---- auth-service ----
    register: (email, password) =>
      request(authUrl, '/auth/register', { method: 'POST', body: { email, password } }),
    login: (email, password) => request(authUrl, '/auth/login', { method: 'POST', body: { email, password } }),
    logout: (token) => request(authUrl, '/auth/logout', { method: 'POST', token }),
    // Utilisateur associé au jeton, ou null si la session est invalide ou expirée
    async me(token) {
      try {
        return await request(authUrl, '/auth/me', { token });
      } catch (error) {
        if (error.status === 401) return null;
        throw error;
      }
    },
    deleteMe: (token) => request(authUrl, '/users/me', { method: 'DELETE', token }),
    listUsers: (token) => request(authUrl, '/users', { token }),
    deleteUser: (token, id) => request(authUrl, `/users/${encodeURIComponent(id)}`, { method: 'DELETE', token }),

    // ---- villa-service ----
    listVillas: (city) => request(villaUrl, city ? `/villas?city=${encodeURIComponent(city)}` : '/villas'),
    getVilla: (id) => request(villaUrl, `/villas/${encodeURIComponent(id)}`),

    // ---- booking-service ----
    myBookings: (userId) => request(bookingUrl, '/bookings', { userId }),
    villaBookings: (villaId) => request(bookingUrl, `/villas/${encodeURIComponent(villaId)}/bookings`),
    createBooking: (userId, booking) => request(bookingUrl, '/bookings', { method: 'POST', userId, body: booking }),
    cancelBooking: (userId, id) =>
      request(bookingUrl, `/bookings/${encodeURIComponent(id)}`, { method: 'DELETE', userId }),
    deleteUserBookings: (userId) =>
      request(bookingUrl, `/users/${encodeURIComponent(userId)}/bookings`, { method: 'DELETE' }),
  };
}
