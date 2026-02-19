#!/usr/bin/env node

/**
 * Test script for Asana integration.
 * Run: ASANA_TOKEN=xxx ASANA_WORKSPACE_GID=xxx node test-asana.mjs
 *
 * Get PAT from: https://app.asana.com/0/developer-console (Personal Access Tokens)
 * Get workspace GID from: https://app.asana.com/api/1.0/workspaces (while logged in)
 */

const token = process.env.ASANA_TOKEN;
const workspaceGid = process.env.ASANA_WORKSPACE_GID;

if (!token || !workspaceGid) {
  console.error("\n  Missing env vars. Run like this:\n");
  console.error("  ASANA_TOKEN=xxx ASANA_WORKSPACE_GID=xxx node test-asana.mjs\n");
  console.error("  Get PAT from: https://app.asana.com/0/developer-console");
  console.error("  Get workspace GID from: https://app.asana.com/api/1.0/workspaces (while logged in)\n");
  process.exit(1);
}

async function asanaFetch(path, options) {
  const res = await fetch("https://app.asana.com/api/1.0" + path, {
    method: options?.method ?? "GET",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(res.status + " " + res.statusText + ": " + body.slice(0, 300));
  }
  return res.json();
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    const result = await fn();
    console.log("  ✓ " + name);
    if (result) console.log("    " + result);
    passed++;
  } catch (err) {
    console.log("  ✗ " + name);
    console.log("    Error: " + err.message);
    failed++;
  }
}

console.log("\nTesting Asana (workspace " + workspaceGid + ")\n");

// Test 1: List projects
let firstProjectGid = null;
await test("List projects", async () => {
  const data = await asanaFetch("/projects?workspace=" + workspaceGid + "&limit=5&opt_fields=name,owner.name");
  const projects = data.data;
  if (!projects.length) return "No projects found";
  firstProjectGid = projects[0].gid;
  const names = projects.map((p) => '"' + p.name + '"').join(", ");
  return projects.length + " projects: " + names;
});

// Test 2: Get project details
await test("Get project details", async () => {
  if (!firstProjectGid) return "Skipped — no projects found";
  const data = await asanaFetch("/projects/" + firstProjectGid + "?opt_fields=name,owner.name,notes,permalink_url");
  const p = data.data;
  return "Project: \"" + p.name + "\" | Owner: " + (p.owner?.name ?? "none");
});

// Test 3: Get project sections
await test("Get project sections", async () => {
  if (!firstProjectGid) return "Skipped — no projects found";
  const data = await asanaFetch("/projects/" + firstProjectGid + "/sections?opt_fields=name");
  const sections = data.data;
  if (!sections.length) return "No sections in project";
  const names = sections.map((s) => '"' + s.name + '"').join(", ");
  return sections.length + " sections: " + names;
});

// Test 4: Search tasks
await test("Search tasks (incomplete)", async () => {
  const data = await asanaFetch(
    "/workspaces/" + workspaceGid + "/tasks/search?completed=false&limit=5&opt_fields=name,assignee.name,due_on"
  );
  const tasks = data.data;
  if (!tasks.length) return "No incomplete tasks found";
  const names = tasks.map((t) => '"' + t.name + '"').join(", ");
  return tasks.length + " incomplete tasks: " + names;
});

// Test 5: Get specific task (if any exist)
await test("Get task details", async () => {
  const search = await asanaFetch(
    "/workspaces/" + workspaceGid + "/tasks/search?completed=false&limit=1&opt_fields=name"
  );
  if (!search.data.length) return "No tasks to test with";

  const taskGid = search.data[0].gid;
  const data = await asanaFetch(
    "/tasks/" + taskGid + "?opt_fields=name,completed,assignee.name,due_on,notes,permalink_url"
  );
  const t = data.data;
  return "Task: \"" + t.name + "\" | Completed: " + t.completed + " | Assignee: " + (t.assignee?.name ?? "none");
});

// Test 6: Create task, add comment, then delete
await test("Create task, add comment, then delete", async () => {
  const createData = await asanaFetch("/tasks", {
    method: "POST",
    body: {
      data: {
        name: "Clawd PM test task — safe to delete",
        workspace: workspaceGid,
      },
    },
  });
  const taskGid = createData.data.gid;

  // Add a comment
  const commentData = await asanaFetch("/tasks/" + taskGid + "/stories", {
    method: "POST",
    body: { data: { text: "Test comment from Clawd PM integration test" } },
  });
  const storyGid = commentData.data.gid;

  // Clean up
  await asanaFetch("/tasks/" + taskGid, { method: "DELETE" });
  return "Created task #" + taskGid + ", added comment #" + storyGid + ", then deleted task";
});

console.log("\nResults: " + passed + " passed, " + failed + " failed\n");
if (failed > 0) process.exit(1);
