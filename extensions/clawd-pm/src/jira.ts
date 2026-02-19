import { Type } from "@sinclair/typebox";

function getJiraAuth(): { auth: string; baseUrl: string } {
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const site = process.env.JIRA_SITE;

  if (!email || !token || !site) {
    throw new Error(
      "Jira not configured. Set JIRA_EMAIL, JIRA_API_TOKEN, and JIRA_SITE environment variables.",
    );
  }

  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const baseUrl = site.includes(".")
    ? `https://${site}`
    : `https://${site}.atlassian.net`;

  return { auth, baseUrl };
}

async function jiraFetch(path: string, options?: RequestInit): Promise<unknown> {
  const { auth, baseUrl } = getJiraAuth();

  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...((options?.headers as Record<string, string>) ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Jira API error ${res.status}: ${res.statusText}. ${body}`);
  }

  return await res.json();
}

function formatIssue(issue: Record<string, unknown>): Record<string, unknown> {
  const fields = issue.fields as Record<string, unknown> | undefined;
  if (!fields) return { key: issue.key, id: issue.id };

  return {
    key: issue.key,
    summary: fields.summary,
    status: (fields.status as Record<string, unknown>)?.name,
    assignee: (fields.assignee as Record<string, unknown>)?.displayName ?? "Unassigned",
    priority: (fields.priority as Record<string, unknown>)?.name,
    type: (fields.issuetype as Record<string, unknown>)?.name,
    updated: fields.updated,
    created: fields.created,
  };
}

export function createJiraSearchTool() {
  return {
    name: "jira_search",
    label: "Jira Search",
    description:
      "Search Jira issues using JQL. Returns matching issues with key, summary, status, assignee, priority. Use for questions like 'what shipped this week', 'what's in the current sprint', 'show me all bugs'.",
    parameters: Type.Object({
      jql: Type.String({
        description:
          'JQL query string. Examples: "status changed to Done after startOfWeek()", "sprint in openSprints()", "assignee = currentUser() AND status != Done", "priority = Blocker AND status != Done"',
      }),
      maxResults: Type.Optional(
        Type.Number({ description: "Max results to return (default 20, max 100)", default: 20 }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const jql = params.jql as string;
      const maxResults = (params.maxResults as number) ?? 20;

      const query = new URLSearchParams({
        jql,
        maxResults: String(Math.min(maxResults, 100)),
        fields: "summary,status,assignee,priority,issuetype,updated,created,sprint",
      });

      const data = (await jiraFetch(`/rest/api/3/search/jql?${query}`)) as {
        issues: Record<string, unknown>[];
        total?: number;
        isLast?: boolean;
      };

      const issues = data.issues.map(formatIssue);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: issues.length, issues }, null, 2),
          },
        ],
      };
    },
  };
}

export function createJiraGetIssueTool() {
  return {
    name: "jira_get_issue",
    label: "Jira Get Issue",
    description:
      "Get full details of a specific Jira issue by key (e.g. PROJ-123). Returns summary, description, status, assignee, comments, and more.",
    parameters: Type.Object({
      issueKey: Type.String({ description: 'Issue key, e.g. "PROJ-123"' }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const issueKey = params.issueKey as string;

      const data = (await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}`)) as Record<
        string,
        unknown
      >;

      const fields = data.fields as Record<string, unknown>;
      const comments = (
        (fields?.comment as Record<string, unknown>)?.comments as Record<string, unknown>[]
      )?.map((c) => ({
        author: (c.author as Record<string, unknown>)?.displayName,
        body: c.body,
        created: c.created,
      }));

      const result = {
        key: data.key,
        summary: fields?.summary,
        description: fields?.description,
        status: (fields?.status as Record<string, unknown>)?.name,
        assignee: (fields?.assignee as Record<string, unknown>)?.displayName ?? "Unassigned",
        reporter: (fields?.reporter as Record<string, unknown>)?.displayName,
        priority: (fields?.priority as Record<string, unknown>)?.name,
        type: (fields?.issuetype as Record<string, unknown>)?.name,
        labels: fields?.labels,
        created: fields?.created,
        updated: fields?.updated,
        comments: comments?.slice(-10),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  };
}

export function createJiraCreateIssueTool() {
  return {
    name: "jira_create_issue",
    label: "Jira Create Issue",
    description:
      "Create a new Jira issue. Requires project key, summary, and issue type. Optionally set description, priority, and assignee.",
    parameters: Type.Object({
      projectKey: Type.String({ description: 'Project key, e.g. "PROJ"' }),
      summary: Type.String({ description: "Issue title/summary" }),
      issueType: Type.Optional(
        Type.String({ description: 'Issue type: "Bug", "Task", "Story", "Epic" (default "Task")' }),
      ),
      description: Type.Optional(Type.String({ description: "Issue description in plain text" })),
      priority: Type.Optional(
        Type.String({
          description: 'Priority: "Highest", "High", "Medium", "Low", "Lowest"',
        }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const projectKey = params.projectKey as string;
      const summary = params.summary as string;
      const issueType = (params.issueType as string) ?? "Task";
      const description = params.description as string | undefined;
      const priority = params.priority as string | undefined;

      const fields: Record<string, unknown> = {
        project: { key: projectKey },
        summary,
        issuetype: { name: issueType },
      };

      if (description) {
        fields.description = {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: description }],
            },
          ],
        };
      }

      if (priority) {
        fields.priority = { name: priority };
      }

      const data = (await jiraFetch("/rest/api/3/issue", {
        method: "POST",
        body: JSON.stringify({ fields }),
      })) as Record<string, unknown>;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                created: true,
                key: data.key,
                id: data.id,
                url: `${getJiraAuth().baseUrl}/browse/${data.key}`,
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

export function createJiraGetSprintTool() {
  return {
    name: "jira_get_sprint",
    label: "Jira Get Sprint",
    description:
      "Get the active sprint for a Jira board. Returns sprint info and all issues in it. First call with no boardId to list boards, then call again with the boardId.",
    parameters: Type.Object({
      boardId: Type.Optional(
        Type.Number({ description: "Board ID. Omit to list all boards first." }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const boardId = params.boardId as number | undefined;

      if (!boardId) {
        const data = (await jiraFetch("/rest/agile/1.0/board?maxResults=50")) as {
          values: Record<string, unknown>[];
        };
        const boards = data.values.map((b) => ({
          id: b.id,
          name: b.name,
          type: b.type,
        }));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { hint: "Call again with a boardId to get its active sprint.", boards },
                null,
                2,
              ),
            },
          ],
        };
      }

      const sprintData = (await jiraFetch(
        `/rest/agile/1.0/board/${boardId}/sprint?state=active`,
      )) as { values: Record<string, unknown>[] };

      const activeSprint = sprintData.values?.[0];
      if (!activeSprint) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "No active sprint found." }) }],
        };
      }

      const issuesData = (await jiraFetch(
        `/rest/agile/1.0/sprint/${activeSprint.id}/issue?maxResults=50&fields=summary,status,assignee,priority,issuetype`,
      )) as { issues: Record<string, unknown>[]; total: number };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                sprint: {
                  id: activeSprint.id,
                  name: activeSprint.name,
                  startDate: activeSprint.startDate,
                  endDate: activeSprint.endDate,
                  state: activeSprint.state,
                },
                totalIssues: issuesData.total,
                issues: issuesData.issues.map(formatIssue),
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

export function createJiraAddCommentTool() {
  return {
    name: "jira_add_comment",
    label: "Jira Add Comment",
    description: "Add a comment to a Jira issue.",
    parameters: Type.Object({
      issueKey: Type.String({ description: 'Issue key, e.g. "PROJ-123"' }),
      comment: Type.String({ description: "Comment text" }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const issueKey = params.issueKey as string;
      const comment = params.comment as string;

      await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, {
        method: "POST",
        body: JSON.stringify({
          body: {
            type: "doc",
            version: 1,
            content: [{ type: "paragraph", content: [{ type: "text", text: comment }] }],
          },
        }),
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, issueKey }) }],
      };
    },
  };
}
