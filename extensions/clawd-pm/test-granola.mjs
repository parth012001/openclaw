#!/usr/bin/env node

/**
 * Test script for Granola integration (Enterprise API).
 * Run: GRANOLA_API_KEY=xxx node test-granola.mjs
 *
 * Requires Enterprise plan. Get API key from:
 * Settings → Workspaces → API tab
 */

const token = process.env.GRANOLA_API_KEY;

if (!token) {
  console.error("\n  Missing env var. Run like this:\n");
  console.error("  GRANOLA_API_KEY=xxxxx node test-granola.mjs\n");
  console.error("  Requires Enterprise plan. Get key from: Settings → Workspaces → API tab\n");
  process.exit(1);
}

async function granolaFetch(path) {
  const res = await fetch(`https://public-api.granola.ai${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
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

console.log("\nTesting Granola API\n");

// Test 1: List recent notes
let firstNoteId = null;
await test("List notes", async () => {
  const data = await granolaFetch("/v1/notes?page_size=5");
  const notes = data.notes;
  if (!notes.length) return "No notes found (empty workspace or no shared notes)";

  firstNoteId = notes[0].id;
  return `Found ${notes.length} notes: ${notes.map((n) => `"${n.title ?? "(Untitled)}" by ${n.owner?.name ?? n.owner?.email}`).join(", ")}`;
});

// Test 2: List with date filter
await test("List notes with date filter", async () => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const data = await granolaFetch(`/v1/notes?page_size=5&created_after=${thirtyDaysAgo}`);
  return `${data.notes.length} notes created in last 30 days`;
});

// Test 3: Get specific note
await test("Get note details", async () => {
  if (!firstNoteId) return "Skipped — no notes found";

  const note = await granolaFetch(`/v1/notes/${firstNoteId}`);
  const attendeeCount = note.attendees?.length ?? 0;
  const summaryLength = (note.summary_markdown ?? note.summary_text ?? "").length;
  return `"${note.title}" — ${attendeeCount} attendees, ${summaryLength} chars of summary`;
});

// Test 4: Get note with transcript
await test("Get note with transcript", async () => {
  if (!firstNoteId) return "Skipped — no notes found";

  const note = await granolaFetch(`/v1/notes/${firstNoteId}?include=transcript`);
  const transcriptLines = note.transcript?.length ?? 0;
  return `Transcript: ${transcriptLines} segments`;
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
