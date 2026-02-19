import { Type } from "@sinclair/typebox";

function getIntercomAuth(): { token: string; baseUrl: string } {
  const token = process.env.INTERCOM_TOKEN;
  if (!token) {
    throw new Error("Intercom not configured. Set INTERCOM_TOKEN environment variable.");
  }

  const region = process.env.INTERCOM_REGION ?? "us";
  const baseUrl =
    region === "eu"
      ? "https://api.eu.intercom.io"
      : region === "au"
        ? "https://api.au.intercom.io"
        : "https://api.intercom.io";

  return { token, baseUrl };
}

async function intercomFetch(path: string, options?: { method?: string; body?: unknown }): Promise<unknown> {
  const { token, baseUrl } = getIntercomAuth();

  const res = await fetch(`${baseUrl}${path}`, {
    method: options?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Intercom-Version": "2.11",
    },
    ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Intercom API error ${res.status}: ${res.statusText}. ${body.slice(0, 300)}`);
  }

  return await res.json();
}

function formatConversation(c: Record<string, unknown>): Record<string, unknown> {
  const source = c.source as Record<string, unknown> | undefined;
  const stats = c.statistics as Record<string, unknown> | undefined;
  const contacts = c.contacts as Record<string, unknown> | undefined;
  const contactList = (contacts?.contacts ?? contacts) as Record<string, unknown>[] | undefined;

  return {
    id: c.id,
    state: c.state,
    open: c.open,
    read: c.read,
    subject: source?.subject,
    body_preview: ((source?.body as string) ?? "").replace(/<[^>]*>/g, "").slice(0, 300),
    source_type: source?.type,
    delivered_as: source?.delivered_as,
    admin_assignee_id: c.admin_assignee_id,
    team_assignee_id: c.team_assignee_id,
    contacts: contactList?.map((ct) => ({ id: ct.id, type: ct.type })),
    waiting_since: c.waiting_since,
    snoozed_until: c.snoozed_until,
    created_at: c.created_at,
    updated_at: c.updated_at,
    first_response_time: stats?.time_to_admin_reply,
  };
}

export function createIntercomSearchConversationsTool() {
  return {
    name: "intercom_search_conversations",
    label: "Intercom Search Conversations",
    description:
      "Search Intercom conversations using filters. Use for questions like 'show me open conversations', 'unread messages', 'conversations waiting for reply'. Supports filtering by state (open/closed/snoozed), read status, admin assignee, and more.",
    parameters: Type.Object({
      field: Type.String({
        description:
          'Field to search. Common: "state" (open/closed/snoozed), "open" (true/false), "read" (true/false), "admin_assignee_id", "source.body" (message content), "created_at", "updated_at"',
      }),
      operator: Type.String({
        description: 'Operator: "=" (equals), "!=" (not equals), "~" (contains), ">" (greater), "<" (less)',
      }),
      value: Type.Unknown({
        description: 'Value to search for. Use strings, booleans, or UNIX timestamps for dates.',
      }),
      perPage: Type.Optional(
        Type.Number({ description: "Results per page (default 20, max 150)", default: 20 }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const perPage = (params.perPage as number) ?? 20;

      const data = (await intercomFetch("/conversations/search", {
        method: "POST",
        body: {
          query: {
            field: params.field,
            operator: params.operator,
            value: params.value,
          },
          pagination: { per_page: Math.min(perPage, 150) },
        },
      })) as {
        conversations: Record<string, unknown>[];
        total_count: number;
        pages: Record<string, unknown>;
      };

      const conversations = data.conversations.map(formatConversation);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { total: data.total_count, count: conversations.length, conversations },
              null,
              2,
            ),
          },
        ],
      };
    },
  };
}

export function createIntercomGetConversationTool() {
  return {
    name: "intercom_get_conversation",
    label: "Intercom Get Conversation",
    description:
      "Get full details of an Intercom conversation by ID, including message thread (conversation parts).",
    parameters: Type.Object({
      conversationId: Type.String({ description: "Conversation ID" }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const conversationId = params.conversationId as string;

      const data = (await intercomFetch(
        `/conversations/${conversationId}?display_as=plaintext`,
      )) as Record<string, unknown>;

      const parts = data.conversation_parts as Record<string, unknown> | undefined;
      const partsList = (parts?.conversation_parts ?? []) as Record<string, unknown>[];

      const formattedParts = partsList.slice(0, 30).map((p) => {
        const author = p.author as Record<string, unknown> | undefined;
        return {
          id: p.id,
          part_type: p.part_type,
          body: ((p.body as string) ?? "").replace(/<[^>]*>/g, "").slice(0, 1000),
          author_type: author?.type,
          author_name: author?.name,
          created_at: p.created_at,
        };
      });

      const result = {
        ...formatConversation(data),
        custom_attributes: data.custom_attributes,
        tags: data.tags,
        conversation_parts: formattedParts,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2).slice(0, 15000) }],
      };
    },
  };
}

export function createIntercomListConversationsTool() {
  return {
    name: "intercom_list_conversations",
    label: "Intercom List Conversations",
    description:
      "List recent Intercom conversations. Quick way to see latest customer messages without building a search query.",
    parameters: Type.Object({
      perPage: Type.Optional(
        Type.Number({ description: "Results per page (default 20)", default: 20 }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const perPage = (params.perPage as number) ?? 20;

      const data = (await intercomFetch(
        `/conversations?order=desc&sort=updated_at&per_page=${Math.min(perPage, 150)}`,
      )) as {
        conversations: Record<string, unknown>[];
        pages: Record<string, unknown>;
      };

      const conversations = data.conversations.map(formatConversation);
      const totalPages = (data.pages as Record<string, unknown>)?.total_pages;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { count: conversations.length, totalPages, conversations },
              null,
              2,
            ),
          },
        ],
      };
    },
  };
}

export function createIntercomSearchContactsTool() {
  return {
    name: "intercom_search_contacts",
    label: "Intercom Search Contacts",
    description:
      "Search Intercom contacts (users and leads). Use for finding specific customers, looking up users by email, or filtering contacts by attributes.",
    parameters: Type.Object({
      field: Type.String({
        description:
          'Field to search. Common: "email", "name", "role" (user/lead), "phone", "external_id", "created_at", "last_seen_at", "signed_up_at"',
      }),
      operator: Type.String({
        description: 'Operator: "=" (equals), "!=" (not equals), "~" (contains), "^" (starts with), "$" (ends with), ">" (greater), "<" (less)',
      }),
      value: Type.Unknown({
        description: "Value to search for",
      }),
      perPage: Type.Optional(
        Type.Number({ description: "Results per page (default 20)", default: 20 }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const perPage = (params.perPage as number) ?? 20;

      const data = (await intercomFetch("/contacts/search", {
        method: "POST",
        body: {
          query: {
            field: params.field,
            operator: params.operator,
            value: params.value,
          },
          pagination: { per_page: Math.min(perPage, 150) },
        },
      })) as {
        data: Record<string, unknown>[];
        total_count: number;
        pages: Record<string, unknown>;
      };

      const contacts = data.data.map((c) => ({
        id: c.id,
        type: c.type,
        role: c.role,
        name: c.name,
        email: c.email,
        phone: c.phone,
        external_id: c.external_id,
        created_at: c.created_at,
        updated_at: c.updated_at,
        last_seen_at: c.last_seen_at,
        signed_up_at: c.signed_up_at,
        os: c.os,
        location: c.location,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: data.total_count, count: contacts.length, contacts }, null, 2),
          },
        ],
      };
    },
  };
}
