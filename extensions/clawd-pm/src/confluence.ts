import { Type } from "@sinclair/typebox";

function getConfluenceAuth(): { auth: string; baseUrl: string } {
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const site = process.env.JIRA_SITE;

  if (!email || !token || !site) {
    throw new Error(
      "Confluence not configured. Set JIRA_EMAIL, JIRA_API_TOKEN, and JIRA_SITE environment variables (same Atlassian credentials).",
    );
  }

  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const baseUrl = site.includes(".")
    ? `https://${site}`
    : `https://${site}.atlassian.net`;

  return { auth, baseUrl };
}

async function confluenceFetch(path: string, options?: RequestInit): Promise<unknown> {
  const { auth, baseUrl } = getConfluenceAuth();

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
    throw new Error(`Confluence API error ${res.status}: ${res.statusText}. ${body}`);
  }

  return await res.json();
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function createConfluenceSearchTool() {
  return {
    name: "confluence_search",
    label: "Confluence Search",
    description:
      "Search Confluence pages and blog posts using CQL (Confluence Query Language). Use for finding PRDs, specs, meeting notes, documentation. Examples: 'find the checkout PRD', 'what docs mention authentication'.",
    parameters: Type.Object({
      query: Type.String({
        description:
          'Search text or CQL query. Simple text searches all content. CQL examples: "type = page AND space = ENG AND title ~ \\"checkout\\"", "text ~ \\"authentication\\" AND lastModified > now(\\"-30d\\")"',
      }),
      limit: Type.Optional(
        Type.Number({ description: "Max results to return (default 10)", default: 10 }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const query = params.query as string;
      const limit = (params.limit as number) ?? 10;

      // If query looks like CQL (has operators), use as-is. Otherwise wrap as text search.
      const cql = query.includes("=") || query.includes("~")
        ? query
        : `type = page AND text ~ "${query.replace(/"/g, '\\"')}"`;

      const searchParams = new URLSearchParams({
        cql,
        limit: String(Math.min(limit, 50)),
        expand: "space",
      });

      // Use /content/search (more reliable than /search on newer instances)
      const data = (await confluenceFetch(
        `/wiki/rest/api/content/search?${searchParams}`,
      )) as {
        results: Record<string, unknown>[];
        totalSize?: number;
        size?: number;
      };

      const results = data.results.map((r) => {
        const space = r.space as Record<string, unknown> | undefined;
        return {
          id: r.id,
          title: r.title,
          space: space?.key,
          spaceName: space?.name,
          type: r.type,
          status: r.status,
          url: r._links
            ? `${getConfluenceAuth().baseUrl}/wiki${(r._links as Record<string, unknown>)?.webui ?? ""}`
            : undefined,
        };
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { total: data.totalSize ?? data.size, count: results.length, results },
              null,
              2,
            ),
          },
        ],
      };
    },
  };
}

export function createConfluenceGetPageTool() {
  return {
    name: "confluence_get_page",
    label: "Confluence Get Page",
    description:
      "Get the full content of a Confluence page by its ID. Returns title, body text, version info, and metadata. Use after searching to read a specific page.",
    parameters: Type.Object({
      pageId: Type.String({ description: "Page ID (numeric string from search results)" }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const pageId = params.pageId as string;

      const data = (await confluenceFetch(
        `/wiki/api/v2/pages/${pageId}?body-format=storage`,
      )) as Record<string, unknown>;

      const body = data.body as Record<string, unknown> | undefined;
      const storage = body?.storage as Record<string, unknown> | undefined;
      const version = data.version as Record<string, unknown> | undefined;
      const space = data.spaceId as string | undefined;

      const bodyText = storage?.value ? stripHtml(storage.value as string) : "";

      const result = {
        id: data.id,
        title: data.title,
        spaceId: space,
        status: data.status,
        body: bodyText.slice(0, 15000),
        truncated: bodyText.length > 15000,
        version: version?.number,
        lastUpdatedBy: (version?.authorId as string) ?? null,
        createdAt: data.createdAt,
        url: `${getConfluenceAuth().baseUrl}/wiki${(data._links as Record<string, unknown>)?.webui ?? ""}`,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  };
}

export function createConfluenceGetSpacesTool() {
  return {
    name: "confluence_get_spaces",
    label: "Confluence Get Spaces",
    description:
      "List all Confluence spaces. Use to discover available spaces before searching or creating pages.",
    parameters: Type.Object({}),
    async execute() {
      const data = (await confluenceFetch(
        `/wiki/api/v2/spaces?limit=50&sort=name`,
      )) as { results: Record<string, unknown>[] };

      const spaces = data.results.map((s) => ({
        id: s.id,
        key: s.key,
        name: s.name,
        type: s.type,
        status: s.status,
      }));

      return {
        content: [
          { type: "text", text: JSON.stringify({ count: spaces.length, spaces }, null, 2) },
        ],
      };
    },
  };
}

export function createConfluenceCreatePageTool() {
  return {
    name: "confluence_create_page",
    label: "Confluence Create Page",
    description:
      "Create a new Confluence page in a space. Requires space ID and title. Use confluence_get_spaces first to find the space ID.",
    parameters: Type.Object({
      spaceId: Type.String({
        description: "Space ID (numeric). Use confluence_get_spaces to find it.",
      }),
      title: Type.String({ description: "Page title" }),
      body: Type.Optional(
        Type.String({ description: "Page body content in plain text or HTML" }),
      ),
      parentId: Type.Optional(
        Type.String({ description: "Parent page ID to nest under (optional)" }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const spaceId = params.spaceId as string;
      const title = params.title as string;
      const body = params.body as string | undefined;
      const parentId = params.parentId as string | undefined;

      const payload: Record<string, unknown> = {
        spaceId,
        status: "current",
        title,
        body: {
          representation: "storage",
          value: body
            ? `<p>${body.replace(/\n/g, "</p><p>")}</p>`
            : "",
        },
      };

      if (parentId) {
        payload.parentId = parentId;
      }

      const data = (await confluenceFetch("/wiki/api/v2/pages", {
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
                id: data.id,
                title: data.title,
                url: `${getConfluenceAuth().baseUrl}/wiki${(data._links as Record<string, unknown>)?.webui ?? ""}`,
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

export function createConfluenceAddCommentTool() {
  return {
    name: "confluence_add_comment",
    label: "Confluence Add Comment",
    description: "Add a comment (footer comment) to a Confluence page.",
    parameters: Type.Object({
      pageId: Type.String({ description: "Page ID to comment on" }),
      comment: Type.String({ description: "Comment text (supports simple HTML)" }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const pageId = params.pageId as string;
      const comment = params.comment as string;

      await confluenceFetch(`/wiki/api/v2/footer-comments`, {
        method: "POST",
        body: JSON.stringify({
          pageId,
          body: {
            representation: "storage",
            value: `<p>${comment}</p>`,
          },
        }),
      });

      return {
        content: [
          { type: "text", text: JSON.stringify({ success: true, pageId }) },
        ],
      };
    },
  };
}
