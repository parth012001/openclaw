#!/usr/bin/env node

/**
 * Test script for Jira integration.
 * Run: JIRA_EMAIL=you@co.com JIRA_API_TOKEN=xxx JIRA_SITE=yourteam node test-jira.mjs
 */

const email = process.env.JIRA_EMAIL;
const token = process.env.JIRA_API_TOKEN;
const site = process.env.JIRA_SITE;

if (!email || !token || !site) {
  console.error("\n  Missing env vars. Run like this:\n");
  console.error("  JIRA_EMAIL=you@company.com JIRA_API_TOKEN=your-token JIRA_SITE=yourteam node test-jira.mjs\n");
  console.error("  Get your API token at: https://id.atlassian.com/manage-profile/security/api-tokens\n");
  process.exit(1);
}

const auth = Buffer.from(`${email}:${token}`).toString("base64");
const baseUrl = site.includes(".") ? `https://${site}` : `https://${site}.atlassian.net`;

async function jiraFetch(path) {
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

console.log(`\nTesting Jira at ${baseUrl}\n`);

// Test 1: Auth + list projects
await test("Auth & list projects", async () => {
  const data = await jiraFetch("/rest/api/3/project");
  const projects = data.map((p) => `${p.key} (${p.name})`).slice(0, 5);
  return `Found ${data.length} projects: ${projects.join(", ")}`;
});

// Test 2: Search with JQL
await test("JQL search (recent issues)", async () => {
  const params = new URLSearchParams({
    jql: "project is not EMPTY ORDER BY updated DESC",
    maxResults: "5",
    fields: "summary,status,assignee,priority,issuetype,updated",
  });
  const data = await jiraFetch(`/rest/api/3/search/jql?${params}`);
  const issues = data.issues.map((i) => {
    const f = i.fields;
    return `${i.key}: ${f.summary} [${f.status?.name}]`;
  });
  return `${data.total} total issues. Top 5:\n${issues.map((i) => `      ${i}`).join("\n")}`;
});

// Test 3: Agile API — list boards
await test("Agile API — list boards", async () => {
  const data = await jiraFetch("/rest/agile/1.0/board?maxResults=5");
  const boards = data.values.map((b) => `${b.id}: ${b.name} (${b.type})`);
  return `Found ${data.values.length} boards: ${boards.join(", ")}`;
});

// Test 4: Get a specific issue (using first result from search)
await test("Get specific issue details", async () => {
  const params = new URLSearchParams({ jql: "project is not EMPTY ORDER BY updated DESC", maxResults: "1", fields: "summary" });
  const search = await jiraFetch(`/rest/api/3/search/jql?${params}`);
  if (!search.issues.length) return "No issues found to test with";

  const key = search.issues[0].key;
  const issue = await jiraFetch(`/rest/api/3/issue/${key}`);
  const f = issue.fields;
  return `${issue.key}: ${f.summary} | Status: ${f.status?.name} | Assignee: ${f.assignee?.displayName ?? "Unassigned"}`;
});

// Test 5: Active sprint (if boards exist)
await test("Active sprint", async () => {
  const boards = await jiraFetch("/rest/agile/1.0/board?maxResults=3");
  if (!boards.values.length) return "No boards found";

  for (const board of boards.values) {
    try {
      const sprints = await jiraFetch(`/rest/agile/1.0/board/${board.id}/sprint?state=active`);
      if (sprints.values.length) {
        const s = sprints.values[0];
        return `Board "${board.name}" → Sprint "${s.name}" (${s.startDate?.slice(0, 10)} to ${s.endDate?.slice(0, 10)})`;
      }
    } catch {
      // Some boards don't support sprints
    }
  }
  return "No active sprints found on any board";
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
