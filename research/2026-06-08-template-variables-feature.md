# 2026-06-08 Research: Task Template Variables

## Research Direction: Task Management Tool Patterns

### Projects Reviewed
1. **cyanheads/atlas-mcp-server** (474⭐) - 3-node architecture (Project → Task + Knowledge)
2. **scopecraft/command** (174⭐) - Phase-based task organization, parent tasks, subtask sequencing
3. **milisp/codexia** (719⭐) - Agent Task Scheduler, headless web server, MCP marketplace
4. **dmmulroy/overseer** (222⭐) - Learnings bubble from subtasks to parents, VCS integration
5. **abhiz123/todoist-mcp-server** (392⭐) - Todoist integration for natural language tasks

### Key Patterns Found
- **Variable substitution in templates** (Todoist, many task managers) - Templates with {{variables}}
- **Learnings/notes cascading** (Overseer) - Subtask results bubble to parent
- **Phase-based organization** (Scopecraft) - Two-state workflow (current/archive)
- **Knowledge nodes** (ATLAS) - Attach documents/context to projects

### Feature Decision: Task Template Variables

**Rationale**: Templates currently have fixed `commandText`, `description`, `tags`. Adding `{{variable}}` substitution allows reusable templates like:
- Template: "Deploy {{repo_name}} to {{environment}} — branch {{branch}}"
- Variables: `{repo_name: "my-app", environment: "staging", branch: "feature/auth"}`
- Result: "Deploy my-app to staging — branch feature/auth"

This is high-value (🔴) because:
- Makes templates dramatically more reusable
- Common pattern in task management tools (Todoist, Asana, etc.)
- Low-medium implementation difficulty (3⭐)
- Follows existing layered architecture cleanly

### Implementation Plan
1. Shared types: Add `variables?: Record<string, string>` to TaskTemplate
2. Store: Add `variables` column to templates table, update parseTemplate
3. Store: Update createTaskFromTemplate to apply variable substitution
4. MCP client: Update createTaskFromTemplate to accept variables
5. MCP tool: Add `variables` input to create_task_from_template
6. Dashboard: Show variables in template cards
7. Tests: Store + MCP tool tests
