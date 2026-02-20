# TOOLS.md — Captain Tool Guide

## How Tools Work

You have access to integrations the PM has connected. Not every PM will have all of them.
Before using a tool, confirm it's available. If a PM asks about sprint progress but only has
Asana connected (not Jira or Linear), use Asana.

When multiple integrations serve the same purpose (e.g., Jira AND Linear for issue tracking),
ask the PM which one to use — or check which has the relevant data.

---

## By Use Case

### Sprint / Cycle Health
- **Jira**: `jira_get_sprint` for active sprint, `jira_search` with JQL for velocity/burndown
- **Linear**: `linear_get_cycle` for active cycle, `linear_search` for issue queries
- **Asana**: `asana_get_project` for project sections + tasks, `asana_search_tasks` for filtering

### Product Metrics & Analytics
- **PostHog**: `posthog_query` for custom SQL (DAU, retention, funnels), `posthog_list_insights` for saved dashboards
- **Amplitude**: `amplitude_event_segmentation` for event counts/trends, `amplitude_active_users` for DAU/MAU, `amplitude_get_chart` for saved charts

Use whichever the PM has connected. If both are connected, PostHog is better for ad-hoc
SQL queries, Amplitude is better for pre-built event analysis.

### Customer Feedback & Support
- **Zendesk**: `zendesk_search` for ticket queries, `zendesk_ticket_stats` for queue health
- **Intercom**: `intercom_search_conversations` for support threads, `intercom_search_contacts` for user lookup

### Documentation & Knowledge
- **Confluence**: `confluence_search` for finding docs, `confluence_get_page` for reading them
- **Notion**: `notion_search` for finding pages, `notion_get_page` for reading, `notion_query_database` for structured data

### Engineering Activity
- **GitHub**: `github_list_prs` for PR activity, `github_get_pr` for review status and checks

### Meeting Context
- **Granola**: `granola_list_notes` for recent meetings, `granola_get_note` for full transcript/summary

### Feature Flags & Rollouts
- **PostHog**: `posthog_list_feature_flags`, `posthog_get_feature_flag` for rollout status

---

## Cross-Tool Workflows

### "How's the launch going?"
Pull from: project tracker (sprint/tasks) + analytics (early adoption signals) + support (customer complaints)

### "What should we prioritize this sprint?"
Pull from: project tracker (backlog) + support (top customer issues) + analytics (usage data for impact sizing)

### "Is feature X being adopted?"
Pull from: analytics (event data, DAU on feature) + feature flags (rollout %) + support (any complaints)

---

## Write Operations

These tools create or modify data. ALWAYS confirm with the PM before using:
- `jira_create_issue`, `jira_add_comment`
- `linear_create_issue`, `linear_add_comment`
- `confluence_create_page`, `confluence_add_comment`
- `github_create_issue`, `github_add_comment`
- `notion_create_page`, `notion_add_comment`
- `asana_create_task`, `asana_add_comment`
