import { Type } from "@sinclair/typebox";

function getLinearAuth(): string {
  const key = process.env.LINEAR_API_KEY;
  if (!key) {
    throw new Error("Linear not configured. Set LINEAR_API_KEY environment variable.");
  }
  return key;
}

async function linearQuery(query: string, variables?: Record<string, unknown>): Promise<unknown> {
  const apiKey = getLinearAuth();

  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Linear API error ${res.status}: ${res.statusText}. ${body}`);
  }

  const data = (await res.json()) as { data?: unknown; errors?: { message: string }[] };

  if (data.errors?.length) {
    throw new Error(`Linear GraphQL error: ${data.errors.map((e) => e.message).join(", ")}`);
  }

  return data.data;
}

function formatIssue(node: Record<string, unknown>): Record<string, unknown> {
  return {
    identifier: node.identifier,
    title: node.title,
    status: (node.state as Record<string, unknown>)?.name,
    assignee: (node.assignee as Record<string, unknown>)?.name ?? "Unassigned",
    priority: node.priorityLabel,
    labels: (
      (node.labels as Record<string, unknown>)?.nodes as Record<string, unknown>[] | undefined
    )?.map((l) => l.name),
    updated: node.updatedAt,
    created: node.createdAt,
  };
}

export function createLinearSearchTool() {
  return {
    name: "linear_search",
    label: "Linear Search",
    description:
      "Search Linear issues by text query. Returns matching issues with identifier, title, status, assignee, priority. Use for questions like 'find the checkout redesign issue', 'what bugs are open'.",
    parameters: Type.Object({
      query: Type.String({
        description: 'Text search query, e.g. "checkout redesign", "login bug"',
      }),
      limit: Type.Optional(
        Type.Number({ description: "Max results to return (default 10)", default: 10 }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const query = params.query as string;
      const limit = (params.limit as number) ?? 10;

      const data = (await linearQuery(
        `query($term: String!, $first: Int!) {
          searchIssues(term: $term, first: $first) {
            nodes {
              id identifier title
              state { name }
              assignee { name }
              priorityLabel
              labels { nodes { name } }
              updatedAt createdAt
            }
          }
        }`,
        { term: query, first: Math.min(limit, 50) },
      )) as { searchIssues: { nodes: Record<string, unknown>[] } };

      const issues = data.searchIssues.nodes.map(formatIssue);

      return {
        content: [
          { type: "text", text: JSON.stringify({ count: issues.length, issues }, null, 2) },
        ],
      };
    },
  };
}

export function createLinearGetIssueTool() {
  return {
    name: "linear_get_issue",
    label: "Linear Get Issue",
    description:
      'Get full details of a specific Linear issue by identifier (e.g. "ENG-123"). Returns title, description, status, assignee, comments, and project info.',
    parameters: Type.Object({
      identifier: Type.String({ description: 'Issue identifier, e.g. "ENG-123"' }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const identifier = params.identifier as string;

      const data = (await linearQuery(
        `query($id: String!) {
          issue(id: $id) {
            id identifier title description url
            state { name type }
            assignee { name }
            priority priorityLabel
            labels { nodes { name } }
            project { name state }
            cycle { name number }
            comments { nodes { body user { name } createdAt } }
            createdAt updatedAt
          }
        }`,
        { id: identifier },
      )) as { issue: Record<string, unknown> };

      const issue = data.issue;
      const comments = (
        (issue.comments as Record<string, unknown>)?.nodes as Record<string, unknown>[] | undefined
      )?.map((c) => ({
        author: (c.user as Record<string, unknown>)?.name,
        body: c.body,
        created: c.createdAt,
      }));

      const result = {
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        url: issue.url,
        status: (issue.state as Record<string, unknown>)?.name,
        statusType: (issue.state as Record<string, unknown>)?.type,
        assignee: (issue.assignee as Record<string, unknown>)?.name ?? "Unassigned",
        priority: issue.priorityLabel,
        labels: (
          (issue.labels as Record<string, unknown>)?.nodes as Record<string, unknown>[] | undefined
        )?.map((l) => l.name),
        project: (issue.project as Record<string, unknown>)?.name,
        cycle: issue.cycle
          ? `${(issue.cycle as Record<string, unknown>).name} (#${(issue.cycle as Record<string, unknown>).number})`
          : null,
        comments: comments?.slice(-10),
        created: issue.createdAt,
        updated: issue.updatedAt,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  };
}

export function createLinearCreateIssueTool() {
  return {
    name: "linear_create_issue",
    label: "Linear Create Issue",
    description:
      "Create a new Linear issue. Requires team key and title. Optionally set description, priority, and labels.",
    parameters: Type.Object({
      teamKey: Type.String({
        description: 'Team key, e.g. "ENG". Use linear_get_teams first if unknown.',
      }),
      title: Type.String({ description: "Issue title" }),
      description: Type.Optional(
        Type.String({ description: "Issue description (supports markdown)" }),
      ),
      priority: Type.Optional(
        Type.Number({
          description: "Priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low",
        }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const teamKey = params.teamKey as string;
      const title = params.title as string;
      const description = params.description as string | undefined;
      const priority = params.priority as number | undefined;

      // First resolve teamKey to teamId
      const teamData = (await linearQuery(
        `query { teams(filter: { key: { eq: "${teamKey}" } }) { nodes { id key name } } }`,
      )) as { teams: { nodes: Record<string, unknown>[] } };

      const team = teamData.teams.nodes[0];
      if (!team) {
        throw new Error(`Team "${teamKey}" not found. Use linear_get_teams to list available teams.`);
      }

      const input: Record<string, unknown> = {
        teamId: team.id,
        title,
      };
      if (description) input.description = description;
      if (priority !== undefined) input.priority = priority;

      const data = (await linearQuery(
        `mutation($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue { id identifier title url }
          }
        }`,
        { input },
      )) as { issueCreate: { success: boolean; issue: Record<string, unknown> } };

      if (!data.issueCreate.success) {
        throw new Error("Failed to create Linear issue.");
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                created: true,
                identifier: data.issueCreate.issue.identifier,
                title: data.issueCreate.issue.title,
                url: data.issueCreate.issue.url,
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

export function createLinearGetTeamsTool() {
  return {
    name: "linear_get_teams",
    label: "Linear Get Teams",
    description: "List all teams in the Linear workspace. Use this to discover team keys.",
    parameters: Type.Object({}),
    async execute() {
      const data = (await linearQuery(
        `query { teams { nodes { id key name } } }`,
      )) as { teams: { nodes: Record<string, unknown>[] } };

      const teams = data.teams.nodes.map((t) => ({ id: t.id, key: t.key, name: t.name }));

      return {
        content: [{ type: "text", text: JSON.stringify({ teams }, null, 2) }],
      };
    },
  };
}

export function createLinearGetCycleTool() {
  return {
    name: "linear_get_cycle",
    label: "Linear Get Active Cycle",
    description:
      "Get the active cycle (sprint) for a team. Returns cycle info and all issues in it.",
    parameters: Type.Object({
      teamKey: Type.String({
        description: 'Team key, e.g. "ENG". Use linear_get_teams first if unknown.',
      }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const teamKey = params.teamKey as string;

      const data = (await linearQuery(
        `query($key: String!) {
          teams(filter: { key: { eq: $key } }) {
            nodes {
              id key name
              activeCycle {
                id name number startsAt endsAt progress
                issues {
                  nodes {
                    id identifier title
                    state { name }
                    assignee { name }
                    priorityLabel
                    updatedAt
                  }
                }
              }
            }
          }
        }`,
        { key: teamKey },
      )) as { teams: { nodes: Record<string, unknown>[] } };

      const team = data.teams.nodes[0];
      if (!team) {
        throw new Error(`Team "${teamKey}" not found.`);
      }

      const cycle = team.activeCycle as Record<string, unknown> | null;
      if (!cycle) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ team: team.name, activeCycle: null, message: "No active cycle." }),
            },
          ],
        };
      }

      const issues = (
        (cycle.issues as Record<string, unknown>)?.nodes as Record<string, unknown>[]
      )?.map(formatIssue);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                team: team.name,
                cycle: {
                  name: cycle.name,
                  number: cycle.number,
                  startsAt: cycle.startsAt,
                  endsAt: cycle.endsAt,
                  progress: cycle.progress,
                },
                totalIssues: issues?.length ?? 0,
                issues,
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

export function createLinearGetProjectsTool() {
  return {
    name: "linear_get_projects",
    label: "Linear Get Projects",
    description:
      "List projects in the Linear workspace with progress info. Shows project name, status, lead, and completion percentage.",
    parameters: Type.Object({
      limit: Type.Optional(
        Type.Number({ description: "Max projects to return (default 20)", default: 20 }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const limit = (params.limit as number) ?? 20;

      const data = (await linearQuery(
        `query($first: Int!) {
          projects(first: $first, orderBy: updatedAt) {
            nodes {
              id name state
              progress
              lead { name }
              startDate targetDate
              teams { nodes { key } }
              updatedAt
            }
          }
        }`,
        { first: Math.min(limit, 50) },
      )) as { projects: { nodes: Record<string, unknown>[] } };

      const projects = data.projects.nodes.map((p) => {
        const progress = p.progress as number | undefined;
        return {
          name: p.name,
          state: p.state,
          lead: (p.lead as Record<string, unknown>)?.name ?? "No lead",
          progress: progress != null ? `${Math.round(progress * 100)}%` : "Unknown",
          startDate: p.startDate,
          targetDate: p.targetDate,
          teams: (
            (p.teams as Record<string, unknown>)?.nodes as Record<string, unknown>[]
          )?.map((t) => t.key),
          updated: p.updatedAt,
        };
      });

      return {
        content: [
          { type: "text", text: JSON.stringify({ count: projects.length, projects }, null, 2) },
        ],
      };
    },
  };
}

export function createLinearAddCommentTool() {
  return {
    name: "linear_add_comment",
    label: "Linear Add Comment",
    description: "Add a comment to a Linear issue.",
    parameters: Type.Object({
      identifier: Type.String({ description: 'Issue identifier, e.g. "ENG-123"' }),
      comment: Type.String({ description: "Comment text (supports markdown)" }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const identifier = params.identifier as string;
      const comment = params.comment as string;

      // Resolve identifier to issue ID
      const issueData = (await linearQuery(
        `query($id: String!) { issue(id: $id) { id identifier } }`,
        { id: identifier },
      )) as { issue: { id: string; identifier: string } };

      if (!issueData.issue) {
        throw new Error(`Issue "${identifier}" not found.`);
      }

      await linearQuery(
        `mutation($input: CommentCreateInput!) {
          commentCreate(input: $input) { success }
        }`,
        { input: { issueId: issueData.issue.id, body: comment } },
      );

      return {
        content: [
          { type: "text", text: JSON.stringify({ success: true, identifier }) },
        ],
      };
    },
  };
}
