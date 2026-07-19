# 管理后台 UI 组件统一与优化 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提取 5 个通用 UI 组件（Switch、ConfirmDialog、SelectFilter、Popover、DateRangePicker），在各管理页面统一应用，并新增密钥刷新功能。

**Architecture:** 新增组件置于 `src/lib/`，每个组件一个文件，各页面引入改造。后端仅新增密钥刷新一个功能点（PATCH /admin/keys 增加 `refresh_key` 参数）。

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Lucide Icons（本地 SVG）

## Global Constraints

- 所有新增组件必须是 `'use client'` 客户端组件
- 所有图标使用 Lucide Icons，通过 `<InlineIcon name="..." />` 组件引用
- 保持浅色主题、白底灰字、indigo-500 (#6366f1) 主色
- 圆角：lg/2xl，阴影：轻微柔和 shadow-sm/border
- 零新增 npm 依赖

---

### Task 1: Switch 组件

**Files:**
- Create: `src/lib/switch.tsx`

**Produces:** `<Switch checked onChange disabled size />` 开关组件，供 keys/channels 页面使用

- [ ] **Step 1: 创建组件文件**

```tsx
'use client';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export function Switch({ checked, onChange, disabled = false, size = 'md' }: SwitchProps) {
  const sizeClasses = size === 'sm'
    ? { track: 'w-8 h-4.5', thumb: 'w-3.5 h-3.5', translate: 'translate-x-3.5' }
    : { track: 'w-10 h-5.5', thumb: 'w-4.5 h-4.5', translate: 'translate-x-4.5' };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`
        relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent
        transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500/20
        ${checked ? 'bg-emerald-500' : 'bg-gray-300'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${sizeClasses.track}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block rounded-full bg-white shadow-sm ring-0
          transition-transform duration-200 ease-in-out
          ${checked ? sizeClasses.translate : 'translate-x-0'}
          ${sizeClasses.thumb}
        `}
      />
    </button>
  );
}
```

> 注：Tailwind v4 默认不含 `w-4.5` / `h-5.5` 等尺寸，需要手动加 `w-[1.125rem]` / `h-[1.375rem]` 等。这里改用精确的 Tailwind v3 兼容写法，或用内联 style 替代。实际使用时根据 Tailwind v4 配置调整。

```tsx
'use client';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

const sizes = {
  sm: { track: 'w-8 h-5', thumb: 'w-3.5 h-3.5', translate: 'translate-x-3' },
  md: { track: 'w-10 h-6', thumb: 'w-4.5 h-4.5', translate: 'translate-x-4' },
} as const;

export function Switch({ checked, onChange, disabled = false, size = 'md' }: SwitchProps) {
  const s = sizes[size];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`
        relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent
        transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500/20
        ${checked ? 'bg-emerald-500' : 'bg-gray-300'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${s.track}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block rounded-full bg-white shadow ring-0
          transition-transform duration-200 ease-in-out
          ${checked ? s.translate : 'translate-x-0'}
          ${s.thumb}
        `}
      />
    </button>
  );
}
```

- [ ] **Step 2: 验证构建**

```bash
cd "D:\project\mortal-api" && npx tsc --noEmit src/lib/switch.tsx --strict --jsx react-jsx 2>&1 | head -20
```

Expected: No type errors (the file may have import errors due to missing project context, but component itself should type-check).

- [ ] **Step 3: 提交**

```bash
git add src/lib/switch.tsx
git commit -m "feat: add Switch component for enable/disable toggle"
```

---

### Task 2: ConfirmDialog 组件

**Files:**
- Create: `src/lib/confirm-dialog.tsx`

**Produces:** `<ConfirmDialog>` 基于 Modal 的确认弹窗，替换 `confirm()` / `alert()`。

- [ ] **Step 1: 创建组件文件**

```tsx
'use client';

import { Modal } from './modal';
import { InlineIcon } from './icon';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  variant?: 'danger' | 'info';
  loading?: boolean;
}

export function ConfirmDialog({
  open, onClose, onConfirm,
  title = '确认操作',
  message,
  confirmText = '确认',
  variant = 'info',
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        {/* Alert icon + message */}
        <div className={`rounded-lg px-4 py-3 text-sm flex items-start gap-3 ${
          variant === 'danger'
            ? 'bg-red-50 border border-red-200 text-red-600'
            : 'bg-indigo-50 border border-indigo-100 text-indigo-700'
        }`}>
          <InlineIcon
            name="triangleAlert"
            className={`w-5 h-5 shrink-0 mt-0.5 ${variant === 'danger' ? 'text-red-500' : 'text-indigo-500'}`}
          />
          <span>{message}</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-3">
            <InlineIcon name="loaderCircle" className="w-5 h-5 animate-spin text-indigo-600" />
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
            <button
              onClick={onConfirm}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors flex items-center justify-center gap-2 ${
                variant === 'danger'
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {variant === 'danger' && <InlineIcon name="trash2" className="w-4 h-4" />}
              {confirmText}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: 检查编译**

```bash
npx tsc --noEmit --strict src/lib/confirm-dialog.tsx --jsx react-jsx 2>&1 | head -20
```

Expected: No type errors.

- [ ] **Step 3: 提交**

```bash
git add src/lib/confirm-dialog.tsx
git commit -m "feat: add ConfirmDialog component"
```

---

### Task 3: SelectFilter 组件

**Files:**
- Create: `src/lib/select-filter.tsx`

**Produces:** 美化版通用下拉筛选器

- [ ] **Step 1: 创建组件文件**

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { InlineIcon } from './icon';

export interface SelectOption {
  label: string;
  value: string;
  color?: 'green' | 'red' | 'gray';
}

interface SelectFilterProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const colorDot: Record<string, string> = {
  green: 'bg-emerald-500',
  red: 'bg-red-400',
  gray: 'bg-gray-300',
};

export function SelectFilter({
  options, value, onChange, placeholder = '请选择', className = '',
}: SelectFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 whitespace-nowrap"
      >
        {selected?.color && (
          <span className={`w-2 h-2 rounded-full ${colorDot[selected.color] || ''}`} />
        )}
        <span className={selected ? 'font-medium' : 'text-gray-400'}>{selected?.label || placeholder}</span>
        <InlineIcon name="chevronDown" className={`w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 min-w-[140px] bg-white border border-gray-200 rounded-xl shadow-lg py-1 overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${
                value === opt.value
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {opt.color && <span className={`w-2 h-2 rounded-full ${colorDot[opt.color]}`} />}
              <span className="flex-1 truncate">{opt.label}</span>
              {value === opt.value && <InlineIcon name="check" className="w-3 h-3 text-indigo-500 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 检查编译**

```bash
npx tsc --noEmit --strict src/lib/select-filter.tsx --jsx react-jsx 2>&1 | head -20
```

- [ ] **Step 3: 提交**

```bash
git add src/lib/select-filter.tsx
git commit -m "feat: add SelectFilter component for unified select styling"
```

---

### Task 4: Popover 组件

**Files:**
- Create: `src/lib/popover.tsx`

**Produces:** 点击触发的弹出层，用于模型限制列展开

- [ ] **Step 1: 创建组件文件**

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';

interface PopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: 'start' | 'center';
}

export function Popover({
  trigger, children,
  open: controlledOpen, onOpenChange,
  align = 'start',
}: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handler);
    }
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, setIsOpen]);

  return (
    <div ref={ref} className="relative inline-block">
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {trigger}
      </div>
      {isOpen && (
        <div
          className={`absolute z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg py-2 px-3 min-w-[140px] ${
            align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 检查编译**

```bash
npx tsc --noEmit --strict src/lib/popover.tsx --jsx react-jsx 2>&1 | head -20
```

- [ ] **Step 3: 提交**

```bash
git add src/lib/popover.tsx
git commit -m "feat: add Popover component for click-triggered overlays"
```

---

### Task 5: DateRangePicker 组件

**Files:**
- Create: `src/lib/date-range-picker.tsx`

**Produces:** 下拉面板式日期范围选择器

- [ ] **Step 1: 创建组件文件**

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { InlineIcon } from './icon';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartChange: (date: string) => void;
  onEndChange: (date: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DateRangePicker({
  startDate, endDate,
  onStartChange, onEndChange,
  onConfirm, onCancel,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handleCancel();
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, localStart, localEnd]);

  useEffect(() => {
    setLocalStart(startDate);
    setLocalEnd(endDate);
  }, [startDate, endDate]);

  const handleConfirm = () => {
    onStartChange(localStart);
    onEndChange(localEnd);
    onConfirm();
    setOpen(false);
  };

  const handleCancel = () => {
    setLocalStart(startDate);
    setLocalEnd(endDate);
    onCancel();
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all bg-indigo-600 text-white shadow-sm"
      >
        <InlineIcon name="calendar" className="w-3 h-3" />
        自定义
        <InlineIcon name="chevronDown" className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 right-0 bg-white border border-gray-200 rounded-xl shadow-lg p-4 min-w-[260px]">
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">开始日期</label>
              <input
                type="date"
                value={localStart}
                onChange={(e) => setLocalStart(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">结束日期</label>
              <input
                type="date"
                value={localEnd}
                onChange={(e) => setLocalEnd(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleConfirm}
                disabled={!localStart}
                className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                确认
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 检查编译**

```bash
npx tsc --noEmit --strict src/lib/date-range-picker.tsx --jsx react-jsx 2>&1 | head -20
```

- [ ] **Step 3: 提交**

```bash
git add src/lib/date-range-picker.tsx
git commit -m "feat: add DateRangePicker component with dropdown panel"
```

---

### Task 6: 后端支持密钥刷新

**Files:**
- Modify: `src/lib/keys.ts` (add `refreshRelayKey` function)
- Modify: `src/app/admin/keys/route.ts` (handle `refresh_key` in PATCH)

- [ ] **Step 1: 在 `src/lib/keys.ts` 新增刷新函数**

在第53行 `deleteRelayKey` 前插入：

```tsx
export function refreshRelayKey(id: string): string | null {
  const db = getDb();
  const newKey = generateRelayKey();
  const result = db.prepare("UPDATE relay_keys SET key = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?").run(newKey, id);
  return result.changes > 0 ? newKey : null;
}
```

- [ ] **Step 2: 在路由中处理 `refresh_key` 参数**

修改 `src/app/admin/keys/route.ts` 的 PATCH handler，在 `updateRelayKey` 调用后增加：

```tsx
// 插入到 updateRelayKey 调用之后、return 之前
let newKeyValue: string | null = null;
if (body.refresh_key) {
  newKeyValue = refreshRelayKey(body.id);
}
// 修改 return 语句附带新密钥
const key = body.refresh_key ? getRelayKeyById(body.id) : null;
return NextResponse.json({ success: true, new_key: newKeyValue, key });
```

> 注意顶部需要导入 `refreshRelayKey` 和 `getRelayKeyById`。

最终 PATCH handler：

```tsx
export async function PATCH(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;
  try {
    const body = await request.json();
    const updated = updateRelayKey(body.id, {
      name: body.name,
      balance: body.balance,
      is_active: body.is_active,
      expires_at: body.expires_at,
      allowed_models: body.allowed_models,
      allowed_channels: body.allowed_channels,
    });

    let newKeyValue: string | null = null;
    if (body.refresh_key) {
      newKeyValue = refreshRelayKey(body.id);
    }

    const key = body.refresh_key ? getRelayKeyById(body.id) : undefined;
    return NextResponse.json({ success: updated, new_key: newKeyValue, key });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add src/lib/keys.ts src/app/admin/keys/route.ts
git commit -m "feat: add key refresh support via PATCH /admin/keys"
```

---

### Task 7: 密钥页面全面改造

**Files:**
- Modify: `src/app/dashboard/keys/page.tsx`

**改造内容：**
① 操作区启用/禁用 → Switch 组件
② 编辑弹窗中增加刷新密钥按钮
③ 到期时间列 → 新增在创建时间右侧
④ 模型限制列 → Popover 方式展示
⑤ 删除确认 → ConfirmDialog

- [ ] **Step 1: 添加导入**

在文件顶部新增导入：

```tsx
import { Switch } from '@/lib/switch';
import { ConfirmDialog } from '@/lib/confirm-dialog';
import { Popover } from '@/lib/popover';
```

- [ ] **Step 2: 新增状态变量**

在 `const [copiedId, setCopiedId]` 行后插入：

```tsx
const [deleteConfirm, setDeleteConfirm] = useState<{ id: string } | null>(null);
const [refreshing, setRefreshing] = useState(false);
const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
```

- [ ] **Step 3: 改造删除逻辑**

替换 `handleDelete` 函数：

```tsx
const handleDelete = async (id: string) => {
  await apiFetch(`/admin/keys?id=${id}`, { method: 'DELETE' });
  setDeleteConfirm(null);
  fetchData();
};
```

在 JSX 末尾（`</div>` 闭合前）添加删除确认弹窗：

```tsx
<ConfirmDialog
  open={!!deleteConfirm}
  onClose={() => setDeleteConfirm(null)}
  onConfirm={() => handleDelete(deleteConfirm!.id)}
  title="确认删除"
  message="确定删除此 Key？此操作不可撤销。"
  confirmText="确认删除"
  variant="danger"
/>
```

- [ ] **Step 4: 改造操作区启用/禁用按钮**

替换当前的 toggle 按钮：

```tsx
{/* 原代码: */}
<button onClick={() => handleToggle(k.id, k.is_active)}
  className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100">
  <InlineIcon name={k.is_active ? 'toggleLeft' : 'toggleRight'} className="w-3.5 h-3.5" />
</button>

{/* 改为: */}
<Switch
  checked={!!k.is_active}
  onChange={() => handleToggle(k.id, k.is_active)}
  size="sm"
/>
```

- [ ] **Step 5: 编辑弹窗中增加刷新密钥按钮**

在编辑弹窗的输入字段后、保存/取消按钮前插入：

```tsx
<div className="border-t border-gray-100 pt-3">
  <div className="flex items-center justify-between">
    <div>
      <p className="text-xs text-gray-500">API Key</p>
      <code className="text-[10px] text-gray-400 font-mono mt-0.5 block">
        {showEdit.key.slice(0, 20)}...
      </code>
    </div>
    <button
      onClick={async () => {
        if (!confirm('刷新 Key 后旧 Key 将立即失效，确定继续？')) return;
        setRefreshing(true);
        const res = await apiFetch('/admin/keys', {
          method: 'PATCH',
          body: JSON.stringify({ id: showEdit.id, refresh_key: true }),
        });
        const data = await res.json();
        setRefreshing(false);
        if (data.new_key) {
          setNewKeyValue(data.new_key);
          fetchData();
        }
      }}
      disabled={refreshing}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 transition-colors"
    >
      <InlineIcon name="refreshCw" className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
      刷新 API Key
    </button>
  </div>
  {newKeyValue && (
    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
      <p className="text-[10px] text-amber-700 font-medium">新 API Key（请立即保存）</p>
      <code className="text-xs text-amber-800 font-mono break-all">{newKeyValue}</code>
      <button onClick={() => { navigator.clipboard.writeText(newKeyValue); }}
        className="mt-1 text-[10px] text-indigo-600 underline">复制</button>
    </div>
  )}
</div>
```

- [ ] **Step 6: 新增到期时间列**

在 table header 的"创建时间"和"操作"之间插入：

```tsx
{/* 在 <th>创建时间</th> 和 <th>操作</th> 之间 */}
<th className="text-left px-3 sm:px-4 py-3 font-medium text-gray-500 text-xs hidden lg:table-cell">到期时间</th>
```

在 table body 对应位置（创建时间 td 之后、操作 td 之前）插入：

```tsx
<td className="px-3 sm:px-4 py-3 text-left text-[10px] whitespace-nowrap hidden lg:table-cell">
  {k.expires_at ? (
    <span className={expired ? 'text-red-500 font-medium' : 'text-gray-500'}>
      {k.expires_at.slice(0, 10)}
    </span>
  ) : (
    <span className="text-gray-300">—</span>
  )}
</td>
```

同时调整 `colSpan` 值（当前8列变为9列）。

- [ ] **Step 7: 模型限制列改造为 Popover**

替换当前模型限制列 td 内容：

```tsx
<td className="px-3 sm:px-4 py-3 hidden md:table-cell">
  {modelsList.length > 0 ? (
    <Popover
      trigger={
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-medium cursor-pointer hover:bg-gray-200 transition-colors">
          <InlineIcon name="bot" className="w-3 h-3" />
          {modelsList.length} 个模型
          <InlineIcon name="chevronDown" className="w-2.5 h-2.5" />
        </span>
      }
    >
      <div className="space-y-1 min-w-[140px]">
        <p className="text-[10px] text-gray-400 font-medium mb-1.5">限制模型</p>
        {modelsList.map(m => (
          <div key={m} className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <code className="text-[11px] text-gray-700 font-mono">{m}</code>
          </div>
        ))}
      </div>
    </Popover>
  ) : (
    <span className="text-[10px] text-gray-400">全部</span>
  )}
</td>
```

- [ ] **Step 8: 手动验证**

```bash
cd "D:\project\mortal-api" && npm run build 2>&1 | tail -20
```

Expected: Build succeeds.

- [ ] **Step 9: 提交**

```bash
git add src/app/dashboard/keys/page.tsx
git commit -m "feat: revamp keys page with Switch, Popover, expiry column, key refresh"
```

---

### Task 8: 仪表盘日期 + 筛选改造

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: 添加导入**

```tsx
import { DateRangePicker } from '@/lib/date-range-picker';
import { SelectFilter } from '@/lib/select-filter';
```

- [ ] **Step 2: 替换自定义日期区域**

移除当前 `showCustom && (...)` 内联 datetime-local 输入块（第131~140行），改为 DateRangePicker 组件。

将：

```tsx
{showCustom && (
  <div className="flex items-center gap-1.5 bg-white rounded-lg border border-gray-200 px-3 py-1.5">
    <InlineIcon name="clock" className="w-3.5 h-3.5 text-gray-400 shrink-0" />
    <input type="datetime-local" value={startMonth} onChange={function(e) { setStartMonth(e.target.value); }}
      className="text-xs border-0 bg-transparent focus:outline-none focus:ring-0 p-0 text-gray-700" style={{width: '9rem'}} />
    <span className="text-gray-300 shrink-0">—</span>
    <input type="datetime-local" value={endMonth} onChange={function(e) { setEndMonth(e.target.value); }}
      className="text-xs border-0 bg-transparent focus:outline-none focus:ring-0 p-0 text-gray-700" style={{width: '9rem'}} />
  </div>
)}
```

改为：

```tsx
{showCustom && (
  <DateRangePicker
    startDate={startMonth}
    endDate={endMonth}
    onStartChange={setStartMonth}
    onEndChange={setEndMonth}
    onConfirm={() => { setShowCustom(false); fetchStats(); }}
    onCancel={() => setShowCustom(false)}
  />
)}
```

并且修改"自定义"按钮的点击逻辑——点击时设置 `activeDate('custom')` + `setShowCustom(true)`，不再需要 `setShowCustom(false)`。

同时修改 `buildUrl` 中的自定义逻辑（第55~58行），因为日期格式从 `datetime-local` 变为 `date`，需要补时间：

```tsx
else if (activeDate === 'custom') {
  if (startMonth) params.set('start_date', startMonth + ' 00:00:00');
  if (endMonth) params.set('end_date', endMonth + ' 23:59:59');
}
```

- [ ] **Step 3: 替换 Key 筛选器**

将当前 `<select>` 替换为 SelectFilter：

```tsx
{/* 替换: */}
<select value={selectedKeyId} onChange={e => setSelectedKeyId(e.target.value)}
  className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 max-w-[160px]">
  <option value="">全部 Key</option>
  {keys.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
</select>

{/* 改为: */}
<SelectFilter
  options={[
    { label: '全部 Key', value: '' },
    ...keys.map(k => ({ label: k.name, value: k.id })),
  ]}
  value={selectedKeyId}
  onChange={setSelectedKeyId}
  placeholder="全部 Key"
  className="max-w-[160px]"
/>
```

- [ ] **Step 4: 验证构建**

```bash
cd "D:\project\mortal-api" && npm run build 2>&1 | tail -20
```

- [ ] **Step 5: 提交**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: replace dashboard date picker and key filter with shared components"
```

---

### Task 9: 日志页筛选器改造

**Files:**
- Modify: `src/app/dashboard/logs/page.tsx`

- [ ] **Step 1: 添加导入**

```tsx
import { SelectFilter } from '@/lib/select-filter';
```

- [ ] **Step 2: 替换状态筛选器**

```tsx
{/* 替换 */}
<select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
  className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
  <option value="">全部状态</option>
  <option value="success">成功</option>
  <option value="fail">失败</option>
</select>

{/* 改为 */}
<SelectFilter
  options={[
    { label: '全部状态', value: '' },
    { label: '成功', value: 'success', color: 'green' },
    { label: '失败', value: 'fail', color: 'red' },
  ]}
  value={statusFilter}
  onChange={(v) => { setStatusFilter(v); setPage(0); }}
  placeholder="全部状态"
/>
```

- [ ] **Step 3: 替换 Key 筛选器**

```tsx
{/* 替换 */}
<select value={keyFilter} onChange={(e) => { setKeyFilter(e.target.value); setPage(0); }}
  className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 max-w-[120px]">
  <option value="">全部 Key</option>
  {keys.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
</select>

{/* 改为 */}
<SelectFilter
  options={[
    { label: '全部 Key', value: '' },
    ...keys.map(k => ({ label: k.name, value: k.id })),
  ]}
  value={keyFilter}
  onChange={(v) => { setKeyFilter(v); setPage(0); }}
  placeholder="全部 Key"
/>
```

- [ ] **Step 4: 验证构建**

```bash
cd "D:\project\mortal-api" && npm run build 2>&1 | tail -20
```

- [ ] **Step 5: 提交**

```bash
git add src/app/dashboard/logs/page.tsx
git commit -m "feat: replace logs page filters with SelectFilter component"
```

---

### Task 10: 渠道页组件替换

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx`

- [ ] **Step 1: 添加导入**

```tsx
import { Switch } from '@/lib/switch';
import { ConfirmDialog } from '@/lib/confirm-dialog';
```

- [ ] **Step 2: 新增状态变量**

在 `const [aliasName, setAliasName]` 后插入：

```tsx
const [deleteConfirm, setDeleteConfirm] = useState<{ id: string } | null>(null);
const [modelErrModal, setModelErrModal] = useState(false);
```

- [ ] **Step 3: 改造删除渠道**

替换 `deleteChannel` 函数调用 `confirm` 的部分：

将 `if (!confirm('确定删除此渠道？关联的模型和别名也会被删除。')) return;` 移除，改为：

```tsx
const handleDeleteChannel = async () => {
  if (!deleteConfirm) return;
  await apiFetch(`/admin/channels?id=${deleteConfirm.id}`, { method: 'DELETE' });
  setDeleteConfirm(null);
  fetchAll();
};
```

同时`deleteChannel`按钮调用改为 `setDeleteConfirm({ id: ch.id })`.

在底部 `</div>` 前添加：

```tsx
<ConfirmDialog
  open={!!deleteConfirm}
  onClose={() => setDeleteConfirm(null)}
  onConfirm={handleDeleteChannel}
  title="确认删除"
  message="确定删除此渠道？关联的模型和别名也会被删除。此操作不可撤销。"
  confirmText="确认删除"
  variant="danger"
/>
```

- [ ] **Step 4: 改造启用/停用按钮**

替换当前的 toggle 图标：

```tsx
{/* 替换 */}
<button onClick={() => toggleChannel(ch.id, ch.is_active)}
  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all border border-transparent hover:border-gray-200">
  <InlineIcon name={ch.is_active ? 'toggleLeft' : 'toggleRight'} className="w-4 h-4" />
</button>

{/* 改为 */}
<Switch
  checked={!!ch.is_active}
  onChange={() => toggleChannel(ch.id, ch.is_active)}
/>
```

并删除该按钮对应的 tooltip span（停用/启用提示文字）。

- [ ] **Step 5: 替换 `alert('模型已存在或创建失败')`**

在 `addModel` 函数中：

```tsx
// 将:
// if (res.ok) { ... } else { alert('模型已存在或创建失败'); }
// 改为:
if (res.ok) {
  setModelModal(false); setNewModelId(''); fetchAll();
} else {
  setModelErrModal(true);
}
```

底部添加：

```tsx
<ConfirmDialog
  open={modelErrModal}
  onClose={() => setModelErrModal(false)}
  onConfirm={() => setModelErrModal(false)}
  title="提示"
  message="模型已存在或创建失败。"
  confirmText="知道了"
  variant="info"
/>
```

- [ ] **Step 6: 验证构建**

```bash
cd "D:\project\mortal-api" && npm run build 2>&1 | tail -20
```

- [ ] **Step 7: 提交**

```bash
git add src/app/dashboard/channels/page.tsx
git commit -m "feat: replace channels page toggles with Switch and confirms with ConfirmDialog"
```
