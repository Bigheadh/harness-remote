# 变更记录：安全加固与功能增强

## 概览

| 日期 | 任务 | 涉及文件数 | 增加行数 | 删除行数 |
|------|------|-----------|---------|---------|
| 2026-06-02 | 安全加固与功能增强 | 12 | ~200 | ~50 |

## 1. src/shared/http.ts — Timing-safe token 比较

### 改动 1: 添加 timing-safe 比较函数
- **位置**: 文件顶部
- **改前**: 无
- **改后**:
  ```typescript
  import { timingSafeEqual } from "node:crypto";
  
  function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      timingSafeEqual(Buffer.from(a), Buffer.from(a));
      return false;
    }
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }
  ```
- **原因**: 原始的 `===` 比较存在时序攻击风险，攻击者可通过测量响应时间推断 token
- **影响**: 所有 token 验证现在使用恒定时间比较
- **风险**: 低。仅改变比较方式，不影响功能

### 改动 2: 使用安全比较
- **位置**: requireBearerToken 函数
- **改前**: `if (token !== expectedToken)`
- **改后**: `if (!safeCompare(token, expectedToken))`
- **原因**: 应用 timing-safe 比较
- **影响**: 认证验证更加安全
- **验证**: 运行 `npm test` 确认所有测试通过

## 2. src/shared/config-utils.ts — 新增共享配置校验

### 改动 1: 提取公共校验函数
- **位置**: 新文件
- **改前**: 无
- **改后**: 
  ```typescript
  export function validateRequired(value: unknown, fieldName: string): asserts value is string
  export function validateUrl(value: string, fieldName: string): void
  export function parseJsonConfig(filePath: string): Record<string, unknown>
  ```
- **原因**: server/config.ts 和 mcp-server/config.ts 有重复的校验逻辑
- **影响**: 消除代码重复，便于统一维护
- **风险**: 低。纯重构，行为不变

## 3. src/server/config.ts — 使用共享校验

### 改动 1: 导入共享函数
- **位置**: 文件顶部
- **改前**: 内联的 validateRequired 和 validateUrl 函数
- **改后**: `import { validateRequired, validateUrl, parseJsonConfig } from "../shared/config-utils.js"`
- **原因**: 消除重复代码
- **影响**: 代码更简洁，维护更容易

## 4. src/mcp-server/config.ts — 使用共享校验

### 改动 1: 导入共享函数
- **位置**: 文件顶部
- **改前**: 内联的 validateRequired 和 validateUrl 函数
- **改后**: `import { validateRequired, validateUrl, parseJsonConfig } from "../shared/config-utils.js"`
- **原因**: 消除重复代码
- **影响**: 代码更简洁，维护更容易

## 5. src/shared/types.ts — 添加优先级类型

### 改动 1: 新增 TaskPriority 类型
- **位置**: 文件顶部
- **改前**: 无
- **改后**: `export type TaskPriority = "low" | "normal" | "high" | "urgent";`
- **原因**: 支持任务优先级功能
- **影响**: 新增类型定义

### 改动 2: Task 接口添加 priority 字段
- **位置**: Task 接口
- **改前**: 无 priority 字段
- **改后**: `priority: TaskPriority;`
- **原因**: 任务需要优先级属性
- **影响**: 所有创建任务的地方需要提供 priority

## 6. src/server/tasks/store.ts — 优先级支持与超时检测

### 改动 1: SQLite 表添加 priority 列
- **位置**: CREATE TABLE 语句
- **改前**: 无 priority 列
- **改后**: `priority TEXT NOT NULL DEFAULT 'normal'`
- **原因**: 持久化优先级信息
- **影响**: 新增数据库列

### 改动 2: 添加迁移代码
- **位置**: 表创建后
- **改前**: 无
- **改后**: 
  ```typescript
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'`);
  } catch { /* Column already exists */ }
  ```
- **原因**: 兼容现有数据库
- **影响**: 自动迁移旧数据库

### 改动 3: rowToTask 添加 priority 映射
- **位置**: rowToTask 函数
- **改前**: 无 priority
- **改后**: `priority: (row["priority"] as TaskPriority) ?? "normal"`
- **原因**: 从数据库行读取 priority
- **影响**: 任务对象包含 priority

### 改动 4: INSERT 语句添加 priority
- **位置**: insertTask 准备语句
- **改前**: 9 个参数
- **改后**: 10 个参数（含 priority）
- **原因**: 插入 priority 值
- **影响**: createTask 需要提供 priority

### 改动 5: listTasks 按优先级排序
- **位置**: selectTasks 查询
- **改前**: `ORDER BY created_at DESC`
- **改后**: 按 priority 排序（urgent > high > normal > low），再按 created_at DESC
- **原因**: 优先显示高优先级任务
- **影响**: 任务列表排序更合理

### 改动 6: 新增 resetStaleTasks 方法
- **位置**: store 实现
- **改前**: 无
- **改后**: 
  ```typescript
  async resetStaleTasks(timeoutMs: number = 30 * 60 * 1000): Promise<number> {
    const cutoff = new Date(Date.now() - timeoutMs).toISOString();
    const result = db.prepare(`
      UPDATE tasks SET status = 'pending', updated_at = ?
      WHERE status IN ('running', 'picked') AND updated_at < ?
    `).run(new Date().toISOString(), cutoff);
    return Number(result.changes);
  }
  ```
- **原因**: 检测并重置超时的任务
- **影响**: 防止任务永久卡在 running/picked 状态

## 7. src/server/feishu/events.ts — 优先级解析

### 改动 1: 添加 parsePriority 函数
- **位置**: 文件顶部
- **改前**: 无
- **改后**: 
  ```typescript
  function parsePriority(text: string): TaskPriority {
    const match = text.match(/#priority:(urgent|high|normal|low)/i);
    if (match) return match[1].toLowerCase() as TaskPriority;
    if (text.includes("!urgent")) return "urgent";
    if (text.includes("!high")) return "high";
    return "normal";
  }
  ```
- **原因**: 从消息文本中解析优先级
- **影响**: 支持 `#priority:urgent` 和 `!urgent` 语法

### 改动 2: 添加 stripPriorityMarkers 函数
- **位置**: 文件顶部
- **改前**: 无
- **改后**: 
  ```typescript
  function stripPriorityMarkers(text: string): string {
    return text.replace(/#priority:(urgent|high|normal|low)/gi, "")
              .replace(/[!](urgent|high)/g, "").trim();
  }
  ```
- **原因**: 从任务文本中移除优先级标记
- **影响**: 任务描述更清晰

### 改动 3: createTaskFromFeishuEvent 使用 priority
- **位置**: createTaskFromFeishuEvent 函数
- **改前**: 无 priority
- **改后**: 
  ```typescript
  const priority = parsePriority(event.text);
  const cleanText = stripPriorityMarkers(event.text);
  return { ... priority, commandText: cleanText, ... };
  ```
- **原因**: 从消息中提取优先级
- **影响**: 新任务自动设置优先级

## 8. src/server/feishu/client.ts — 导出 FeishuReplyClient 类型

### 改动 1: 新增接口
- **位置**: 文件顶部
- **改前**: 无
- **改后**: 
  ```typescript
  export interface FeishuReplyClient {
    replyToMessage(input: FeishuReplyInput): Promise<void>;
  }
  ```
- **原因**: 支持依赖注入和类型安全
- **影响**: 路由可以接受可选的 FeishuReplyClient

### 改动 2: createFeishuReplyClient 返回类型
- **位置**: createFeishuReplyClient 函数
- **改前**: 隐式返回类型
- **改后**: `: FeishuReplyClient`
- **原因**: 明确返回类型
- **影响**: 类型更清晰

## 9. src/server/tasks/routes.ts — 新增端点

### 改动 1: 导入 FeishuReplyClient 和 logger
- **位置**: 文件顶部
- **改前**: 无
- **改后**: 导入 FeishuReplyClient 类型和 createLogger
- **原因**: 支持新的 reply 端点和 stale reset 端点
- **影响**: 路由可以使用 Feishu 客户端

### 改动 2: registerTaskRoutes 添加 feishuClient 参数
- **位置**: 函数签名
- **改前**: `personalToken: string`
- **改后**: `personalToken: string, feishuClient?: FeishuReplyClient`
- **原因**: 支持可选的 Feishu 客户端注入
- **影响**: 向后兼容，现有调用无需修改

### 改动 3: 新增 /api/tasks/reset-stale 端点
- **位置**: 路由注册
- **改前**: 无
- **改后**: 
  ```typescript
  server.post("/api/tasks/reset-stale", async (req, reply) => {
    const body = req.body as { timeoutMs?: number } | undefined;
    const timeoutMs = body?.timeoutMs ?? 30 * 60 * 1000;
    const resetCount = await store.resetStaleTasks(timeoutMs);
    return reply.send({ ok: true, resetCount });
  });
  ```
- **原因**: 提供管理员手动重置超时任务的接口
- **影响**: 新增 API 端点

### 改动 4: 新增 /api/tasks/:id/reply 端点
- **位置**: 路由注册
- **改前**: 无
- **改后**: 
  ```typescript
  server.post("/api/tasks/:id/reply", async (req, reply) => {
    // 验证 message 参数
    // 获取任务的 feishu_message_id
    // 调用 feishuClient.replyToMessage
    // 返回成功或错误
  });
  ```
- **原因**: 提供专用的飞书回复端点，替代通过 result 端点混用
- **影响**: 新增 API 端点，MCP 客户端可以使用

## 10. src/server/index.ts — 服务器启动改进

### 改动 1: 导入 FastifyRequest 和 createFeishuReplyClient
- **位置**: 文件顶部
- **改前**: 仅导入 Fastify
- **改后**: 导入 FastifyRequest 类型和 createFeishuReplyClient
- **原因**: 支持请求日志和 Feishu 客户端
- **影响**: 新增导入

### 改动 2: 添加请求日志中间件
- **位置**: Fastify 实例创建后
- **改前**: 无
- **改后**: 
  ```typescript
  server.addHook("onRequest", async (req) => {
    req.startTime = Date.now();
  });
  server.addHook("onResponse", async (req, reply) => {
    const duration = Date.now() - req.startTime;
    log.info({ method: req.method, url: req.url, statusCode: reply.statusCode, duration }, "Request completed");
  });
  ```
- **原因**: 记录所有请求的方法、URL、状态码和耗时
- **影响**: 提升可观测性

### 改动 3: 创建并传递 FeishuReplyClient
- **位置**: 路由注册前
- **改前**: 无
- **改后**: 
  ```typescript
  const feishuClient = createFeishuReplyClient(config.feishu);
  registerTaskRoutes(server, store, config.personalToken, feishuClient);
  ```
- **原因**: 将 Feishu 客户端注入到路由
- **影响**: reply 端点可以使用

## 11. src/mcp-server/client.ts — 使用新 reply 端点

### 改动 1: replyFeishu 使用 /reply 端点
- **位置**: replyFeishu 方法
- **改前**: 
  ```typescript
  body: JSON.stringify({ success: true, summary: message })
  ```
- **改后**: 
  ```typescript
  body: JSON.stringify({ message })
  ```
- **原因**: 使用专用的 reply 端点而非 result 端点
- **影响**: 语义更清晰

## 12. src/mcp-server/tools.ts — 更新工具描述

### 改动 1: list_tasks 描述更新
- **位置**: list_tasks 工具
- **改前**: "List tasks from the server. Returns pending tasks by default."
- **改后**: "List tasks from the server. Returns pending tasks by default, sorted by priority (urgent first)."
- **原因**: 反映新的排序行为
- **影响**: 文档更新

## 结构性摘要

### 新增
- `src/shared/config-utils.ts` — 共享配置校验工具
- `TaskPriority` 类型
- `FeishuReplyClient` 接口
- `resetStaleTasks()` 方法
- `parsePriority()` 和 `stripPriorityMarkers()` 函数
- `POST /api/tasks/:id/reply` 端点
- `POST /api/tasks/reset-stale` 端点
- 请求日志中间件

### 重构
- 配置校验函数提取到共享模块
- token 比较改为 timing-safe

### 功能增强
- 任务优先级支持（low/normal/high/urgent）
- 优先级排序
- 超时任务检测和重置

## 风险说明

1. **数据库迁移**: ALTER TABLE 语句在旧数据库上执行，如果列已存在会静默失败
2. **向后兼容**: 新增的 feishuClient 参数是可选的，不影响现有调用
3. **性能**: timing-safe 比较比简单 === 稍慢，但差异可忽略

## 验证步骤

1. 运行 `npm run typecheck` — 通过
2. 运行 `npm test` — 108 个测试全部通过
3. 运行 `npm run build` — 构建成功
4. 手动测试：
   - 发送带 `#priority:urgent` 的消息，验证任务优先级设置
   - 调用 `/api/tasks/reset-stale`，验证超时任务重置
   - 调用 `/api/tasks/:id/reply`，验证飞书回复功能
