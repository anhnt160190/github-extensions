// Chrome storage.local wrapper for async/await usage

export async function get(key) {
  const result = await chrome.storage.local.get(key);
  return result[key] ?? null;
}

export async function set(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

export async function remove(key) {
  await chrome.storage.local.remove(key);
}
