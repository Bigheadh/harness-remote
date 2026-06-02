# Changelog: Task Dependencies (Prerequisite Chains)

## 概览

| 项目 | 值 |
|------|-----|
| 日期 | 2026-06-02 |
| 功能 | 任务依赖关系（前置条件链：任务 B 等待任务 A 完成） |
| 涉及文件数 | 7 |
| 新增行数 | ~350 |
| 删除行数 | ~5 |

## 逐文件改动

### 1. `src/shared/types.ts`

**改动 1: Task 接口新增 dependsOn 字段**
- 位置: `Task` interface, line 35
- 改前: `assignedDeviceId?: string;`
- 改后: `assignedDeviceId?: string; dependsOn?: string[];`
- 原因: 支持任务依赖关系，允许任务声明其前置条件
- 影响范围: 所有消费 Task 类型的代码均可访问此字段

**改动 2: AuditAction 新增 task.dependencies_set**
- 位置: `AuditAction` type, line 70
- 改前: `| "task.comment_deleted";`
- 改后: `| "task.comment_deleted" | "task.dependencies_set";`
- 原因: 审计日志需要记录依赖关系变更操作
- 影响范围: 审计日志记录

### 2. `src/server/tasks/store.ts`

**改动 1: TaskStore 接口新增 5 个依赖方法**
- 位置: `TaskStore` interface, line 72-77
- 新增方法: `setDependencies`, `getDependencies`, `getDependents`, `isTaskBlocked`, `listReadyTasks`
- 原因: 提供依赖管理的核心存储操作

**改动 2: 新增 task_dependencies 表**
- 位置: `createTaskStore` 初始化, line 317-333
- 新建表: `task_dependencies (task_id TEXT, depends_on_task_id TEXT)` 联合主键
- 索引: `idx_task_dependencies_depends_on` 加速反向查询
- 原因: 多对多依赖关系需要关联表

**改动 3: 实现 5 个依赖方法**
- `setDependencies`: 验证任务存在、检查自依赖、检测循环依赖（DFS）、替换所有依赖
- `getDependencies`: 查询指定任务的所有前置依赖 ID
- `getDependents`: 查询所有等待指定任务完成的下游任务
- `isTaskBlocked`: 检查是否存在未完成的依赖
- `listReadyTasks`: 查询所有 pending 且依赖已全部满足的任务，按优先级排序

### 3. `src/server/tasks/routes.ts`

**改动 1: GET /api/tasks/ready**
- 位置: line 454-473
- 新增端点: 列出所有可立即处理的任务（pending + 所有依赖已满足）
- 权限: tasks.read
- 注意: 必须在 `:id` 参数路由之前注册

**改动 2: GET /api/tasks/:id/dependencies**
- 位置: line 1056-1097
- 新增端点: 获取任务的完整依赖图（前置依赖、下游任务、是否被阻塞）
- 权限: tasks.read

**改动 3: POST /api/tasks/:id/dependencies**
- 位置: line 1099-1148
- 新增端点: 设置任务的前置依赖（替换式）
- 权限: tasks.write
- 校验: 检查数组格式、任务存在性、自依赖、循环依赖
- 审计: 记录 task.dependencies_set

**改动 4: DELETE /api/tasks/:id/dependencies/:depId**
- 位置: line 1150-1207
- 新增端点: 移除单个依赖关系
- 权限: tasks.write
- 审计: 记录 task.dependencies_set

### 4. `src/mcp-server/client.ts`

**改动 1: TaskApiClient 接口新增 4 个方法**
- `setDependencies`, `getDependencies`, `removeDependency`, `listReadyTasks`

**改动 2: 实现 4 个 HTTP 客户端方法**
- 分别调用对应的 API 端点

### 5. `src/mcp-server/tools.ts`

**改动 1: 新增 4 个 MCP 工具**
- `set_task_dependencies`: 设置任务前置依赖，支持清空
- `get_task_dependencies`: 获取依赖图，返回阻塞状态
- `remove_task_dependency`: 移除单个依赖
- `list_ready_tasks`: 列出所有就绪任务（推荐的拉取方式）

### 6. `test/mcp-server/tools.test.ts`

**改动 1: Mock Client 新增 4 个方法**
- `setDependencies`, `getDependencies`, `removeDependency`, `listReadyTasks`

**改动 2: 工具计数更新**
- 从 28 增加到 32

### 7. `FEATURES.md`

**改动: Phase 21 标记 Task dependencies 为完成**

## 结构性摘要

- **新增**: `task_dependencies` 表（SQLite 联合主键）
- **新增**: 5 个 Store 方法、3 个 API 路由、4 个 MCP 工具
- **修改**: Task 类型增加 `dependsOn` 可选字段

## 风险说明

- **循环依赖检测**: 使用 DFS 遍历依赖图，性能可接受（任务数通常 <1000）
- **级联删除**: SQLite 外键 ON DELETE CASCADE 确保删除任务时清理依赖记录
- **向后兼容**: `dependsOn` 是可选字段，不影响现有数据

## 验证步骤

1. `npm run typecheck` — 通过 ✓
2. `npm run build` — 通过 ✓
3. `npm run test` — 223/223 通过 ✓
