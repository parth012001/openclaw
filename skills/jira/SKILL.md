---
name: jira
description: Jira Cloud API for searching tickets, managing sprints, creating issues, and tracking project status.
homepage: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
metadata:
  {
    "openclaw":
      {
        "emoji": "🎫",
        "requires": { "env": ["JIRA_API_TOKEN", "JIRA_EMAIL", "JIRA_SITE"] },
        "primaryEnv": "JIRA_API_TOKEN",
      },
  }
---

# jira

Use the Jira Cloud REST API to search issues, manage sprints, create tickets, and track project status.

## Setup

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token", give it a name (e.g. "clawd-pm")
3. Copy the token
4. Set these environment variables:

```bash
export JIRA_EMAIL="you@company.com"
export JIRA_API_TOKEN="your-api-token"
export JIRA_SITE="yourteam"  # just the subdomain, not the full URL
```

## API Basics

All requests use Basic Auth (base64 of email:token):

```bash
AUTH=$(echo -n "$JIRA_EMAIL:$JIRA_API_TOKEN" | base64)
curl -s "https://$JIRA_SITE.atlassian.net/rest/api/3/..." \
  -H "Authorization: Basic $AUTH" \
  -H "Content-Type: application/json"
```

## Common Operations

**Search issues with JQL:**

```bash
AUTH=$(echo -n "$JIRA_EMAIL:$JIRA_API_TOKEN" | base64)
curl -s -G "https://$JIRA_SITE.atlassian.net/rest/api/3/search" \
  --data-urlencode "jql=project = PROJ AND status = 'In Progress'" \
  --data-urlencode "fields=summary,status,assignee,priority,updated,sprint" \
  --data-urlencode "maxResults=20" \
  -H "Authorization: Basic $AUTH"
```

**Get a specific issue:**

```bash
AUTH=$(echo -n "$JIRA_EMAIL:$JIRA_API_TOKEN" | base64)
curl -s "https://$JIRA_SITE.atlassian.net/rest/api/3/issue/PROJ-123" \
  -H "Authorization: Basic $AUTH"
```

**Create an issue:**

```bash
AUTH=$(echo -n "$JIRA_EMAIL:$JIRA_API_TOKEN" | base64)
curl -s -X POST "https://$JIRA_SITE.atlassian.net/rest/api/3/issue" \
  -H "Authorization: Basic $AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "project": {"key": "PROJ"},
      "summary": "Bug: checkout page crashes on mobile",
      "description": {
        "type": "doc",
        "version": 1,
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Detailed description here"}]}]
      },
      "issuetype": {"name": "Bug"},
      "priority": {"name": "High"},
      "assignee": {"accountId": "user-account-id"}
    }
  }'
```

**Get active sprint for a board:**

```bash
AUTH=$(echo -n "$JIRA_EMAIL:$JIRA_API_TOKEN" | base64)
# First, find boards
curl -s "https://$JIRA_SITE.atlassian.net/rest/agile/1.0/board" \
  -H "Authorization: Basic $AUTH"

# Then get active sprint
curl -s "https://$JIRA_SITE.atlassian.net/rest/agile/1.0/board/{boardId}/sprint?state=active" \
  -H "Authorization: Basic $AUTH"

# Get issues in a sprint
curl -s "https://$JIRA_SITE.atlassian.net/rest/agile/1.0/sprint/{sprintId}/issue" \
  -H "Authorization: Basic $AUTH"
```

**Update an issue:**

```bash
AUTH=$(echo -n "$JIRA_EMAIL:$JIRA_API_TOKEN" | base64)
curl -s -X PUT "https://$JIRA_SITE.atlassian.net/rest/api/3/issue/PROJ-123" \
  -H "Authorization: Basic $AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "summary": "Updated title",
      "priority": {"name": "Critical"}
    }
  }'
```

**Transition an issue (change status):**

```bash
AUTH=$(echo -n "$JIRA_EMAIL:$JIRA_API_TOKEN" | base64)
# First get available transitions
curl -s "https://$JIRA_SITE.atlassian.net/rest/api/3/issue/PROJ-123/transitions" \
  -H "Authorization: Basic $AUTH"

# Then transition
curl -s -X POST "https://$JIRA_SITE.atlassian.net/rest/api/3/issue/PROJ-123/transitions" \
  -H "Authorization: Basic $AUTH" \
  -H "Content-Type: application/json" \
  -d '{"transition": {"id": "31"}}'
```

**Add a comment:**

```bash
AUTH=$(echo -n "$JIRA_EMAIL:$JIRA_API_TOKEN" | base64)
curl -s -X POST "https://$JIRA_SITE.atlassian.net/rest/api/3/issue/PROJ-123/comment" \
  -H "Authorization: Basic $AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "body": {
      "type": "doc",
      "version": 1,
      "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Comment from Clawd PM"}]}]
    }
  }'
```

**Get project info:**

```bash
AUTH=$(echo -n "$JIRA_EMAIL:$JIRA_API_TOKEN" | base64)
curl -s "https://$JIRA_SITE.atlassian.net/rest/api/3/project" \
  -H "Authorization: Basic $AUTH"
```

**Get recent activity (issues updated recently):**

```bash
AUTH=$(echo -n "$JIRA_EMAIL:$JIRA_API_TOKEN" | base64)
curl -s -G "https://$JIRA_SITE.atlassian.net/rest/api/3/search" \
  --data-urlencode "jql=updated >= -7d ORDER BY updated DESC" \
  --data-urlencode "fields=summary,status,assignee,updated,priority" \
  --data-urlencode "maxResults=50" \
  -H "Authorization: Basic $AUTH"
```

## Useful JQL Queries

- Issues completed this week: `status changed to "Done" after startOfWeek()`
- My open issues: `assignee = currentUser() AND status != Done`
- Blockers: `priority = Blocker AND status != Done`
- Sprint issues: `sprint in openSprints()`
- Recently created: `created >= -7d ORDER BY created DESC`
- Unassigned: `assignee is EMPTY AND status != Done`
- Epics: `issuetype = Epic AND status != Done`
- Bugs by priority: `issuetype = Bug AND status != Done ORDER BY priority ASC`

## Description Format

Jira Cloud v3 uses Atlassian Document Format (ADF) for description and comments:

```json
{
  "type": "doc",
  "version": 1,
  "content": [
    {"type": "paragraph", "content": [{"type": "text", "text": "Plain text"}]},
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Heading"}]},
    {"type": "bulletList", "content": [
      {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Item 1"}]}]}
    ]}
  ]
}
```

## Notes

- Rate limit: ~10 requests/second per user
- Pagination: use `startAt` and `maxResults` params (default 50, max 100)
- The Agile API (`/rest/agile/1.0/`) is separate from the Platform API (`/rest/api/3/`)
- Account IDs (not usernames) are used for assignee/reporter fields
- Use `fields` param to limit response size — full issue responses are large
