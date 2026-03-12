// Aggregate GitHub API calls across multiple accounts

import { GitHubAPI } from './github-api.js';
import * as cache from './cache.js';

// Search repos across all accounts, merge and deduplicate
export async function searchAllAccounts(query, accounts) {
  const cacheKey = `search:${query}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const results = await Promise.allSettled(
    accounts.map((acc) => new GitHubAPI(acc.pat, acc.id).searchRepos(query))
  );

  const repos = [];
  const seen = new Set();
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const repo of result.value) {
      if (!seen.has(repo.fullName)) {
        seen.add(repo.fullName);
        repos.push(repo);
      }
    }
  }

  repos.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  cache.set(cacheKey, repos);
  return repos;
}

// List recent repos across all accounts
export async function listAllRepos(accounts) {
  const cacheKey = 'repos:all';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const results = await Promise.allSettled(
    accounts.map((acc) => new GitHubAPI(acc.pat, acc.id).listUserRepos())
  );

  const repos = [];
  const seen = new Set();
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const repo of result.value) {
      if (!seen.has(repo.fullName)) {
        seen.add(repo.fullName);
        repos.push(repo);
      }
    }
  }

  repos.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  cache.set(cacheKey, repos);
  return repos;
}

// Fetch all PRs (authored + review-requested) across all accounts
export async function getAllPRs(accounts) {
  const cacheKey = 'prs:all';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const authoredPromises = accounts.map((acc) =>
    new GitHubAPI(acc.pat, acc.id).getAuthoredPRs(acc.username)
  );
  const reviewPromises = accounts.map((acc) =>
    new GitHubAPI(acc.pat, acc.id).getReviewPRs(acc.username)
  );

  const [authoredResults, reviewResults] = await Promise.all([
    Promise.allSettled(authoredPromises),
    Promise.allSettled(reviewPromises),
  ]);

  const authored = authoredResults
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  const reviews = reviewResults
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  const result = { authored, reviews };
  cache.set(cacheKey, result);
  return result;
}
