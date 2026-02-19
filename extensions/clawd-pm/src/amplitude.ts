import { Type } from "@sinclair/typebox";

function getAmplitudeAuth(): { auth: string; baseUrl: string } {
  const apiKey = process.env.AMPLITUDE_API_KEY;
  const secretKey = process.env.AMPLITUDE_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error(
      "Amplitude not configured. Set AMPLITUDE_API_KEY and AMPLITUDE_SECRET_KEY environment variables.",
    );
  }

  const auth = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");
  const region = process.env.AMPLITUDE_REGION ?? "us";
  const baseUrl =
    region === "eu" ? "https://analytics.eu.amplitude.com" : "https://amplitude.com";

  return { auth, baseUrl };
}

async function amplitudeFetch(path: string): Promise<unknown> {
  const { auth, baseUrl } = getAmplitudeAuth();

  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Amplitude API error ${res.status}: ${res.statusText}. ${body.slice(0, 300)}`);
  }

  return await res.json();
}

export function createAmplitudeGetActiveUsersTool() {
  return {
    name: "amplitude_active_users",
    label: "Amplitude Active Users",
    description:
      "Get active or new user counts from Amplitude. Use for questions like 'how many DAUs do we have', 'show me MAU trend', 'new user growth this month'. Supports daily, weekly, and monthly intervals.",
    parameters: Type.Object({
      start: Type.String({
        description: 'Start date in YYYYMMDD format, e.g. "20260101"',
      }),
      end: Type.String({
        description: 'End date in YYYYMMDD format, e.g. "20260218"',
      }),
      metric: Type.Optional(
        Type.String({
          description: '"active" for active users or "new" for new users (default "active")',
        }),
      ),
      interval: Type.Optional(
        Type.Number({
          description: "Interval: 1 (daily), 7 (weekly), 30 (monthly). Default 1.",
        }),
      ),
      groupBy: Type.Optional(
        Type.String({
          description: 'Group by property, e.g. "city", "country", "platform", "os", "version"',
        }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const start = params.start as string;
      const end = params.end as string;
      const metric = (params.metric as string) ?? "active";
      const interval = (params.interval as number) ?? 1;
      const groupBy = params.groupBy as string | undefined;

      const queryParams = new URLSearchParams({
        start,
        end,
        m: metric,
        i: String(interval),
      });
      if (groupBy) queryParams.set("g", groupBy);

      const data = (await amplitudeFetch(`/api/2/users?${queryParams}`)) as Record<string, unknown>;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data, null, 2).slice(0, 15000),
          },
        ],
      };
    },
  };
}

export function createAmplitudeGetChartTool() {
  return {
    name: "amplitude_get_chart",
    label: "Amplitude Get Chart",
    description:
      "Get data from a saved Amplitude chart by its chart ID. Returns the chart's data in JSON format. Use for questions like 'show me the conversion funnel chart', 'get data from our retention chart'. Find chart IDs from Amplitude URLs.",
    parameters: Type.Object({
      chartId: Type.String({
        description: "Chart ID from Amplitude (found in the chart URL)",
      }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const chartId = params.chartId as string;

      const data = (await amplitudeFetch(`/api/3/chart/${chartId}/query`)) as Record<string, unknown>;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data, null, 2).slice(0, 15000),
          },
        ],
      };
    },
  };
}

export function createAmplitudeListCohortsTool() {
  return {
    name: "amplitude_list_cohorts",
    label: "Amplitude List Cohorts",
    description:
      "List all behavioral cohorts in Amplitude. Use for questions like 'what cohorts do we have', 'show me user segments', 'list behavioral groups'.",
    parameters: Type.Object({}),
    async execute() {
      const data = (await amplitudeFetch("/api/3/cohorts")) as Record<string, unknown>;

      const cohorts = (data.cohorts ?? data) as Record<string, unknown>[];
      const formatted = cohorts.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        size: c.size,
        archived: c.archived,
        is_predictive: c.is_predictive,
        last_viewed: c.last_viewed,
        chart_id: c.chart_id,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: formatted.length, cohorts: formatted }, null, 2),
          },
        ],
      };
    },
  };
}

export function createAmplitudeGetSessionLengthTool() {
  return {
    name: "amplitude_session_length",
    label: "Amplitude Session Length",
    description:
      "Get session length distribution from Amplitude. Use for questions like 'how long are user sessions', 'session duration stats', 'engagement depth'.",
    parameters: Type.Object({
      start: Type.String({
        description: 'Start date in YYYYMMDD format, e.g. "20260101"',
      }),
      end: Type.String({
        description: 'End date in YYYYMMDD format, e.g. "20260218"',
      }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const start = params.start as string;
      const end = params.end as string;

      const data = (await amplitudeFetch(
        `/api/2/sessions/length?start=${start}&end=${end}`,
      )) as Record<string, unknown>;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data, null, 2).slice(0, 15000),
          },
        ],
      };
    },
  };
}

export function createAmplitudeEventSegmentationTool() {
  return {
    name: "amplitude_event_segmentation",
    label: "Amplitude Event Segmentation",
    description:
      "Get event counts and metrics from Amplitude. Use for questions like 'how many times did users click checkout this week', 'signups per day', 'purchase events by country'. This is the core analytics query tool.",
    parameters: Type.Object({
      eventType: Type.String({
        description:
          'Event name. For custom events prefix with "ce:", e.g. "ce:purchase". Use "_active" for any active event, "_all" for any event.',
      }),
      start: Type.String({
        description: 'Start date in YYYYMMDD format, e.g. "20260101"',
      }),
      end: Type.String({
        description: 'End date in YYYYMMDD format, e.g. "20260218"',
      }),
      metric: Type.Optional(
        Type.String({
          description: '"uniques" (unique users, default), "totals" (total count), "avg" (average per user), "pctdau" (% of DAU)',
        }),
      ),
      interval: Type.Optional(
        Type.Number({
          description: "Interval: 1 (daily), 7 (weekly), 30 (monthly). Default 1.",
        }),
      ),
      groupBy: Type.Optional(
        Type.String({
          description:
            'Group by a property. Use "gp:property_name" for custom properties. Built-in: "country", "city", "platform", "os", "device_type", "version"',
        }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const eventType = params.eventType as string;
      const start = params.start as string;
      const end = params.end as string;
      const metric = (params.metric as string) ?? "uniques";
      const interval = (params.interval as number) ?? 1;
      const groupBy = params.groupBy as string | undefined;

      const eventObj: Record<string, unknown> = { event_type: eventType };
      if (groupBy) {
        const subpropType = groupBy.startsWith("gp:") ? "custom" : "event";
        const propName = groupBy.startsWith("gp:") ? groupBy.slice(3) : groupBy;
        eventObj.group_by = [{ type: subpropType, value: propName }];
      }

      const queryParams = new URLSearchParams({
        e: JSON.stringify(eventObj),
        start,
        end,
        m: metric,
        i: String(interval),
      });

      const data = (await amplitudeFetch(
        `/api/2/events/segmentation?${queryParams}`,
      )) as Record<string, unknown>;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data, null, 2).slice(0, 15000),
          },
        ],
      };
    },
  };
}

export function createAmplitudeUserSearchTool() {
  return {
    name: "amplitude_user_search",
    label: "Amplitude User Search",
    description:
      "Search for a user in Amplitude by user ID, device ID, or email. Returns matching users with their Amplitude IDs. Use for investigating specific customer behavior.",
    parameters: Type.Object({
      query: Type.String({
        description: "User ID, device ID, or email address to search for",
      }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const query = params.query as string;

      const data = (await amplitudeFetch(
        `/api/2/usersearch?user=${encodeURIComponent(query)}`,
      )) as Record<string, unknown>;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    },
  };
}
