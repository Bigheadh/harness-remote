# Phase 60: Task Time Estimate Setter

## 概览
| 项目 | 内容 |
|------|------|
| 日期 | 2026-06-07 |
| 任务 | 添加任务时间估算设置功能 |
| 涉及文件数 | 5 |
| 增加行数 | ~120 |
| 删除行数 | 0 |

## 逐文件改动

### 1. src/server/tasks/store.ts
**改动 1**: TaskStore 接口新增 `setTaskEstimatedMinutes` 方法签名
- 位置: 第 68 行 (接口声明)
- 改前: `setTaskPriority(taskId: string, priority: TaskPriority): Promise<Task>;` 后直接是 `listOverdueTasks`
- 改后: 在 `setTaskPriority` 和 `listOverdueTasks` 之间新增 `setTaskEstimatedMinutes(taskId: string, minutes: number | null): Promise<Task>;`
- 原因: `estimated_minutes` 列已在 Phase 49 添加到数据库，但没有 setter 方法
- 影响: 允许 store 层设置/清除任务时间估算

**改动 2**: TaskStore 实现新增 `setTaskEstimatedMinutes` 方法
- 位置: 第 1280-1301 行 (实现)
- 改前: 无
- 改后: 新增完整实现，包含参数验证（非负数或 null）、任务存在性检查、SQL UPDATE、返回更新后的任务
- 原因: 实现时间估算的设置逻辑
- 影响: 数据库 `estimated_minutes` 列可被更新

### 2. src/server/tasks/routes.ts
**改动 1**: 新增 `POST /api/tasks/:id/estimated-minutes` 路由
- 位置: 文件末尾 (第 3826+ 行)
- 改前: 文件以 `}` 结束
- 改后: 新增完整的路由处理，包含 auth 验证、参数验证（非负数或 null）、错误处理（404/400/500）
- 原因: 提供 HTTP API 端点供 MCP 客户端调用
- 影响: 新增 REST API 端点

### 3. src/mcp-server/client.ts
**改动 1**: TaskApiClient 接口新增 `setEstimatedMinutes` 方法签名
- 位置: 第 37 行
- 改前: `setPriority` 后直接是 `listOverdueTasks`
- 改后: 在 `setPriority` 和 `listOverdueTasks` 之间新增 `setEstimatedMinutes(taskId: string, minutes: number | null): Promise<Task>;`
- 原因: 客户端接口需要声明新方法

**改动 2**: TaskApiClient 实现新增 `setEstimatedMinutes` 方法
- 位置: 第 569-589 行 (实现)
- 改前: 无
- 改后: 新增 HTTP fetch 实现，调用 `POST /api/tasks/:id/estimated-minutes`
- 原因: MCP 客户端需要调用新的 API 端点

### 4. src/mcp-server/tools.ts
**改动 1**: 新增 `set_task_estimated_minutes` MCP 工具注册
- 位置: 第 737-767 行 (紧跟 set_task_priority 工具之后)
- 改前: 无
- 改后: 新增完整的工具注册，包含描述、inputSchema（taskId + estimatedMinutes）、handler
- 原因: AI 代理需要通过 MCP 协议设置任务时间估算
- 影响: 新增 1 个 MCP 工具（120 → 121）

### 5. test/mcp-server/tools.test.ts
**改动 1**: Mock 客户端新增 `setEstimatedMinutes` 方法
- 位置: 第 234-249 行
- 改前: 无
- 改后: 新增 mock 实现，记录调用参数并返回模拟任务
- 原因: 测试需要 mock 客户端满足 TaskApiClient 接口

**改动 2**: 更新工具数量断言
- 位置: 第 1697-1698 行
- 改前: `toHaveLength(120)` / `"registers all 120 tools"`
- 改后: `toHaveLength(121)` / `"registers all 121 tools"`
- 原因: 新增 1 个工具

**改动 3**: 新增 4 个测试用例
- 位置: 第 2285-2325 行
- 改前: 无
- 改后: 注册验证、设置值（30分钟）、清除（null）、错误处理
- 原因: 覆盖新工具的核心场景

## 结构性摘要
- **新增**: 1 个 store 方法、1 个 API 路由、1 个 client 方法、1 个 MCP 工具、4 个测试
- **修改**: 2 个接口声明（store + client）、工具数量断言
- **无删除**

## 风险说明
- **低风险**: 遵循已有的 setter 模式（set_task_priority、set_task_due_date），架构一致
- **数据库**: `estimated_minutes` 列已存在（Phase 49 添加），无需 migration
- **向后兼容**: 新增 API 端点和 MCP 工具，不影响现有功能

## 验证步骤
1. `npm run typecheck` — ✅ 通过
2. `npm run build` — ✅ 通过
3. `npm test` — ✅ 455/455 通过（新增 4 个测试）
4. MCP 工具注册数: 121（从 120 增加）
