// GitHub REST API wrapper with PAT authentication

const API_BASE = 'https://api.github.com';

export class GitHubAPI {
  constructor(pat, accountId) {
    this.pat = pat;
    this.accountId = accountId;
  }

  async _fetch(endpoint, params = {}) {
    const url = new URL(`${API_BASE}${endpoint}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    const resp = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.pat}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (resp.status === 403) {
      const remaining = resp.headers.get('X-RateLimit-Remaining');
      if (remaining === '0') {
        const reset = resp.headers.get('X-RateLimit-Reset');
        const resetDate = new Date(Number(reset) * 1000);
        throw new Error(
          `Rate limited until ${resetDate.toLocaleTimeString()}`
        );
      }
    }

    if (!resp.ok) {
      let message = resp.statusText;
      try {
        const body = await resp.json();
        message = body.message || message;
      } catch {
        // response body not JSON
      }
      throw new Error(`GitHub API ${resp.status}: ${message}`);
    }

    return resp.json();
  }

  // Verify PAT and return authenticated user
  async testConnection() {
    const user = await this._fetch('/user');
    return user.login;
  }

  // Search repositories by name
  async searchRepos(query) {
    const data = await this._fetch('/search/repositories', {
      q: `${query} in:name`,
      per_page: '20',
      sort: 'updated',
    });
    return data.items.map((r) => ({
      name: r.name,
      fullName: r.full_name,
      owner: r.owner.login,
      url: r.html_url,
      description: r.description || '',
      stars: r.stargazers_count,
      updatedAt: r.updated_at,
      accountId: this.accountId,
    }));
  }

  // List authenticated user's repos (most recent)
  async listUserRepos() {
    const repos = await this._fetch('/user/repos', {
      per_page: '30',
      sort: 'updated',
      direction: 'desc',
    });
    return repos.map((r) => ({
      name: r.name,
      fullName: r.full_name,
      owner: r.owner.login,
      url: r.html_url,
      description: r.description || '',
      stars: r.stargazers_count,
      updatedAt: r.updated_at,
      accountId: this.accountId,
    }));
  }

  // Get open PRs authored by user
  async getAuthoredPRs(username) {
    const data = await this._fetch('/search/issues', {
      q: `type:pr author:${encodeURIComponent(username)} is:open`,
      per_page: '30',
      sort: 'updated',
    });
    return data.items.map(mapPR.bind(null, this.accountId));
  }

  // Get open PRs where review is requested
  async getReviewPRs(username) {
    const data = await this._fetch('/search/issues', {
      q: `type:pr review-requested:${encodeURIComponent(username)} is:open`,
      per_page: '30',
      sort: 'updated',
    });
    return data.items.map(mapPR.bind(null, this.accountId));
  }
}

function mapPR(accountId, item) {
  // Extract repo from repository_url: ".../repos/owner/repo"
  const repoParts = item.repository_url.split('/');
  const repo = `${repoParts.at(-2)}/${repoParts.at(-1)}`;

  return {
    title: item.title,
    number: item.number,
    url: item.html_url,
    repo,
    state: item.state,
    draft: item.draft || false,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    accountId,
  };
}
