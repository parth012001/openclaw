#!/usr/bin/env node

/**
 * Test script for Amplitude integration.
 * Run: AMPLITUDE_API_KEY=xxx AMPLITUDE_SECRET_KEY=xxx node test-amplitude.mjs
 *
 * Optional: AMPLITUDE_REGION=eu (defaults to "us")
 *
 * Get API key and secret from: Settings → Projects → your project → General
 */

const apiKey = process.env.AMPLITUDE_API_KEY;
const secretKey = process.env.AMPLITUDE_SECRET_KEY;
const region = process.env.AMPLITUDE_REGION ?? "us";

if (!apiKey || !secretKey) {
  console.error("\n  Missing env vars. Run like this:\n");
  console.error("  AMPLITUDE_API_KEY=xxx AMPLITUDE_SECRET_KEY=xxx node test-amplitude.mjs\n");
  console.error("  Get keys from: Settings → Projects → your project → General\n");
  process.exit(1);
}

const auth = Buffer.from(apiKey + ":" + secretKey).toString("base64");
const baseUrl = region === "eu" ? "https://analytics.eu.amplitude.com" : "https://amplitude.com";

async function amplitudeFetch(path) {
  const res = await fetch(baseUrl + path, {
    headers: {
      Authorization: "Basic " + auth,
      Accept: "application/json",
    },
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

console.log("\nTesting Amplitude at " + baseUrl + "\n");

// Calculate date range (last 30 days)
const endDate = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, "");

// Test 1: Get active users
await test("Get active users (last 30 days)", async () => {
  const data = await amplitudeFetch("/api/2/users?start=" + startDate + "&end=" + endDate + "&m=active&i=30");
  const series = data.data?.series;
  if (!series || !series.length) return "No active user data";
  return "Got active user data series";
});

// Test 2: Get new users
await test("Get new users (last 30 days)", async () => {
  const data = await amplitudeFetch("/api/2/users?start=" + startDate + "&end=" + endDate + "&m=new&i=7");
  const series = data.data?.series;
  if (!series || !series.length) return "No new user data";
  return "Got new user data series";
});

// Test 3: Session length
await test("Get session length distribution", async () => {
  const data = await amplitudeFetch("/api/2/sessions/length?start=" + startDate + "&end=" + endDate);
  return "Session length data retrieved";
});

// Test 4: List cohorts
await test("List cohorts", async () => {
  const data = await amplitudeFetch("/api/3/cohorts");
  const cohorts = data.cohorts ?? data;
  if (!Array.isArray(cohorts) || !cohorts.length) return "No cohorts found";
  const names = cohorts.slice(0, 3).map((c) => '"' + c.name + '"').join(", ");
  return cohorts.length + " cohorts. First: " + names;
});

// Test 5: Event segmentation (any active event)
await test("Event segmentation (any active event)", async () => {
  const eventObj = JSON.stringify({ event_type: "_active" });
  const data = await amplitudeFetch(
    "/api/2/events/segmentation?e=" + encodeURIComponent(eventObj) + "&start=" + startDate + "&end=" + endDate + "&m=uniques&i=7"
  );
  const series = data.data?.series;
  if (!series || !series.length) return "No event segmentation data";
  return "Got event segmentation series (weekly uniques)";
});

// Test 6: User search
await test("User search", async () => {
  const data = await amplitudeFetch("/api/2/usersearch?user=test");
  const matches = data.matches;
  if (!matches || !matches.length) return "No users matched 'test' (expected for fresh project)";
  return matches.length + " user(s) matched";
});

console.log("\nResults: " + passed + " passed, " + failed + " failed\n");
if (failed > 0) process.exit(1);
