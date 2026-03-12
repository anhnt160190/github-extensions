// Background service worker: navigation detection + auto-switch

import { getAccountForOrg } from '../lib/account-manager.js';
import { getCurrentUsername, swapSession } from '../lib/cookie-manager.js';

// Rate limiter: track last switch per tab to prevent infinite loops
const lastSwitchByTab = new Map();
const SWITCH_COOLDOWN_MS = 5000;

// URL paths to skip (no auto-switch on these pages)
const SKIP_PATHS = [
  '/settings',
  '/notifications',
  '/login',
  '/new',
  '/organizations',
  '/explore',
  '/marketplace',
  '/pulls',
  '/issues',
  '/codespaces',
  '/sponsors',
];

// Extract owner from GitHub URL path: /owner/repo/... → owner
function parseOwnerFromUrl(url) {
  try {
    const { pathname } = new URL(url);
    // Skip root and special paths
    if (pathname === '/' || pathname === '') return null;
    for (const skip of SKIP_PATHS) {
      if (pathname.startsWith(skip)) return null;
    }
    const parts = pathname.split('/').filter(Boolean);
    return parts[0] || null;
  } catch {
    return null;
  }
}

// Auto-switch logic on navigation complete
chrome.webNavigation.onCompleted.addListener(
  async (details) => {
    // Only handle main frame navigations
    if (details.frameId !== 0) return;

    const owner = parseOwnerFromUrl(details.url);
    if (!owner) return;

    // Rate limit: skip if switched recently on this tab
    const lastSwitch = lastSwitchByTab.get(details.tabId);
    if (lastSwitch && Date.now() - lastSwitch < SWITCH_COOLDOWN_MS) return;

    // Find account mapped to this owner/org
    const targetAccount = await getAccountForOrg(owner);
    if (!targetAccount) return;

    // Check current session
    const currentUsername = await getCurrentUsername();
    if (currentUsername === targetAccount.username) {
      // Already on correct account, just update badge
      updateBadge(targetAccount.id);
      return;
    }

    // Need to switch — check if target has stored cookies
    if (!targetAccount.cookies) return;

    try {
      lastSwitchByTab.set(details.tabId, Date.now());
      await swapSession(targetAccount.id);
      updateBadge(targetAccount.id);
      chrome.tabs.reload(details.tabId);
    } catch (err) {
      console.error('Auto-switch failed:', err.message);
    }
  },
  { url: [{ hostEquals: 'github.com' }] }
);

// Update toolbar badge with current account initial
function updateBadge(accountId) {
  const initial = accountId.charAt(0).toUpperCase();
  chrome.action.setBadgeText({ text: initial });
  chrome.action.setBadgeBackgroundColor({ color: '#238636' });
}

// Clean up rate limit entries when tabs close
chrome.tabs.onRemoved.addListener((tabId) => {
  lastSwitchByTab.delete(tabId);
});
