# Phase 47: Saved Views (Custom Filter Presets)

**Date**: 2026-06-07
**Feature**: Saved filter views — save filter combinations as named presets for quick reuse
**Reference**: Inspired by Linear/Plane "Views" feature (Plane has 50k+ GitHub stars)

## 概览

| 指标 | 数值 |
|------|------|
| 涉及文件数 | 5 |
| 新增行数 | ~250 |
| 删除行数 | 0 |
| 新增测试 | 19 |
| MCP 工具新增 | 5 (98 → 103) |

## 逐文件改动

### 1. `src/shared/types.ts`

**新增接口** (文件末尾):

```typescript
export interface SavedView {
  id: string;
  name: string;
  createdBy: string;
  filters: SavedViewFilters;
  createdAt: string;
  updatedAt: string;
}

export interface SavedViewFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  deviceId?: string;
  tags?: string[];
  fromDate?: string;
  toDate?: string;
  query?: string;
}
```

**修改原因**: 定义 SavedView 和 SavedViewFilters 共享类型，供 store、routes、client、tools 各层使用。
**影响范围**: 所有 import types 的文件均可引用新类型。
**风险**: 低 — 纯类型新增，无运行时影响。

### 2. `src/server/tasks/store.ts`

**改动**:
- 新增 `import type { SavedView, SavedViewFilters }` (line 7)
- TaskStore 接口新增 5 个方法声明 (lines 159-164)
- DB 初始化新增 `saved_views` 表创建 + 索引 (lines 544-555)
- 实现 5 个 store 方法 (lines 2949-3022):
  - `createSavedView` — 插入新视图，生成 ID
  - `listSavedViews` — 按 creator 可选过滤，按创建时间倒序
  - `getSavedView` — 按 ID 查询
  - `updateSavedView` — 部分更新 name/filters
  - `deleteSavedView` — 按 ID 删除

**修改原因**: 持久化保存用户的自定义过滤器预设。
**影响范围**: TaskStore 接口扩展，所有使用 TaskStore 的代码自动获得新方法。
**风险**: 低 — 新表独立，不修改现有表结构。

### 3. `src/server/tasks/routes.ts`

**新增路由** (lines 3287-3412):
- `GET /api/saved-views` — 列出所有保存的视图 (tasks.read 权限)
- `GET /api/saved-views/:id` — 获取视图详情 (tasks.read 权限)
- `POST /api/saved-views` — 创建新视图 (tasks.write 权限，含审计日志)
- `PUT /api/saved-views/:id` — 更新视图 (tasks.write 权限)
- `DELETE /api/saved-views/:id` — 删除视图 (tasks.write 权限)

**修改原因**: 暴露 Saved Views CRUD API 供 MCP 客户端和 Dashboard 使用。
**影响范围**: 新增 `/api/saved-views` 路由组，不影响现有路由。
**风险**: 低 — 路由前缀 `/api/saved-views` 不与现有路由冲突。

### 4. `src/mcp-server/client.ts`

**改动**:
- TaskApiClient 接口新增 5 个方法声明 (lines 147-152)
- createTaskApiClient 实现新增 5 个 HTTP client 方法 (lines 1725-1783)

**修改原因**: MCP 客户端封装 Saved Views API 调用。
**影响范围**: TaskApiClient 接口扩展。
**风险**: 低 — 新增方法，不修改现有方法。

### 5. `src/mcp-server/tools.ts`

**新增 5 个 MCP 工具** (lines 4079-4260):
- `list_saved_views` — 列出保存的过滤视图
- `get_saved_view` — 获取视图详情和过滤参数
- `create_saved_view` — 创建命名过滤预设
- `update_saved_view` — 更新视图名称或过滤参数
- `delete_saved_view` — 永久删除视图

**修改原因**: AI 代理可通过 MCP 协议管理 Saved Views。
**影响范围**: 新增 5 个工具注册。
**风险**: 低 — 新增工具，不修改现有工具。

### 6. `test/mcp-server/tools.test.ts`

**改动**:
- 工具数量断言 98 → 103 (lines 1492-1493)
- Mock client 新增 5 个方法实现 (lines 1437-1499)
- 新增 19 个测试用例 (lines 2891-3049):
  - list_saved_views: 注册、列表、过滤、错误处理 (4 tests)
  - get_saved_view: 注册、获取、错误处理 (3 tests)
  - create_saved_view: 注册、创建、错误处理 (3 tests)
  - update_saved_view: 注册、更新名称、更新过滤器、错误处理 (4 tests)
  - delete_saved_view: 注册、删除、错误处理 (3 tests)
  - 总计: 5 描述测试 + 14 功能测试

**修改原因**: 验证新增 MCP 工具的注册和行为。
**影响范围**: 测试覆盖率增加。

## 结构性摘要

- **新增**: 2 个 TypeScript 接口 (SavedView, SavedViewFilters)
- **新增**: 1 个 SQLite 表 (saved_views) + 1 个索引
- **新增**: 5 个 store 方法
- **新增**: 5 个 API 路由
- **新增**: 5 个 MCP client 方法
- **新增**: 5 个 MCP 工具
- **新增**: 19 个测试用例

## 风险说明

- **低风险**: 所有改动均为新增，不修改现有功能
- **数据迁移**: 自动创建新表，无需手动迁移
- **向后兼容**: 新 API 路由和 MCP 工具不影响现有功能

## 验证步骤

1. `npm run typecheck` — ✅ 通过
2. `npm run build` — ✅ 通过
3. `npm test` — ✅ 379/379 测试通过
