# Channel & Key Management UI Optimization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 4 contained frontend UI optimizations in the channel management and key management pages.

**Architecture:** All changes are client-side React/TypeScript only. No backend schema changes, no new routes. Four independent changes: (1) Modal `size` prop, (2) HealthBar empty state, (3) alert() → ConfirmDialog, (4) @dnd-kit drag-and-drop sorting.

**Tech Stack:** Next.js 16, Tailwind CSS v4, @dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities, Lucide Icons

## Global Constraints

- All icons must be Lucide Icons (https://lucide.dev/icons) and downloaded locally to `public/icons/`
- No CDN icon loading
- Follow existing Tailwind CSS v4 conventions (shadows, rounded corners, colors)
- Use `<InlineIcon name="icon-name" />` not `<Icon>` for consistency with existing code
- Types are already defined in `src/lib/types.ts` and `src/lib/channels.ts` — do not redefine

---

## File Structure

### Files to Modify

| File | Change |
|------|--------|
| `src/lib/modal.tsx` | Add `size` prop (`'md'` \| `'lg'`) controlling `max-w-*` class |
| `src/app/dashboard/keys/page.tsx:450` | Channel Picker Modal pass `size="lg"` |
| `src/lib/health-badge.tsx:52-63` | HealthBar empty state: 10→20 bars, 0%, — |
| `src/app/dashboard/channels/page.tsx` | Replace alert() with ConfirmDialog; add @dnd-kit drag-and-drop |
| `scripts/download-lucide-icons.js:25` | Add `'grip-vertical'` to `neededIcons` |

### Files to Create

| File | How |
|------|-----|
| `public/icons/grip-vertical.svg` | Download via `node scripts/download-lucide-icons.js` |

### Package Changes

| Package | Version |
|---------|---------|
| `@dnd-kit/core` | latest |
| `@dnd-kit/sortable` | latest |
| `@dnd-kit/utilities` | latest |

---

### Task 1: Modal size prop + Channel Picker width

**Files:**
- Modify: `src/lib/modal.tsx`
- Modify: `src/app/dashboard/keys/page.tsx:450`

**Interfaces:**
- Consumes: Existing `Modal` props (`open`, `onClose`, `title`, `children`, `zIndex`)
- Produces: `Modal` gains optional `size?: 'md' | 'lg'` prop (default `'md'`)

- [ ] **Step 1: Add `size` prop to Modal**

In `src/lib/modal.tsx`, add `size` to the interface and apply it to the container div:

```tsx
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  portal?: boolean;
  zIndex?: number;
  size?: 'md' | 'lg';  // NEW
}
```

Change line 46 from:
```tsx
className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-lg overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
```
to:
```tsx
className={`bg-white rounded-2xl shadow-2xl border border-gray-100 w-full ${size === 'lg' ? 'max-w-2xl' : 'max-w-lg'} overflow-hidden animate-in slide-in-from-bottom-4 duration-200`}
```

Add default value in destructuring:
```tsx
export function Modal({ open, onClose, title, children, portal, zIndex, size = 'md' }: ModalProps) {
```

- [ ] **Step 2: Apply `size="lg"` to Channel Picker Modal**

In `src/app/dashboard/keys/page.tsx`, line 450:

```tsx
<Modal open={chPickerOpen} onClose={() => setChPickerOpen(false)} title="选择渠道" zIndex={9999} size="lg">
```

- [ ] **Step 3: Verify it renders**

Run: `npm run dev` (if not running), navigate to Keys page, click edit on a key, click "选择渠道" — the modal should be visibly wider.

- [ ] **Step 4: Commit**

```bash
git add src/lib/modal.tsx src/app/dashboard/keys/page.tsx
git commit -m "feat: add Modal size prop, widen Channel Picker to max-w-2xl"
```

---

### Task 2: HealthBar empty state — 20 bars + defaults

**Files:**
- Modify: `src/lib/health-badge.tsx:52-63`

**Interfaces:**
- Consumes: `HealthBarProps` with `recent_checks: []` (empty array)
- Produces: When empty, renders 20 gray bars in two rows + 0% + —

- [ ] **Step 1: Replace HealthBar empty state**

In `src/lib/health-badge.tsx`, replace lines 52-63 (the `if (recent_checks.length === 0)` block):

```tsx
export function HealthBar({ recent_checks, uptime_pct, avg_latency_ms }: HealthBarProps) {
  if (recent_checks.length === 0) {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} className="w-2 h-3 rounded-[2px] bg-gray-100" />
            ))}
          </div>
          <span className="text-[10px] text-gray-400 whitespace-nowrap">0%</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} className="w-2 h-3 rounded-[2px] bg-gray-100" />
            ))}
          </div>
          <span className="text-[10px] text-gray-400 whitespace-nowrap">—</span>
        </div>
      </div>
    );
  }
  // ... rest unchanged
```

- [ ] **Step 2: Verify**

Create a channel with no health checks and visit Channels page. The card should show 20 gray bars per row with "0%" and "—" on the right.

- [ ] **Step 3: Commit**

```bash
git add src/lib/health-badge.tsx
git commit -m "fix: show 20 empty bars + defaults in HealthBar when no checks"
```

---

### Task 3: Download grip-vertical icon

**Files:**
- Modify: `scripts/download-lucide-icons.js:25`
- Create: `public/icons/grip-vertical.svg` (via script)

- [ ] **Step 1: Add icon to script**

In `scripts/download-lucide-icons.js`, add `'grip-vertical'` to the `neededIcons` array. Insert it alphabetically near the top:

```js
const neededIcons = [
  "download",
  "receipt",
  'grip-vertical',   // NEW
  'layout-dashboard', 'key-round', 'plug', 'list', 'log-out', 'check', 'x',
  // ... rest unchanged
];
```

- [ ] **Step 2: Download**

```bash
node scripts/download-lucide-icons.js
```

Expected: `grip-vertical` appears in the success count. Verify file exists:
```bash
ls public/icons/grip-vertical.svg
```

- [ ] **Step 3: Commit**

```bash
git add scripts/download-lucide-icons.js public/icons/grip-vertical.svg
git commit -m "chore: add grip-vertical icon for drag handle"
```

---

### Task 4: Replace alert() with ConfirmDialog in channel pull-models

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx`

**Interfaces:**
- Consumes: Existing `ConfirmDialog` from `@/lib/confirm-dialog` (already imported at line 8)
- Consumes: Existing `doPullModels` function at line 282

- [ ] **Step 1: Add state variables for error dialogs**

After line 58 (`const [modelErrModal, setModelErrModal] = useState(false);`), add three new state variables:

```tsx
const [pullEmptyDialog, setPullEmptyDialog] = useState<string | null>(null);  // message for "empty models"
const [pullFailDialog, setPullFailDialog] = useState<string | null>(null);    // message for "HTTP failure"
const [pullErrDialog, setPullErrDialog] = useState<string | null>(null);      // message for "exception"
```

- [ ] **Step 2: Replace alert() calls in doPullModels**

Replace lines 282-298 (the entire `doPullModels` function):

```tsx
const doPullModels = async (id: string) => {
  setPullingId(id);
  try {
    const res = await apiFetch('/admin/channels', { method: 'PUT', body: JSON.stringify({ id, _action: 'pull-models' }) });
    if (res.ok) {
      const d = await res.json();
      const models = d.models || [];
      if (models.length === 0) {
        setPullEmptyDialog('上游返回了空模型列表，请检查 API Key 和 URL');
      } else {
        setPulledModels(function(p) { var o: Record<string, string[]> = {}; o[id] = models; return Object.assign({}, p, o); });
      }
    } else {
      const text = await res.text();
      setPullFailDialog('拉取失败 (HTTP ' + res.status + '):\n' + (text || '').slice(0, 300));
    }
  } catch (e) {
    setPullErrDialog('拉取异常: ' + String(e instanceof Error ? e.message : e).slice(0, 300));
  }
  setPullingId(null);
};
```

- [ ] **Step 3: Add ConfirmDialog components**

Before the closing `</div>` of the return (before line 775), add the three ConfirmDialog instances:

```tsx
<ConfirmDialog
  open={!!pullEmptyDialog}
  onClose={() => setPullEmptyDialog(null)}
  onConfirm={() => setPullEmptyDialog(null)}
  title="提示"
  message={pullEmptyDialog || ''}
  confirmText="知道了"
  variant="info"
/>
<ConfirmDialog
  open={!!pullFailDialog}
  onClose={() => setPullFailDialog(null)}
  onConfirm={() => setPullFailDialog(null)}
  title="拉取失败"
  message={pullFailDialog || ''}
  confirmText="知道了"
  variant="danger"
/>
<ConfirmDialog
  open={!!pullErrDialog}
  onClose={() => setPullErrDialog(null)}
  onConfirm={() => setPullErrDialog(null)}
  title="请求异常"
  message={pullErrDialog || ''}
  confirmText="知道了"
  variant="danger"
/>
```

- [ ] **Step 4: Verify behavior**

Open channel side panel, click "拉取" with an invalid URL. You should see the styled ConfirmDialog instead of a browser alert. Test all three paths:
1. Valid URL + invalid API key → should show "上游返回了空模型列表" dialog
2. Invalid URL (e.g., `https://invalid.local/`) → should show "拉取失败" dialog
3. Network failure → should show "请求异常" dialog

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/channels/page.tsx
git commit -m "fix: replace browser alert() with ConfirmDialog for pull-models errors"
```

---

### Task 5: Channel card drag-and-drop sorting

**Files:**
- Modify: `package.json` (add deps)
- Modify: `src/app/dashboard/channels/page.tsx`
- Already available: `public/icons/grip-vertical.svg` (from Task 3)

**Interfaces:**
- Consumes: `channels` state array, `setChannels`, `fetchAll`
- Produces: Drag-reorderable channel card list, persisted via `PATCH /admin/channels`

- [ ] **Step 1: Install @dnd-kit dependencies**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Add imports**

At the top of `src/app/dashboard/channels/page.tsx`, add:

```tsx
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
```

Note: `@dnd-kit/modifiers` may need installing too. If so:
```bash
npm install @dnd-kit/modifiers
```

- [ ] **Step 3: Create SortableChannelCard component**

Before the `export default function ChannelsPage()` line, add this component:

```tsx
function SortableChannelCard({ ch, children }: { ch: Channel; children: React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ch.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    position: isDragging ? 'relative' as const : undefined,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'relative z-50' : ''}>
      <div className="flex items-stretch">
        {/* Drag handle */}
        <button
          className="flex items-center justify-center w-8 shrink-0 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors rounded-l-xl hover:bg-gray-50 border-r border-transparent hover:border-gray-200"
          {...attributes}
          {...listeners}
          title="拖拽排序"
        >
          <InlineIcon name="grip-vertical" className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add sensors and drag handler**

Inside `ChannelsPage`, after state declarations and before the `if (loading)` check, add:

```tsx
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
);

const handleDragEnd = useCallback(async (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;

  setChannels((prev) => {
    const oldIndex = prev.findIndex((ch) => ch.id === active.id);
    const newIndex = prev.findIndex((ch) => ch.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return prev;
    const reordered = arrayMove(prev, oldIndex, newIndex);

    // Persist new priority order
    reordered.forEach((ch, idx) => {
      apiFetch('/admin/channels', {
        method: 'PATCH',
        body: JSON.stringify({ id: ch.id, priority: idx }),
      });
    });

    return reordered;
  });
}, []);
```

- [ ] **Step 5: Wrap channel card rendering with DndContext + SortableContext**

Replace the channel cards section (from line 357 `<div className="space-y-4">` prior to the channel map, down to where channels.map ends). Find the wrapping area:

Around line 356-410, replace:
```tsx
      {/* Channel Cards */}
      {channels.map(ch => {
        ...
      })}
```
with:
```tsx
      {/* Channel Cards */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={channels.map(ch => ch.id)} strategy={verticalListSortingStrategy}>
          {channels.map(ch => {
            const models = modelsForChannel(ch.id);
            return (
              <SortableChannelCard key={ch.id} ch={ch}>
                <div className="bg-white rounded-xl border border-gray-100 hover:shadow-sm transition-shadow"
                  style={{ borderRadius: '0 0.75rem 0.75rem 0' }}>
                  <div className="p-4 sm:p-5">
                    {/* existing card content — unchanged from lines 362-406 */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        ...
                      </div>
                      ...
                    </div>
                  </div>
                </div>
              </SortableChannelCard>
            );
          })}
        </SortableContext>
      </DndContext>
```

The existing card JSX from lines 362-406 should be copied verbatim as the children of `SortableChannelCard`. The outer `bg-white rounded-xl border...` div loses its original rounding since the SortableChannelCard wraps and the drag handle rounds the left side.

**Important**: The card's border-radius on the right side only is achieved via `style={{ borderRadius: '0 0.75rem 0.75rem 0' }}` — this makes the handle's left side squared and the card content's right side rounded, creating a seamless union.

- [ ] **Step 6: Remove the outer border/rounding from the inner card**

Since the SortableChannelCard houses the handle + card as one visual unit, the inner `<div>` should have its original `rounded-xl` replaced with a right-side-only rounding:

Inside the card content, change:
```tsx
<div className="bg-white rounded-xl border border-gray-100 hover:shadow-sm transition-shadow">
```
to:
```tsx
<div className="bg-white border border-gray-100 hover:shadow-sm transition-shadow h-full">
```

The `h-full` makes the card fill the sortable container vertically.

- [ ] **Step 7: Verify drag-and-drop works**

Run dev server, navigate to Channels page. Verify:
1. Each channel card has a grip-vertical handle on the left
2. Click and drag a card — card shifts with visual feedback
3. Drop in new position — channels reorder in the list
4. Refresh page — order persists (check priority values updated)

- [ ] **Step 8: Commit**

```bash
git add package.json src/app/dashboard/channels/page.tsx
git commit -m "feat: add drag-and-drop sorting for channel cards with @dnd-kit"
```

---

## Self-Review Checklist

- [ ] **Spec coverage:** All 4 spec items covered (Modal size, HealthBar 20 bars, alert→ConfirmDialog, @dnd-kit drag)
- [ ] **No placeholders:** Every code block contains real, compilable code
- [ ] **Type consistency:** `ModalProps.size` is `'md' | 'lg'` everywhere; `Canvas` type used matches `channels.ts`
- [ ] **All file paths are exact and include line numbers where known
