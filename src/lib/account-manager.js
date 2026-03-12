// Account CRUD operations and org-to-account mapping

import { get, set } from './storage.js';

const STORAGE_KEY = 'accounts';

export async function getAccounts() {
  return (await get(STORAGE_KEY)) || [];
}

export async function addAccount({ id, username, pat, orgs }) {
  const accounts = await getAccounts();

  if (accounts.some((a) => a.id === id)) {
    throw new Error(`Account "${id}" already exists`);
  }

  // Check for duplicate org mappings across accounts
  const existingOrgs = accounts.flatMap((a) => a.orgs || []);
  const dupes = (orgs || []).filter((o) => existingOrgs.includes(o));
  if (dupes.length > 0) {
    throw new Error(`Orgs already mapped: ${dupes.join(', ')}`);
  }

  accounts.push({
    id,
    username,
    pat,
    orgs: orgs || [],
    cookies: null,
    cookiesCapturedAt: null,
  });

  await set(STORAGE_KEY, accounts);
}

export async function updateAccount(id, updates) {
  const accounts = await getAccounts();
  const index = accounts.findIndex((a) => a.id === id);
  if (index === -1) throw new Error(`Account "${id}" not found`);

  // Check for duplicate org mappings if orgs are being updated
  if (updates.orgs) {
    const otherOrgs = accounts
      .filter((a) => a.id !== id)
      .flatMap((a) => a.orgs || []);
    const dupes = updates.orgs.filter((o) => otherOrgs.includes(o));
    if (dupes.length > 0) {
      throw new Error(`Orgs already mapped: ${dupes.join(', ')}`);
    }
  }

  // Only allow updating known fields
  const allowed = ['username', 'pat', 'orgs', 'cookies', 'cookiesCapturedAt'];
  const safe = {};
  for (const key of allowed) {
    if (key in updates) safe[key] = updates[key];
  }
  accounts[index] = { ...accounts[index], ...safe };
  await set(STORAGE_KEY, accounts);
}

export async function removeAccount(id) {
  const accounts = await getAccounts();
  const filtered = accounts.filter((a) => a.id !== id);
  if (filtered.length === accounts.length) {
    throw new Error(`Account "${id}" not found`);
  }
  await set(STORAGE_KEY, filtered);
}

export async function getAccountForOrg(orgName) {
  const accounts = await getAccounts();
  return accounts.find((a) => (a.orgs || []).includes(orgName)) || null;
}

export async function getAccountById(id) {
  const accounts = await getAccounts();
  return accounts.find((a) => a.id === id) || null;
}
