// Settings page: account CRUD, PAT testing, session capture

import {
  getAccounts,
  addAccount,
  updateAccount,
  removeAccount,
} from '../lib/account-manager.js';
import { captureSession } from '../lib/cookie-manager.js';
import { esc, formatTime } from '../lib/dom-utils.js';

const accountsList = document.getElementById('accounts-list');
const form = document.getElementById('account-form');
const patStatus = document.getElementById('pat-status');

// -- Render accounts list --

async function renderAccounts() {
  const accounts = await getAccounts();
  if (accounts.length === 0) {
    accountsList.innerHTML =
      '<p style="color:#8b949e;padding:8px 0;">No accounts configured yet.</p>';
    return;
  }

  accountsList.innerHTML = accounts
    .map(
      (acc) => `
    <div class="account-card" data-id="${esc(acc.id)}">
      <div class="account-card-header">
        <span class="account-card-label">${esc(acc.id)}</span>
        <span class="account-card-username">@${esc(acc.username)}</span>
      </div>
      <div class="account-card-orgs">Orgs: ${esc((acc.orgs || []).join(', ') || 'none')}</div>
      <div class="session-status ${acc.cookies ? 'captured' : 'not-captured'}">
        Session: ${acc.cookies ? 'Captured ' + formatTime(acc.cookiesCapturedAt) : 'Not captured'}
      </div>
      <div class="account-card-actions">
        <button class="btn-capture" data-action="capture" data-id="${esc(acc.id)}">Capture Session</button>
        <button data-action="edit" data-id="${esc(acc.id)}">Edit</button>
        <button class="btn-danger" data-action="delete" data-id="${esc(acc.id)}">Delete</button>
      </div>
    </div>
  `
    )
    .join('');
}

// -- Event delegation for account actions --

accountsList.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  const { action, id } = btn.dataset;

  if (action === 'delete') {
    if (!confirm(`Delete account "${id}"?`)) return;
    try {
      await removeAccount(id);
      await renderAccounts();
    } catch (err) {
      alert(err.message);
    }
  }

  if (action === 'capture') {
    try {
      btn.textContent = 'Capturing...';
      btn.disabled = true;
      const cookies = await captureSession();
      await updateAccount(id, {
        cookies,
        cookiesCapturedAt: new Date().toISOString(),
      });
      await renderAccounts();
    } catch (err) {
      alert('Capture failed: ' + err.message);
      btn.textContent = 'Capture Session';
      btn.disabled = false;
    }
  }

  if (action === 'edit') {
    const accounts = await getAccounts();
    const acc = accounts.find((a) => a.id === id);
    if (!acc) return;
    // Populate form for editing
    document.getElementById('account-id').value = acc.id;
    document.getElementById('account-id').disabled = true;
    document.getElementById('account-username').value = acc.username;
    document.getElementById('account-pat').value = acc.pat;
    document.getElementById('account-orgs').value = (acc.orgs || []).join(', ');
    form.dataset.editing = id;
    document.getElementById('save-btn').textContent = 'Update Account';
  }
});

// -- Form submit: add or update account --

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('account-id').value.trim();
  const username = document.getElementById('account-username').value.trim();
  const pat = document.getElementById('account-pat').value.trim();
  const orgsRaw = document.getElementById('account-orgs').value.trim();
  const orgs = orgsRaw
    ? orgsRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  if (!id || !username || !pat) {
    alert('Label, username, and PAT are required.');
    return;
  }

  try {
    if (form.dataset.editing) {
      await updateAccount(form.dataset.editing, { username, pat, orgs });
    } else {
      await addAccount({ id, username, pat, orgs });
    }
    resetForm();
    await renderAccounts();
  } catch (err) {
    alert(err.message);
  }
});

// -- Test PAT button --

document.getElementById('test-pat-btn').addEventListener('click', async () => {
  const pat = document.getElementById('account-pat').value.trim();
  if (!pat) {
    patStatus.textContent = 'Enter a PAT first';
    patStatus.className = 'status-error';
    return;
  }

  patStatus.textContent = 'Testing...';
  patStatus.className = '';

  try {
    const resp = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${pat}` },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    patStatus.textContent = `Valid - ${data.login}`;
    patStatus.className = 'status-success';
    // Auto-fill username if empty
    const usernameInput = document.getElementById('account-username');
    if (!usernameInput.value) usernameInput.value = data.login;
  } catch (err) {
    patStatus.textContent = `Failed: ${err.message}`;
    patStatus.className = 'status-error';
  }
});

// -- Helpers --

function resetForm() {
  form.reset();
  form.dataset.editing = '';
  document.getElementById('account-id').disabled = false;
  document.getElementById('save-btn').textContent = 'Save Account';
  patStatus.textContent = '';
  patStatus.className = '';
}

// -- Init --
renderAccounts();
