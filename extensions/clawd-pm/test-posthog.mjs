#!/usr/bin/env node

/**
 * Test script for PostHog integration.
 * Run: POSTHOG_API_KEY=phx_xxx POSTHOG_PROJECT_ID=12345 node test-posthog.mjs
 *
 * Optional: POSTHOG_HOST=https://eu.posthog.com (defaults to US cloud)
 *
 * Get personal API key from: Settings → Personal API Keys
 * Get project ID from: Settings → Project → Project ID
 */

const token = process.env.POSTHOG_API_KEY;
const projectId = process.env.POSTHOG_PROJECT_ID;
const host = process.env.POSTHOG_HOST ?? "https://us.posthog.com";

if (!token || !projectId) {
  console.error("\n  Missing env vars. Run like this:\n");
  console.error("  POSTHOG_API_KEY=phx_xxx POSTHOG_PROJECT_ID=12345 node test-posthog.mjs\n");
  console.error("  Get personal API key from: Settings → Personal API Keys");
  console.error("  Get project ID from: Settings → Project → Project ID\n");
  process.exit(1);
}

async function posthogFetch(path, options) {
  const res = await fetch(`${host}${path}`, {
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
    throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    const result = await fn();
    console.log(`  ✓ ${name}`);
    if (result) console.log(`    ${result}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    failed++;
  }
}

console.log(`\nTesting PostHog at ${host} (project ${projectId})\n`);

// Test 1: HogQL query — count events in last 7 days
await test("HogQL query (event counts last 7 days)", async () => {
  const data = await posthogFetch(`/api/projects/${projectId}/query/`, {
    method: "POST",
    body: {
      query: {
        kind: "HogQLQuery",
        query:
          "SELECT event, count() AS cnt FROM events WHERE timestamp >= now() - INTERVAL 7 DAY GROUP BY event ORDER BY cnt DESC LIMIT 10",
      },
    },
  });
  const rows = data.results?.length ?? 0;
  if (rows === 0) return "No events in last 7 days";
  const top = data.results.slice(0, 3).map((r) => r[0] + " (" + r[1] + ")").join(", ");
  return rows + " event types. Top: " + top;
});

// Test 2: List insights
await test("List insights", async () => {
  const data = await posthogFetch(
    `/api/projects/${projectId}/insights/?limit=5&basic=true`,
  );
  if (!data.results.length) return `No insights found (${data.count} total)`;
  const names = data.results.map((i) => '"' + (i.name || i.derived_name || "(Untitled)") + '"').join(", ");
  return data.count + " total insights. Recent: " + names;
});

// Test 3: Get specific insight (if any exist)
await test("Get insight details", async () => {
  const list = await posthogFetch(
    `/api/projects/${projectId}/insights/?limit=1&basic=true`,
  );
  if (!list.results.length) return "No insights to test with";

  const insightId = list.results[0].id;
  const data = await posthogFetch(
    `/api/projects/${projectId}/insights/${insightId}/?refresh=force_cache`,
  );
  return `Insight #${data.id}: "${data.name || data.derived_name}" — has ${data.result ? "cached" : "no"} result data`;
});

// Test 4: List feature flags
await test("List feature flags", async () => {
  const data = await posthogFetch(
    `/api/projects/${projectId}/feature_flags/?limit=5`,
  );
  if (!data.results.length) return `No feature flags found (${data.count} total)`;
  const flagNames = data.results.map((f) => '"' + f.key + '" [' + (f.active ? "active" : "inactive") + ']').join(", ");
  return data.count + " total flags. Recent: " + flagNames;
});

// Test 5: Get specific feature flag (if any exist)
await test("Get feature flag details", async () => {
  const list = await posthogFetch(
    `/api/projects/${projectId}/feature_flags/?limit=1`,
  );
  if (!list.results.length) return "No feature flags to test with";

  const flagId = list.results[0].id;
  const data = await posthogFetch(
    `/api/projects/${projectId}/feature_flags/${flagId}/`,
  );
  const filters = data.filters;
  const rollout = filters?.groups?.[0]?.rollout_percentage;
  return `Flag #${data.id}: "${data.key}" | Active: ${data.active} | Rollout: ${rollout ?? "N/A"}%`;
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
