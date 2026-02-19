import { Type } from "@sinclair/typebox";

function getAsanaAuth(): { token: string; workspaceGid: string } {
  const token = process.env.ASANA_TOKEN;
  const workspaceGid = process.env.ASANA_WORKSPACE_GID;

  if (!token || !workspaceGid) {
    throw new Error(
      "Asana not configured. Set ASANA_TOKEN and ASANA_WORKSPACE_GID environment variables.",
    );
  }

  return { token, workspaceGid };
}

async function asanaFetch(path: string, options?: { method?: string; body?: unknown }): Promise<unknown> {
  const { token } = getAsanaAuth();

  const res = await fetch(`https://app.asana.com/api/1.0${path}`, {
    method: options?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Asana API error ${res.status}: ${res.statusText}. ${body.slice(0, 300)}`);
  }

  return await res.json();
}

function formatTask(t: Record<string, unknown>): Record<string, unknown> {
  const assignee = t.assignee as Record<string, unknown> | undefined;
  const memberships = t.memberships as Record<string, unknown>[] | undefined;

  return {
    gid: t.gid,
    name: t.name,
    completed: t.completed,
    assignee: assignee ? { gid: assignee.gid, name: assignee.name } : null,
    due_on: t.due_on,
    due_at: t.due_at,
    created_at: t.created_at,
    modified_at: t.modified_at,
    notes: ((t.notes as string) ?? "").slice(0, 2000),
    tags: (t.tags as Record<string, unknown>[])?.map((tag) => tag.name),
    projects: memberships?.map((m) => {
      const proj = m.project as Record<string, unknown> | undefined;
      const section = m.section as Record<string, unknown> | undefined;
      return { project: proj?.name, section: section?.name };
    }),
    permalink_url: t.permalink_url,
  };
}

export function createAsanaSearchTasksTool() {
  return {
    name: "asana_search_tasks",
    label: "Asana Search Tasks",
    description:
      "Search tasks in your Asana workspace. Use for questions like 'find tasks assigned to me', 'overdue tasks', 'tasks in project X', 'incomplete tasks tagged with bug'.",
    parameters: Type.Object({
      text: Type.Optional(
        Type.String({ description: "Search text in task names and descriptions" }),
      ),
      assignee: Type.Optional(
        Type.String({ description: 'Assignee GID, or "me" for the authenticated user' }),
      ),
      projectGid: Type.Optional(
        Type.String({ description: "Filter to tasks in a specific project (project GID)" }),
      ),
      completed: Type.Optional(
        Type.Boolean({ description: "Filter by completion status (true/false)" }),
      ),
      isSubtask: Type.Optional(
        Type.Boolean({ description: "Filter subtasks (true) or top-level tasks (false)" }),
      ),
      modifiedSince: Type.Optional(
        Type.String({ description: 'Filter tasks modified after this date, e.g. "2026-01-01T00:00:00Z"' }),
      ),
      limit: Type.Optional(
        Type.Number({ description: "Max results (default 25, max 100)", default: 25 }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const { workspaceGid } = getAsanaAuth();
      const limit = (params.limit as number) ?? 25;

      const queryParams = new URLSearchParams({
        limit: String(Math.min(limit, 100)),
        opt_fields: "name,completed,assignee.name,due_on,modified_at,permalink_url,tags.name,memberships.(project|section).name",
      });

      if (params.text) queryParams.set("text", params.text as string);
      if (params.assignee) queryParams.set("assignee.any", params.assignee as string);
      if (params.projectGid) queryParams.set("projects.any", params.projectGid as string);
      if (params.completed !== undefined) queryParams.set("completed", String(params.completed));
      if (params.isSubtask !== undefined) queryParams.set("is_subtask", String(params.isSubtask));
      if (params.modifiedSince) queryParams.set("modified_on.after", params.modifiedSince as string);

      const data = (await asanaFetch(
        `/workspaces/${workspaceGid}/tasks/search?${queryParams}`,
      )) as { data: Record<string, unknown>[] };

      const tasks = data.data.map(formatTask);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: tasks.length, tasks }, null, 2),
          },
        ],
      };
    },
  };
}

export function createAsanaGetTaskTool() {
  return {
    name: "asana_get_task",
    label: "Asana Get Task",
    description:
      "Get full details of a specific Asana task by GID, including description, subtasks, and stories (comments).",
    parameters: Type.Object({
      taskGid: Type.String({ description: "Task GID" }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const taskGid = params.taskGid as string;

      const [taskData, storiesData] = await Promise.all([
        asanaFetch(
          `/tasks/${taskGid}?opt_fields=name,completed,assignee.name,due_on,due_at,created_at,modified_at,notes,tags.name,memberships.(project|section).name,permalink_url,custom_fields.name,custom_fields.display_value`,
        ) as Promise<{ data: Record<string, unknown> }>,
        asanaFetch(
          `/tasks/${taskGid}/stories?opt_fields=text,type,created_by.name,created_at&limit=20`,
        ) as Promise<{ data: Record<string, unknown>[] }>,
      ]);

      const task = taskData.data;
      const comments = storiesData.data
        .filter((s) => s.type === "comment")
        .slice(0, 20)
        .map((s) => ({
          text: ((s.text as string) ?? "").slice(0, 1000),
          author: (s.created_by as Record<string, unknown>)?.name,
          created_at: s.created_at,
        }));

      const customFields = (task.custom_fields as Record<string, unknown>[])?.map((f) => ({
        name: f.name,
        value: f.display_value,
      }));

      const result = {
        ...formatTask(task),
        custom_fields: customFields,
        comments,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  };
}

export function createAsanaCreateTaskTool() {
  return {
    name: "asana_create_task",
    label: "Asana Create Task",
    description:
      "Create a new task in Asana. Can assign to a user, set due date, add to a project, and set description.",
    parameters: Type.Object({
      name: Type.String({ description: "Task name/title" }),
      notes: Type.Optional(Type.String({ description: "Task description (plain text)" })),
      assignee: Type.Optional(
        Type.String({ description: 'Assignee GID, or "me" for yourself' }),
      ),
      dueOn: Type.Optional(
        Type.String({ description: 'Due date in YYYY-MM-DD format, e.g. "2026-03-01"' }),
      ),
      projectGid: Type.Optional(
        Type.String({ description: "Project GID to add the task to" }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const { workspaceGid } = getAsanaAuth();

      const taskData: Record<string, unknown> = {
        name: params.name,
        workspace: workspaceGid,
      };

      if (params.notes) taskData.notes = params.notes;
      if (params.assignee) taskData.assignee = params.assignee;
      if (params.dueOn) taskData.due_on = params.dueOn;
      if (params.projectGid) taskData.projects = [params.projectGid];

      const data = (await asanaFetch("/tasks", {
        method: "POST",
        body: { data: taskData },
      })) as { data: Record<string, unknown> };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                task: {
                  gid: data.data.gid,
                  name: data.data.name,
                  permalink_url: data.data.permalink_url,
                },
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  };
}

export function createAsanaListProjectsTool() {
  return {
    name: "asana_list_projects",
    label: "Asana List Projects",
    description:
      "List projects in your Asana workspace. Use for questions like 'what projects do we have', 'show me active projects'.",
    parameters: Type.Object({
      archived: Type.Optional(
        Type.Boolean({ description: "Filter by archived status (default false)", default: false }),
      ),
      limit: Type.Optional(
        Type.Number({ description: "Max results (default 20)", default: 20 }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const { workspaceGid } = getAsanaAuth();
      const archived = (params.archived as boolean) ?? false;
      const limit = (params.limit as number) ?? 20;

      const queryParams = new URLSearchParams({
        workspace: workspaceGid,
        archived: String(archived),
        limit: String(Math.min(limit, 100)),
        opt_fields: "name,owner.name,created_at,modified_at,due_on,current_status_update.title,current_status_update.status_type,permalink_url,color",
      });

      const data = (await asanaFetch(`/projects?${queryParams}`)) as {
        data: Record<string, unknown>[];
      };

      const projects = data.data.map((p) => {
        const owner = p.owner as Record<string, unknown> | undefined;
        const status = p.current_status_update as Record<string, unknown> | undefined;
        return {
          gid: p.gid,
          name: p.name,
          owner: owner?.name,
          due_on: p.due_on,
          status: status?.status_type,
          status_title: status?.title,
          created_at: p.created_at,
          modified_at: p.modified_at,
          permalink_url: p.permalink_url,
        };
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: projects.length, projects }, null, 2),
          },
        ],
      };
    },
  };
}

export function createAsanaGetProjectTool() {
  return {
    name: "asana_get_project",
    label: "Asana Get Project",
    description:
      "Get details of a specific Asana project by GID, including its sections and recent tasks.",
    parameters: Type.Object({
      projectGid: Type.String({ description: "Project GID" }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const projectGid = params.projectGid as string;

      const [projectData, sectionsData, tasksData] = await Promise.all([
        asanaFetch(
          `/projects/${projectGid}?opt_fields=name,owner.name,notes,created_at,modified_at,due_on,current_status_update.title,current_status_update.status_type,permalink_url`,
        ) as Promise<{ data: Record<string, unknown> }>,
        asanaFetch(
          `/projects/${projectGid}/sections?opt_fields=name`,
        ) as Promise<{ data: Record<string, unknown>[] }>,
        asanaFetch(
          `/projects/${projectGid}/tasks?opt_fields=name,completed,assignee.name,due_on,modified_at&limit=30`,
        ) as Promise<{ data: Record<string, unknown>[] }>,
      ]);

      const project = projectData.data;
      const owner = project.owner as Record<string, unknown> | undefined;
      const status = project.current_status_update as Record<string, unknown> | undefined;

      const sections = sectionsData.data.map((s) => ({ gid: s.gid, name: s.name }));
      const tasks = tasksData.data.map((t) => {
        const assignee = t.assignee as Record<string, unknown> | undefined;
        return {
          gid: t.gid,
          name: t.name,
          completed: t.completed,
          assignee: assignee?.name,
          due_on: t.due_on,
        };
      });

      const result = {
        gid: project.gid,
        name: project.name,
        owner: owner?.name,
        notes: ((project.notes as string) ?? "").slice(0, 3000),
        due_on: project.due_on,
        status: status?.status_type,
        status_title: status?.title,
        created_at: project.created_at,
        modified_at: project.modified_at,
        permalink_url: project.permalink_url,
        sections,
        recent_tasks: tasks,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  };
}

export function createAsanaAddCommentTool() {
  return {
    name: "asana_add_comment",
    label: "Asana Add Comment",
    description:
      "Add a comment to an Asana task. The comment will be authored by the authenticated user.",
    parameters: Type.Object({
      taskGid: Type.String({ description: "Task GID to comment on" }),
      text: Type.String({ description: "Comment text (plain text)" }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const taskGid = params.taskGid as string;
      const text = params.text as string;

      const data = (await asanaFetch(`/tasks/${taskGid}/stories`, {
        method: "POST",
        body: { data: { text } },
      })) as { data: Record<string, unknown> };

      const story = data.data;
      const author = story.created_by as Record<string, unknown> | undefined;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                storyGid: story.gid,
                taskGid,
                author: author?.name,
                created_at: story.created_at,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  };
}
