import { Type } from "@sinclair/typebox";

function getGranolaAuth(): { token: string } {
  const token = process.env.GRANOLA_API_KEY;
  if (!token) {
    throw new Error("Granola not configured. Set GRANOLA_API_KEY environment variable (Enterprise API key).");
  }
  return { token };
}

async function granolaFetch(path: string): Promise<unknown> {
  const { token } = getGranolaAuth();

  const res = await fetch(`https://public-api.granola.ai${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Granola API error ${res.status}: ${res.statusText}. ${body.slice(0, 300)}`);
  }

  return await res.json();
}

function formatNote(note: Record<string, unknown>): Record<string, unknown> {
  const owner = note.owner as Record<string, unknown> | undefined;
  const calEvent = note.calendar_event as Record<string, unknown> | undefined;
  const folders = note.folder_membership as Record<string, unknown>[] | undefined;

  return {
    id: note.id,
    title: note.title ?? "(Untitled)",
    owner: owner?.name ?? owner?.email,
    created: note.created_at,
    updated: note.updated_at,
    meeting: calEvent
      ? {
          title: calEvent.event_title,
          start: calEvent.scheduled_start_time,
          end: calEvent.scheduled_end_time,
          organiser: calEvent.organiser,
        }
      : null,
    folders: folders?.map((f) => f.name),
  };
}

export function createGranolaListNotesTool() {
  return {
    name: "granola_list_notes",
    label: "Granola List Notes",
    description:
      "List meeting notes from Granola. Filter by date range. Use for questions like 'what meetings happened this week', 'show me notes from last Monday'.",
    parameters: Type.Object({
      createdAfter: Type.Optional(
        Type.String({
          description: 'Filter notes created after this date, e.g. "2025-01-20" or "2025-01-20T09:00:00Z"',
        }),
      ),
      createdBefore: Type.Optional(
        Type.String({
          description: 'Filter notes created before this date',
        }),
      ),
      updatedAfter: Type.Optional(
        Type.String({
          description: 'Filter notes updated after this date',
        }),
      ),
      limit: Type.Optional(
        Type.Number({ description: "Max results (default 10, max 30)", default: 10 }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const createdAfter = params.createdAfter as string | undefined;
      const createdBefore = params.createdBefore as string | undefined;
      const updatedAfter = params.updatedAfter as string | undefined;
      const limit = (params.limit as number) ?? 10;

      const query = new URLSearchParams({
        page_size: String(Math.min(limit, 30)),
      });
      if (createdAfter) query.set("created_after", createdAfter);
      if (createdBefore) query.set("created_before", createdBefore);
      if (updatedAfter) query.set("updated_after", updatedAfter);

      const data = (await granolaFetch(`/v1/notes?${query}`)) as {
        notes: Record<string, unknown>[];
        hasMore: boolean;
      };

      const notes = data.notes.map(formatNote);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: notes.length, hasMore: data.hasMore, notes }, null, 2),
          },
        ],
      };
    },
  };
}

export function createGranolaGetNoteTool() {
  return {
    name: "granola_get_note",
    label: "Granola Get Note",
    description:
      "Get the full content of a Granola meeting note by ID. Returns summary, attendees, calendar event info, and optionally the full transcript.",
    parameters: Type.Object({
      noteId: Type.String({
        description: 'Note ID from list results, e.g. "not_1d3tmYTlCICgjy"',
      }),
      includeTranscript: Type.Optional(
        Type.Boolean({ description: "Include full meeting transcript (default false)", default: false }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const noteId = params.noteId as string;
      const includeTranscript = (params.includeTranscript as boolean) ?? false;

      const path = includeTranscript
        ? `/v1/notes/${noteId}?include=transcript`
        : `/v1/notes/${noteId}`;

      const note = (await granolaFetch(path)) as Record<string, unknown>;

      const attendees = (note.attendees as Record<string, unknown>[])?.map((a) => ({
        name: a.name,
        email: a.email,
      }));

      const transcript = (note.transcript as Record<string, unknown>[] | undefined)?.map((t) => {
        const speaker = t.speaker as Record<string, unknown>;
        return {
          speaker: speaker?.source,
          text: t.text,
          start: t.start_time,
          end: t.end_time,
        };
      });

      const result: Record<string, unknown> = {
        ...formatNote(note),
        summary: note.summary_markdown ?? note.summary_text,
        attendees,
      };

      if (transcript) {
        result.transcript = transcript;
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  };
}
