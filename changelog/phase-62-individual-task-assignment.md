# Changelog: Phase 62 — Individual Task Assignment MCP Tools

**Date**: 2026-06-07
**Feature**: Individual task device assignment/unassignment via MCP tools

## 概览

| 项目 | 内容 |
|------|------|
| 日期 | 2026-06-07 |
| 任务 | 添加单任务设备分配 MCP 工具 |
| 涉及文件数 | 4 |
| 新增行数 | ~90 |
| 删除行数 | 0 |

## 逐文件改动

### 1. src/mcp-server/client.ts

**改动 1: 添加接口方法**
- 位置: TaskApiClient 接口 (line ~42)
- 改前: `bulkAssign(ids: string[], deviceId: string): Promise<{ updated: number; errors: string[] }>;`
- 改后: 添加 `assignTask(taskId: string, deviceId: string): Promise<Task>;` 和 `unassignTask(taskId: string): Promise<Task>;`
- 原因: 需要单任务分配的客户端方法
- 影响: 所有实现 TaskApiClient 接口的对象需要添加这两个方法

**改动 2: 添加实现方法**
- 位置: createTaskApiClient 实现 (line ~687)
- 改前: 无
- 改后: 添加 `assignTask` 和 `unassignTask` 的 HTTP fetch 实现
- 原因: 调用已有的 POST /api/tasks/:id/assign 和 POST /api/tasks/:id/unassign 路由
- 影响: MCP 工具层可以调用这些方法

### 2. src/mcp-server/tools.ts

**改动 3: 添加 assign_task 工具注册**
- 位置: tools.ts (line ~1160)
- 改前: 无
- 改后: 新增 `server.registerTool("assign_task", ...)` 注册
- 原因: AI 代理需要通过 MCP 协议将任务分配给设备
- 影响: 工具计数 +1

**改动 4: 添加 unassign_task 工具注册**
- 位置: tools.ts (line ~1200)
- 改前: 无
- 改后: 新增 `server.registerTool("unassign_task", ...)` 注册
- 原因: AI 代理需要通过 MCP 协议取消任务的设备分配
- 影响: 工具计数 +1

### 3. test/mcp-server/tools.test.ts

**改动 5: 添加 mock 方法**
- 位置: createMockClient (line ~356)
- 改前: 无
- 改后: 添加 `assignTask` 和 `unassignTask` mock 实现
- 原因: mock 需要满足 TaskApiClient 接口
- 影响: 测试可以验证工具调用

**改动 6: 更新工具计数**
- 位置: tool registration test (line ~1714)
- 改前: `expect(mockServer.registrations).toHaveLength(122);`
- 改后: `expect(mockServer.registrations).toHaveLength(124);`
- 原因: 新增 2 个工具

**改动 7: 添加测试用例**
- 位置: 新增 describe 块 (line ~3415)
- 改前: 无
- 改后: 添加 6 个测试用例覆盖 assign_task 和 unassign_task
- 原因: 验证工具注册、正常调用、错误处理

### 4. FEATURES.md

**改动 8: 添加 Phase 62**
- 位置: 文件末尾
- 改前: 无
- 改后: 添加 Phase 62 的完整功能列表
- 原因: 跟踪功能进度

## 结构性摘要

- **新增**: assign_task 和 unassign_task MCP 工具
- **新增**: client 层 assignTask/unassignTask 方法
- **新增**: 6 个测试用例
- **修改**: 工具计数 122 → 124

## 风险说明

- **低风险**: Store 层和 API 路由已存在且经过测试，本次只添加 MCP 工具层
- **兼容性**: 新增工具不影响现有工具
- **测试覆盖**: 每个工具都有注册测试、正常调用测试、错误处理测试

## 验证步骤

1. ✅ `npm run typecheck` — 编译通过
2. ✅ `npm run build` — 构建通过
3. ✅ `npm test` — 464/464 测试通过
4. ✅ 工具计数验证: 124 个工具注册
