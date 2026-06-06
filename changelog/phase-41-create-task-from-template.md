# Phase 41: Create Task from Template

## 概览

| 日期 | 任务 | 涉及文件数 | 新增行数 | 删除行数 |
|------|------|-----------|---------|---------|
| 2026-06-06 | 从模板创建任务 | 4 | ~130 | ~2 |

## 逐文件改动

### 1. src/server/tasks/routes.ts
**新增路由**: `POST /api/templates/:id/create-task`

- **位置**: 第 320-391 行（在 DELETE /api/templates/:id 之后，GET /api/tasks 之前）
- **改前**: 模板只有 CRUD 操作，无法从模板生成任务
- **改后**: 新增 `POST /api/templates/:id/create-task` 路由，接受可选 overrides body（commandText, description, priority, tags, assignedDeviceId, dueDate, reminderAt）
- **修改原因**: 模板定义了可复用的任务配置，但缺少「从模板创建任务」的能力，导致模板形同虚设
- **实现逻辑**: 
  1. 验证 auth（tasks.write 权限）
  2. 查找模板，404 if not found
  3. 合并 overrides 与模板默认值（dueDateOffsetMs → 计算绝对时间，reminderOffsetMs → 计算绝对时间）
  4. 调用 store.createTask()，使用合成的 feishuMessageId（`tmpl_${templateId}_${timestamp}`）
- **影响范围**: API 层，不影响 store 或 MCP 工具
- **风险**: 低。纯新增路由，不修改现有逻辑

### 2. src/mcp-server/client.ts
**新增接口方法**: `createTaskFromTemplate`

- **位置**: 第 49 行（接口声明）+ 第 665-679 行（实现）
- **改前**: TaskApiClient 接口无 createTaskFromTemplate 方法
- **改后**: 新增 `createTaskFromTemplate(templateId, overrides?)` 方法，POST 到 `/api/templates/:id/create-task`
- **修改原因**: MCP 工具层需要调用此方法来支持 AI 代理从模板创建任务
- **影响范围**: MCP 客户端层
- **风险**: 低。纯新增方法，不影响现有客户端

### 3. src/mcp-server/tools.ts
**新增 MCP 工具**: `create_task_from_template`

- **位置**: 第 1208-1276 行（在 delete_template 工具之后，scheduled task tools 之前）
- **改前**: 无此工具，AI 代理无法通过 MCP 从模板创建任务
- **改后**: 注册 `create_task_from_template` 工具，接受 templateId + 可选 overrides（commandText, description, priority, tags, assignedDeviceId, dueDate, reminderAt）
- **修改原因**: 让 AI 代理能通过 MCP 协议从模板创建任务，实现模板的实际价值
- **工具描述**: "Create a new task from an existing template. Templates define reusable task configurations..."
- **影响范围**: MCP 工具层
- **风险**: 低。纯新增工具注册

### 4. test/mcp-server/tools.test.ts
**更新 mock + 新增测试**

- **位置**: 
  - 第 380-398 行：新增 mock `createTaskFromTemplate` 方法
  - 第 1229-1230 行：工具计数 76 → 77
  - 第 1945-1999 行：新增 4 个测试用例
- **改前**: 无 createTaskFromTemplate mock，工具计数为 76
- **改后**: 
  - Mock 实现：推送 calls 并返回默认 Task 对象
  - 工具计数更新为 77
  - 测试用例：注册验证、默认创建、带 overrides 创建、错误处理
- **修改原因**: 新增的 MCP 工具需要测试覆盖
- **影响范围**: 仅测试文件
- **风险**: 无

## 结构性摘要

- **新增**: 1 个 API 路由、1 个客户端方法、1 个 MCP 工具、4 个测试用例
- **修改**: TaskApiClient 接口（新增 1 个方法签名）、工具计数（76→77）
- **无删除**

## 风险说明

1. **feishuMessageId 合成**: 使用 `tmpl_${templateId}_${timestamp}` 格式，避免与真实飞书消息 ID 冲突，同时保证唯一性（时间戳 + 模板 ID）
2. **dueDate/reminderAt 偏移计算**: 使用 `Date.now() + offsetMs` 计算绝对时间，精度为毫秒级
3. **auth 用户名**: 模板创建任务时使用 `authCtx.user?.username ?? "api"` 作为 feishuUserId，区分于飞书来源的任务

## 验证步骤

1. `npm run typecheck` — 通过 ✓
2. `npm run build` — 通过 ✓
3. `npm test` — 295/295 通过 ✓（新增 4 个测试）
4. 工具计数：77 个 MCP 工具 ✓
