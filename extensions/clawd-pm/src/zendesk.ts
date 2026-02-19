import { Type } from "@sinclair/typebox";

function getZendeskAuth(): { auth: string; baseUrl: string } {
  const email = process.env.ZENDESK_EMAIL;
  const token = process.env.ZENDESK_API_TOKEN;
  const subdomain = process.env.ZENDESK_SUBDOMAIN;

  if (!email || !token || !subdomain) {
    throw new Error(
      "Zendesk not configured. Set ZENDESK_EMAIL, ZENDESK_API_TOKEN, and ZENDESK_SUBDOMAIN environment variables.",
    );
  }

  const auth = Buffer.from(`${email}/token:${token}`).toString("base64");
  const baseUrl = subdomain.includes(".")
    ? `https://${subdomain}`
    : `https://${subdomain}.zendesk.com`;

  return { auth, baseUrl };
}

async function zendeskFetch(path: string): Promise<unknown> {
  const { auth, baseUrl } = getZendeskAuth();

  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Zendesk API error ${res.status}: ${res.statusText}. ${body.slice(0, 300)}`);
  }

  return await res.json();
}

function formatTicket(ticket: Record<string, unknown>): Record<string, unknown> {
  return {
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    type: ticket.type,
    requester_id: ticket.requester_id,
    assignee_id: ticket.assignee_id,
    tags: ticket.tags,
    created: ticket.created_at,
    updated: ticket.updated_at,
    url: ticket.url,
  };
}

export function createZendeskSearchTool() {
  return {
    name: "zendesk_search",
    label: "Zendesk Search",
    description:
      "Search Zendesk tickets using Zendesk query syntax. Use for questions like 'what are customers complaining about', 'show me urgent tickets', 'any tickets about checkout bugs'. Query examples: 'type:ticket status:open', 'type:ticket priority:urgent', 'type:ticket tags:bug', 'type:ticket subject:checkout'.",
    parameters: Type.Object({
      query: Type.String({
        description:
          'Zendesk search query. Examples: "type:ticket status:open", "type:ticket priority:urgent", "type:ticket tags:billing created>2026-01-01", or just a text term like "checkout error"',
      }),
      sortBy: Type.Optional(
        Type.String({
          description: 'Sort by: "created_at", "updated_at", "priority", "status", "ticket_type" (default "updated_at")',
        }),
      ),
      sortOrder: Type.Optional(
        Type.String({ description: '"asc" or "desc" (default "desc")' }),
      ),
      limit: Type.Optional(
        Type.Number({ description: "Max results (default 20)", default: 20 }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const query = params.query as string;
      const sortBy = (params.sortBy as string) ?? "updated_at";
      const sortOrder = (params.sortOrder as string) ?? "desc";
      const limit = (params.limit as number) ?? 20;

      // If query doesn't include type:, prepend type:ticket
      const fullQuery = query.includes("type:") ? query : `type:ticket ${query}`;

      const searchParams = new URLSearchParams({
        query: fullQuery,
        sort_by: sortBy,
        sort_order: sortOrder,
        per_page: String(Math.min(limit, 100)),
      });

      const data = (await zendeskFetch(`/api/v2/search.json?${searchParams}`)) as {
        results: Record<string, unknown>[];
        count: number;
      };

      const tickets = data.results.map(formatTicket);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: data.count, count: tickets.length, tickets }, null, 2),
          },
        ],
      };
    },
  };
}

export function createZendeskGetTicketTool() {
  return {
    name: "zendesk_get_ticket",
    label: "Zendesk Get Ticket",
    description:
      "Get full details of a specific Zendesk ticket by ID, including comments/conversation thread.",
    parameters: Type.Object({
      ticketId: Type.Number({ description: "Ticket ID number" }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const ticketId = params.ticketId as number;

      const [ticketData, commentsData] = await Promise.all([
        zendeskFetch(`/api/v2/tickets/${ticketId}.json`) as Promise<{
          ticket: Record<string, unknown>;
        }>,
        zendeskFetch(`/api/v2/tickets/${ticketId}/comments.json?per_page=20&sort_order=desc`) as Promise<{
          comments: Record<string, unknown>[];
        }>,
      ]);

      const ticket = ticketData.ticket;
      const comments = commentsData.comments.map((c) => ({
        id: c.id,
        author_id: c.author_id,
        body: ((c.plain_body ?? c.body) as string)?.slice(0, 2000),
        public: c.public,
        created: c.created_at,
      }));

      const result = {
        ...formatTicket(ticket),
        description: ((ticket.description as string) ?? "").slice(0, 5000),
        comments,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  };
}

export function createZendeskGetRecentTicketsTool() {
  return {
    name: "zendesk_recent_tickets",
    label: "Zendesk Recent Tickets",
    description:
      "Get recently updated tickets. Quick way to see what customers are contacting about without writing a query.",
    parameters: Type.Object({
      status: Type.Optional(
        Type.String({
          description: 'Filter by status: "new", "open", "pending", "hold", "solved", "closed" (default: all open statuses)',
        }),
      ),
      limit: Type.Optional(
        Type.Number({ description: "Max results (default 20)", default: 20 }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const status = params.status as string | undefined;
      const limit = (params.limit as number) ?? 20;

      const query = status
        ? `type:ticket status:${status}`
        : "type:ticket status:new status:open status:pending";

      const searchParams = new URLSearchParams({
        query,
        sort_by: "updated_at",
        sort_order: "desc",
        per_page: String(Math.min(limit, 100)),
      });

      const data = (await zendeskFetch(`/api/v2/search.json?${searchParams}`)) as {
        results: Record<string, unknown>[];
        count: number;
      };

      const tickets = data.results.map(formatTicket);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: data.count, count: tickets.length, tickets }, null, 2),
          },
        ],
      };
    },
  };
}

export function createZendeskGetTicketStatsTool() {
  return {
    name: "zendesk_ticket_stats",
    label: "Zendesk Ticket Stats",
    description:
      "Get ticket counts by status. Quick overview of support queue health — how many new, open, pending, solved tickets.",
    parameters: Type.Object({}),
    async execute() {
      const statuses = ["new", "open", "pending", "hold", "solved"];

      const counts: Record<string, number> = {};
      for (const status of statuses) {
        const data = (await zendeskFetch(
          `/api/v2/search/count.json?query=${encodeURIComponent(`type:ticket status:${status}`)}`,
        )) as { count: number };
        counts[status] = data.count;
      }

      const total = Object.values(counts).reduce((a, b) => a + b, 0);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total, byStatus: counts }, null, 2),
          },
        ],
      };
    },
  };
}
