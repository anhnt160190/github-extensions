// Simple in-memory TTL cache for API responses

const store = new Map();
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

export function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function set(key, value, ttlMs = DEFAULT_TTL) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidate(key) {
  store.delete(key);
}

export function clear() {
  store.clear();
}
