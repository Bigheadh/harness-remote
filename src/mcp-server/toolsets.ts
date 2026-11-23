/**
 * MCP Toolset categorization and filtering.
 *
 * Allows callers to expose only the tool groups needed for their session
 * (e.g. `core` = 21 essential inbox tools instead of all 161 tools),
 * dramatically reducing LLM context token overhead and improving tool-selection accuracy.
 */

export type McpToolset =
  | "core"
  | "tasks_extended"
  | "planning"
  | "sla"
  | "analytics"
  | "admin"
  | "all";

export const VALID_MCP_TOOLSETS: readonly McpToolset[] = [
  "core",
  "tasks_extended",
  "planning",
  "sla",
  "analytics",
  "admin",
  "all",
] as const;

export const MCP_TOOLSET_TOOLS: Record<Exclude<McpToolset, "all">, readonly string[]> = {
  core: [
    "list_tasks",
    "search_tasks",
    "get_task",
    "create_task",
    "update_task",
    "mark_task_running",
    "report_task_result",
    "reply_feishu",
    "update_task_card",
    "download_attachment",
    "add_task_comment",
    "list_task_comments",
    "manage_task_tags",
    "list_all_tags",
    "set_task_priority",
    "set_task_due_date",
    "set_task_description",
    "assign_task",
    "unassign_task",
    "list_ready_tasks",
    "list_overdue_tasks",
  ],
  tasks_extended: [
    "delete_task_comment",
    "add_task_note",
    "list_task_notes",
    "delete_task_note",
    "add_task_link",
    "list_task_links",
    "remove_task_link",
    "create_subtask",
    "list_subtasks",
    "update_subtask_status",
    "report_subtask_result",
    "delete_subtask",
    "set_task_dependencies",
    "get_task_dependencies",
    "remove_task_dependency",
    "get_task_dependency_graph",
    "add_task_relationship",
    "remove_task_relationship",
    "list_task_relationships",
    "lock_task",
    "unlock_task",
    "check_task_lock",
    "watch_task",
    "unwatch_task",
    "list_task_watchers",
    "clone_task",
    "retry_task",
    "reopen_task",
    "pin_task",
    "unpin_task",
    "archive_task",
    "unarchive_task",
    "list_archived_tasks",
    "forward_task",
    "set_task_reminder",
    "set_task_estimated_minutes",
    "set_task_command_text",
    "list_user_tasks",
    "escalate_overdue_priorities",
    "bulk_update_status",
    "bulk_assign_tasks",
    "bulk_delete_tasks",
    "bulk_update_priority",
    "bulk_update_due_date",
    "bulk_clone_tasks",
    "bulk_archive_tasks",
    "bulk_unarchive_tasks",
    "log_time_entry",
    "list_time_entries",
    "delete_time_entry",
    "start_time_tracking",
    "stop_time_tracking",
    "get_kanban_board",
    "get_task_activity",
    "get_global_activity",
    "create_saved_view",
    "list_saved_views",
    "get_saved_view",
    "update_saved_view",
    "delete_saved_view",
    "apply_saved_view",
  ],
  planning: [
    "create_cycle",
    "list_cycles",
    "get_cycle",
    "update_cycle",
    "delete_cycle",
    "add_task_to_cycle",
    "remove_task_from_cycle",
    "list_cycle_tasks",
    "get_cycle_progress",
    "create_module",
    "list_modules",
    "get_module",
    "update_module",
    "delete_module",
    "add_task_to_module",
    "remove_task_from_module",
    "list_module_tasks",
    "create_template",
    "list_templates",
    "get_template",
    "update_template",
    "delete_template",
    "create_task_from_template",
    "get_template_usage_stats",
    "create_scheduled_task",
    "list_scheduled_tasks",
    "get_scheduled_task",
    "update_scheduled_task",
    "delete_scheduled_task",
    "run_scheduled_task",
  ],
  sla: [
    "create_sla_policy",
    "list_sla_policies",
    "get_sla_policy",
    "update_sla_policy",
    "delete_sla_policy",
    "get_sla_summary",
    "list_sla_breaches",
    "check_sla_breaches",
    "get_task_sla_status",
  ],
  analytics: [
    "get_task_stats_summary",
    "get_task_timeseries",
    "get_processing_stats",
    "get_time_tracking_stats",
    "get_user_stats",
    "export_tasks",
    "export_tasks_csv",
    "import_tasks",
    "import_tasks_csv",
    "get_api_usage",
    "get_api_usage_entries",
  ],
  admin: [
    "create_user",
    "list_users",
    "get_user",
    "update_user_role",
    "delete_user",
    "regenerate_user_token",
    "create_api_key",
    "list_api_keys",
    "get_api_key",
    "rotate_api_key",
    "revoke_api_key",
    "enable_api_key",
    "disable_api_key",
    "cleanup_expired_api_keys",
    "register_device",
    "list_devices",
    "get_device",
    "delete_device",
    "create_webhook",
    "list_webhooks",
    "get_webhook",
    "update_webhook",
    "delete_webhook",
    "list_webhook_deliveries",
    "query_audit_log",
    "audit_count",
    "cleanup_audit_log",
    "reset_stale_tasks",
    "cleanup_processed_events",
  ],
};

const TOOL_TO_TOOLSET = new Map<string, Exclude<McpToolset, "all">>();
for (const [group, tools] of Object.entries(MCP_TOOLSET_TOOLS) as Array<
  [Exclude<McpToolset, "all">, readonly string[]]
>) {
  for (const name of tools) {
    TOOL_TO_TOOLSET.set(name, group);
  }
}

/**
 * Look up the toolset group for a given MCP tool name.
 * Defaults to "tasks_extended" for any newly added uncategorized tool.
 */
export function getToolsetForTool(toolName: string): Exclude<McpToolset, "all"> {
  return TOOL_TO_TOOLSET.get(toolName) ?? "tasks_extended";
}

/**
 * Parse a comma-separated string or string array into validated McpToolset entries.
 */
export function parseToolsets(input: string | string[] | undefined): McpToolset[] | undefined {
  if (!input) return undefined;
  const rawList = Array.isArray(input)
    ? input
    : input
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

  if (rawList.length === 0) return undefined;

  const validSet = new Set<string>(VALID_MCP_TOOLSETS);
  const result: McpToolset[] = [];
  for (const item of rawList) {
    const normalized = item.toLowerCase();
    if (!validSet.has(normalized)) {
      throw new Error(
        `Invalid MCP toolset '${item}'. Valid toolsets: ${VALID_MCP_TOOLSETS.join(", ")}`,
      );
    }
    if (!result.includes(normalized as McpToolset)) {
      result.push(normalized as McpToolset);
    }
  }
  return result;
}

/**
 * Determine whether a tool should be registered given the configured toolsets.
 */
export function shouldRegisterTool(
  toolName: string,
  enabledToolsets?: readonly McpToolset[],
): boolean {
  if (!enabledToolsets || enabledToolsets.length === 0 || enabledToolsets.includes("all")) {
    return true;
  }
  const group = getToolsetForTool(toolName);
  return enabledToolsets.includes(group);
}
