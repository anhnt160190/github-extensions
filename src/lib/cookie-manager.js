// Cookie capture, store, and swap for GitHub account switching

import {
  getAccounts,
  getAccountById,
  updateAccount,
} from './account-manager.js';

const GITHUB_DOMAIN = '.github.com';
const GITHUB_URL = 'https://github.com';

// Critical GitHub cookies that define a session (used for validation)
const SESSION_COOKIE_NAMES = [
  'user_session',
  '__Host-user_session_same_site',
  'logged_in',
  'dotcom_user',
  '_gh_sess',
];

// Capture ALL current GitHub cookies (full snapshot for reliable restore)
export async function captureSession() {
  return chrome.cookies.getAll({ domain: GITHUB_DOMAIN });
}

// Read the current logged-in GitHub username from dotcom_user cookie
export async function getCurrentUsername() {
  const cookie = await chrome.cookies.get({
    url: GITHUB_URL,
    name: 'dotcom_user',
  });
  return cookie?.value || null;
}

// Save current browser cookies for the currently logged-in account (auto-detect).
// Failures are non-fatal — a failed save should never block the swap.
async function saveCurrentSession() {
  try {
    const currentUser = await getCurrentUsername();
    if (!currentUser) return;

    const accounts = await getAccounts();
    const current = accounts.find(
      (a) => a.username.toLowerCase() === currentUser.toLowerCase()
    );
    if (!current) return;

    const cookies = await captureSession();
    await updateAccount(current.id, {
      cookies,
      cookiesCapturedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Failed to auto-save current session:', err.message);
  }
}

// Swap session: save current session, remove cookies, set target account's cookies
export async function swapSession(accountId) {
  const account = await getAccountById(accountId);
  if (!account?.cookies) {
    throw new Error(`No stored session for account "${accountId}"`);
  }

  // Auto-save current session before destroying it
  await saveCurrentSession();

  // Remove all current GitHub cookies
  const currentCookies = await chrome.cookies.getAll({
    domain: GITHUB_DOMAIN,
  });
  for (const cookie of currentCookies) {
    const protocol = cookie.secure ? 'https' : 'http';
    const cookieUrl = `${protocol}://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
    await chrome.cookies.remove({ url: cookieUrl, name: cookie.name });
  }

  // Set target account's cookies (skip expired ones)
  const now = Date.now() / 1000;
  const validCookies = account.cookies.filter(
    (c) => !c.expirationDate || c.expirationDate > now
  );
  for (const cookie of validCookies) {
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
