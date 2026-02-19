---
name: linear
description: Linear GraphQL API for searching issues, managing cycles, creating tickets, and tracking team progress.
homepage: https://linear.app/developers
metadata:
  {
    "openclaw":
      {
        "emoji": "🔷",
        "requires": { "env": ["LINEAR_API_KEY"] },
        "primaryEnv": "LINEAR_API_KEY",
      },
  }
---

# linear

Use the Linear GraphQL API to search issues, manage cycles, create tickets, and track team progress.

## Setup

1. Go to https://linear.app/settings/account/security
2. Under "Personal API keys", click "Create key"
3. Name it (e.g. "clawd-pm") and copy the key
4. Set the environment variable:

```bash
export LINEAR_API_KEY="lin_api_xxxxxxxxxxxxx"
```

## API Basics

Linear uses a single GraphQL endpoint. All requests are POST:

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ viewer { id name email } }"}'
```

## Common Operations

**Search issues (filter by team, status, assignee, etc.):**

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query($filter: IssueFilter) { issues(filter: $filter, first: 20, orderBy: updatedAt) { nodes { id identifier title state { name } assignee { name } priority priorityLabel labels { nodes { name } } updatedAt createdAt } } }",
    "variables": {
      "filter": {
        "team": {"key": {"eq": "ENG"}},
        "state": {"name": {"nin": ["Done", "Canceled"]}}
      }
    }
  }'
```

**Get a specific issue by identifier:**

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query($id: String!) { issue(id: $id) { id identifier title description state { name } assignee { name } priority priorityLabel labels { nodes { name } } project { name } cycle { name number } comments { nodes { body user { name } createdAt } } createdAt updatedAt } }",
    "variables": {"id": "ENG-123"}
  }'
```

**Create an issue:**

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title url } } }",
    "variables": {
      "input": {
        "teamId": "team-uuid-here",
        "title": "Bug: checkout page crashes on mobile",
        "description": "Detailed description in markdown",
        "priority": 2,
        "labelIds": ["label-uuid"]
      }
    }
  }'
```

**Get teams:**

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ teams { nodes { id key name } } }"}'
```

**Get active cycle for a team:**

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query($teamId: String!) { team(id: $teamId) { activeCycle { id name number startsAt endsAt progress issues { nodes { id identifier title state { name } assignee { name } priority priorityLabel } } } } }",
    "variables": {"teamId": "team-uuid-here"}
  }'
```

**Get projects:**

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ projects(first: 20, orderBy: updatedAt) { nodes { id name state progress { scope completed } lead { name } startDate targetDate teams { nodes { key } } } } }"}'
```

**Update an issue:**

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id identifier title state { name } } } }",
    "variables": {
      "id": "issue-uuid-here",
      "input": {
        "title": "Updated title",
        "priority": 1,
        "stateId": "state-uuid-for-done"
      }
    }
  }'
```

**Add a comment to an issue:**

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success comment { id body } } }",
    "variables": {
      "input": {
        "issueId": "issue-uuid-here",
        "body": "Comment from Clawd PM in markdown"
      }
    }
  }'
```

**Get recent activity (issues updated in last 7 days):**

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query($after: DateTime!) { issues(filter: {updatedAt: {gte: $after}}, first: 50, orderBy: updatedAt) { nodes { id identifier title state { name } assignee { name } priority priorityLabel updatedAt } } }",
    "variables": {"after": "2026-02-11T00:00:00Z"}
  }'
```

**Search issues by text:**

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "query($term: String!) { searchIssues(term: $term, first: 10) { nodes { id identifier title state { name } assignee { name } } } }", "variables": {"term": "checkout redesign"}}'
```

**Get workflow states for a team:**

```bash
curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query($teamId: String!) { team(id: $teamId) { states { nodes { id name type position } } } }",
    "variables": {"teamId": "team-uuid-here"}
  }'
```

## Issue Filters

The `IssueFilter` object supports these fields:

- `team`: `{key: {eq: "ENG"}}` or `{name: {contains: "Engineering"}}`
- `state`: `{name: {eq: "In Progress"}}` or `{type: {eq: "started"}}`
- `assignee`: `{name: {eq: "John"}}` or `{isMe: {eq: true}}`
- `priority`: `{lte: 2}` (1=Urgent, 2=High, 3=Medium, 4=Low, 0=No priority)
- `labels`: `{name: {eq: "bug"}}`
- `project`: `{name: {contains: "Checkout"}}`
- `cycle`: `{isActive: {eq: true}}`
- `createdAt`/`updatedAt`: `{gte: "2026-01-01T00:00:00Z"}`
- Combine filters with `and`, `or` arrays

## State Types

Linear workflow states have a `type` field:
- `backlog` — Not yet planned
- `unstarted` — Planned but not started
- `started` — In progress
- `completed` — Done
- `canceled` — Won't do

## Priority Levels

- `0` — No priority
- `1` — Urgent
- `2` — High
- `3` — Medium
- `4` — Low

## Notes

- Linear uses UUIDs for IDs internally, but issues have human-readable identifiers like `ENG-123`
- You can look up issues by identifier using the `issue(id: "ENG-123")` query
- Description and comments use markdown
- Rate limit: 1,500 requests per hour per API key
- Pagination: use `first`, `after` (cursor), `last`, `before` params
- Use `orderBy` param: `updatedAt`, `createdAt`, `priority`
- The `viewer` query returns the authenticated user's info
