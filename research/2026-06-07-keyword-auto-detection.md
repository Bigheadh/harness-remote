# Research: Keyword-Based Auto-Detection — Phase 55

**Date**: 2026-06-07
**Direction**: Feishu Bot UX Enhancement
**Reference**: awesome-mcp-servers, todo-for-ai, activepieces

## 搜索关键词

- `mcp server task management stars:>500` — 最高: awesome-mcp-servers (88629★)
- `task+management+mcp+stars:>100` — 最高: todo-for-ai (1167★)
- `workflow+automation+open+source` — 最高: activepieces (22593★)
- `feishu+bot+auto+categorize` — 中文搜索

## 参考项目分析

### todo-for-ai (1167★) — AI 任务管理系统
- **核心特性**: AI-first task management, auto-categorization, smart prioritization
- **可借鉴**: "AI-Powered Task Creation" — 自动从消息内容推断优先级和标签
- **决策**: 验证了关键词自动检测的用户价值

### activepieces (22593★) — 开源 Zapier 替代品
- **核心特性**: 280+ integrations, workflow automation, AI pieces
- **可借鉴**: "Human in the Loop" — 延迟执行、审批流程模式
- **决策**: 工作流自动化是 harness-remote 的潜在扩展方向，但当前阶段优先改善 Feishu bot 体验

### Plane (50428★) — 开源 Jira/Linear 替代品
- **核心特性**: 看板视图、甘特图、循环视图、Saved Views、活动日志
- **可借鉴**: 智能优先级推断、自动标签分类
- **决策**: 确认了自然语言理解在任务管理中的价值

## Gap 发现过程

1. 用户发送 Feishu 消息时，必须手动添加 `#priority:urgent` 和 `#tag:bug` 标记
2. 这增加了使用摩擦，降低了 Feishu bot 的用户体验
3. 主流任务管理工具（Linear、Plane）都支持从消息内容自动推断优先级和标签
4. harness-remote 的消息解析管道已经具备扩展条件（parsePriority、parseTagsFromText 函数）

## 实现决策

### 为什么选择这个功能
1. **高用户价值**: 减少手动标记工作，提升 Feishu bot 体验
2. **低实现成本**: 只需修改 events.ts 的解析函数，无需新增存储或路由
3. **参考验证**: Linear、Plane 等工具都支持自动分类
4. **向后兼容**: 显式标记仍优先于关键词检测

### 技术方案
- 新增 `PRIORITY_KEYWORDS` 和 `TAG_KEYWORDS` 正则模式字典
- 新增 `detectPriorityFromKeywords()` 和 `detectTagsFromKeywords()` 导出函数
- 新增 `detectDueDateFromText()` 自然语言日期检测
- 修改现有解析函数，在无显式标记时调用关键词检测
- 支持中英文双语关键词

### 关键 Pitfall
- `\b` 词边界正则不适用于中文字符，中文模式需移除 `\b`

## 下一步研究方向

1. **任务路由建议** — 根据消息内容推荐处理设备
2. **多消息上下文** — 连续消息自动合并为一个任务
3. **任务模板变量** — 模板支持动态参数替换
4. **工作流自动化** — 参考 activepieces 的触发器/动作模式
