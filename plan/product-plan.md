# Clawd PM — Product Plan

## One-Liner

A 24/7 AI PM copilot that lives in Slack, connected to every tool the PM team uses, and can be talked to naturally.

## The Problem (Hard Data)

From PM33 research across 1,200+ PMs:
- 31 hours/week on administrative busywork
- 6 hours/week on strategic thinking
- 3 hours/week on customer interaction

Top 5 time killers:
1. Status report compilation — 4.2 hrs/week
2. Manual data analysis — 6.1 hrs/week
3. Cross-tool data sync — 3.8 hrs/week
4. Repetitive stakeholder updates — 5.3 hrs/week
5. Manual priority rebalancing — 4.7 hrs/week

84% of PMs fear their products will fail (Atlassian State of Product 2026). Nearly half don't have enough time for strategic planning.

## Why Slack

All existing solutions require PMs to adopt a new tool:
- Cursor for PMs — PMs have to learn an IDE
- ChatPRD — single-purpose web app
- Plane AI — requires switching project management tools
- Copilot/ChatGPT — copy-paste workflow, no integrations

Our edge: zero adoption friction. PMs already live in Slack. The bot just shows up where they already work.

## The Product: Connected Brain, Not Predefined Skills

Not slash commands. Not rigid workflows. One always-on agent that knows everything about the team's product work and can be talked to naturally.

### How PMs Use It

```
@clawd what shipped this week?
@clawd what's blocking the checkout redesign?
@clawd draft a PRD for push notifications based on the thread in #product-ideas from Monday
@clawd what did we decide about the pricing page? check #pricing-v2
@clawd write me a stakeholder update for the exec meeting tomorrow
@clawd create a ticket for the bug Sarah mentioned in #eng-support yesterday
```

No predefined skills. The PM just talks to it and it figures out what to do — because it's connected to everything and has context.

## Architecture

### Layer 1: Connections (Integrations)

Each integration is a tool that OpenClaw's agent can call.

| Integration      | What it reads                          | API      |
|------------------|----------------------------------------|----------|
| Jira/Linear      | Tickets, sprints, status, assignees    | REST API |
| Confluence/Notion| Pages, docs, meeting notes             | REST API |
| Slack            | Channel history, threads, users        | OpenClaw |
| Google Calendar  | Meetings, attendees, time              | REST API |

### Layer 2: Agent Config

OpenClaw config with agent identity prompt: "You are a PM copilot. You have access to these tools. When someone asks you something, use the right tool to get the data and respond."

This is openclaw.json + agent identity/system prompt.

### Layer 3: Two Cron Jobs (Only Automations)

- 9am Daily Digest — pull Jira + Slack activity, post summary to #daily-standup
- 4pm Friday Weekly Wrap — aggregate the week, post to #product-updates

These prove "proactive" value. Everything else is reactive (PM asks, bot answers).

## Build Order

### Phase 1: Foundation (Day 1)
1. Set up OpenRouter with free model for testing
2. Build Jira/Linear integration (read tickets, sprints, create tickets)
3. Build Confluence/Notion integration (read pages, search docs)

### Phase 2: Wiring (Day 2)
4. Wire integrations as OpenClaw tools
5. Write the agent identity prompt
6. Test end-to-end: ask questions in Slack, verify it pulls right data

### Phase 3: Automation (Day 3)
7. Build daily digest cron job
8. Build weekly wrap cron job
9. Test with design partner PMs

### Phase 4: Quality (Day 4-5, when Anthropic credits arrive)
10. Switch to Claude, test response quality
11. Iterate based on what PMs actually ask for

## Design Partner Strategy

Give PMs the connected brain and watch what they ask. Their patterns become features.

The question to ask: "If you had an AI in Slack that could see your Jira, Confluence, and Slack history — what would you ask it?"

Their answers become the roadmap.

## Why This Approach Wins

- Build integrations, not opinions. Don't guess PM workflows — let PMs show you by usage.
- Every integration is reusable. Jira tool works for ticket creation, sprint queries, blocker detection, status reports — all from one integration.
- Design partners become product designers. They discover workflows by using it.
- It's defensible. Anyone can build a PRD writer. A Slack-native agent with deep integrations that learns from usage is a product.

## Competitive Landscape

| Competitor       | Friction                    | Our Edge                          |
|------------------|-----------------------------|-----------------------------------|
| Cursor for PMs   | PMs learn an IDE            | Zero new tools — it's Slack       |
| ChatPRD          | Single purpose, web app     | Multi-purpose, lives where work happens |
| Plane AI         | Switch project mgmt tools   | Works with existing Jira/Linear   |
| Copilot/ChatGPT  | Copy-paste workflow         | Direct integrations, proactive    |
| Productboard Pulse | Limited to feedback analysis | Full PM workflow coverage        |

## Pricing Model

$29/PM/month. A team of 5 PMs saving 10hrs/week each = 200hrs/month for $145. That's $0.73/hour of PM time saved.

## Market Validation

- Productboard just launched "Pulse AI Agent for Slack" (limited to feedback)
- LogRocket published "AI-powered Slack workflows for PMs who hate dashboards"
- Dennis Yang (Chime) went viral: "Cursor is a better PM than I ever was"
- The market is moving here right now. First mover with deep integrations wins.
