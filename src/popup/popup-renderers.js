// Popup rendering functions for repos, PRs, and accounts

import { esc, timeAgo } from '../lib/dom-utils.js';

// Render account list with current user highlighted
export function renderAccountList(container, accounts, currentUsername) {
  if (accounts.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = accounts
    .map((acc) => {
      const isCurrent = acc.username === currentUsername;
      return `
      <div class="account-item" data-id="${esc(acc.id)}">
        <span class="account-dot ${isCurrent ? 'active' : ''}"></span>
        <span class="account-label">${esc(acc.id)} (${esc(acc.username)})</span>
        ${isCurrent ? '<span class="account-check">&#10003;</span>' : ''}
      </div>`;
    })
    .join('');
}

// Render repo results list
export function renderRepos(resultsList, repos) {
  resultsList.innerHTML = repos
    .map(
      (r) => `
    <li class="result-item" data-url="${esc(r.url)}">
      <span class="result-name">${esc(r.fullName)}</span>
      <span class="result-badge">${esc(r.accountId)}</span>
    </li>`
    )
    .join('');
}

// Render PR results list
export function renderPRs(resultsList, prs) {
  resultsList.innerHTML = prs
    .map(
      (pr) => `
    <li class="result-item pr-item" data-url="${esc(pr.url)}">
      <div>
        <span class="pr-title">${pr.draft ? '[Draft] ' : ''}${esc(pr.title)}</span>
        <span class="result-badge">${esc(pr.accountId)}</span>
      </div>
      <div class="pr-repo">${esc(pr.repo)} #${pr.number} &middot; ${timeAgo(pr.updatedAt)}</div>
    </li>`
    )
    .join('');
}
