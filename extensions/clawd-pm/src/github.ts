import { Type } from "@sinclair/typebox";

function getGitHubAuth(): { token: string } {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GitHub not configured. Set GITHUB_TOKEN environment variable (personal access token).");
  }
  return { token };
}

async function githubFetch(path: string, options?: RequestInit): Promise<unknown> {
  const { token } = getGitHubAuth();

  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...((options?.headers as Record<string, string>) ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API error ${res.status}: ${res.statusText}. ${body.slice(0, 300)}`);
  }

  return await res.json();
}

function formatPR(pr: Record<string, unknown>): Record<string, unknown> {
  return {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    draft: pr.draft,
    author: (pr.user as Record<string, unknown>)?.login,
    url: pr.html_url,
    branch: (pr.head as Record<string, unknown>)?.ref,
    baseBranch: (pr.base as Record<string, unknown>)?.ref,
    reviewers: (pr.requested_reviewers as Record<string, unknown>[])?.map((r) => r.login),
    labels: (pr.labels as Record<string, unknown>[])?.map((l) => l.name),
    mergeable: pr.mergeable_state,
    created: pr.created_at,
    updated: pr.updated_at,
    merged: pr.merged_at,
  };
}

export function createGitHubListPRsTool() {
  return {
    name: "github_list_prs",
    label: "GitHub List PRs",
    description:
      "List pull requests for a GitHub repository. Filter by state (open/closed/all), author, or labels. Use for questions like 'what PRs are open', 'what did Sarah ship this week', 'any PRs waiting for review'.",
    parameters: Type.Object({
      repo: Type.String({
        description: 'Repository in "owner/repo" format, e.g. "acme/backend"',
      }),
      state: Type.Optional(
        Type.String({ description: 'Filter by state: "open", "closed", or "all" (default "open")' }),
      ),
      author: Type.Optional(
        Type.String({ description: "Filter by PR author GitHub username" }),
      ),
      label: Type.Optional(
        Type.String({ description: "Filter by label name" }),
      ),
      limit: Type.Optional(
        Type.Number({ description: "Max results (default 20)", default: 20 }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const repo = params.repo as string;
      const state = (params.state as string) ?? "open";
      const author = params.author as string | undefined;
      const label = params.label as string | undefined;
      const limit = (params.limit as number) ?? 20;

      const query = new URLSearchParams({
        state,
        per_page: String(Math.min(limit, 100)),
        sort: "updated",
        direction: "desc",
      });

      const data = (await githubFetch(
        `/repos/${repo}/pulls?${query}`,
      )) as Record<string, unknown>[];

      let prs = data.map(formatPR);

      if (author) {
        prs = prs.filter((pr) => pr.author === author);
      }
      if (label) {
        prs = prs.filter((pr) =>
          (pr.labels as string[])?.some((l) => l.toLowerCase() === label.toLowerCase()),
        );
      }

      return {
        content: [
          { type: "text", text: JSON.stringify({ count: prs.length, pullRequests: prs }, null, 2) },
        ],
      };
    },
  };
}

export function createGitHubGetPRTool() {
  return {
    name: "github_get_pr",
    label: "GitHub Get PR",
    description:
      "Get full details of a specific pull request including description, review status, checks, and comments.",
    parameters: Type.Object({
      repo: Type.String({
        description: 'Repository in "owner/repo" format',
      }),
      prNumber: Type.Number({ description: "Pull request number" }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const repo = params.repo as string;
      const prNumber = params.prNumber as number;

      const [pr, reviews, checks] = await Promise.all([
        githubFetch(`/repos/${repo}/pulls/${prNumber}`) as Promise<Record<string, unknown>>,
        githubFetch(`/repos/${repo}/pulls/${prNumber}/reviews`) as Promise<Record<string, unknown>[]>,
        githubFetch(`/repos/${repo}/commits/${prNumber}/check-runs`).catch(() => null) as Promise<Record<string, unknown> | null>,
      ]);

      const result = {
        ...formatPR(pr),
        body: ((pr.body as string) ?? "").slice(0, 5000),
        additions: pr.additions,
        deletions: pr.deletions,
        changedFiles: pr.changed_files,
        mergeable: pr.mergeable,
        mergeableState: pr.mergeable_state,
        reviews: reviews.map((r) => ({
          author: (r.user as Record<string, unknown>)?.login,
          state: r.state,
          body: ((r.body as string) ?? "").slice(0, 500),
          submitted: r.submitted_at,
        })),
        checksStatus: checks
          ? {
              total: (checks.check_runs as Record<string, unknown>[])?.length ?? 0,
              passed: (checks.check_runs as Record<string, unknown>[])?.filter(
                (c) => c.conclusion === "success",
              ).length,
              failed: (checks.check_runs as Record<string, unknown>[])?.filter(
                (c) => c.conclusion === "failure",
              ).length,
            }
          : null,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  };
}

export function createGitHubListReposTool() {
  return {
    name: "github_list_repos",
    label: "GitHub List Repos",
    description:
      "List repositories for an organization or the authenticated user. Use to discover available repos.",
    parameters: Type.Object({
      org: Type.Optional(
        Type.String({ description: "Organization name. Omit to list your own repos." }),
      ),
      limit: Type.Optional(
        Type.Number({ description: "Max results (default 30)", default: 30 }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const org = params.org as string | undefined;
      const limit = (params.limit as number) ?? 30;

      const query = new URLSearchParams({
        per_page: String(Math.min(limit, 100)),
        sort: "updated",
        direction: "desc",
      });

      const path = org
        ? `/orgs/${org}/repos?${query}`
        : `/user/repos?${query}`;

      const data = (await githubFetch(path)) as Record<string, unknown>[];

      const repos = data.map((r) => ({
        name: r.full_name,
        description: r.description,
        private: r.private,
        language: r.language,
        defaultBranch: r.default_branch,
        openIssues: r.open_issues_count,
        stars: r.stargazers_count,
        updated: r.updated_at,
        url: r.html_url,
      }));

      return {
        content: [
          { type: "text", text: JSON.stringify({ count: repos.length, repos }, null, 2) },
        ],
      };
    },
  };
}

export function createGitHubListIssuesTool() {
  return {
    name: "github_list_issues",
    label: "GitHub List Issues",
    description:
      "List issues for a GitHub repository. Filter by state, assignee, or labels. Note: PRs are also returned by GitHub's issues API — they'll have a pull_request field.",
    parameters: Type.Object({
      repo: Type.String({
        description: 'Repository in "owner/repo" format',
      }),
      state: Type.Optional(
        Type.String({ description: '"open", "closed", or "all" (default "open")' }),
      ),
      assignee: Type.Optional(
        Type.String({ description: "Filter by assignee username" }),
      ),
      labels: Type.Optional(
        Type.String({ description: "Comma-separated label names to filter by" }),
      ),
      limit: Type.Optional(
        Type.Number({ description: "Max results (default 20)", default: 20 }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const repo = params.repo as string;
      const state = (params.state as string) ?? "open";
      const assignee = params.assignee as string | undefined;
      const labels = params.labels as string | undefined;
      const limit = (params.limit as number) ?? 20;

      const query = new URLSearchParams({
        state,
        per_page: String(Math.min(limit, 100)),
        sort: "updated",
        direction: "desc",
      });
      if (assignee) query.set("assignee", assignee);
      if (labels) query.set("labels", labels);

      const data = (await githubFetch(
        `/repos/${repo}/issues?${query}`,
      )) as Record<string, unknown>[];

      const issues = data.map((i) => ({
        number: i.number,
        title: i.title,
        state: i.state,
        author: (i.user as Record<string, unknown>)?.login,
        assignees: (i.assignees as Record<string, unknown>[])?.map((a) => a.login),
        labels: (i.labels as Record<string, unknown>[])?.map((l) => l.name),
        isPullRequest: !!(i.pull_request),
        comments: i.comments,
        created: i.created_at,
        updated: i.updated_at,
        url: i.html_url,
      }));

      return {
        content: [
          { type: "text", text: JSON.stringify({ count: issues.length, issues }, null, 2) },
        ],
      };
    },
  };
}

export function createGitHubCreateIssueTool() {
  return {
    name: "github_create_issue",
    label: "GitHub Create Issue",
    description:
      "Create a new GitHub issue in a repository.",
    parameters: Type.Object({
      repo: Type.String({
        description: 'Repository in "owner/repo" format',
      }),
      title: Type.String({ description: "Issue title" }),
      body: Type.Optional(
        Type.String({ description: "Issue body (supports markdown)" }),
      ),
      labels: Type.Optional(
        Type.Array(Type.String(), { description: "Label names to apply" }),
      ),
      assignees: Type.Optional(
        Type.Array(Type.String(), { description: "GitHub usernames to assign" }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const repo = params.repo as string;
      const title = params.title as string;
      const body = params.body as string | undefined;
      const labels = params.labels as string[] | undefined;
      const assignees = params.assignees as string[] | undefined;

      const payload: Record<string, unknown> = { title };
      if (body) payload.body = body;
      if (labels) payload.labels = labels;
      if (assignees) payload.assignees = assignees;

      const data = (await githubFetch(`/repos/${repo}/issues`, {
        method: "POST",
        body: JSON.stringify(payload),
      })) as Record<string, unknown>;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                created: true,
                number: data.number,
                title: data.title,
                url: data.html_url,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  };
}

export function createGitHubAddCommentTool() {
  return {
    name: "github_add_comment",
    label: "GitHub Add Comment",
    description: "Add a comment to a GitHub issue or pull request.",
    parameters: Type.Object({
      repo: Type.String({
        description: 'Repository in "owner/repo" format',
      }),
      issueNumber: Type.Number({ description: "Issue or PR number" }),
      comment: Type.String({ description: "Comment text (supports markdown)" }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const repo = params.repo as string;
      const issueNumber = params.issueNumber as number;
      const comment = params.comment as string;

      const data = (await githubFetch(`/repos/${repo}/issues/${issueNumber}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: comment }),
      })) as Record<string, unknown>;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              commentId: data.id,
              url: data.html_url,
            }),
          },
        ],
      };
    },
  };
}
