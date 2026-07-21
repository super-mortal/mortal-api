# 管理后台 UI 优化集合 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 批量优化管理后台 5 个页面的 UI 细节——HealthBar 点阵布局、模型 Popover、日期选择器统一、侧边栏调整、API Key 显示、价格校验、模型广场去重、日志字体缩小。

**Architecture:** 所有改动独立分布在 5 个文件中，彼此无依赖。按实现顺序排列：
1. logs/page.tsx（最小改动）
2. health-badge.tsx（独立组件）
3. keys/page.tsx（Popover + DateTimePicker）
4. channels/page.tsx（侧边栏 + API Key + 价格）
5. models/page.tsx（去重逻辑最大改动）

每个任务都是自包含的——改动后可直接页面验证。

**Tech Stack:** Next.js 16 + TypeScript + Tailwind CSS v4 + React

## Global Constraints

- 所有图标使用 Lucide Icons（本地 SVG 加载），不使用 CDN
- 浅色主题，白底灰字
- 移动端适配保持现状（hidden md:table-cell 等断点不变）
- 不改动 API 接口，所有变更仅限前端

---

### Task 1: 调用日志表格字号缩小

**Files:**
- Modify: `src/app/dashboard/logs/page.tsx`

**Interfaces:**
- Consumes: 无
- Produces: 日志表格字号整体缩小 1px

改动当前字号：

| 原始 | 目标 |
|------|------|
| `text-[10px] sm:text-xs` | `text-[9px] sm:text-[11px]` |
| `text-[10px]` | `text-[9px]` |
| `text-xs` | `text-[11px]` |

- [ ] **查看当前表格区域的所有字号类**

在 `src/app/dashboard/logs/page.tsx` 中查找 `<table>` 内的所有字号 Tailwind 类，确认改动范围。主要改动点：

1. 表头 `th` 中：`text-[10px] sm:text-xs` → `text-[9px] sm:text-[11px]`
2. 数据行 `td` 中：`text-[10px] sm:text-xs` → `text-[9px] sm:text-[11px]`
3. `text-[10px]`（非响应式的）→ `text-[9px]`
4. `text-xs`（在表格内的）→ `text-[11px]`
5. 分页区域的 `text-xs` → `text-[11px]`

- [ ] **统一替换表格内的字号类**

用 Edit 工具逐行修改。搜索模式：
- `text-[10px] sm:text-xs` → `text-[9px] sm:text-[11px]`
- `text-xs`（仅在表格和分页区域内）→ `text-[11px]`
- `text-[10px]`（在表格内的）→ `text-[9px]`

注意：`text-xs` 和 `text-[10px]` 可能在页面其他位置（如统计条、按钮）也有使用，只改表格和分页区域内的。

- [ ] **验证构建无报错**

```bash
cd /d/project/mortal-api && npm run build 2>&1 | tail -20
```
期望输出：无 TypeScript/ESLint 错误。

- [ ] **提交**

```bash
git add src/app/dashboard/logs/page.tsx
git commit -m "style: reduce log table font size by 1px"
```

---

### Task 2: HealthBar 24 点双行布局

**Files:**
- Modify: `src/lib/health-badge.tsx` — `HealthBar` 组件

**Interfaces:**
- Consumes: 接口 `{ recent_checks, uptime_pct, avg_latency_ms }` 不变
- Produces: 最多 24 点，分两行，第一行右 % 第二行右 ms

- [ ] **修改 HealthBar 渲染逻辑**

将当前 `recent_checks.map(...)` 的单行渲染改为双行布局：

```tsx
export function HealthBar({ recent_checks, uptime_pct, avg_latency_ms }: HealthBarProps) {
  if (recent_checks.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="w-2 h-3 rounded-[2px] bg-gray-100" />
          ))}
        </div>
        <span className="text-[10px] text-gray-400">暂无数据</span>
      </div>
    );
  }

  const dotColor = (check: CheckItem) => {
    if (!check.ok) {
      if (check.kind === 'quota') return 'bg-amber-400';
      return 'bg-red-400';
    }
    return 'bg-emerald-400';
  };

  const maxDots = 24;
  const checks = recent_checks.slice(-maxDots); // 取最近 24 条
  const firstRow = checks.slice(0, 12);
  const secondRow = checks.slice(12, 24);

  const DotRow = ({ items }: { items: CheckItem[] }) => (
    <div className="flex gap-0.5 items-end">
      {items.map((check, i) => (
        <div
          key={i}
          className={`w-2 h-3 rounded-[2px] ${dotColor(check)}`}
          title={`${check.checked_at?.slice(0, 16) || '?'} · ${check.ok ? '成功' : (check.kind === 'quota' ? '额度上限' : '失败')} · ${check.latency_ms}ms${check.error ? ' · ' + check.error : ''}`}
        />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <DotRow items={firstRow} />
        <span className="text-[10px] text-gray-500 whitespace-nowrap">{uptime_pct}%</span>
      </div>
      {secondRow.length > 0 && (
        <div className="flex items-center gap-2">
          <DotRow items={secondRow} />
          <span className="text-[10px] text-gray-500 whitespace-nowrap">
            <span title="平均响应时间">{avg_latency_ms}ms</span>
          </span>
        </div>
      )}
    </div>
  );
}
```

关键变更：
- `recent_checks.slice(-24)` — 取最近 24 条
- `slice(0, 12)` / `slice(12, 24)` — 分两行
- 第一行右侧：`{uptime_pct}%`
- 第二行右侧（仅当有第二行数据时）：`{avg_latency_ms}ms`
- 整个组件外层从 `flex items-center gap-2` 改为 `flex flex-col gap-0.5`

- [ ] **验证构建**

```bash
cd /d/project/mortal-api && npm run build 2>&1 | tail -20
```

- [ ] **提交**

```bash
git add src/lib/health-badge.tsx
git commit -m "feat: limit HealthBar to 24 dots in two rows with % and ms"
```

---

### Task 3: Key 管理 — 模型限制 Popover 自适应

**Files:**
- Modify: `src/app/dashboard/keys/page.tsx` — `<Popover>` 中的模型列表
- Modify: `src/lib/popover.tsx` — 移除 `min-w-[140px]` 硬限制

**Interfaces:**
- Consumes: `Popover` 组件的现有接口不变
- Produces: 模型列表自适应宽度，≤10单列 ＞10双列

- [ ] **移除 Popover 的最小宽度限制**

在 `src/lib/popover.tsx` 中，移除第 74 行的 `min-w-[140px]`：

```diff
- className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg py-2 px-3 min-w-[140px] max-h-60 overflow-y-auto"
+ className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg py-2 px-3 max-h-60 overflow-y-auto"
```

同时将宽度从 `dropPos.width`（触发器的宽度）改为 `max-content` 自适应：
```diff
- width: dropPos.width,
+ width: 'max-content',
+ minWidth: Math.max(dropPos.width, 160),
```

这样 Popover 宽度至少和触发器一样宽（160px 保底），但会根据内容自动扩展。

- [ ] **修改 Key 页面的模型列表渲染逻辑**

找到 keys/page.tsx 中 `<Popover>` 的 children 部分（当前在行 517-527）：

```tsx
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
    {modelsList.length > 10 ? (
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {modelsList.map(m => (
          <div key={m} className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            <code className="text-[11px] text-gray-700 font-mono break-all">{m}</code>
          </div>
        ))}
      </div>
    ) : (
      modelsList.map(m => (
        <div key={m} className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <code className="text-[11px] text-gray-700 font-mono whitespace-nowrap">{m}</code>
        </div>
      ))
    )}
  </div>
</Popover>
```

关键变化：
- 去掉 `min-w-[140px]`（移到 popover.tsx 层）
- 条件渲染：`modelsList.length > 10 ? grid-cols-2 : 单列`
- 双列中模型名 `break-all`（允许长模型名换行），单列中 `whitespace-nowrap`
- Popover `max-h-60` 已在组件层定义，高度大约可显示 10 个模型

- [ ] **验证构建**

```bash
cd /d/project/mortal-api && npm run build 2>&1 | tail -20
```

- [ ] **提交**

```bash
git add src/app/dashboard/keys/page.tsx src/lib/popover.tsx
git commit -m "feat: adaptive model popover — remove min-width, 2-col when >10"
```

---

### Task 4: 编辑 Key 过期时间 DateTimePicker

**Files:**
- Modify: `src/app/dashboard/keys/page.tsx` — 编辑 Modal 中的过期时间字段

**Interfaces:**
- Consumes: `DateTimePicker` 组件（来自 `src/lib/date-picker.tsx`），接口 `value: string, onChange: (v: string) => void`
- Produces: 编辑 Key 过期时间使用统一日历选择器

- [ ] **替换编辑 Modal 中的过期时间输入**

当前代码（行 367-372）：
```tsx
<div>
  <label className="block text-xs text-gray-500 mb-1.5">过期时间</label>
  <input type="datetime-local" value={editExpiry} onChange={(e) => setEditExpiry(e.target.value)}
    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
  {showEdit.expires_at && <p className="text-[10px] text-gray-400 mt-1">当前: {toBeijing(showEdit.expires_at)}</p>}
</div>
```

替换为：
```tsx
<div>
  <label className="block text-xs text-gray-500 mb-1.5">过期时间</label>
  <DateTimePicker value={editExpiry} onChange={(v) => setEditExpiry(v)}
    className="w-full" />
  {showEdit.expires_at && <p className="text-[10px] text-gray-400 mt-1">当前: {toBeijing(showEdit.expires_at)}</p>}
</div>
```

`DateTimePicker` 已经在文件顶部导入（行 9: `import { DateTimePicker, DatePicker } from '@/lib/date-picker';`），所以无需添加 import。

- [ ] **验证构建**

```bash
cd /d/project/mortal-api && npm run build 2>&1 | tail -20
```

- [ ] **提交**

```bash
git add src/app/dashboard/keys/page.tsx
git commit -m "feat: use DateTimePicker for key expiry date editing"
```

---

### Task 5: 渠道侧边栏 — 宽度、滚动条、API Key 显示

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx` — 侧边 Panel

**Interfaces:**
- Consumes: 无
- Produces: 侧边栏 +20px、滚动条隐藏、API Key ***+眼睛切换

- [ ] **调整侧边栏宽度**

找到行 276：
```diff
- <div className="absolute right-0 top-0 bottom-0 w-1/2 min-w-[480px] max-w-[640px] bg-white shadow-2xl flex flex-col">
+ <div className="absolute right-0 top-0 bottom-0 w-1/2 min-w-[500px] max-w-[660px] bg-white shadow-2xl flex flex-col">
```

- [ ] **隐藏侧边栏内容区域滚动条**

找到侧边栏内容区域的 className（行 289）：
```tsx
<div className="flex-1 overflow-y-auto px-6 py-4">
```

改为：
```tsx
<div className="flex-1 overflow-y-auto px-6 py-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
```

Tailwind v4 支持任意 CSS 的自定义语法 `[scrollbar-width:none]`。

- [ ] **API Key 字段 — *** 显示 + 眼睛切换**

改动 1：添加 hasExistingKey 计算和 showApiKey 状态

在组件顶部（state 定义区域，约行 45-57）添加：
```typescript
const [showApiKey, setShowApiKey] = useState(false);
```

改动 2：修正打开侧边栏时 panelForm.api_key 的赋值

在 `setPanelForm` 被调用处（约行 250），打开侧边栏时：
```tsx
<button onClick={() => {
  setPanelForm({ name: ch.name, base_url: ch.base_url, api_key: ch.api_key ? '••••••••••••••••••' : '', priority: ch.priority, notes: ch.notes });
  setPanelEditId(ch.id);
  setModelChannelId(ch.id);
  setSidePanelOpen(true);
}}
```

改动 3：替换 API Key 输入框的 placeholder 为 *** 显示 + 眼睛图标

找到 API Key 字段（行 312-316）：
```tsx
<div className="mt-3">
  <label className="block text-xs text-gray-500 mb-1">API Key <span className="text-gray-400">（加密存储）</span></label>
  <input type="password" value={panelForm.api_key} onChange={e => setPanelForm({...panelForm, api_key: e.target.value})}
    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono" placeholder={panelEditId ? '留空保持不变' : 'sk-...'} />
</div>
```

替换为：
```tsx
<div className="mt-3">
  <label className="block text-xs text-gray-500 mb-1">API Key <span className="text-gray-400">（加密存储）</span></label>
  <div className="relative">
    <input type={showApiKey ? 'text' : 'password'} value={panelForm.api_key}
      onChange={e => setPanelForm({...panelForm, api_key: e.target.value})}
      className="w-full px-3 py-2.5 pr-10 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
      placeholder={panelEditId ? '••••••••••••••••••' : 'sk-...'} />
    {panelEditId && panelForm.api_key === '••••••••••••••••••' && (
      <button type="button" onClick={() => setShowApiKey(!showApiKey)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600">
        {showApiKey ? <InlineIcon name="eyeOff" className="w-4 h-4" /> : <InlineIcon name="eye" className="w-4 h-4" />}
      </button>
    )}
  </div>
</div>
```

改动 4：修正保存时的 API Key 判断逻辑

当前保存逻辑（行 86）：
```tsx
if (isEdit && !body.api_key) delete body.api_key;
```

改为检测 masked sentinel：
```tsx
if (isEdit && (!body.api_key || body.api_key === '••••••••••••••••••')) delete body.api_key;
```

改动 5：重置 showApiKey 状态

关闭侧边栏时重置（在 `setSidePanelOpen(false)` 附近，行 88、530）：
```typescript
// 在关闭侧边栏的地方添加
setShowApiKey(false);
```

需要确保：
1. `saveChannel` 函数中取消时重置
2. 侧边栏 overlay 点击关闭时重置
3. `setSidePanelOpen(false)` 地方都需要加上 `setShowApiKey(false)`

- [ ] **验证构建**

```bash
cd /d/project/mortal-api && npm run build 2>&1 | tail -20
```

- [ ] **提交**

```bash
git add src/app/dashboard/channels/page.tsx
git commit -m "feat: widen side panel, hide scrollbar, masked API key with eye toggle"
```

---

### Task 6: 价格输入框 — 去除 spinner + 小数校验

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx` — 模型展开后的价格输入框

**Interfaces:**
- Consumes: 无
- Produces: 价格输入使用 `type="text"`，保存时校验必须含小数点

- [ ] **修改三个价格输入框的类型和校验**

当前代码（行 441-466），三个价格输入框：
```tsx
<input type="number" step="0.001"
  defaultValue={pricingMap[m.model_id]?.prompt_price ?? ''}
  id={`price-prompt-${m.id}`}
  className="w-full px-2 py-1.5 text-sm font-mono text-right border-0 focus:outline-none focus:ring-0" />
```

全部改为：
```tsx
<input type="text" inputMode="decimal"
  defaultValue={pricingMap[m.model_id]?.prompt_price ?? ''}
  id={`price-prompt-${m.id}`}
  className="w-full px-2 py-1.5 text-sm font-mono text-right border-0 focus:outline-none focus:ring-0 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden" />
```

三个输入框（prompt, completion, cached）都做相同修改。

- [ ] **添加保存价格时的校验逻辑**

找到「保存价格」按钮的 onClick 处理函数（行 470-484）：

修改为添加校验：
```tsx
<button
  onClick={async () => {
    const getVal = (id: string) => (document.getElementById(id) as HTMLInputElement)?.value || '';
    const validateDecimal = (v: string, label: string): boolean => {
      if (v === '' || v === '0') return true; // 允许空和0无校验
      if (!/^\d+\.\d+$/.test(v)) {
        alert(`${label} 价格必须包含小数点，如 28.0`);
        return false;
      }
      return true;
    };
    const p = getVal(`price-prompt-${m.id}`);
    const c = getVal(`price-completion-${m.id}`);
    const ch = getVal(`price-cached-${m.id}`);
    if (!validateDecimal(p, '标准输入') || !validateDecimal(c, '输出') || !validateDecimal(ch, '缓存输入')) return;
    await apiFetch('/admin/pricing', {
      method: 'POST',
      body: JSON.stringify({
        model_id: m.model_id,
        prompt_price: Number(p),
        completion_price: Number(c),
        cached_prompt_price: Number(ch),
      }),
    });
    fetchAll();
  }}
  className="mt-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors"
>
  保存价格
</button>
```

校验逻辑：
- 空字符串或 `"0"` = 通过（允许清除价格）
- 数值必须匹配正则 `/^\d+\.\d+$/`（如 `28.0`、`0.5`、`100.00`）
- 不匹配则 alert 提示并 return，不保存

- [ ] **验证构建**

```bash
cd /d/project/mortal-api && npm run build 2>&1 | tail -20
```

- [ ] **提交**

```bash
git add src/app/dashboard/channels/page.tsx
git commit -m "fix: remove price spinner, add decimal validation"
```

---

### Task 7: 模型广场去重

**Files:**
- Modify: `src/app/dashboard/models/page.tsx` — 模型聚合逻辑 + 卡片渲染

**Interfaces:**
- Consumes: 已有 Channel 接口（需扩展 uptime_pct）
- Produces: 同名模型只显示一张卡片，含渠道列表和 Popover

- [ ] **扩展 Channel 接口以支持 uptime_pct**

在 models/page.tsx 的 `interface Channel` 中添加字段：
```typescript
interface Channel {
  id: string; name: string; health_status: string; is_active: number;
  uptime_pct?: number;
}
```

- [ ] **重写模型分组逻辑**

替换当前的 `displayItems` 构建逻辑（行 52-87）：

```typescript
// 构建模型分组: displayName → { channels, type, ... }
const modelGroups = new Map<string, {
  displayName: string;
  type: 'alias' | 'model';
  actualModel: string;
  channels: Array<{ name: string; health: string; uptimePct: number; isActive: boolean }>;
}>();

// 收集有别名的模型
const modelIdsWithAlias = new Set<string>();
aliases.filter(a => a.is_active).forEach(a => modelIdsWithAlias.add(a.channel_model_id));

// 处理别名
aliases.filter(a => a.is_active).forEach(a => {
  const cm = channelModels.find(m => m.id === a.channel_model_id);
  const ch = channels.find(c => c.id === (cm?.channel_id || ''));
  const key = a.alias_name;
  if (!modelGroups.has(key)) {
    modelGroups.set(key, {
      displayName: key,
      type: 'alias',
      actualModel: a.model_id || cm?.model_id || '?',
      channels: [],
    });
  }
  modelGroups.get(key)!.channels.push({
    name: a.channel_name || cm?.channel_name || ch?.name || '?',
    health: ch?.health_status || 'unknown',
    uptimePct: ch?.uptime_pct ?? 0,
    isActive: ch?.is_active !== 0,
  });
});

// 处理原生模型（排除已有别名的）
channelModels.filter(m => m.is_active && !modelIdsWithAlias.has(m.id)).forEach(m => {
  const ch = channels.find(c => c.id === m.channel_id);
  const key = m.model_id;
  if (!modelGroups.has(key)) {
    modelGroups.set(key, {
      displayName: key,
      type: 'model',
      actualModel: key,
      channels: [],
    });
  }
  modelGroups.get(key)!.channels.push({
    name: m.channel_name || ch?.name || '?',
    health: ch?.health_status || 'unknown',
    uptimePct: ch?.uptime_pct ?? 0,
    isActive: ch?.is_active !== 0,
  });
});

// 排序每个分组的渠道（uptimePct 降序）
for (const group of modelGroups.values()) {
  group.channels.sort((a, b) => b.uptimePct - a.uptimePct);
}

// 转为数组，保持排序
const displayGroups = [...modelGroups.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
```

- [ ] **更新筛选逻辑**

修改 `filteredItems`（当前行 93-101）为 `filteredGroups`，按渠道名筛选：
```typescript
const filteredGroups = displayGroups.filter(group => {
  if (filterChannel !== 'all') {
    // 分组中至少有一个渠道匹配筛选
    if (!group.channels.some(c => c.name === filterChannel)) return false;
  }
  if (filterStatus === '正常') {
    if (!group.channels.some(c => c.health === 'healthy' && c.isActive)) return false;
  }
  if (filterStatus === '异常') {
    if (!group.channels.some(c => c.health === 'unhealthy')) return false;
  }
  if (filterStatus === '停用') {
    if (!group.channels.some(c => !c.isActive)) return false;
  }
  if (filterType === '原生' && group.type !== 'model') return false;
  if (filterType === '别名' && group.type !== 'alias') return false;
  return true;
});
```

- [ ] **更新统计信息**

修改统计行（行 110-115）：
当前统计 `nativeModels` 和 `aliasCount` 是按条目数的，改为按分组后的 Group 数量。

```typescript
const nativeGroupCount = displayGroups.filter(g => g.type === 'model').length;
const aliasGroupCount = displayGroups.filter(g => g.type === 'alias').length;
```

- [ ] **重写卡片渲染**

替换 `filteredItems.map(...)` 的卡片渲染逻辑（行 159-199）：

```tsx
{filteredGroups.map((group, i) => {
  const bestChannel = group.channels[0]; // uptimePct 最高
  const copyKey = `group-${group.displayName}-${i}`;
  return (
  <div key={copyKey}
    className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-all hover:border-gray-200 group">
    <div className="flex items-start justify-between gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <code className="text-sm font-semibold text-gray-900 font-mono truncate">{group.displayName}</code>
          {group.type === 'alias' ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 shrink-0">别名</span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200 shrink-0">原生</span>
          )}
          <button onClick={() => copyToClipboard(group.displayName, copyKey)}
            className="ml-auto p-1 rounded text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all shrink-0" title="复制模型名">
            {copied === copyKey
              ? <InlineIcon name="check" className="w-3.5 h-3.5 text-emerald-500" />
              : <InlineIcon name="copy" className="w-3.5 h-3.5" />}
          </button>
        </div>
        {group.type === 'alias' && (
          <div className="text-[10px] text-gray-400 mt-0.5 font-mono">
            <span className="text-gray-300">实际请求: </span>{group.actualModel}
          </div>
        )}
        {/* 主渠道显示（uptime 最高的那个） */}
        <div className="flex items-center gap-1.5 mt-1.5">
          {healthDot(bestChannel.health)}
          <span className="text-xs text-gray-500 truncate">{bestChannel.name}</span>
          {!bestChannel.isActive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">停用</span>}
          <span className="text-[10px] text-gray-400">{bestChannel.uptimePct}% 可用率</span>
        </div>
      </div>
      {/* 右侧悬浮箭头（多渠道时显示 Popover） */}
      {group.channels.length > 1 ? (
        <Popover
          trigger={
            <span className="p-1 rounded text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer shrink-0 mt-0.5">
              <InlineIcon name="arrowRight" className="w-3.5 h-3.5" />
            </span>
          }
        >
          <div className="space-y-1 min-w-[160px]">
            <p className="text-[10px] text-gray-400 font-medium mb-1.5">该模型可用渠道</p>
            {group.channels.map(ch => (
              <div key={ch.name} className="flex items-center gap-1.5">
                {healthDot(ch.health)}
                <span className="text-xs text-gray-700">{ch.name}</span>
                <span className="text-[10px] text-gray-400 ml-auto">{ch.uptimePct}%</span>
              </div>
            ))}
          </div>
        </Popover>
      ) : (
        <InlineIcon name={group.type === 'alias' ? 'arrowRight' : 'zap'} className="w-3.5 h-3.5 text-gray-300 shrink-0 mt-0.5" />
      )}
    </div>
  </div>
  );
})}
```

关键变化：
- 每个 group 是一张卡片（同名合并）
- `bestChannel` = channels 数组第一个（uptimePct 最高）
- 卡片显示主渠道名 + 健康圆点 + 可用率百分比
- 多渠道时右侧箭头替换为 `Popover`，悬浮显示所有渠道
- 单渠道时保持原有箭头图标不变

- [ ] **导入 Popover 组件**

在文件顶部添加 import（如果有 Popover 使用）：
```typescript
import { Popover } from '@/lib/popover';
```

- [ ] **验证构建**

```bash
cd /d/project/mortal-api && npm run build 2>&1 | tail -20
```

- [ ] **提交**

```bash
git add src/app/dashboard/models/page.tsx
git commit -m "feat: deduplicate model plaza by name with channel uptime sorting"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ HealthBar 24点双行布局 → Task 2
- ✅ 模型限制 Popover 自适应 → Task 3
- ✅ 编辑 Key 过期时间 DateTimePicker → Task 4
- ✅ 侧边栏宽度+20px → Task 5
- ✅ 侧边栏滚动条隐藏 → Task 5
- ✅ API Key *** + 眼睛 → Task 5
- ✅ 价格输入 spinner 去除 + 小数校验 → Task 6
- ✅ 模型广场去重 + 渠道筛选兼容 → Task 7
- ✅ 日志表格字体缩小 → Task 1

**2. Placeholder check:** 无 TBD/TODO 占位符，所有代码片段完整。

**3. Type consistency:** 所有组件接口（Popover、DateTimePicker）与现有源码一致。Channel 接口添加了 `uptime_pct` 扩展，与渠道管理页面的完整接口一致。
