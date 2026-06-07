# Phase 69: Task Reopening

## 日期
2026-06-08

## 概览
| 指标 | 数值 |
|------|------|
| 涉及文件 | 6 |
| 新增行数 | ~120 |
| 删除行数 | ~10 |
| 风险等级 | 低 |

## 逐文件改动

### 1. src/shared/types.ts
- **位置**: Task interface (line 85-86)
- **改前**: `cycleId?: string; }`
- **改后**: 新增 `reopenedCount?: number;` 字段
- **原因**: 跟踪任务被重新打开的次数，帮助用户了解任务的反复情况
- **影响**: Task 接口新增可选字段，不影响现有代码

### 2. src/server/tasks/store.ts
- **位置1**: VALID_TRANSITIONS (line 201-207)
  - **改前**: `done: [], failed: []`
  - **改后**: `done: ["pending"], failed: ["pending"]`
  - **原因**: 允许 done/failed 状态转换回 pending，实现任务重新打开
  - **影响**: 状态机扩展，done/failed 不再是终态

- **位置2**: DB migration (line 655-656)
  - **改后**: 新增 `ALTER TABLE tasks ADD COLUMN reopened_count INTEGER DEFAULT 0`
  - **原因**: 持久化存储任务重新打开次数

- **位置3**: rowToTask (line 262-263)
  - **改后**: 新增 `reopenedCount` 解析
  - **原因**: 从数据库行中提取 reopened_count 字段

- **位置4**: TaskStore interface (line 128-129)
  - **改后**: 新增 `reopenTask(taskId: string): Promise<Task>` 方法签名
  - **原因**: 定义重新打开任务的 store 方法接口

- **位置5**: reopenTask implementation (line 1037-1064)
  - **改后**: 完整实现 reopenTask 方法
  - **原因**: 验证任务状态为 done/failed，重置状态为 pending，清除处理时间戳和结果，递增 reopenedCount

### 3. src/server/tasks/routes.ts
- **位置**: POST /api/tasks/:id/reopen (line 1705-1751)
- **改后**: 新增重新打开任务的 API 端点
- **原因**: 提供 HTTP API 让前端和客户端重新打开任务
- **影响**: 需要 tasks.write 权限

### 4. src/mcp-server/client.ts
- **位置1**: TaskApiClient interface (line 97-98)
  - **改后**: 新增 `reopenTask(taskId: string): Promise<Task>` 方法签名

- **位置2**: reopenTask implementation (line 1323-1335)
  - **改后**: HTTP POST 调用 /api/tasks/:id/reopen
  - **原因**: MCP 客户端调用重新打开任务的 API

### 5. src/mcp-server/tools.ts
- **位置**: reopen_task tool registration (line 2852-2887)
- **改后**: 新增 reopen_task MCP 工具注册
- **原因**: 让 AI 代理能够重新打开已完成或失败的任务
- **影响**: 工具数量从 141 增加到 142

### 6. test/mcp-server/tools.test.ts
- **位置1**: Mock client (line 940-955)
  - **改后**: 新增 reopenTask mock 方法

- **位置2**: Tool count assertion (line 1931-1932)
  - **改前**: `registers all 141 tools` / `toHaveLength(141)`
  - **改后**: `registers all 142 tools` / `toHaveLength(142)`

- **位置3**: reopen_task tests (line 4467-4497)
  - **改后**: 新增 3 个测试用例（注册、成功、失败）

### 7. test/server/tasks.store.test.ts
- **位置**: 状态转换测试 (line 186-198)
  - **改前**: 测试 done/failed → pending 应该被拒绝
  - **改后**: 测试 done/failed → pending 应该成功（重新打开）
  - **原因**: 状态机已扩展，done/failed 现在可以转换回 pending

## 结构性摘要
- **新增**: reopenTask store 方法、POST /api/tasks/:id/reopen 路由、reopenTask 客户端方法、reopen_task MCP 工具
- **修改**: VALID_TRANSITIONS 允许 done/failed → pending，Task 接口新增 reopenedCount 字段
- **重构**: 更新状态转换测试以反映新的行为

## 风险说明
- **低风险**: 状态机扩展只增加了新的转换路径，不影响现有的合法转换
- **数据库迁移**: 新增 reopened_count 列有 DEFAULT 0，现有数据不受影响
- **向后兼容**: reopenedCount 是可选字段，现有代码不需要修改

## 验证步骤
1. ✅ TypeScript 编译通过
2. ✅ Build 成功
3. ✅ 511 个测试全部通过
4. ✅ 新增 3 个 reopen_task 测试通过
5. ✅ 状态转换测试更新后通过
