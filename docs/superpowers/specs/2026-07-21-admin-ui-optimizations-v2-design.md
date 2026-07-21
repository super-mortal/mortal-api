# Admin UI Optimizations V2 — Design Spec

**Date:** 2026-07-21
**Status:** Draft
**Scope:** 5 independent UI fixes across keys, channels, and models pages

---

## 1. Key Expiry: DateTimePicker → DatePicker

**File:** `src/app/dashboard/keys/page.tsx`

### Problem

The `DateTimePicker` component (date + time selector) is rendered inside the edit Key modal. The time portion (`<input type="time">`) extends past the modal's right edge and gets clipped by the modal boundary.

### Solution

Replace `DateTimePicker` with the project's existing `DatePicker` (date-only). The `DatePicker` component already exists in `src/lib/date-picker.tsx` and uses `react-day-picker` with a clean calendar popover.

**Changes:**
- Import: `DateTimePicker` → `DatePicker` from `@/lib/date-picker`
- Edit modal: replace `<DateTimePicker ...>` with `<DatePicker ...>`
- Value format: `yyyy-MM-dd` (no time component)
- Expiry logic: selected date's 00:00 (local time) = key expires
- `handleEditSave` update: the comparison `editExpiry !== (showEdit.expires_at || '').replace(' ', 'T').slice(0, 16)` needs to change to `.slice(0, 10)` so it compares date-only against the stored datetime. When sending, append `T00:00` so the server stores midnight of that day.
- `showEdit.expires_at` display: the existing "当前" readout uses `toBeijing()` which shows full datetime — keep it but consider limiting to date only

**Before:**
```tsx
<DateTimePicker value={editExpiry} onChange={(v) => setEditExpiry(v)} className="w-full" />
```

**After:**
```tsx
<DatePicker value={editExpiry} onChange={(v) => setEditExpiry(v)} className="w-full" />
```

---

## 2. Model Display: Show Original ID with Alias in Parentheses

**File:** `src/app/dashboard/keys/page.tsx`

### Problem

The "允许的模型" dropdown in the Key edit modal currently displays only alias names for models that have aliases. This obscures the actual model ID, making it harder to identify which model is being selected (especially when multiple aliases map to different models).

### Solution

Change the options format to `model_id (alias_name)` when an alias exists, and just `model_id` when there's no alias.

**Required refactoring of `getModelsForChannels()`:**

| Current | New |
|---------|-----|
| Returns `string[]` (alias names + model IDs merged) | Returns `Array<{ label: string; value: string }>` |
| Alias names shown alone | Format: `model_id (alias_name)` |
| Users see `DeepSeek V4 Pro` | Users see `deepseek-v4-pro (DeepSeek V4 Pro)` |

The `value` field stores the raw `model_id` for backend storage, while `label` includes both ID and alias for display.

**Caller changes:**
```typescript
// Before:
const models = await getModelsForChannels(chIds);
setCreateModelOptions(models.map(m => ({ label: m, value: m })));

// After:
setCreateModelOptions(await getModelsForChannels(chIds));
```

Selected model tags in the UI will show the label (with alias in parens), which provides full context.

---

## 3. API Key Eye Toggle: Always Visible When Editing

**File:** `src/app/dashboard/channels/page.tsx`

### Problem

The eye toggle button for revealing/hiding the API key is conditionally rendered:
```tsx
{panelEditId && panelForm.api_key === '••••••••••••••••••' && (...)}
```
The condition `panelForm.api_key === '••••••••••••••••••'` fails in some cases (e.g., empty API key from server, or single character typed), causing the button to not render at all.

### Solution

Remove the sentinel value check. The eye button should show whenever in edit mode (`panelEditId` is truthy):

```tsx
{panelEditId && (
  <button type="button" onClick={() => setShowApiKey(!showApiKey)} ...>
    {showApiKey ? <InlineIcon name="eyeOff" ... /> : <InlineIcon name="eye" ... />}
  </button>
)}
```

This is the original intent: when editing an existing channel, always allow toggling the API key visibility.

---

## 4. Model Editor Save Structure Refactor

**File:** `src/app/dashboard/channels/page.tsx`

### Problem

The model editor section inside the channel side panel has multiple independent action buttons per model card:
- "创建"/"更新" button for alias
- "删除别名" link
- "保存价格" button
- "删除此模型" button

Each makes its own API call. This is inconsistent, error-prone, and requires the user to save each field individually.

### New Flow

**Per model card (when expanded):**
- Inline inputs for alias and prices — unchanged
- All individual action buttons REMOVED
- Two buttons at the bottom:
  - **保存** (bottom-right) — validates inputs, stages the model's changes locally
  - **删除** (bottom-left) — marks the model for deletion

**Outer "💾 保存" button (side panel footer):**
- Saves EVERYTHING in one shot: channel info + model aliases + model pricing + model deletions
- This is the ONLY button that makes API calls
- Changes not committed via the outer save are lost

### State Management

New state to track pending model operations:

```typescript
interface PendingModelChange {
  alias?: string;
  prices?: { prompt_price: string; completion_price: string; cached_prompt_price: string };
  staged: boolean;   // user confirmed via model-card "保存"
  deleted?: boolean; // marked for deletion via model-card "删除"
}
const [pendingModels, setPendingModels] = useState<Record<string, PendingModelChange>>({});
```

### Save Flow

1. **User edits alias/price inputs** → changes stored in `pendingModels[modelId]` via blur/change handlers
2. **User clicks model card "保存"** → validates decimals, sets `staged: true`, shows green confirmation badge
3. **User clicks model card "删除"** → confirm dialog → sets `deleted: true`, card shows "待删除" overlay
4. **User clicks outer "💾 保存"** → `saveChannel()` extended:
   - Save channel info (existing logic, unchanged)
   - Iterate pendingModels:
     - deleted → DELETE channel-model
     - alias changed → DELETE old alias, POST new alias
     - prices changed → POST pricing
   - Clear pendingModels
   - Close side panel, refresh data

### Visual States

| State | Model Card Appearance |
|-------|----------------------|
| Expanded, unsaved | Normal inputs, "保存" and "删除" buttons visible |
| Staged ("已保存") | Green left border/checkmark, card slightly highlighted |
| Pending delete ("待删除") | Red left border, dimmed text, "待删除" badge |
| Outer save completes | All pending cleared, card collapses |

---

## 5. Model Plaza Arrow Direction & Position

**File:** `src/app/dashboard/models/page.tsx`, `src/lib/popover.tsx`

### Problem

1. Arrow icon uses `arrowRight` but should point left
2. Popover appears to the right of the trigger, but should appear to the left
3. Arrow vertical alignment is slightly off relative to the card's content

### Solution

**Arrow icon:** `arrowRight` → `arrowLeft`

**Popover left-side positioning:** Add `side` prop to Popover component.

```typescript
interface PopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: 'start' | 'center';
  side?: 'bottom' | 'left';  // NEW: default 'bottom'
}
```

When `side='left'`:
```typescript
// Position: popover's right edge aligns with trigger's left edge
style={{
  top: dropPos.top,
  right: window.innerWidth - dropPos.left - 4,  // 4px gap
  width: 'max-content',
  minWidth: Math.max(dropPos.width, 160),
}}
```

When `side='bottom'` (default, existing behavior):
```typescript
style={{
  top: dropPos.top,
  left: dropPos.left,
  width: 'max-content',
  minWidth: Math.max(dropPos.width, 160),
}}
```

**Usage in model plaza:**
```tsx
<Popover side="left" trigger={<span>...<InlineIcon name="arrowLeft" .../></span>}>
```

**Alignment fix:** Adjust vertical positioning of the arrow trigger. Change `mt-0.5` to `mt-1` or remove it, and add `self-start` to the arrow container so it stays at the top of the card content regardless of content height.

---

## Implementation Order

| Task | File(s) | Complexity | Dependency |
|------|---------|-----------|------------|
| 1. DatePicker swap | keys/page.tsx | Simple | None |
| 2. Model display format | keys/page.tsx | Medium | None |
| 3. Eye toggle fix | channels/page.tsx | Simple | None |
| 4. Model editor save restructure | channels/page.tsx | Complex | None |
| 5. Arrow direction + popover left | models/page.tsx, popover.tsx | Medium | None |

Tasks are independent and can be built in any order.

## Non-Goals

- No changes to the side panel's Basic Info section structure
- No changes to the health bar or channel card layout
- No changes to the dashboard or logs pages
- No changes to backend APIs (only frontend state management and API call orchestration)
