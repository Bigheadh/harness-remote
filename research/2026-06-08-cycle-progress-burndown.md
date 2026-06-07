# 2026-06-08: Cycle Progress / Burndown Feature Research

## Research Direction
Sprint/Cycle progress tracking and burndown charts — inspired by Plane (50k+ stars), Linear, and Jira.

## Gap Analysis
The project has cycles (Phase 63) with CRUD + MCP tools, but no progress tracking or burndown data. Cycles have `completedTasks` and `totalTasks` counts, but no time-series progress data.

## Feature: Cycle Progress / Burndown
### What it provides
- Burndown data: tasks remaining over time (ideal vs actual)
- Status breakdown: pending/picked/running/done/failed counts
- Priority breakdown: urgent/high/normal/low counts
- Completion rate: tasks completed per day
- Time tracking summary: estimated vs actual minutes

### Implementation Plan
1. Shared types: `CycleProgress` interface
2. Store: `getCycleProgress(cycleId)` method with SQL aggregation
3. API route: `GET /api/cycles/:id/progress`
4. MCP client: `getCycleProgress(cycleId)` method
5. MCP tool: `get_cycle_progress`

### Reference Projects
- Plane (50k+ stars): Cycles with burndown charts
- Linear: Sprint progress tracking
- Jira: Velocity charts and burndown graphs

## Next Research Direction
- Task modules / project grouping
- Rich text pages / wiki
- Calendar view for due dates
