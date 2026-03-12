// Popup: account list, repo search, PR tabs, manual switch

import { getAccounts } from '../lib/account-manager.js';
import { getCurrentUsername, swapSession } from '../lib/cookie-manager.js';
import {
  searchAllAccounts,
  listAllRepos,
  getAllPRs,
} from '../lib/github-aggregate.js';
import * as cache from '../lib/cache.js';
import {
  renderAccountList,
  renderRepos,
  renderPRs,
} from './popup-renderers.js';

// -- DOM refs --
const accountsSection = document.getElementById('accounts-section');
const searchInput = document.getElementById('search-input');
const resultsList = document.getElementById('results-list');
const loadingEl = document.getElementById('loading');
const emptyState = document.getElementById('empty-state');
const refreshBtn = document.getElementById('refresh-btn');
const settingsBtn = document.getElementById('settings-btn');
const tabs = document.querySelectorAll('.tab');

let currentTab = 'repos';
let accounts = [];
let currentUsername = null;

// -- Init --
async function init() {
  try {
    accounts = await getAccounts();
    currentUsername = await getCurrentUsername();
    renderAccountList(accountsSection, accounts, currentUsername);

    if (accounts.length === 0) {
      showEmpty('No accounts configured. Click the gear icon to add accounts.');
      return;
    }
    loadTab(currentTab);
  } catch (err) {
    showEmpty('Failed to initialize: ' + err.message);
  }
}

// -- Account click: manual switch --
accountsSection.addEventListener('click', async (e) => {
  const item = e.target.closest('.account-item');
  if (!item) return;

  const targetId = item.dataset.id;
  const target = accounts.find((a) => a.id === targetId);
  if (!target || target.username === currentUsername) return;

  if (!target.cookies) {
    alert('No session captured for this account. Capture it in Settings first.');
    return;
  }

  try {
    showLoading();
    await swapSession(targetId);
    currentUsername = target.username;
    renderAccountList(accountsSection, accounts, currentUsername);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url?.includes('github.com')) {
      chrome.tabs.reload(tab.id);
    }
  } catch (err) {
    alert('Switch failed: ' + err.message);
  } finally {
    hideLoading();
  }
});

// -- Tab switching --
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    currentTab = tab.dataset.tab;
    searchInput.value = '';
    loadTab(currentTab);
  });
});

// -- Search with debounce --
let searchTimer = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const query = searchInput.value.trim();

  if (!query) {
    loadTab(currentTab);
    return;
  }

  searchTimer = setTimeout(async () => {
    if (currentTab !== 'repos') {
      tabs.forEach((t) => t.classList.remove('active'));
      document.querySelector('[data-tab="repos"]').classList.add('active');
      currentTab = 'repos';
    }
    showLoading();
    try {
      const repos = await searchAllAccounts(query, accounts);
      hideLoading();
      if (repos.length === 0) return showEmpty('No repos found');
      emptyState.classList.add('hidden');
      renderRepos(resultsList, repos);
    } catch (err) {
      showEmpty('Search failed: ' + err.message);
    }
  }, 300);
});

// -- Load tab content --
async function loadTab(tab) {
  showLoading();
  refreshBtn.classList.remove('hidden');

  try {
    if (tab === 'repos') {
      const repos = await listAllRepos(accounts);
      hideLoading();
      if (repos.length === 0) return showEmpty('No repos found');
      emptyState.classList.add('hidden');
      renderRepos(resultsList, repos);
    } else if (tab === 'authored') {
      const { authored } = await getAllPRs(accounts);
      hideLoading();
      if (authored.length === 0) return showEmpty('No PRs found');
      emptyState.classList.add('hidden');
      renderPRs(resultsList, authored);
    } else if (tab === 'reviews') {
      const { reviews } = await getAllPRs(accounts);
      hideLoading();
      if (reviews.length === 0) return showEmpty('No PRs found');
      emptyState.classList.add('hidden');
      renderPRs(resultsList, reviews);
    }
  } catch (err) {
    showEmpty('Failed to load: ' + err.message);
  }
}

// -- Click result: open in new tab --
resultsList.addEventListener('click', (e) => {
  const item = e.target.closest('.result-item');
  if (!item?.dataset.url) return;
  chrome.tabs.create({ url: item.dataset.url });
});

// -- Refresh + Settings buttons --
refreshBtn.addEventListener('click', () => {
  cache.clear();
  loadTab(currentTab);
});

settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// -- UI state helpers --
function showLoading() {
  loadingEl.classList.remove('hidden');
  emptyState.classList.add('hidden');
  resultsList.innerHTML = '';
}

function hideLoading() {
  loadingEl.classList.add('hidden');
}

function showEmpty(msg) {
  hideLoading();
  emptyState.textContent = msg;
  emptyState.classList.remove('hidden');
  resultsList.innerHTML = '';
}

// -- Start --
init();
