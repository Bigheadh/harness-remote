#!/usr/bin/env python3
"""Add archived tasks view to dashboard template."""
import sys

FILE = '/opt/harness-remote/src/server/dashboard/templates/dashboard.ts'

with open(FILE, 'r') as f:
    lines = f.readlines()

print(f"File has {len(lines)} lines")

def find_line(pattern, start=0):
    for i in range(start, len(lines)):
        if pattern in lines[i]:
            return i
    return -1

# Find anchors
css_line = find_line('.overdue { color: var(--red)')
state_line = find_line("let sortCol = ''")
tasklist_line = find_line('id=\\"taskList\\"')
if tasklist_line < 0:
    tasklist_line = find_line('id="taskList"')
loadtasks_end = find_line("Failed to load tasks:")
renderstats_line = find_line('function renderStats()')
rendertasks_line = find_line('function renderTasks()')
bulk_line = find_line('id=\\"bulkBar\\"')
if bulk_line < 0:
    bulk_line = find_line('id="bulkBar"')
sse_line = find_line("function connectSSE()")

print(f"css={css_line+1} state={state_line+1} tasklist={tasklist_line+1} loadtasks_end={loadtasks_end+1} renderstats={renderstats_line+1} rendertasks={rendertasks_line+1} bulk={bulk_line+1} sse={sse_line+1}")

# Collect all insertions (line_num, text) and replacements (line_num, old, new)
ops = []  # list of (type, line_num, ...)

# Insertions (will be applied bottom-to-top)
# 1. CSS after .overdue
ops.append(('I', css_line + 1,
    '\n'
    '    .archived-toggle { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-card); color: var(--text); font-size: 13px; cursor: pointer; transition: all 0.2s; flex: none; }\n'
    '    .archived-toggle:hover { border-color: var(--accent); }\n'
    '    .archived-toggle.active { background: rgba(108,92,231,0.15); border-color: var(--accent); color: var(--accent); }\n'
    '    tr.archived-row { opacity: 0.55; }\n'
    '    tr.archived-row:hover { opacity: 0.8; }\n'
))

# 2. State vars after sortCol
ops.append(('I', state_line + 1,
    "    let showArchived = false;\n"
    "    let archivedTasks = [];\n"
))

# 3. Toolbar toggle button before taskList
ops.append(('I', tasklist_line,
    '      <button class=\\"archived-toggle\\" id=\\"archivedToggle\\" onclick=\\"toggleArchived()\\">&#128230; Archived</button>\n'
))

# 4. loadArchivedTasks + toggleArchived after loadTasks ends (before renderStats)
# loadTasks ends around line 822 (the } line), renderStats starts at 824
loadtasks_fn_end = find_line("    }", loadtasks_end)  # closing brace of loadTasks
# Insert before renderStats
ops.append(('I', renderstats_line,
    '\n'
    '    async function loadArchivedTasks() {\n'
    '      try {\n'
    "        const data = await apiFetch('/api/tasks/archived?limit=500');\n"
    '        archivedTasks = data.tasks || [];\n'
    '        allTags = new Set();\n'
    '        archivedTasks.forEach(t => {\n'
    '          if (t.tags) t.tags.forEach(tag => allTags.add(tag));\n'
    '        });\n'
    '        renderStats();\n'
    '        renderTasks();\n'
    '      } catch (e) {\n'
    "        document.getElementById('taskList').innerHTML =\n"
    "          '<div class=\\\"empty\\\">Failed to load archived tasks: ' + escapeHtml(e.message) + '</div>';\n"
    '      }\n'
    '    }\n'
    '\n'
    '    function toggleArchived() {\n'
    '      showArchived = !showArchived;\n'
    "      const btn = document.getElementById('archivedToggle');\n"
    "      btn.classList.toggle('active', showArchived);\n"
    "      currentFilter = '';\n"
    "      currentPriorityFilter = '';\n"
    "      searchQuery = '';\n"
    "      tagQuery = '';\n"
    "      document.getElementById('search').value = '';\n"
    "      document.getElementById('statusFilter').value = '';\n"
    "      document.getElementById('priorityFilter').value = '';\n"
    "      document.getElementById('tagFilter').value = '';\n"
    "      document.getElementById('bulkActionsActive').style.display = showArchived ? 'none' : '';\n"
    "      document.getElementById('bulkActionsArchived').style.display = showArchived ? '' : 'none';\n"
    '      if (showArchived) {\n'
    '        loadArchivedTasks();\n'
    '      } else {\n'
    '        loadTasks();\n'
    '      }\n'
    '    }\n'
    '\n'
))

# 5. Add archived-row class before task row return
for i in range(rendertasks_line, min(rendertasks_line + 200, len(lines))):
    if "return '<tr onclick=" in lines[i] and "showDetail" in lines[i] and "cursor:pointer" in lines[i]:
        indent = lines[i][:len(lines[i]) - len(lines[i].lstrip())]
        ops.append(('I', i, indent + "const _acls = showArchived ? ' archived-row' : '';\n"))
        ops.append(('R', i+1, lines[i+1], lines[i+1].replace("return '<tr onclick=", "return '<tr class=\"' + _acls + '\" onclick=")))
        print(f"Row class at line {i+1}")
        break

# 6. Bulk actions - add id to first div and archived div
for i in range(bulk_line, min(bulk_line + 15, len(lines))):
    if 'class=\\"bulk-actions\\"' in lines[i] and 'id' not in lines[i]:
        ops.append(('R', i, lines[i], lines[i].replace('class=\\"bulk-actions\\"', 'class=\\"bulk-actions\\" id=\\"bulkActionsActive\\"')))
        # Find closing </div> and insert archived div before it
        for j in range(i+1, min(i+15, len(lines))):
            if '</div>' in lines[j]:
                ops.append(('I', j,
                    '      <div class=\\"bulk-actions\\" id=\\"bulkActionsArchived\\" style=\\"display:none\\">\n'
                    '        <button class=\\"btn-sm orange\\" onclick=\\"bulkUnarchive()\\">&#128228; Unarchive</button>\n'
                    '        <button class=\\"btn-sm red\\" onclick=\\"bulkDelete()\\">&#128465;&#65039; Delete</button>\n'
                    '        <button class=\\"btn-sm\\" onclick=\\"clearSelection()\\">&#10005; Clear</button>\n'
                    '      </div>\n'
                ))
                break
        break

# 7. SSE handler
for i in range(sse_line, min(sse_line + 20, len(lines))):
    if lines[i].strip() == 'refresh();' and i > sse_line:
        ops.append(('R', i, lines[i], '            if (!showArchived) refresh();\n'))
        break

# 8. Archive/unarchive reload
for i, line in enumerate(lines):
    if "alert('Archived ' + (data.archived" in line:
        for j in range(i+1, min(i+5, len(lines))):
            if lines[j].strip() == "refresh();":
                ops.append(('R', j, lines[j], '        if (showArchived) loadArchivedTasks(); else refresh();\n'))
                break
        break

for i, line in enumerate(lines):
    if "alert('Restored ' + (data.unarchived" in line:
        for j in range(i+1, min(i+5, len(lines))):
            if lines[j].strip() == "refresh();":
                ops.append(('R', j, lines[j], '        if (showArchived) loadArchivedTasks(); else refresh();\n'))
                break
        break

# 9. renderStats changes
for i in range(renderstats_line, min(renderstats_line + 15, len(lines))):
    if 'allTasks.forEach' in lines[i]:
        # Add _tasks line before this, and replace allTasks with _tasks
        ops.append(('R', i, lines[i], '      const _tasks = showArchived ? archivedTasks : allTasks;\n' + lines[i].replace('allTasks.forEach', '_tasks.forEach')))
        break

for i in range(renderstats_line, min(renderstats_line + 15, len(lines))):
    if 'const total = allTasks.length' in lines[i]:
        ops.append(('R', i, lines[i], "      const total = _tasks.length;\n      const _pfx = showArchived ? '&#128230; ' : '';\n"))
        break

for i in range(renderstats_line, min(renderstats_line + 25, len(lines))):
    if "'<div class=\\\"stat-label\\\">' + s.label + '</div>'" in lines[i]:
        ops.append(('R', i, lines[i], lines[i].replace("s.label + '</div>'", "_pfx + s.label + '</div>'")))
        break

for i in range(renderstats_line + 10, min(renderstats_line + 25, len(lines))):
    if "document.title = (active > 0" in lines[i]:
        old_block = lines[i-1] + lines[i] + lines[i+1]
        new_block = (
            '      if (showArchived) {\n'
            "        document.title = '&#128230; Archived (' + total + ') - Harness Remote';\n"
            '      } else {\n'
            + lines[i-1] + lines[i] + lines[i+1]
            + '      }\n'
        )
        ops.append(('R', i-1, old_block, new_block))
        break

# 10. renderTasks source
for i in range(rendertasks_line, min(rendertasks_line + 5, len(lines))):
    if 'let filtered = allTasks' in lines[i]:
        ops.append(('R', i, lines[i], '      let filtered = showArchived ? archivedTasks : allTasks;\n'))
        break

# Separate insertions and replacements
insertions = [(ln, txt) for op in ops if op[0] == 'I' for ln, txt in [(op[1], op[2])]]
replacements = [(ln, old, new) for op in ops if op[0] == 'R' for ln, old, new in [(op[1], op[2], op[3])]]

# Apply replacements first (they don't shift line numbers)
for line_num, old_text, new_text in replacements:
    if isinstance(old_text, str) and len(old_text) > 100:
        # Multi-line replacement
        joined = ''.join(lines[line_num:line_num+3])
        if old_text in joined:
            lines[line_num:line_num+3] = [new_text]
            print(f"Replaced multi-line at {line_num+1}")
        else:
            print(f"WARNING: Multi-line replacement not found at {line_num+1}")
    else:
        if line_num < len(lines):
            if old_text in lines[line_num]:
                lines[line_num] = new_text
                print(f"Replaced line {line_num+1}")
            else:
                print(f"WARNING: Line {line_num+1} doesn't contain expected text")
                print(f"  Expected: {repr(old_text[:80])}")
                print(f"  Got:      {repr(lines[line_num][:80])}")

# Sort insertions by line number descending
insertions.sort(key=lambda x: x[0], reverse=True)

# Apply insertions
for line_num, text in insertions:
    lines.insert(line_num, text)
    print(f"Inserted at line {line_num+1}")

# Write
with open(FILE, 'w') as f:
    f.writelines(lines)

print(f"\nSUCCESS: {len(lines)} lines written")
