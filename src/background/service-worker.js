// Background service worker: navigation detection + auto-switch

import { getAccountForOrg } from '../lib/account-manager.js';
import { getCurrentUsername, swapSession } from '../lib/cookie-manager.js';

// Rate limiter: track last switch per tab to prevent infinite loops
const lastSwitchByTab = new Map();
const SWITCH_COOLDOWN_MS = 5000;

// Top-level path segments to skip (GitHub reserved paths, not user/org names)
const SKIP_SEGMENTS = new Set([
  'settings',
  'notifications',
  'login',
  'new',
  'organizations',
  'explore',
  'marketplace',
  'pulls',
  'issues',
  'codespaces',
  'sponsors',
]);

// Extract owner from GitHub URL path: /owner/repo/... → owner
function parseOwnerFromUrl(url) {
  try {
    const { pathname } = new URL(url);
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length === 0) return null;
    // Match exact segment, not prefix (avoids false-matching orgs like "newrelic")
    if (SKIP_SEGMENTS.has(segments[0])) return null;
    return segments[0];
  } catch {
    return null;
  }
}

// Auto-switch logic: shared handler for both full and SPA navigations
async function handleNavigation(details) {
  try {
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
    if (currentUsername?.toLowerCase() === targetAccount.username?.toLowerCase()) {
      // Already on correct account, just update badge
      updateBadge(targetAccount.id);
      return;
    }

    // Need to switch — check if target has stored cookies
    if (!targetAccount.cookies) return;

    // Set timestamp before async work to prevent concurrent swaps
    lastSwitchByTab.set(details.tabId, Date.now());

    await swapSession(targetAccount.id);
    updateBadge(targetAccount.id);
    chrome.tabs.reload(details.tabId);
  } catch (err) {
    console.error('Auto-switch failed:', err.message);
  }
}

const NAV_FILTER = { url: [{ hostEquals: 'github.com' }] };

// Full page navigations (address bar, reload, external links)
chrome.webNavigation.onCompleted.addListener(handleNavigation, NAV_FILTER);

// SPA navigations via history.pushState (GitHub Turbo/pjax link clicks)
chrome.webNavigation.onHistoryStateUpdated.addListener(
  handleNavigation,
  NAV_FILTER
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
