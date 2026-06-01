# Changelog: End-to-End Integration Test Suite

## 概览

| 日期 | 任务 | 涉及文件数 | 新增行数 | 删除行数 |
|------|------|-----------|---------|---------|
| 2026-06-02 | 添加端到端集成测试套件 | 2 | +321 | -1 |

## 逐文件改动

### 1. test/server/integration.test.ts (新建)

**改动类型**：新建文件

**改动内容**：创建完整的端到端集成测试套件，使用 Fastify 的 `inject()` 方法在进程内模拟 HTTP 请求，无需启动真实服务器。

**测试用例（15 个）**：

| # | 测试描述 | 验证点 |
|---|---------|--------|
| 1 | Feishu P2P 消息创建任务 | POST /feishu/events 返回 201 + taskId |
| 2 | GET /api/tasks 返回新任务 | 任务列表包含刚创建的任务，status=pending |
| 3 | GET /api/tasks/:id 返回详情 | source=feishu, userId 正确, status=pending |
| 4 | 状态转换 pending→picked | POST /status 返回 picked |
| 5 | 状态转换 picked→running | POST /status 返回 running |
| 6 | 上报结果完成任务 | POST /result 返回 done, summary/details 正确 |
| 7 | 重复事件去重 | 同一 eventId 第二次提交返回 200 无 taskId |
| 8 | 非白名单用户忽略 | userId 不在 allowedUserIds 返回 200 |
| 9 | 群聊无 bot mention 忽略 | group + mentionedBot=false 返回 200 |
| 10 | 群聊有 bot mention 创建任务 | group + mentionedBot=true 返回 201 |
| 11 | 无 auth 返回 401 | Bearer token 缺失 |
| 12 | 错误 token 返回 401 | Bearer token 不匹配 |
| 13 | 不存在的任务返回 404 | GET /api/tasks/:id 找不到 |
| 14 | /health 端点正常 | 返回 { ok: true } |
| 15 | 结果上报缺少字段返回 400 | 缺少 summary 字段 |

**实现方式**：
- 使用 `Fastify.inject()` 在内存中处理请求，避免端口绑定和网络延迟
- 每个测试前通过 `makeFeishuEvent()` 生成唯一事件 ID 和消息 ID
- `buildFeishuPayload()` 构建符合飞书事件格式的 JSON 负载
- 使用临时 SQLite 数据库 (`/tmp/harness-remote-integration-test/`)
- `beforeAll` 创建 Fastify 实例并注册路由，`afterAll` 清理资源

**影响范围**：纯测试代码，不影响生产逻辑

**风险**：无。测试使用临时数据库，不影响开发环境数据。

**验证步骤**：
```bash
cd /opt/harness-remote
npm run test  # 95 tests passed
npm run typecheck  # exit 0
npm run build  # exit 0
```

### 2. FEATURES.md (修改)

**改动位置**：第 85 行

**改前**：`- [ ] Integration test: end-to-end flow`
**改后**：`- [x] Integration test: end-to-end flow`

**修改原因**：标记集成测试任务已完成

**影响范围**：仅追踪文件

## 结构性摘要

- **新增**：1 个集成测试文件（321 行），15 个测试用例覆盖完整任务生命周期
- **修改**：1 个追踪文件（FEATURES.md）

## 风险说明

无风险。所有改动均为测试代码和追踪文件，不影响生产逻辑。

## 验证

- [x] typecheck 通过
- [x] build 通过
- [x] 全部 95 个测试通过（含新增 15 个集成测试）
- [x] git commit: f4ac4ba
- [x] git push 成功
