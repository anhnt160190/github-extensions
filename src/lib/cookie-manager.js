// Cookie capture, store, and swap for GitHub account switching

import { getAccountById, updateAccount } from './account-manager.js';

const GITHUB_DOMAIN = '.github.com';
const GITHUB_URL = 'https://github.com';

// Critical GitHub cookies that define a session
const SESSION_COOKIE_NAMES = [
  'user_session',
  '__Host-user_session_same_site',
  'logged_in',
  'dotcom_user',
  '_gh_sess',
];

// Capture current GitHub session cookies (only critical ones)
export async function captureSession() {
  const all = await chrome.cookies.getAll({ domain: GITHUB_DOMAIN });
  return all.filter((c) => SESSION_COOKIE_NAMES.includes(c.name));
}

// Store captured cookies for a specific account
export async function storeSession(accountId, cookies) {
  await updateAccount(accountId, {
    cookies,
    cookiesCapturedAt: new Date().toISOString(),
  });
}

// Read the current logged-in GitHub username from dotcom_user cookie
export async function getCurrentUsername() {
  const cookie = await chrome.cookies.get({
    url: GITHUB_URL,
    name: 'dotcom_user',
  });
  return cookie?.value || null;
}

// Swap session: remove current cookies, set target account's cookies
export async function swapSession(accountId) {
  const account = await getAccountById(accountId);
  if (!account?.cookies) {
    throw new Error(`No stored session for account "${accountId}"`);
  }

  // Remove all current GitHub cookies
  const currentCookies = await chrome.cookies.getAll({
    domain: GITHUB_DOMAIN,
  });
  for (const cookie of currentCookies) {
    const protocol = cookie.secure ? 'https' : 'http';
    const cookieUrl = `${protocol}://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
    await chrome.cookies.remove({ url: cookieUrl, name: cookie.name });
  }

  // Set target account's cookies
  for (const cookie of account.cookies) {
    const details = {
      url: `https://${cookie.domain.replace(/^\./, '')}${cookie.path}`,
      name: cookie.name,
      value: cookie.value,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite || 'unspecified',
    };
    // Only set expirationDate for persistent cookies (not session cookies)
    if (cookie.expirationDate) {
      details.expirationDate = cookie.expirationDate;
    }
    // Domain cookies need the domain field
    if (cookie.domain.startsWith('.')) {
      details.domain = cookie.domain;
    }
    try {
      await chrome.cookies.set(details);
    } catch {
      // Some cookies may fail (CSRF tokens etc.) — non-fatal
    }
  }
}

// Check if a stored session looks valid (has key cookies, not obviously expired)
export async function isSessionValid(accountId) {
  const account = await getAccountById(accountId);
  if (!account?.cookies) return false;

  const hasSession = account.cookies.some((c) =>
    SESSION_COOKIE_NAMES.includes(c.name)
  );
  if (!hasSession) return false;

  // Check if user_session cookie has expired
  const sessionCookie = account.cookies.find(
    (c) => c.name === 'user_session'
  );
  if (sessionCookie?.expirationDate) {
    return sessionCookie.expirationDate > Date.now() / 1000;
  }

  return true;
}
