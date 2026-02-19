#!/usr/bin/env node

/**
 * Test script for Notion integration.
 * Run: NOTION_TOKEN=ntn_xxx node test-notion.mjs
 *
 * Create an integration at: https://www.notion.so/my-integrations
 * Then share pages/databases with the integration via the ••• menu → Add connections
 */

const token = process.env.NOTION_TOKEN;

if (!token) {
  console.error("\n  Missing env var. Run like this:\n");
  console.error("  NOTION_TOKEN=ntn_xxxxx node test-notion.mjs\n");
  console.error("  Create an integration at: https://www.notion.so/my-integrations\n");
  process.exit(1);
}

async function notionFetch(path, options = {}) {
  const res = await fetch(`https://api.notion.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

function extractTitle(properties) {
  for (const val of Object.values(properties)) {
    if (val.type === "title") {
      return val.title?.map((t) => t.plain_text).join("") ?? "";
    }
  }
  return "";
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

console.log("\nTesting Notion API\n");

// Test 1: Auth — search for everything (empty query)
let firstPageId = null;
await test("Auth & search all shared pages", async () => {
  const data = await notionFetch("/v1/search", {
    method: "POST",
    body: JSON.stringify({ page_size: 5 }),
  });
  const results = data.results;
  if (!results.length) return "No pages shared with integration (share pages via ••• → Add connections)";

  for (const r of results) {
    if (r.object === "page") {
      firstPageId = r.id;
      break;
    }
  }

  const items = results.map((r) => {
    if (r.object === "page") {
      const title = r.properties ? extractTitle(r.properties) : "(Untitled)";
      return `📄 ${title}`;
    }
    const dbTitle = r.title?.map((t) => t.plain_text).join("") ?? "(Untitled DB)";
    return `🗃 ${dbTitle}`;
  });
  return `Found ${results.length} items: ${items.join(", ")}`;
});

// Test 2: Search with query
await test("Search by text query", async () => {
  const data = await notionFetch("/v1/search", {
    method: "POST",
    body: JSON.stringify({ query: "test", page_size: 5 }),
  });
  return `${data.results.length} results for "test"`;
});

// Test 3: Get page content
await test("Get page content", async () => {
  if (!firstPageId) return "Skipped — no pages found";

  const [page, blocks] = await Promise.all([
    notionFetch(`/v1/pages/${firstPageId}`),
    notionFetch(`/v1/blocks/${firstPageId}/children?page_size=20`),
  ]);

  const title = page.properties ? extractTitle(page.properties) : "(Untitled)";
  return `Page "${title}" — ${blocks.results.length} blocks, last edited ${page.last_edited_time}`;
});

// Test 4: Create a test page (then archive it)
let testPageId = null;
await test("Create page", async () => {
  if (!firstPageId) return "Skipped — no parent page to nest under";

  const data = await notionFetch("/v1/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "page_id", page_id: firstPageId },
      properties: {
        title: {
          title: [{ type: "text", text: { content: `Clawd PM Test — ${new Date().toISOString().slice(0, 19)}` } }],
        },
      },
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: "Test page created by Clawd PM integration test. Safe to delete." } }],
          },
        },
      ],
    }),
  });

  testPageId = data.id;
  return `Created page (ID: ${data.id})`;
});

// Test 5: Add comment
await test("Add comment", async () => {
  if (!testPageId) return "Skipped — no test page created";

  const data = await notionFetch("/v1/comments", {
    method: "POST",
    body: JSON.stringify({
      parent: { page_id: testPageId },
      rich_text: [{ type: "text", text: { content: "Test comment from Clawd PM." } }],
    }),
  });

  return `Comment added (ID: ${data.id})`;
});

// Test 6: Search for databases specifically
let firstDbId = null;
await test("Search databases", async () => {
  const data = await notionFetch("/v1/search", {
    method: "POST",
    body: JSON.stringify({
      filter: { value: "database", property: "object" },
      page_size: 5,
    }),
  });
  if (!data.results.length) return "No databases shared with integration";
  firstDbId = data.results[0].id;
  const dbs = data.results.map((r) => r.title?.map((t) => t.plain_text).join("") ?? "(Untitled)");
  return `Found ${data.results.length} databases: ${dbs.join(", ")}`;
});

// Test 7: Query database
await test("Query database", async () => {
  if (!firstDbId) return "Skipped — no databases found";

  const data = await notionFetch(`/v1/databases/${firstDbId}/query`, {
    method: "POST",
    body: JSON.stringify({ page_size: 5 }),
  });

  return `${data.results.length} entries in database`;
});

// Cleanup: archive test page
if (testPageId) {
  try {
    await notionFetch(`/v1/pages/${testPageId}`, {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
    });
    console.log(`\n  (Cleaned up test page ${testPageId})`);
  } catch {
    console.log(`\n  (Could not clean up test page ${testPageId})`);
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
