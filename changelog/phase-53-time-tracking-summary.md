# Phase 53: Time Tracking Summary & Dashboard Visualization

## 概览
| 项目 | 详情 |
|------|------|
| 日期 | 2026-06-07 |
| 任务 | 添加时间跟踪汇总统计 API + MCP 工具 + 仪表盘可视化 |
| 涉及文件 | 7 个 |
| 新增测试 | 8 个 |

## 逐文件改动

### 1. src/shared/types.ts
**改动**: 新增 `TimeTrackingSummary` 接口
- **位置**: 文件末尾，`TaskWatcher` 接口之后
- **改前**: 无
- **改后**: 新增 `TimeTrackingSummary` 接口，包含 `totalEntries`, `totalMinutes`, `avgMinutesPerEntry`, `avgMinutesPerTask`, `tasksWithEntries`, `activeTimers`, `byUser`, `byPriority`, `recentDaily` 字段
- **原因**: 为时间跟踪汇总统计提供类型定义
- **影响**: 所有消费 TimeTrackingSummary 的 store、route、client、tool 文件

### 2. src/server/tasks/store.ts
**改动**: TaskStore 接口新增 `getTimeTrackingSummary()` 方法声明 + 实现
- **位置**: 接口声明 (line ~175) + 实现 (line ~3143)
- **改前**: 无 `getTimeTrackingSummary` 方法
- **改后**: 接口声明 + 实现方法，包含 5 个 SQL 查询 (total/active/tasks/byUser/byPriority/daily)
- **原因**: 提供聚合时间跟踪统计的数据库查询
- **影响**: 被 stats route 调用

### 3. src/server/stats/routes.ts
**改动**: 新增 `GET /api/stats/time-tracking` 路由
- **位置**: 文件末尾，`registerStatsRoutes` 函数内
- **改前**: 无
- **改后**: 新增带认证、授权、缓存的 stats 端点
- **原因**: 暴露时间跟踪统计给前端和 MCP 客户端
- **影响**: 被 dashboard 和 MCP client 调用

### 4. src/mcp-server/client.ts
**改动**: TaskApiClient 接口新增 `getTimeTrackingStats()` 方法声明 + 实现
- **位置**: 接口 (line ~166) + 实现 (line ~1935)
- **改前**: 无
- **改后**: HTTP GET 客户端方法，调用 `/api/stats/time-tracking`
- **原因**: 让 MCP 工具可以获取时间跟踪统计
- **影响**: 被 MCP tool 调用

### 5. src/mcp-server/tools.ts
**改动**: 新增 `get_time_tracking_stats` MCP 工具
- **位置**: 文件末尾
- **改前**: 113 个工具
- **改后**: 114 个工具
- **原因**: 让 AI 代理可以查询时间跟踪分析数据
- **影响**: MCP 工具注册数从 113 增加到 114

### 6. src/server/dashboard/templates/dashboard.ts
**改动**: Analytics 视图新增时间跟踪可视化卡片
- **位置**: `loadAnalytics()` 函数 (fetch) + `renderAnalytics()` 函数 (渲染)
- **改前**: 6 个 analytics 卡片 (status, priority, creation trend, completion trend, processing, users)
- **改后**: 7 个 analytics 卡片 (新增 time tracking: total time, entries, averages, by-priority chart, by-user chart)
- **原因**: 在仪表盘中可视化时间跟踪数据
- **影响**: 用户在 Analytics 标签页可以看到时间跟踪统计

### 7. test/server/tasks.store.test.ts
**改动**: 新增 4 个 getTimeTrackingSummary 测试
- **位置**: 文件末尾新 describe 块
- **改前**: 65 个测试
- **改后**: 69 个测试
- **原因**: 验证 store 层时间跟踪汇总逻辑
- **影响**: 测试覆盖零值状态、聚合、活跃计时器、优先级分解

### 8. test/mcp-server/tools.test.ts
**改动**: mock client 新增 getTimeTrackingStats + 新增 4 个测试 + 工具计数更新
- **位置**: mock client (line ~1558) + 新 describe 块 (文件末尾) + 计数断言 (line ~1630)
- **改前**: 113 工具断言, 173 个测试
- **改后**: 114 工具断言, 177 个测试
- **原因**: 验证 MCP 工具注册、数据返回、错误处理
- **影响**: 测试覆盖新工具的完整生命周期

## 结构性摘要
- **新增**: 1 个共享类型接口 (`TimeTrackingSummary`)
- **新增**: 1 个 store 方法 (`getTimeTrackingSummary`)
- **新增**: 1 个 API 路由 (`GET /api/stats/time-tracking`)
- **新增**: 1 个 MCP client 方法 (`getTimeTrackingStats`)
- **新增**: 1 个 MCP 工具 (`get_time_tracking_stats`)
- **新增**: 1 个仪表盘 analytics 卡片 (时间跟踪可视化)
- **新增**: 8 个测试用例

## 风险说明
- **低风险**: 纯新增代码，不修改现有逻辑
- **低风险**: SQL 查询为只读聚合，不影响写入性能
- **低风险**: Dashboard 改动为纯前端 JS 模板，不影响后端

## 验证步骤
- [x] `npm run typecheck` 通过
- [x] `npm run build` 通过
- [x] `npm test` — 420 个测试全部通过 (从 412 增加到 420)
- [x] 工具计数断言更新为 114
