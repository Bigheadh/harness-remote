# Phase 70: Modules (Epics) + Template Variables

## Date
2026-06-08

## Summary
Added Module/Epic support to group tasks into logical units (e.g., "Auth System", "Payment Flow"), plus template variable substitution for reusable task templates.

## Files Modified

### src/shared/types.ts
- **Added**: `ModuleStatus` type (`"planned" | "active" | "completed" | "archived"`)
- **Added**: `Module` interface (id, name, description, status, startDate, endDate, targetCompletionPercent, createdBy, timestamps)
- **Added**: `ModuleWithProgress` interface (extends Module with totalTasks, completedTasks, completionPercent)
- **Added**: `moduleId?: string` field to `Task` interface
- **Added**: `variables?: Record<string, string>` field to `TaskTemplate` interface

### src/server/tasks/store.ts
- **Added**: DB migration for `modules` table (id, name, description, status, start_date, end_date, target_completion_percent, created_by, created_at, updated_at)
- **Added**: DB migration for `module_id` column on tasks table
- **Added**: DB index `idx_tasks_module_id` on tasks(module_id)
- **Added**: `rowToModule()` helper function
- **Added**: `applyTemplateVariables()` helper for `{var_name}` substitution
- **Updated**: `rowToTask()` to include moduleId
- **Updated**: `rowToTemplate()` to parse JSON variables field
- **Added**: 8 store methods: createModule, listModules, getModule, updateModule, deleteModule, addTaskToModule, removeTaskFromModule, listModuleTasks
- **Updated**: TaskStore interface with module method declarations
- **Updated**: Task insert statement to include module_id column
- **Updated**: Template store methods to accept/update variables field

### src/server/tasks/routes.ts
- **Added**: 8 API routes for module management:
  - `GET /api/modules` — list modules with optional status filter
  - `GET /api/modules/:id` — get module with progress
  - `POST /api/modules` — create module (requires tasks.write)
  - `PUT /api/modules/:id` — update module (requires tasks.write)
  - `DELETE /api/modules/:id` — delete module (requires tasks.write)
  - `POST /api/modules/:id/tasks` — add task to module
  - `DELETE /api/modules/:id/tasks/:taskId` — remove task from module
  - `GET /api/modules/:id/tasks` — list tasks in module
- **Updated**: Template routes to pass through variables field
- **Updated**: createTaskFromTemplate route with variable substitution logic

### src/mcp-server/client.ts
- **Added**: 8 client interface methods for modules
- **Added**: 8 client implementation methods with HTTP fetch calls
- **Updated**: createTemplate and createTaskFromTemplate to accept variables parameter

### src/mcp-server/tools.ts
- **Added**: 8 MCP tools: list_modules, get_module, create_module, update_module, delete_module, add_task_to_module, remove_task_from_module, list_module_tasks
- **Updated**: create_template tool to accept variables parameter
- **Updated**: update_template tool to accept variables parameter
- **Updated**: create_task_from_template tool to accept variables parameter

### test/mcp-server/tools.test.ts
- **Added**: 8 mock client methods for module operations
- **Added**: 17 new test cases for module tools (registration, success, error cases)
- **Updated**: Tool count assertion from 142 to 150

### FEATURES.md
- **Added**: Phase 70 section documenting all module and template variable features

## Risk Assessment
- **Low risk**: All new features are additive (no existing behavior changed)
- **DB migration**: New tables/columns only, no destructive changes
- **Template variables**: Substitution is opt-in (only applies when variables are provided)
- **Auth**: Module routes use existing auth middleware (tasks.read/tasks.write permissions)

## Verification Steps
1. ✅ `npm run typecheck` — passes
2. ✅ `npm run build` — passes
3. ✅ `npm test` — 528 tests pass (17 new)
4. ✅ Tool count verified: 150 registered tools
