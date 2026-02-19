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
}
