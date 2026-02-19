#!/usr/bin/env node

/**
 * Test script for Confluence integration.
 * Run: JIRA_EMAIL=you@co.com JIRA_API_TOKEN=xxx JIRA_SITE=yourteam node test-confluence.mjs
 * (Same Atlassian credentials as Jira)
 */

const email = process.env.JIRA_EMAIL;
const token = process.env.JIRA_API_TOKEN;
const site = process.env.JIRA_SITE;

if (!email || !token || !site) {
  console.error("\n  Missing env vars. Run like this:\n");
  console.error("  JIRA_EMAIL=you@company.com JIRA_API_TOKEN=your-token JIRA_SITE=yourteam node test-confluence.mjs\n");
  process.exit(1);
}

const auth = Buffer.from(`${email}:${token}`).toString("base64");
const baseUrl = site.includes(".") ? `https://${site}` : `https://${site}.atlassian.net`;

async function confluenceFetch(path) {
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

async function confluencePost(path, payload) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
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

console.log(`\nTesting Confluence at ${baseUrl}\n`);

// Test 1: List spaces (v2 API)
let firstSpaceId = null;
let firstSpaceKey = null;
await test("List spaces (v2 API)", async () => {
  const data = await confluenceFetch("/wiki/api/v2/spaces?limit=10&sort=name");
  const spaces = data.results;
  if (spaces.length) {
    firstSpaceId = spaces[0].id;
    firstSpaceKey = spaces[0].key;
  }
  return `Found ${spaces.length} spaces: ${spaces.map((s) => `${s.key} (${s.name})`).join(", ") || "none"}`;
});

// Test 2: Search pages using CQL (content/search API)
await test("Search pages (CQL)", async () => {
  const cql = encodeURIComponent("type = page");
  const data = await confluenceFetch(`/wiki/rest/api/content/search?cql=${cql}&limit=5&expand=space`);
  const results = data.results;
  if (!results.length) return "No pages found (empty workspace?)";
  return `Found ${data.totalSize ?? results.length} pages: ${results.map((r) => `"${r.title}" [${r.space?.key ?? "?"}]`).join(", ")}`;
});

// Test 3: Get a specific page (v2 API)
await test("Get page content (v2 API)", async () => {
  // Use v2 pages list to find a page
  const pages = await confluenceFetch("/wiki/api/v2/pages?limit=1");
  if (!pages.results?.length) return "No pages to test with";

  const pageId = pages.results[0].id;
  const page = await confluenceFetch(`/wiki/api/v2/pages/${pageId}?body-format=storage`);
  const bodyLength = page.body?.storage?.value?.length ?? 0;
  return `Page "${page.title}" (ID: ${page.id}) — ${bodyLength} chars of content, version ${page.version?.number}`;
});

// Test 4: Create a test page (then clean up)
let testPageId = null;
await test("Create page (v2 API)", async () => {
  if (!firstSpaceId) return "Skipped — no spaces found";

  const page = await confluencePost("/wiki/api/v2/pages", {
    spaceId: firstSpaceId,
    status: "current",
    title: `Clawd PM Test Page — ${new Date().toISOString().slice(0, 19)}`,
    body: {
      representation: "storage",
      value: "<p>This is a test page created by Clawd PM integration test. Safe to delete.</p>",
    },
  });

  testPageId = page.id;
  return `Created page "${page.title}" (ID: ${page.id})`;
});

// Test 5: Add comment to the test page
await test("Add footer comment (v2 API)", async () => {
  if (!testPageId) return "Skipped — no test page created";

  const comment = await confluencePost("/wiki/api/v2/footer-comments", {
    pageId: testPageId,
    body: {
      representation: "storage",
      value: "<p>Test comment from Clawd PM integration test.</p>",
    },
  });

  return `Comment added (ID: ${comment.id})`;
});

// Cleanup: delete the test page
if (testPageId) {
  try {
    const res = await fetch(`${baseUrl}/wiki/api/v2/pages/${testPageId}`, {
      method: "DELETE",
      headers: { Authorization: `Basic ${auth}` },
    });
    if (res.ok) {
      console.log(`\n  (Cleaned up test page ${testPageId})`);
    }
  } catch {
    console.log(`\n  (Could not clean up test page ${testPageId})`);
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
