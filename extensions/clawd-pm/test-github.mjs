#!/usr/bin/env node

/**
 * Test script for GitHub integration.
 * Run: GITHUB_TOKEN=ghp_xxx node test-github.mjs
 * Optionally: GITHUB_TEST_REPO=owner/repo node test-github.mjs
 */

const token = process.env.GITHUB_TOKEN;

if (!token) {
  console.error("\n  Missing env var. Run like this:\n");
  console.error("  GITHUB_TOKEN=ghp_xxxxx node test-github.mjs\n");
  console.error("  Get a token at: https://github.com/settings/tokens\n");
  process.exit(1);
}

async function githubFetch(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function githubPost(path, payload) {
  const res = await fetch(`https://api.github.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
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

console.log("\nTesting GitHub API\n");

// Test 1: Auth — get current user
let username = null;
await test("Auth & get current user", async () => {
  const data = await githubFetch("/user");
  username = data.login;
  return `Logged in as: ${data.login} (${data.name ?? "no name"})`;
});

// Test 2: List user repos
let testRepo = process.env.GITHUB_TEST_REPO || null;
await test("List repos", async () => {
  const data = await githubFetch("/user/repos?per_page=5&sort=updated&direction=desc");
  if (!testRepo && data.length) {
    testRepo = data[0].full_name;
  }
  return `Found ${data.length} repos (showing 5): ${data.map((r) => r.full_name).join(", ")}`;
});

// Test 3: List PRs
await test("List pull requests", async () => {
  if (!testRepo) return "Skipped — no repos found";
  const data = await githubFetch(`/repos/${testRepo}/pulls?state=all&per_page=5`);
  if (!data.length) return `No PRs found on ${testRepo}`;
  return `${data.length} PRs on ${testRepo}: ${data.map((pr) => `#${pr.number} ${pr.title} [${pr.state}]`).join(", ")}`;
});

// Test 4: List issues
await test("List issues", async () => {
  if (!testRepo) return "Skipped — no repos found";
  const data = await githubFetch(`/repos/${testRepo}/issues?state=all&per_page=5`);
  if (!data.length) return `No issues found on ${testRepo}`;
  return `${data.length} issues on ${testRepo}: ${data.map((i) => `#${i.number} ${i.title} [${i.state}]`).join(", ")}`;
});

// Test 5: Get specific PR details (if any exist)
await test("Get PR details", async () => {
  if (!testRepo) return "Skipped — no repos found";
  const prs = await githubFetch(`/repos/${testRepo}/pulls?state=all&per_page=1`);
  if (!prs.length) return "No PRs to test with";

  const pr = await githubFetch(`/repos/${testRepo}/pulls/${prs[0].number}`);
  return `PR #${pr.number}: "${pr.title}" by ${pr.user?.login} | +${pr.additions}/-${pr.deletions} | ${pr.changed_files} files | ${pr.state}`;
});

// Test 6: Get PR reviews
await test("Get PR reviews", async () => {
  if (!testRepo) return "Skipped — no repos found";
  const prs = await githubFetch(`/repos/${testRepo}/pulls?state=all&per_page=1`);
  if (!prs.length) return "No PRs to test with";

  const reviews = await githubFetch(`/repos/${testRepo}/pulls/${prs[0].number}/reviews`);
  if (!reviews.length) return `No reviews on PR #${prs[0].number}`;
  return `${reviews.length} reviews: ${reviews.map((r) => `${r.user?.login}: ${r.state}`).join(", ")}`;
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
