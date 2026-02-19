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
import {
  createPostHogQueryTool,
  createPostHogListInsightsTool,
  createPostHogGetInsightTool,
  createPostHogListFeatureFlagsTool,
  createPostHogGetFeatureFlagTool,
} from "./src/posthog.js";
import {
  createIntercomSearchConversationsTool,
  createIntercomGetConversationTool,
  createIntercomListConversationsTool,
  createIntercomSearchContactsTool,
} from "./src/intercom.js";
import {
  createAmplitudeGetActiveUsersTool,
  createAmplitudeGetChartTool,
  createAmplitudeListCohortsTool,
  createAmplitudeGetSessionLengthTool,
  createAmplitudeEventSegmentationTool,
  createAmplitudeUserSearchTool,
} from "./src/amplitude.js";
import {
  createAsanaSearchTasksTool,
  createAsanaGetTaskTool,
  createAsanaCreateTaskTool,
  createAsanaListProjectsTool,
  createAsanaGetProjectTool,
  createAsanaAddCommentTool,
} from "./src/asana.js";

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

  // PostHog tools — only register if API key and project ID are configured
  if (process.env.POSTHOG_API_KEY && process.env.POSTHOG_PROJECT_ID) {
    api.registerTool(createPostHogQueryTool() as AnyAgentTool, { optional: true });
    api.registerTool(createPostHogListInsightsTool() as AnyAgentTool, { optional: true });
    api.registerTool(createPostHogGetInsightTool() as AnyAgentTool, { optional: true });
    api.registerTool(createPostHogListFeatureFlagsTool() as AnyAgentTool, { optional: true });
    api.registerTool(createPostHogGetFeatureFlagTool() as AnyAgentTool, { optional: true });
    api.logger?.info?.("Clawd PM: PostHog tools registered");
  }

  // Intercom tools — only register if token is configured
  if (process.env.INTERCOM_TOKEN) {
    api.registerTool(createIntercomSearchConversationsTool() as AnyAgentTool, { optional: true });
    api.registerTool(createIntercomGetConversationTool() as AnyAgentTool, { optional: true });
    api.registerTool(createIntercomListConversationsTool() as AnyAgentTool, { optional: true });
    api.registerTool(createIntercomSearchContactsTool() as AnyAgentTool, { optional: true });
    api.logger?.info?.("Clawd PM: Intercom tools registered");
  }

  // Amplitude tools — only register if credentials are configured
  if (process.env.AMPLITUDE_API_KEY && process.env.AMPLITUDE_SECRET_KEY) {
    api.registerTool(createAmplitudeGetActiveUsersTool() as AnyAgentTool, { optional: true });
    api.registerTool(createAmplitudeGetChartTool() as AnyAgentTool, { optional: true });
    api.registerTool(createAmplitudeListCohortsTool() as AnyAgentTool, { optional: true });
    api.registerTool(createAmplitudeGetSessionLengthTool() as AnyAgentTool, { optional: true });
    api.registerTool(createAmplitudeEventSegmentationTool() as AnyAgentTool, { optional: true });
    api.registerTool(createAmplitudeUserSearchTool() as AnyAgentTool, { optional: true });
    api.logger?.info?.("Clawd PM: Amplitude tools registered");
  }

  // Asana tools — only register if credentials are configured
  if (process.env.ASANA_TOKEN && process.env.ASANA_WORKSPACE_GID) {
    api.registerTool(createAsanaSearchTasksTool() as AnyAgentTool, { optional: true });
    api.registerTool(createAsanaGetTaskTool() as AnyAgentTool, { optional: true });
    api.registerTool(createAsanaCreateTaskTool() as AnyAgentTool, { optional: true });
    api.registerTool(createAsanaListProjectsTool() as AnyAgentTool, { optional: true });
    api.registerTool(createAsanaGetProjectTool() as AnyAgentTool, { optional: true });
    api.registerTool(createAsanaAddCommentTool() as AnyAgentTool, { optional: true });
    api.logger?.info?.("Clawd PM: Asana tools registered");
  }
}
