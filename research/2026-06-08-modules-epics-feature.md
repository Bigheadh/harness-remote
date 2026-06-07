# 2026-06-08: Modules (Epics) Feature Research

## Research Direction
Higher-level task grouping — inspired by Plane (50k+ stars) and Huly (26k+ stars).

## Gap Analysis
The project has cycles (sprints) for time-boxed work periods, but lacks a way to group
tasks into **logical units** like features, epics, or modules. In Plane, "Modules" let you
divide a project into smaller, manageable chunks (e.g., "Authentication", "Dashboard", "API").

Current state:
- Cycles: time-boxed sprints with start/end dates ✅
- Tags: flat labels for categorization ✅
- Dependencies: blocking relationships between tasks ✅
- **Modules/Epics: MISSING** — no way to group tasks by feature area

## Feature: Modules (Epics)
### What it provides
- Group tasks into logical modules (e.g., "Auth System", "Payment Flow", "UI Redesign")
- Each module has: name, description, status (planned/active/completed/archived), date range
- Tasks can belong to one module at a time
- Module progress tracking: total tasks, completed tasks, completion percentage
- Filter tasks by module
- MCP tools for AI agents to manage modules

### Implementation Plan
1. **Shared types**: `Module` interface, `ModuleStatus` type, `ModuleWithProgress` 
2. **Store layer**: DB table `modules`, CRUD methods, task-module linking
3. **API routes**: CRUD endpoints + task-module linking
4. **MCP client**: HTTP client methods
5. **MCP tools**: module management tools
6. **Tests**: store tests + MCP tools tests
7. **Dashboard**: modules view in dashboard

### Reference Projects
- **Plane** (50k+ stars): Modules feature for grouping issues
- **Huly** (26k+ stars): Module/epic grouping in project management
- **Linear**: Projects for grouping issues (similar concept)

### Difficulty: 3/5
Standard layered architecture implementation following existing patterns (cycles, templates).
