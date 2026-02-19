import type { AnyAgentTool, OpenClawPluginApi } from "../../src/plugins/types.js";
import {
  createJiraSearchTool,
  createJiraGetIssueTool,
  createJiraCreateIssueTool,
  createJiraGetSprintTool,
  createJiraAddCommentTool,
} from "./src/jira.js";
import {
  createLinearSearchTool,
  createLinearGetIssueTool,
  createLinearCreateIssueTool,
  createLinearGetTeamsTool,
  createLinearGetCycleTool,
  createLinearGetProjectsTool,
  createLinearAddCommentTool,
} from "./src/linear.js";
import {
  createConfluenceSearchTool,
  createConfluenceGetPageTool,
  createConfluenceGetSpacesTool,
  createConfluenceCreatePageTool,
  createConfluenceAddCommentTool,
} from "./src/confluence.js";
import {
  createGitHubListPRsTool,
  createGitHubGetPRTool,
  createGitHubListReposTool,
  createGitHubListIssuesTool,
  createGitHubCreateIssueTool,
  createGitHubAddCommentTool,
} from "./src/github.js";
import {
  createNotionSearchTool,
  createNotionGetPageTool,
  createNotionCreatePageTool,
  createNotionAddCommentTool,
  createNotionQueryDatabaseTool,
} from "./src/notion.js";
import {
  createGranolaListNotesTool,
  createGranolaGetNoteTool,
} from "./src/granola.js";
import {
  createZendeskSearchTool,
  createZendeskGetTicketTool,
  createZendeskGetRecentTicketsTool,
  createZendeskGetTicketStatsTool,
} from "./src/zendesk.js";

export default function register(api: OpenClawPluginApi) {
  // Jira tools — only register if credentials are configured
  if (process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN && process.env.JIRA_SITE) {
    api.registerTool(createJiraSearchTool() as AnyAgentTool, { optional: true });
    api.registerTool(createJiraGetIssueTool() as AnyAgentTool, { optional: true });
    api.registerTool(createJiraCreateIssueTool() as AnyAgentTool, { optional: true });
    api.registerTool(createJiraGetSprintTool() as AnyAgentTool, { optional: true });
    api.registerTool(createJiraAddCommentTool() as AnyAgentTool, { optional: true });
    api.registerTool(createConfluenceSearchTool() as AnyAgentTool, { optional: true });
    api.registerTool(createConfluenceGetPageTool() as AnyAgentTool, { optional: true });
    api.registerTool(createConfluenceGetSpacesTool() as AnyAgentTool, { optional: true });
    api.registerTool(createConfluenceCreatePageTool() as AnyAgentTool, { optional: true });
    api.registerTool(createConfluenceAddCommentTool() as AnyAgentTool, { optional: true });
    api.logger?.info?.("Clawd PM: Jira + Confluence tools registered");
  }

  // Linear tools — only register if credentials are configured
  if (process.env.LINEAR_API_KEY) {
    api.registerTool(createLinearSearchTool() as AnyAgentTool, { optional: true });
    api.registerTool(createLinearGetIssueTool() as AnyAgentTool, { optional: true });
    api.registerTool(createLinearCreateIssueTool() as AnyAgentTool, { optional: true });
    api.registerTool(createLinearGetTeamsTool() as AnyAgentTool, { optional: true });
    api.registerTool(createLinearGetCycleTool() as AnyAgentTool, { optional: true });
    api.registerTool(createLinearGetProjectsTool() as AnyAgentTool, { optional: true });
    api.registerTool(createLinearAddCommentTool() as AnyAgentTool, { optional: true });
    api.logger?.info?.("Clawd PM: Linear tools registered");
  }

  // GitHub tools — only register if token is configured
  if (process.env.GITHUB_TOKEN) {
    api.registerTool(createGitHubListPRsTool() as AnyAgentTool, { optional: true });
    api.registerTool(createGitHubGetPRTool() as AnyAgentTool, { optional: true });
    api.registerTool(createGitHubListReposTool() as AnyAgentTool, { optional: true });
    api.registerTool(createGitHubListIssuesTool() as AnyAgentTool, { optional: true });
    api.registerTool(createGitHubCreateIssueTool() as AnyAgentTool, { optional: true });
    api.registerTool(createGitHubAddCommentTool() as AnyAgentTool, { optional: true });
    api.logger?.info?.("Clawd PM: GitHub tools registered");
  }

  // Notion tools — only register if token is configured
  if (process.env.NOTION_TOKEN) {
    api.registerTool(createNotionSearchTool() as AnyAgentTool, { optional: true });
    api.registerTool(createNotionGetPageTool() as AnyAgentTool, { optional: true });
    api.registerTool(createNotionCreatePageTool() as AnyAgentTool, { optional: true });
    api.registerTool(createNotionAddCommentTool() as AnyAgentTool, { optional: true });
    api.registerTool(createNotionQueryDatabaseTool() as AnyAgentTool, { optional: true });
    api.logger?.info?.("Clawd PM: Notion tools registered");
  }

  // Granola tools — only register if API key is configured
  if (process.env.GRANOLA_API_KEY) {
    api.registerTool(createGranolaListNotesTool() as AnyAgentTool, { optional: true });
    api.registerTool(createGranolaGetNoteTool() as AnyAgentTool, { optional: true });
    api.logger?.info?.("Clawd PM: Granola tools registered");
  }

  // Zendesk tools — only register if credentials are configured
  if (process.env.ZENDESK_EMAIL && process.env.ZENDESK_API_TOKEN && process.env.ZENDESK_SUBDOMAIN) {
    api.registerTool(createZendeskSearchTool() as AnyAgentTool, { optional: true });
    api.registerTool(createZendeskGetTicketTool() as AnyAgentTool, { optional: true });
    api.registerTool(createZendeskGetRecentTicketsTool() as AnyAgentTool, { optional: true });
    api.registerTool(createZendeskGetTicketStatsTool() as AnyAgentTool, { optional: true });
    api.logger?.info?.("Clawd PM: Zendesk tools registered");
  }
}
