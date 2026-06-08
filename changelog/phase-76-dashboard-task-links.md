# Phase 76: Dashboard Task Links Display

## 概览

| 项目 | 详情 |
|------|------|
| 日期 | 2026-06-08 |
| 任务 | 在 Dashboard 任务详情面板中显示 Task Links（外部链接） |
| 涉及文件数 | 2 |
| 新增行数 | ~30 |
| 删除行数 | 0 |

## 逐文件改动

### 1. `src/server/dashboard/templates/dashboard.ts`

#### 改动 1: CSS 样式 — 添加 `.link-item` 样式

**位置**: CSS 区域 `.watcher-item:last-child` 之后

**改前**:
```css
.watcher-item:last-child { border-bottom: none; }
```

**改后**:
```css
.watcher-item:last-child { border-bottom: none; }
.link-item {
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.link-item:last-child { border-bottom: none; }
.link-item a {
  color: var(--accent);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.link-item a:hover { text-decoration: underline; }
.link-item .link-meta { font-size: 11px; color: var(--text-dim); }
```

**原因**: 为 Task Links 区域提供视觉样式，与 Watchers/Dependencies 等区域保持一致的设计风格。

**影响范围**: Dashboard 任务详情面板的视觉呈现。

#### 改动 2: showDetail 流程 — 添加 loadLinks 调用

**位置**: showDetail 函数内，`loadWatchers(id)` 调用之后

**改前**:
```javascript
loadWatchers(id);
```

**改后**:
```javascript
loadWatchers(id);
loadLinks(id);
```

**原因**: 打开任务详情时自动加载外部链接数据。

**影响范围**: Dashboard 任务详情面板的数据加载流程。

#### 改动 3: loadLinks 函数

**位置**: `loadWatchers` 函数之后，`field` 函数之前

**改前**: 无（新增函数）

**改后**:
```javascript
async function loadLinks(taskId) {
  try {
    const data = await apiFetch('/api/tasks/' + taskId + '/links');
    const links = data.links || [];
    const section = document.createElement('div');
    section.className = 'detail-section';
    if (links.length === 0) {
      section.innerHTML = '<div class="detail-section-header">🔗 Links (0)</div><div class="detail-section-body"><div class="no-data">No external links</div></div>';
    } else {
      section.innerHTML = '<div class="detail-section-header">🔗 Links (' + links.length + ')</div>' +
        '<div class="detail-section-body">' +
        links.map(l =>
          '<div class="link-item">' +
            '<a href="' + escapeHtml(l.url) + '" target="_blank" rel="noopener">' + escapeHtml(l.title || l.url) + '</a>' +
            (l.addedBy ? '<span class="link-meta">· ' + escapeHtml(l.addedBy) + '</span>' : '') +
            (l.createdAt ? '<span class="link-meta">· ' + formatTime(l.createdAt) + '</span>' : '') +
          '</div>'
        ).join('') +
        '</div>';
    }
    document.getElementById('detailBody').appendChild(section);
  } catch { /* links endpoint may not exist */ }
}
```

**原因**: 从 Phase 73 新增的 `/api/tasks/:id/links` 端点获取外部链接数据，并在详情面板中渲染为可点击的链接列表。遵循与其他 async loader（loadSubtasks, loadComments, loadWatchers）相同的模式。

**影响范围**: Dashboard 任务详情面板新增 Links 区域。

### 2. `FEATURES.md`

**改前**: Phase 75 为最后一个条目

**改后**: 新增 Phase 76 条目（4 个 checkbox 均为 `[x]`）

**原因**: 记录新功能的完成状态。

## 结构性摘要

- **新增**: `.link-item` CSS 样式（含子选择器 `.link-meta`、链接样式）
- **新增**: `loadLinks(taskId)` 异步函数（从 API 获取链接并渲染）
- **修改**: `showDetail` 流程中增加 `loadLinks(id)` 调用

## 风险说明

- **低风险**: 纯前端 Dashboard 改动，不影响 API/MCP/Store 层
- **向后兼容**: 如果 `/api/tasks/:id/links` 端点不存在（旧版本），catch 块会静默忽略错误
- **XSS 防护**: 所有用户内容（title, url, addedBy）均通过 `escapeHtml()` 转义

## 验证步骤

1. ✅ `npm run typecheck` — 通过
2. ✅ `npm run build` — 通过
3. ✅ `npm test` — 550/550 测试通过
4. 手动验证: 打开 Dashboard → 点击任务详情 → 确认 Links 区域显示（或显示 "No external links"）
