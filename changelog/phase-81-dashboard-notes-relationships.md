# Phase 81: Dashboard Notes & Relationships Display

## 概览
| 指标 | 数值 |
|------|------|
| 日期 | 2026-06-09 |
| 任务 | 补全仪表盘任务详情面板中缺失的 Notes 和 Relationships 加载功能 |
| 涉及文件数 | 1 |
| 新增行数 | ~50 |
| 删除行数 | 0 |

## 逐文件改动

### src/server/dashboard/templates/dashboard.ts

#### 改动 1: showDetail() 中添加 loadNotes 和 loadRelationships 调用
- **位置**: 约第 1115 行（loadWatchers 调用之后）
- **改前**:
  ```javascript
  loadWatchers(id);
  } catch (e) {
  ```
- **改后**:
  ```javascript
  loadWatchers(id);
  loadNotes(id);
  loadRelationships(id);
  } catch (e) {
  ```
- **原因**: showDetail() 加载任务详情时，并行调用多个 loadXxx() 函数加载子面板数据。此前遗漏了 notes 和 relationships 的加载调用。
- **影响范围**: 仪表盘任务详情面板打开时，notes 和 relationships 数据将自动加载并显示。

#### 改动 2: 新增 loadNotes() 函数
- **位置**: 约第 1286 行（loadWatchers 函数之后）
- **改前**: 无（函数不存在）
- **改后**: 新增 `async function loadNotes(taskId)` — 调用 `GET /api/tasks/:id/notes`，渲染笔记列表（author + timestamp + body），复用 comment-item 样式。无数据时显示 "No notes"。
- **原因**: 后端已有完整的 notes API（store + routes + MCP client + MCP tools），但仪表盘从未加载过 notes 数据。
- **影响范围**: 任务详情面板新增 📝 Notes 区域。

#### 改动 3: 新增 loadRelationships() 函数
- **位置**: 约第 1309 行（loadNotes 函数之后）
- **改前**: 无（函数不存在）
- **改后**: 新增 `async function loadRelationships(taskId)` — 调用 `GET /api/tasks/:id/relationships`，渲染关系列表（类型标签 + 目标任务 ID + 创建时间），复用 dep-item 样式。无数据时显示 "No relationships"。
- **原因**: 后端已有完整的 relationships API，但仪表盘从未加载过 relationships 数据。
- **影响范围**: 任务详情面板新增 🔀 Relationships 区域。

## 结构性摘要
- **新增**: 2 个异步加载函数（loadNotes, loadRelationships）
- **修改**: showDetail() 并行加载调用列表增加 2 项
- **删除**: 无

## 风险说明
- **低风险**: 两个新函数均使用 try/catch 静默降级（与现有 loadSubtasks、loadActivity 等模式一致），即使 API 端点不存在也不会影响面板渲染。
- **无数据库变更**: 纯前端 dashboard 模板修改，不涉及 store/routes 层。

## 验证步骤
1. `npm run typecheck` ✅
2. `npm run build` ✅
3. `npm test` ✅ (560/560)
4. 服务重启后访问仪表盘，打开任务详情面板，确认 📝 Notes 和 🔀 Relationships 区域正常显示。
