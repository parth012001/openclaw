import { Type } from "@sinclair/typebox";

function getNotionAuth(): { token: string } {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    throw new Error("Notion not configured. Set NOTION_TOKEN environment variable (integration token).");
  }
  return { token };
}

async function notionFetch(
  path: string,
  options?: RequestInit,
): Promise<unknown> {
  const { token } = getNotionAuth();

  const res = await fetch(`https://api.notion.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
      ...((options?.headers as Record<string, string>) ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Notion API error ${res.status}: ${res.statusText}. ${body.slice(0, 300)}`);
  }

  return await res.json();
}

function extractTitle(properties: Record<string, unknown>): string {
  for (const val of Object.values(properties)) {
    const prop = val as Record<string, unknown>;
    if (prop.type === "title") {
      const titleArr = prop.title as { plain_text: string }[] | undefined;
      return titleArr?.map((t) => t.plain_text).join("") ?? "";
    }
  }
  return "";
}

function extractPlainText(richText: unknown[]): string {
  return (richText as { plain_text: string }[])
    ?.map((t) => t.plain_text)
    .join("") ?? "";
}

function blockToText(block: Record<string, unknown>): string {
  const type = block.type as string;
  const content = block[type] as Record<string, unknown> | undefined;
  if (!content) return "";

  const richText = content.rich_text as unknown[] | undefined;
  const text = richText ? extractPlainText(richText) : "";

  switch (type) {
    case "heading_1":
      return `# ${text}`;
    case "heading_2":
      return `## ${text}`;
    case "heading_3":
      return `### ${text}`;
    case "bulleted_list_item":
      return `- ${text}`;
    case "numbered_list_item":
      return `1. ${text}`;
    case "to_do": {
      const checked = content.checked ? "x" : " ";
      return `- [${checked}] ${text}`;
    }
    case "toggle":
      return `> ${text}`;
    case "code":
      return `\`\`\`${content.language ?? ""}\n${text}\n\`\`\``;
    case "quote":
      return `> ${text}`;
    case "divider":
      return "---";
    case "callout":
      return `> ${text}`;
    default:
      return text;
  }
}

export function createNotionSearchTool() {
  return {
    name: "notion_search",
    label: "Notion Search",
    description:
      "Search Notion pages and databases by title. Use for finding docs, specs, meeting notes, wikis. Examples: 'find the onboarding doc', 'search for Q1 roadmap'.",
    parameters: Type.Object({
      query: Type.String({
        description: "Search text to match against page and database titles",
      }),
      filter: Type.Optional(
        Type.String({
          description: 'Filter by object type: "page" or "database" (default: both)',
        }),
      ),
      limit: Type.Optional(
        Type.Number({ description: "Max results (default 10)", default: 10 }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const query = params.query as string;
      const filter = params.filter as string | undefined;
      const limit = (params.limit as number) ?? 10;

      const payload: Record<string, unknown> = {
        query,
        page_size: Math.min(limit, 100),
        sort: { direction: "descending", timestamp: "last_edited_time" },
      };

      if (filter === "page" || filter === "database") {
        payload.filter = { value: filter, property: "object" };
      }

      const data = (await notionFetch("/v1/search", {
        method: "POST",
        body: JSON.stringify(payload),
      })) as { results: Record<string, unknown>[]; has_more: boolean };

      const results = data.results.map((r) => {
        const props = r.properties as Record<string, unknown> | undefined;
        const title = props
          ? extractTitle(props)
          : ((r.title as { plain_text: string }[])?.map((t) => t.plain_text).join("") ?? "");

        const parent = r.parent as Record<string, unknown> | undefined;

        return {
          id: r.id,
          type: r.object,
          title: title || "(Untitled)",
          parentType: parent?.type,
          url: r.url,
          lastEdited: r.last_edited_time,
          created: r.created_time,
        };
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: results.length, results }, null, 2),
          },
        ],
      };
    },
  };
}

export function createNotionGetPageTool() {
  return {
    name: "notion_get_page",
    label: "Notion Get Page",
    description:
      "Get the full content of a Notion page by its ID. Returns the page title, properties, and body content as text.",
    parameters: Type.Object({
      pageId: Type.String({ description: "Page ID (UUID from search results)" }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const pageId = params.pageId as string;

      const [page, blocks] = await Promise.all([
        notionFetch(`/v1/pages/${pageId}`) as Promise<Record<string, unknown>>,
        notionFetch(`/v1/blocks/${pageId}/children?page_size=100`) as Promise<{
          results: Record<string, unknown>[];
          has_more: boolean;
        }>,
      ]);

      const props = page.properties as Record<string, unknown>;
      const title = extractTitle(props);

      const bodyLines = blocks.results.map(blockToText).filter(Boolean);
      const body = bodyLines.join("\n");

      const result = {
        id: page.id,
        title: title || "(Untitled)",
        url: page.url,
        body: body.slice(0, 15000),
        truncated: body.length > 15000,
        lastEdited: page.last_edited_time,
        created: page.created_time,
        lastEditedBy: (page.last_edited_by as Record<string, unknown>)?.id,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  };
}

export function createNotionCreatePageTool() {
  return {
    name: "notion_create_page",
    label: "Notion Create Page",
    description:
      "Create a new Notion page. Requires a parent page ID and title. Optionally add body content.",
    parameters: Type.Object({
      parentPageId: Type.String({
        description: "Parent page ID to nest under. Use notion_search to find it.",
      }),
      title: Type.String({ description: "Page title" }),
      body: Type.Optional(
        Type.String({ description: "Page body content in plain text. Each line becomes a paragraph." }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const parentPageId = params.parentPageId as string;
      const title = params.title as string;
      const body = params.body as string | undefined;

      const children: Record<string, unknown>[] = [];
      if (body) {
        for (const line of body.split("\n").filter(Boolean)) {
          children.push({
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ type: "text", text: { content: line } }],
            },
          });
        }
      }

      const payload: Record<string, unknown> = {
        parent: { type: "page_id", page_id: parentPageId },
        properties: {
          title: {
            title: [{ type: "text", text: { content: title } }],
          },
        },
      };

      if (children.length) {
        payload.children = children;
      }

      const data = (await notionFetch("/v1/pages", {
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
                title,
                url: data.url,
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

export function createNotionAddCommentTool() {
  return {
    name: "notion_add_comment",
    label: "Notion Add Comment",
    description: "Add a comment to a Notion page.",
    parameters: Type.Object({
      pageId: Type.String({ description: "Page ID to comment on" }),
      comment: Type.String({ description: "Comment text" }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const pageId = params.pageId as string;
      const comment = params.comment as string;

      const data = (await notionFetch("/v1/comments", {
        method: "POST",
        body: JSON.stringify({
          parent: { page_id: pageId },
          rich_text: [{ type: "text", text: { content: comment } }],
        }),
      })) as Record<string, unknown>;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, commentId: data.id, pageId }),
          },
        ],
      };
    },
  };
}

export function createNotionQueryDatabaseTool() {
  return {
    name: "notion_query_database",
    label: "Notion Query Database",
    description:
      "Query a Notion database to list its entries. Returns pages in the database with their properties. Use notion_search with filter 'database' to find database IDs first.",
    parameters: Type.Object({
      databaseId: Type.String({
        description: "Database ID (UUID). Use notion_search with filter 'database' to find it.",
      }),
      limit: Type.Optional(
        Type.Number({ description: "Max results (default 20)", default: 20 }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const databaseId = params.databaseId as string;
      const limit = (params.limit as number) ?? 20;

      const data = (await notionFetch(`/v1/databases/${databaseId}/query`, {
        method: "POST",
        body: JSON.stringify({
          page_size: Math.min(limit, 100),
        }),
      })) as { results: Record<string, unknown>[]; has_more: boolean };

      const entries = data.results.map((r) => {
        const props = r.properties as Record<string, unknown>;
        const title = extractTitle(props);

        const simplified: Record<string, unknown> = {
          id: r.id,
          title: title || "(Untitled)",
          url: r.url,
          lastEdited: r.last_edited_time,
        };

        // Extract readable property values
        for (const [key, val] of Object.entries(props)) {
          const prop = val as Record<string, unknown>;
          switch (prop.type) {
            case "title":
              break; // already extracted
            case "rich_text":
              simplified[key] = extractPlainText(prop.rich_text as unknown[]);
              break;
            case "number":
              simplified[key] = prop.number;
              break;
            case "select":
              simplified[key] = (prop.select as Record<string, unknown>)?.name;
              break;
            case "multi_select":
              simplified[key] = (prop.multi_select as Record<string, unknown>[])?.map(
                (s) => s.name,
              );
              break;
            case "status":
              simplified[key] = (prop.status as Record<string, unknown>)?.name;
              break;
            case "date":
              simplified[key] = (prop.date as Record<string, unknown>)?.start;
              break;
            case "people":
              simplified[key] = (prop.people as Record<string, unknown>[])?.map(
                (p) => p.name ?? p.id,
              );
              break;
            case "checkbox":
              simplified[key] = prop.checkbox;
              break;
            case "url":
              simplified[key] = prop.url;
              break;
            case "email":
              simplified[key] = prop.email;
              break;
          }
        }

        return simplified;
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { count: entries.length, hasMore: data.has_more, entries },
              null,
              2,
            ),
          },
        ],
      };
    },
  };
}
