# Phase 80: Dashboard Module & Cycle Filtering

## 概览
| 项目 | 内容 |
|------|------|
| 日期 | 2026-06-08 |
| 任务 | 添加 Dashboard 模块和周期过滤功能 |
| 涉及文件数 | 2 |
| 新增行数 | ~45 |
| 删除行数 | 0 |

## 逐文件改动

### 1. src/server/dashboard/templates/dashboard.ts

**改动 1: 工具栏添加模块和周期下拉框**
- 位置: ~line 558
- 改前: `<input id="tagFilter" .../>` 后直接是日期范围选择器
- 改后: 在 tagFilter 和日期范围之间插入两个 `<select>` 元素 (moduleFilter, cycleFilter)
- 原因: 用户需要按模块和周期筛选任务列表
- 影响: Dashboard 任务列表视图

**改动 2: 添加过滤状态变量**
- 位置: ~line 841
- 改前: 只有 currentFilter, currentPriorityFilter, searchQuery, tagQuery, dateFrom, dateTo, allTags
- 改后: 新增 currentModuleFilter, currentCycleFilter, allModules, allCycles
- 原因: 存储模块/周期过滤状态和数据

**改动 3: 新增 loadModulesAndCycles() 异步函数**
- 位置: ~line 888
- 改前: 无
- 改后: 并行加载 /api/modules 和 /api/cycles，填充下拉框选项
- 原因: 初始化时获取模块和周期数据供过滤使用

**改动 4: renderTasks() 添加模块和周期过滤逻辑**
- 位置: ~line 983
- 改前: 只有 status, priority, search, tag 过滤
- 改后: 新增 moduleId 和 cycleId 过滤条件
- 原因: 实现客户端侧的模块/周期筛选

**改动 5: 添加事件监听器**
- 位置: ~line 1541
- 改前: 无 moduleFilter/cycleFilter 事件监听
- 改后: 添加 change 事件监听器，触发 renderTasks()
- 原因: 响应用户选择过滤器

**改动 6: 初始化调用**
- 位置: ~line 2523
- 改前: `loadTasks(); connectSSE();`
- 改后: `loadTasks(); loadModulesAndCycles(); connectSSE();`
- 原因: 页面加载时同时获取模块和周期数据

### 2. FEATURES.md
- 新增 Phase 80 条目，标记所有子项为 [x]

## 风险说明
- **低风险**: 纯前端改动，不涉及后端逻辑或数据库变更
- **非关键功能**: loadModulesAndCycles 失败时静默降级（过滤器为空）
- **无破坏性**: 不影响现有过滤器功能

## 验证步骤
- [x] `npm run typecheck` 通过
- [x] `npm run build` 通过
- [x] `npm test` 全部 560 个测试通过
- [x] 服务正常启动，端口 3000 响应 401（auth 保护）
