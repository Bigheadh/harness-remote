# Phase 79: Feishu /watch and /unwatch Slash Commands

## 概览
| 项目 | 内容 |
|------|------|
| 日期 | 2026-06-08 |
| 任务 | 添加飞书 /watch 和 /unwatch 斜杠命令 |
| 涉及文件数 | 3 |
| 新增行数 | ~130 |
| 删除行数 | ~5 |

## 逐文件改动

### src/server/feishu/commands.ts
**改动 1: 文件头注释更新**
- 位置: 第 1-22 行
- 改前: 只列出到 /digest 命令
- 改后: 新增 /watch 和 /unwatch 命令说明
- 原因: 文档完整性

**改动 2: switch 语句新增 case**
- 位置: 第 122-128 行
- 改前: tag case 后直接是 default
- 改后: tag case 后新增 watch 和 unwatch case
- 原因: 路由新的斜杠命令到对应的卡片构建函数

**改动 3: help 文本更新**
- 位置: 第 172-173 行
- 改前: help 卡片只显示到 /tag 命令
- 改后: 新增 /watch 和 /unwatch 命令说明
- 原因: 用户可通过 /help 看到新命令

**改动 4: 新增 buildWatchCard 函数**
- 位置: 第 901-967 行
- 改前: 不存在
- 改后: 新增 67 行函数
- 原因: 实现 /watch 命令的卡片构建逻辑
- 功能: 验证任务存在 → 检查是否已在监听 → 添加监听者 → 返回确认卡片

**改动 5: 新增 buildUnwatchCard 函数**
- 位置: 第 969-1028 行
- 改前: 不存在
- 改后: 新增 60 行函数
- 原因: 实现 /unwatch 命令的卡片构建逻辑
- 功能: 验证任务存在 → 检查是否在监听 → 移除监听者 → 返回确认卡片

### test/server/feishu.commands.test.ts
**改动 1: mock store 新增 watcher 方法**
- 位置: 第 123-126 行
- 改前: deleteSubtask 后直接是 ...overrides
- 改后: 新增 addWatcher, removeWatcher, listWatchers, isWatching mock
- 原因: 测试需要这些方法的 mock

**改动 2: help 测试新增 watch/unwatch 检查**
- 位置: 第 740-741 行
- 改前: help 测试只检查 /assign, /priority, /due, /tag
- 改后: 新增 /watch 和 /unwatch 检查
- 原因: 验证 help 卡片包含新命令

**改动 3: 新增 /watch command 测试块**
- 位置: 第 760-803 行
- 改前: 不存在
- 改后: 4 个测试用例
- 测试覆盖: 订阅成功、已订阅提示、缺少参数、任务不存在

**改动 4: 新增 /unwatch command 测试块**
- 位置: 第 805-869 行
- 改前: 不存在
- 改后: 3 个测试用例
- 测试覆盖: 取消订阅成功、未订阅提示、缺少参数

### FEATURES.md
**改动 1: 新增 Phase 79 条目**
- 位置: 文件末尾
- 改前: Phase 78 是最后一个条目
- 改后: 新增 Phase 79 完整条目
- 原因: 功能追踪器更新

## 结构性摘要
- 新增: 2 个 Feishu 斜杠命令 (/watch, /unwatch)
- 新增: 2 个卡片构建函数 (buildWatchCard, buildUnwatchCard)
- 新增: 10 个测试用例
- 修改: help 文本和文件头注释

## 风险说明
- 低风险: 只添加新命令，不修改现有逻辑
- 已有后端: watch_task/unwatch_task MCP 工具和 API 路由已存在
- 无数据库变更: 复用现有的 task_watchers 表

## 验证步骤
1. npm run typecheck ✅
2. npm run build ✅
3. npm test ✅ (560/560 通过)
4. 服务重启 ✅ (端口 3000 正常监听)
