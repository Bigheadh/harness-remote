# Changelog: MCP Tools Test Implementation

**日期**: 2026-06-02
**任务**: Implement mcp-server/tools.test.ts - Tool contracts
**涉及文件数**: 2
**增删行数**: +362 / -5

---

## 概览

为 MCP 工具层实现完整的契约测试（19 个测试用例），覆盖所有 5 个 MCP 工具的注册、输入输出格式、错误处理和客户端调用委托。

---

## 逐文件改动

### 1. `test/mcp-server/tools.test.ts`

**改动类型**: 重写（从 7 行 placeholder → 365 行完整测试）

**改前**:
```typescript
import { describe, it, expect } from "vitest";

// Placeholder: MCP tool tests will be implemented in a future iteration.
describe("MCP tools", () => {
  it.todo("list_tasks tool returns tasks");
  it.todo("get_task tool returns single task");
});
```

**改后**: 完整的 19 个测试用例，包含：

1. **Mock 层**: `createMockClient()` 创建带调用追踪的 TaskApiClient mock，支持注入失败（`failWith`）。`createMockServer()` 捕获 `registerTool` 注册的工具名、描述、schema 和 handler。

2. **tool registration (6 tests)**: 验证 5 个工具全部注册，每个工具的描述包含关键词。

3. **list_tasks handler (3 tests)**: 默认参数调用、status/limit 透传、客户端异常时返回 isError。

4. **get_task handler (2 tests)**: 返回任务详情、任务不存在时返回错误。

5. **mark_task_running handler (2 tests)**: 标记 running、状态转换失败时返回错误。

6. **report_task_result handler (4 tests)**: 成功结果（done）、失败结果（failed）、无 details 字段、报告失败时返回错误。

7. **reply_feishu handler (2 tests)**: 发送回复、API 失败时返回错误。

**修改原因**: Phase 13 要求为 MCP 工具实现契约测试，验证每个工具的注册、输入参数透传、输出格式和错误处理。

**影响范围**: 仅测试文件，不影响生产代码。

**风险**: 低。使用 mock 对象隔离外部依赖，不涉及网络或文件系统。

**验证步骤**: `npm run test` 全部 80 个测试通过（含 19 个新增）。

### 2. `FEATURES.md`

**改动类型**: 标记完成项

**改前**: `- [ ] mcp-server/tools.test.ts - Tool contracts`
**改后**: `- [x] mcp-server/tools.test.ts - Tool contracts`

**修改原因**: 完成 MCP 工具测试后更新追踪状态。

**影响范围**: 仅文档。

---

## 结构性摘要

- **新增**: `test/mcp-server/tools.test.ts` 中 19 个测试用例（Mock 层 + 5 个工具 × 多场景）
- **删除**: placeholder `it.todo` 测试
- **重构**: 无

## 风险说明

- 无生产代码变更，风险极低
- Mock 对象精确模拟 `TaskApiClient` 接口，包含 5 个方法的完整实现
- 所有测试在本地完成，无网络依赖

## 验证步骤

```bash
npm run typecheck  # ✅ PASS
npm run build      # ✅ PASS
npm run test       # ✅ 80/80 tests passed
```
