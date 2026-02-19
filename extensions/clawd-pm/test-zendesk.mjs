#!/usr/bin/env node

/**
 * Test script for Zendesk integration.
 * Run: ZENDESK_EMAIL=you@co.com ZENDESK_API_TOKEN=xxx ZENDESK_SUBDOMAIN=yourteam node test-zendesk.mjs
 *
 * Get API token from: Admin Center → Apps and integrations → APIs → Zendesk API
 */

const email = process.env.ZENDESK_EMAIL;
const token = process.env.ZENDESK_API_TOKEN;
const subdomain = process.env.ZENDESK_SUBDOMAIN;

if (!email || !token || !subdomain) {
  console.error("\n  Missing env vars. Run like this:\n");
  console.error("  ZENDESK_EMAIL=you@co.com ZENDESK_API_TOKEN=xxx ZENDESK_SUBDOMAIN=yourteam node test-zendesk.mjs\n");
  console.error("  Get API token from: Admin Center → Apps and integrations → APIs → Zendesk API\n");
  process.exit(1);
}

const auth = Buffer.from(`${email}/token:${token}`).toString("base64");
const baseUrl = subdomain.includes(".") ? `https://${subdomain}` : `https://${subdomain}.zendesk.com`;

async function zendeskFetch(path) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
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

console.log(`\nTesting Zendesk at ${baseUrl}\n`);

// Test 1: Auth — search for all tickets
await test("Auth & search tickets", async () => {
  const params = new URLSearchParams({
    query: "type:ticket",
    sort_by: "updated_at",
    sort_order: "desc",
    per_page: "5",
  });
  const data = await zendeskFetch(`/api/v2/search.json?${params}`);
  const tickets = data.results;
  if (!tickets.length) return `No tickets found (${data.count} total)`;
  return `${data.count} total tickets. Recent: ${tickets.map((t) => `#${t.id} "${t.subject}" [${t.status}]`).join(", ")}`;
});

// Test 2: Search by status
await test("Search open tickets", async () => {
  const params = new URLSearchParams({
    query: "type:ticket status:open",
    per_page: "5",
  });
  const data = await zendeskFetch(`/api/v2/search.json?${params}`);
  return `${data.count} open tickets`;
});

// Test 3: Get ticket count
await test("Get ticket count by query", async () => {
  const data = await zendeskFetch(`/api/v2/search/count.json?query=${encodeURIComponent("type:ticket")}`);
  return `Total ticket count: ${data.count}`;
});

// Test 4: Get specific ticket details (if any exist)
await test("Get ticket details", async () => {
  const params = new URLSearchParams({
    query: "type:ticket",
    sort_by: "updated_at",
    sort_order: "desc",
    per_page: "1",
  });
  const search = await zendeskFetch(`/api/v2/search.json?${params}`);
  if (!search.results.length) return "No tickets to test with";

  const ticketId = search.results[0].id;
  const data = await zendeskFetch(`/api/v2/tickets/${ticketId}.json`);
  const t = data.ticket;
  return `Ticket #${t.id}: "${t.subject}" | Status: ${t.status} | Priority: ${t.priority ?? "none"} | Type: ${t.type ?? "none"}`;
});

// Test 5: Get ticket comments
await test("Get ticket comments", async () => {
  const params = new URLSearchParams({
    query: "type:ticket",
    sort_by: "updated_at",
    sort_order: "desc",
    per_page: "1",
  });
  const search = await zendeskFetch(`/api/v2/search.json?${params}`);
  if (!search.results.length) return "No tickets to test with";

  const ticketId = search.results[0].id;
  const data = await zendeskFetch(`/api/v2/tickets/${ticketId}/comments.json?per_page=5`);
  return `${data.comments.length} comments on ticket #${ticketId}`;
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
