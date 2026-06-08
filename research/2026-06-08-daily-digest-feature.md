# Research: 2026-06-08 - Daily Digest Feature

## Search Direction
Task management UX patterns — what do popular open-source project management tools offer for quick task overview?

## Reference Projects Analyzed
- **Linear**: Offers "My Tasks" view with filters, but no explicit "digest" command. The inbox concept serves a similar purpose.
- **Plane**: Has a "My Issues" view and notification center, but no daily digest.
- **Huly**: Calendar view + daily plan feature that shows tasks due today.
- **ClickUp**: Has a "Daily Recap" notification that summarizes completed/incomplete tasks.
- **Notion**: No built-in digest, but users create custom database views with formulas.

## Feature Decision
Implemented `/digest` slash command for Feishu bot — a single-command task summary card.

### Why This Feature?
1. **Gap identified**: After 71 phases, the project had no single-command way to get a task overview. Users needed `/stats` + `/overdue` + `/mine` (3 commands).
2. **High user value**: Digest is the kind of feature users interact with daily. It's the "morning coffee" of task management.
3. **Low implementation complexity**: No new store methods, routes, or MCP tools needed — just composing existing store calls into a rich card.
4. **Consistent with project philosophy**: The project is a Feishu bot, so slash commands are the natural interaction pattern.

### Implementation Approach
- Reused existing store methods: `listTasksByUser()`, `listOverdueTasks()`
- Filtered tasks client-side into categories (pending, in-progress, overdue, due-today, done-today)
- Built a rich Feishu card with sections for each category
- Added visual urgency: red header when overdue tasks exist
- Added empty state for when user has no tasks

### Trade-offs
- **No persistent digest config**: The digest shows all active tasks for the user. A future enhancement could add per-user digest preferences (time, filters, frequency).
- **No scheduled digest**: Currently on-demand only (`/digest`). A future phase could add automatic daily digest via the scheduler.
- **Client-side filtering**: Uses `listTasksByUser(limit=50)` then filters in memory. For users with many tasks, a dedicated store query would be more efficient.

## Next Research Directions
1. **Scheduled digest**: Auto-send `/digest` at a configured time (e.g., 9am daily)
2. **Digest preferences**: Per-user config for what sections to show, time window, etc.
3. **Task snooze/dismiss**: Allow users to temporarily hide tasks from their view
