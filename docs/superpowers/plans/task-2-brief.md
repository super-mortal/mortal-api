# Task 2: Date Display Functions — Handle Beijing Time Input

From the plan:

**Files:**
- Modify: `src/lib/date.ts`

### Changes Needed

Replace both `toBeijing()` and `toBeijingFull()` to handle Beijing time input (instead of UTC input).

Current code parses input as UTC and converts to Beijing. Since `created_at` now stores Beijing time, we need to append `+08:00` before parsing so JS doesn't double-convert.

**Update `toBeijing()`:**
```typescript
export function toBeijing(beijingDate: string): string {
  const d = new Date(beijingDate.replace(' ', 'T') + '+08:00');
  return d.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}
```

**Update `toBeijingFull()`:**
```typescript
export function toBeijingFull(beijingDate: string): string {
  const d = new Date(beijingDate.replace(' ', 'T') + '+08:00');
  return d.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}
```

### Verification
- Run `npx tsc --noEmit` and confirm no new errors
