# Changelog: Phase 55 — Keyword-Based Auto-Detection

**Date**: 2026-06-07
**Files Modified**: 2
**Lines Added**: ~150
**Lines Removed**: ~15

## Overview

Added natural language keyword-based auto-detection for task priority, tags, and due dates. When a user sends a Feishu message without explicit `#priority:`, `#tag:`, or `#due:` markers, the system now analyzes the message text and automatically sets these fields based on keyword patterns.

## Files Changed

### 1. `src/server/feishu/events.ts`

**What changed**:
- Added `PRIORITY_KEYWORDS` dictionary with regex patterns for urgent/high/low priority detection (English + Chinese)
- Added `TAG_KEYWORDS` dictionary with regex patterns for bug, feature, question, documentation, performance, security, tech-debt, ui/ux tag detection (English + Chinese)
- Added `detectPriorityFromKeywords(text)` — exported function that analyzes text and returns detected priority
- Added `detectTagsFromKeywords(text)` — exported function that analyzes text and returns detected tags
- Added `detectDueDateFromText(text)` — function that detects natural language due dates (today, tomorrow, next week, etc.)
- Modified `parsePriority()` — now falls back to `detectPriorityFromKeywords()` when no explicit marker found
- Modified `parseTagsFromText()` — now falls back to `detectTagsFromKeywords()` when no explicit markers found
- Modified `parseDueDate()` — now falls back to `detectDueDateFromText()` when no explicit marker found

**Why**: Users had to manually add `#priority:urgent` and `#tag:bug` markers to every message. Natural language keyword detection reduces friction and improves the Feishu bot experience.

**Impact**: All new tasks created via Feishu events will now have auto-detected priority, tags, and due dates. Explicit markers still take precedence.

### 2. `test/server/feishu.events.test.ts`

**What changed**:
- Added 14 new test cases for keyword detection:
  - Priority detection: urgent (EN), urgent (CN), high, low
  - Tag detection: bug, feature, multiple tags
  - Due date detection: tomorrow (EN), today (CN)
  - Precedence: explicit markers override keywords
  - Edge cases: no false positives, multiple patterns

**Why**: Comprehensive test coverage for the new auto-detection feature.

## Risk Assessment

**Risk Level**: Low
- Pure additive change — no existing behavior modified
- Explicit markers still take precedence (backward compatible)
- Keyword detection is conservative (only triggers on clear patterns)

## Verification

```bash
npm run typecheck  # ✅ Passes
npm run build      # ✅ Passes
npm test           # ✅ 438 tests pass (14 new)
```

## Reference Projects

- **Linear**: Auto-priority from message content
- **Plane**: Tag detection from task descriptions
- **todo-for-ai (1167★)**: AI-first task management with auto-categorization
