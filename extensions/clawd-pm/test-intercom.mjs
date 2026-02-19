#!/usr/bin/env node

/**
 * Test script for Intercom integration.
 * Run: INTERCOM_TOKEN=xxx node test-intercom.mjs
 *
 * Optional: INTERCOM_REGION=eu (defaults to "us", also supports "au")
 *
 * Get access token from: Settings → Integrations → Developer Hub → Your App → Authentication
 */

const token = process.env.INTERCOM_TOKEN;
const region = process.env.INTERCOM_REGION ?? "us";

if (!token) {
  console.error("\n  Missing env var. Run like this:\n");
  console.error("  INTERCOM_TOKEN=xxx node test-intercom.mjs\n");
  console.error("  Get token from: Settings → Integrations → Developer Hub → Your App → Authentication\n");
  process.exit(1);
}

const baseUrl =
  region === "eu"
    ? "https://api.eu.intercom.io"
    : region === "au"
      ? "https://api.au.intercom.io"
      : "https://api.intercom.io";

async function intercomFetch(path, options) {
  const res = await fetch(baseUrl + path, {
    method: options?.method ?? "GET",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Intercom-Version": "2.11",
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

console.log("\nTesting Intercom at " + baseUrl + "\n");

// Test 1: Auth — list conversations
await test("List conversations", async () => {
  const data = await intercomFetch("/conversations?order=desc&sort=updated_at&per_page=5");
  const convos = data.conversations;
  if (!convos.length) return "No conversations found";
  return convos.length + " conversations returned. First: id=" + convos[0].id + " state=" + convos[0].state;
});

// Test 2: Search conversations (open ones)
await test("Search open conversations", async () => {
  const data = await intercomFetch("/conversations/search", {
    method: "POST",
    body: {
      query: { field: "open", operator: "=", value: true },
      pagination: { per_page: 5 },
    },
  });
  return data.total_count + " open conversations";
});

// Test 3: Get specific conversation
await test("Get conversation details", async () => {
  const list = await intercomFetch("/conversations?per_page=1");
  if (!list.conversations.length) return "No conversations to test with";

  const convoId = list.conversations[0].id;
  const data = await intercomFetch("/conversations/" + convoId + "?display_as=plaintext");
  const parts = data.conversation_parts?.conversation_parts?.length ?? 0;
  return "Conversation #" + convoId + ": state=" + data.state + ", " + parts + " parts";
});

// Test 4: Search contacts
await test("Search contacts", async () => {
  const data = await intercomFetch("/contacts/search", {
    method: "POST",
    body: {
      query: { field: "role", operator: "=", value: "user" },
      pagination: { per_page: 5 },
    },
  });
  return data.total_count + " user contacts found";
});

console.log("\nResults: " + passed + " passed, " + failed + " failed\n");
if (failed > 0) process.exit(1);
