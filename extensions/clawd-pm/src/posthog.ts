import { Type } from "@sinclair/typebox";

function getPostHogAuth(): { token: string; baseUrl: string; projectId: string } {
  const token = process.env.POSTHOG_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;

  if (!token || !projectId) {
    throw new Error(
      "PostHog not configured. Set POSTHOG_API_KEY and POSTHOG_PROJECT_ID environment variables.",
    );
  }

  // Default to US cloud, support EU cloud or self-hosted
  const baseUrl = process.env.POSTHOG_HOST ?? "https://us.posthog.com";

  return { token, baseUrl, projectId };
}

async function posthogFetch(path: string, options?: { method?: string; body?: unknown }): Promise<unknown> {
  const { token, baseUrl } = getPostHogAuth();

  const res = await fetch(`${baseUrl}${path}`, {
    method: options?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PostHog API error ${res.status}: ${res.statusText}. ${body.slice(0, 300)}`);
  }

  return await res.json();
}

export function createPostHogQueryTool() {
  return {
    name: "posthog_query",
    label: "PostHog Query",
    description:
      "Run a HogQL (SQL) query against PostHog analytics data. Use for questions like 'how many signups last week', 'top pages by pageviews', 'daily active users trend', 'conversion from signup to purchase'. HogQL is PostHog's SQL dialect — query the 'events' table with columns: event, timestamp, distinct_id, properties. Access properties with dot notation like properties.$current_url. Max 10s execution, 100 rows default (up to 50k with LIMIT).",
    parameters: Type.Object({
      query: Type.String({
        description:
          'HogQL SQL query. Examples: "SELECT event, count() FROM events WHERE timestamp >= now() - INTERVAL 7 DAY GROUP BY event ORDER BY count() DESC LIMIT 20", "SELECT properties.$current_url, count() FROM events WHERE event = \'$pageview\' AND timestamp >= now() - INTERVAL 30 DAY GROUP BY properties.$current_url ORDER BY count() DESC LIMIT 10"',
      }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const { projectId } = getPostHogAuth();
      const query = params.query as string;

      const data = (await posthogFetch(`/api/projects/${projectId}/query/`, {
        method: "POST",
        body: {
          query: {
            kind: "HogQLQuery",
            query,
          },
        },
      })) as {
        columns?: string[];
        results?: unknown[][];
        types?: string[];
        hogql?: string;
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                columns: data.columns,
                rowCount: data.results?.length ?? 0,
                results: data.results?.slice(0, 200),
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

export function createPostHogListInsightsTool() {
  return {
    name: "posthog_list_insights",
    label: "PostHog List Insights",
    description:
      "List saved insights (charts, dashboards, trends, funnels) in PostHog. Use for questions like 'what dashboards do we have', 'show me our saved analytics', 'list our funnels'.",
    parameters: Type.Object({
      limit: Type.Optional(
        Type.Number({ description: "Max results (default 20)", default: 20 }),
      ),
      search: Type.Optional(
        Type.String({ description: "Search insights by name" }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const { projectId } = getPostHogAuth();
      const limit = (params.limit as number) ?? 20;
      const search = params.search as string | undefined;

      const queryParams = new URLSearchParams({
        limit: String(limit),
        basic: "true",
      });
      if (search) queryParams.set("search", search);

      const data = (await posthogFetch(
        `/api/projects/${projectId}/insights/?${queryParams}`,
      )) as {
        count: number;
        results: Record<string, unknown>[];
      };

      const insights = data.results.map((i) => ({
        id: i.id,
        short_id: i.short_id,
        name: i.name || i.derived_name || "(Untitled)",
        description: i.description,
        deleted: i.deleted,
        dashboards: i.dashboards,
        updated: i.last_modified_at ?? i.updated_at,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: data.count, count: insights.length, insights }, null, 2),
          },
        ],
      };
    },
  };
}

export function createPostHogGetInsightTool() {
  return {
    name: "posthog_get_insight",
    label: "PostHog Get Insight",
    description:
      "Get a specific saved insight by ID, including its query definition and cached result data. Use to retrieve the actual data behind a chart or funnel.",
    parameters: Type.Object({
      insightId: Type.Number({ description: "Insight ID number" }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const { projectId } = getPostHogAuth();
      const insightId = params.insightId as number;

      const data = (await posthogFetch(
        `/api/projects/${projectId}/insights/${insightId}/?refresh=force_cache`,
      )) as Record<string, unknown>;

      const result: Record<string, unknown> = {
        id: data.id,
        short_id: data.short_id,
        name: data.name || data.derived_name || "(Untitled)",
        description: data.description,
        query: data.query,
        dashboards: data.dashboards,
        updated: data.last_modified_at ?? data.updated_at,
        created_by: (data.created_by as Record<string, unknown>)?.first_name,
      };

      // Include cached result if available
      const resultData = data.result as unknown;
      if (resultData) {
        result.result = resultData;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2).slice(0, 15000),
          },
        ],
      };
    },
  };
}

export function createPostHogListFeatureFlagsTool() {
  return {
    name: "posthog_list_feature_flags",
    label: "PostHog List Feature Flags",
    description:
      "List feature flags in PostHog with their rollout status. Use for questions like 'what feature flags are active', 'show me flag rollout percentages', 'any experiments running'.",
    parameters: Type.Object({
      active: Type.Optional(
        Type.String({
          description: 'Filter: "true" for active flags only, "false" for inactive, "STALE" for stale flags (default: all)',
        }),
      ),
      limit: Type.Optional(
        Type.Number({ description: "Max results (default 20)", default: 20 }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const { projectId } = getPostHogAuth();
      const limit = (params.limit as number) ?? 20;
      const active = params.active as string | undefined;

      const queryParams = new URLSearchParams({ limit: String(limit) });
      if (active) queryParams.set("active", active);

      const data = (await posthogFetch(
        `/api/projects/${projectId}/feature_flags/?${queryParams}`,
      )) as {
        count: number;
        results: Record<string, unknown>[];
      };

      const flags = data.results.map((f) => {
        const filters = f.filters as Record<string, unknown> | undefined;
        const groups = filters?.groups as Record<string, unknown>[] | undefined;

        return {
          id: f.id,
          key: f.key,
          name: f.name,
          active: f.active,
          deleted: f.deleted,
          rollout_percentage: groups?.[0]?.rollout_percentage ?? null,
          type: filters?.multivariate ? "multivariant" : "boolean",
          created: f.created_at,
          created_by: (f.created_by as Record<string, unknown>)?.first_name,
        };
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: data.count, count: flags.length, flags }, null, 2),
          },
        ],
      };
    },
  };
}

export function createPostHogGetFeatureFlagTool() {
  return {
    name: "posthog_get_feature_flag",
    label: "PostHog Get Feature Flag",
    description:
      "Get details of a specific feature flag by ID, including rollout conditions, variants, and filters.",
    parameters: Type.Object({
      flagId: Type.Number({ description: "Feature flag ID number" }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const { projectId } = getPostHogAuth();
      const flagId = params.flagId as number;

      const data = (await posthogFetch(
        `/api/projects/${projectId}/feature_flags/${flagId}/`,
      )) as Record<string, unknown>;

      const filters = data.filters as Record<string, unknown> | undefined;

      const result = {
        id: data.id,
        key: data.key,
        name: data.name,
        active: data.active,
        deleted: data.deleted,
        filters: filters,
        created: data.created_at,
        created_by: (data.created_by as Record<string, unknown>)?.first_name,
        rollback_conditions: data.rollback_conditions,
        performed_rollback: data.performed_rollback,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  };
}
