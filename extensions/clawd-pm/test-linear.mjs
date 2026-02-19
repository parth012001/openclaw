#!/usr/bin/env node

/**
 * Test script for Linear integration.
 * Run: LINEAR_API_KEY=lin_api_xxx node test-linear.mjs
 */

const apiKey = process.env.LINEAR_API_KEY;

if (!apiKey) {
  console.error("\n  Missing env var. Run like this:\n");
  console.error("  LINEAR_API_KEY=lin_api_xxxxx node test-linear.mjs\n");
  console.error("  Get your API key at: https://linear.app/settings/account/security\n");
  process.exit(1);
}

async function linearQuery(query, variables) {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  if (data.errors?.length) {
    throw new Error(`GraphQL: ${data.errors.map((e) => e.message).join(", ")}`);
  }
  return data.data;
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

console.log("\nTesting Linear API\n");

// Test 1: Auth — get viewer
await test("Auth & get current user", async () => {
  const data = await linearQuery(`{ viewer { id name email } }`);
  return `Logged in as: ${data.viewer.name} (${data.viewer.email})`;
});

// Test 2: List teams
let firstTeamId = null;
let firstTeamKey = null;
await test("List teams", async () => {
  const data = await linearQuery(`{ teams { nodes { id key name } } }`);
  const teams = data.teams.nodes;
  if (teams.length) {
    firstTeamId = teams[0].id;
    firstTeamKey = teams[0].key;
  }
  return `Found ${teams.length} teams: ${teams.map((t) => `${t.key} (${t.name})`).join(", ")}`;
});

// Test 3: Search issues
await test("Search issues", async () => {
  const data = await linearQuery(
    `query($term: String!) {
      searchIssues(term: $term, first: 5) {
        nodes {
          id identifier title
          state { name }
          assignee { name }
          priorityLabel
        }
      }
    }`,
    { term: "bug" },
  );
  const issues = data.searchIssues.nodes;
  if (!issues.length) return "No issues match 'bug' (empty workspace?)";
  return `Found ${issues.length} issues:\n${issues.map((i) => `      ${i.identifier}: ${i.title} [${i.state?.name}]`).join("\n")}`;
});

// Test 4: Get issues with filter (recent) — use IssueFilter, not DateTime variable
await test("Filter issues (recently updated)", async () => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const data = await linearQuery(
    `query($filter: IssueFilter) {
      issues(filter: $filter, first: 5, orderBy: updatedAt) {
        nodes {
          identifier title
          state { name }
          assignee { name }
          priorityLabel
          updatedAt
        }
      }
    }`,
    { filter: { updatedAt: { gte: since } } },
  );
  const issues = data.issues.nodes;
  return `${issues.length} issues updated in last 30 days`;
});

// Test 5: Get active cycle
await test("Active cycle", async () => {
  if (!firstTeamKey) return "Skipped — no teams found";

  const data = await linearQuery(
    `query($key: String!) {
      teams(filter: { key: { eq: $key } }) {
        nodes {
          name
          activeCycle {
            name number startsAt endsAt progress
            issues { nodes { identifier title state { name } } }
          }
        }
      }
    }`,
    { key: firstTeamKey },
  );

  const team = data.teams.nodes[0];
  if (!team) return `Team ${firstTeamKey} not found`;
  if (!team.activeCycle) return `No active cycle for ${team.name}`;

  const c = team.activeCycle;
  return `${team.name} → Cycle "${c.name}" (#${c.number}), ${c.issues.nodes.length} issues, ${Math.round((c.progress ?? 0) * 100)}% done`;
});

// Test 6: Get projects
await test("List projects", async () => {
  const data = await linearQuery(
    `query {
      projects(first: 5, orderBy: updatedAt) {
        nodes {
          name state
          progress
          lead { name }
          startDate targetDate
          teams { nodes { key } }
        }
      }
    }`,
  );
  const projects = data.projects.nodes;
  if (!projects.length) return "No projects found";
  return `Found ${projects.length} projects: ${projects.map((p) => `${p.name} [${p.state}] ${Math.round((p.progress ?? 0) * 100)}%`).join(", ")}`;
});

// Test 7: Get a specific issue (using first search result)
await test("Get specific issue details", async () => {
  const search = await linearQuery(
    `{ issues(first: 1, orderBy: updatedAt) { nodes { identifier } } }`,
  );
  if (!search.issues.nodes.length) return "No issues to test with";

  const id = search.issues.nodes[0].identifier;
  const data = await linearQuery(
    `query($id: String!) {
      issue(id: $id) {
        identifier title description url
        state { name type }
        assignee { name }
        priority priorityLabel
        labels { nodes { name } }
        project { name }
        cycle { name number }
        comments { nodes { body user { name } createdAt } }
        createdAt updatedAt
      }
    }`,
    { id },
  );

  const i = data.issue;
  return `${i.identifier}: ${i.title} | ${i.state?.name} | ${i.assignee?.name ?? "Unassigned"} | ${i.comments?.nodes?.length ?? 0} comments`;
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
