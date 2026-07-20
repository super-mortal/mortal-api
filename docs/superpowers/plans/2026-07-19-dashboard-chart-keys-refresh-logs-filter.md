# Dashboard 图表优化、密钥刷新按钮、日志快捷筛选 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成三个独立的前端优化项：仪表盘 bar chart `maxBarSize`、密钥管理刷新按钮（ConfirmDialog）+ 字号微调、调用日志快捷筛选按钮

**Architecture:** 三个修改各自独立，涉及三个不同文件，可以并行实现。每个文件一个 Task。

**Tech Stack:** Next.js, TypeScript, Recharts, Tailwind CSS v4, ConfirmDialog (现有组件)

## Global Constraints

- 所有图标使用 Lucide Icons，从 `public/icons/` 本地加载（`<InlineIcon name="..." />`）
- 不使用 CDN 加载图标
- ConfirmDialog 使用 `@/lib/confirm-dialog` 已有组件
- 浅色主题，主色 indigo-500

---

### Task 1: Dashboard — BarChart maxBarSize

**Files:**
- Modify: `src/app/dashboard/page.tsx` — 两个 BarChart 组件添加 maxBarSize

**Interfaces:**
- Consumes: 无（纯 Recharts 属性修改）
- Produces: 无

- [ ] **Step 1: 为「每日 Token 消耗」BarChart 添加 maxBarSize**

在 `src/app/dashboard/page.tsx` 第 198 行附近：

**修改前：**
```tsx
<BarChart data={data.dailyStats}>
```

**修改后：**
```tsx
<BarChart data={data.dailyStats} maxBarSize={36}>
```

- [ ] **Step 2: 为「Token 构成」BarChart 添加 maxBarSize**

第 256 行附近同理：

**修改前：**
```tsx
<BarChart data={data.dailyStats}>
```

**修改后：**
```tsx
<BarChart data={data.dailyStats} maxBarSize={36}>
```

- [ ] **Step 3: 验证**

启动开发服务器，选择「今日」筛选，确认两根柱状图均不再撑满容器宽度；切换 7 天/30 天/全部，确认柱子宽度正常。

- [ ] **Step 4: 提交**

```bash
git add src/app/dashboard/page.tsx
git commit -m "fix: add maxBarSize to dashboard bar charts to prevent oversized single-day bars"
```

---

### Task 2: 密钥管理 — 刷新按钮、ConfirmDialog、字号调整

**Files:**
- Modify: `src/app/dashboard/keys/page.tsx`

**Interfaces:**
- Consumes: `ConfirmDialog` from `@/lib/confirm-dialog`
- Consumes: PATCH `/admin/keys` with `{ id, refresh_key: true }` → returns `{ new_key: string }`
- Produces: 无

- [ ] **Step 1: 添加 refreshConfirm 和 refreshResult 状态**

找到现有状态声明区域（约第 34-50 行），新增：

```tsx
const [refreshConfirm, setRefreshConfirm] = useState<{ id: string; name: string } | null>(null);
const [refreshResult, setRefreshResult] = useState<{ name: string; newKey: string } | null>(null);
```

- [ ] **Step 2: 添加 handleRefreshKey 函数**

在 `handleDelete` 函数（约第 179-183 行）之后添加：

```tsx
const handleRefreshKey = async (id: string) => {
  setRefreshConfirm(null);
  try {
    const res = await apiFetch('/admin/keys', {
      method: 'PATCH',
      body: JSON.stringify({ id, refresh_key: true }),
    });
    const key = keys.find(k => k.id === id);
    const data = await res.json();
    if (data.new_key) {
      setRefreshResult({ name: key?.name || 'Key', newKey: data.new_key });
      setTimeout(() => setRefreshResult(null), 5000);
      fetchData();
    }
  } catch {
    // refresh failed silently
  }
};
```

- [ ] **Step 3: 在操作列添加刷新按钮（复制与编辑之间）**

找到操作列 div（约第 527-553 行），在复制按钮（`<button onClick={() => copyKey(...)}>`）的闭合 `</button>` 之后、编辑按钮之前插入：

```tsx
<button
  onClick={() => setRefreshConfirm({ id: k.id, name: k.name })}
  className="p-1.5 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
  title="刷新 Key"
>
  <InlineIcon name="refreshCw" className="w-3.5 h-3.5" />
</button>
```

- [ ] **Step 4: 在表格上方添加刷新结果提示横幅**

在「创建 Key」按钮所在 header div（约第 193-202 行）之后添加：

```tsx
{refreshResult && (
  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3 animate-in fade-in">
    <InlineIcon name="check" className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
    <div className="text-xs text-amber-800">
      <p className="font-medium mb-1">Key「{refreshResult.name}」已刷新</p>
      <code className="block bg-white border border-amber-300 rounded px-2 py-1 font-mono text-[11px] break-all mb-1.5">{refreshResult.newKey}</code>
      <button onClick={() => { navigator.clipboard.writeText(refreshResult.newKey); }}
        className="text-indigo-600 hover:text-indigo-700 underline underline-offset-2">
        复制新 Key
      </button>
    </div>
    <button onClick={() => setRefreshResult(null)}
      className="ml-auto text-amber-400 hover:text-amber-600 shrink-0">
      <InlineIcon name="x" className="w-3.5 h-3.5" />
    </button>
  </div>
)}
```

- [ ] **Step 5: 添加 ConfirmDialog**

在已有 `ConfirmDialog`（删除确认，约第 563-571 行）之前添加：

```tsx
<ConfirmDialog
  open={!!refreshConfirm}
  onClose={() => setRefreshConfirm(null)}
  onConfirm={() => handleRefreshKey(refreshConfirm!.id)}
  title="确认刷新 Key"
  message={`刷新 Key「${refreshConfirm?.name}」后旧 Key 将立即失效，确定继续？`}
  confirmText="确认刷新"
  variant="info"
/>
```

- [ ] **Step 6: 移除编辑弹窗内的旧刷新区域**

找到编辑 Modal 中的 `API Key` 区域（以 `className="border-t border-gray-100 pt-3"` 开头的 div，约第 369-411 行），删除整个区块（从 `<div className="border-t border-gray-100 pt-3">` 开始到它对应的闭合 `</div>` 结束）。

- [ ] **Step 7: 清理不再需要的状态**

检查并移除：
- `refreshing` 状态变量（第 49 行）——如果其他地方不再使用
- `newKeyValue` 状态变量（第 50 行）——新逻辑已用 `refreshResult` 替代

- [ ] **Step 8: 表格字号微调**

统一修改表格字样：

| 位置 | 修改前 | 修改后 |
|------|--------|--------|
| th class (第 453-461 行) | `text-xs` | `text-[11px]` |
| td class (第 474 行，名称) | `text-xs sm:text-sm` | `text-[11px] sm:text-xs` |
| td class (第 476 行，API Key) | `text-[10px] sm:text-xs` | 不变 |
| td class (第 480 行，已用) | `text-xs sm:text-sm` | `text-[11px] sm:text-xs` |
| td class (第 481 行，额度) | `text-xs sm:text-sm` | `text-[11px] sm:text-xs` |
| td class (第 483 行，状态标签) | `text-[10px] sm:text-xs` | 不变 |
| td class (第 506 行，模型) | 已有 `text-[11px]` | 不变 |
| td class (第 514 行，创建时间) | `text-[10px]` | 不变 |
| td class (第 517 行，到期时间) | `text-[10px]` | 不变 |

cell padding 调整：

**修改前：**
```tsx
<th className="text-left px-3 sm:px-4 py-3 ...">名称</th>
<td className="px-3 sm:px-4 py-3 ...">{...}</td>
```

**查找替换：** 将所有 `px-3 sm:px-4 py-3` 替换为 `px-2.5 sm:px-3 py-2.5`（注意：只在 `className` 属性中替换，不影响 JSX 内的其他文本）。

- [ ] **Step 9: 验证**

1. 点击行内刷新按钮 → 弹出 ConfirmDialog（不是 browser confirm）
2. 点击确认 → 刷新成功 → 顶部出现提示横幅（含新 Key + 复制按钮）
3. 5 秒后横幅自动消失
4. 编辑弹窗中不再有刷新 Key 相关区域
5. 表格看起来不拥挤

- [ ] **Step 10: 提交**

```bash
git add src/app/dashboard/keys/page.tsx
git commit -m "feat: add refresh button with ConfirmDialog to keys page, remove old refresh from edit modal, adjust font size"
```

---

### Task 3: 调用日志 — 快捷筛选按钮

**Files:**
- Modify: `src/app/dashboard/logs/page.tsx`

**Interfaces:**
- Consumes: 现有 `startMonth`, `endMonth`, `page`, `fetchLogs` 状态和函数
- Produces: 无

- [ ] **Step 1: 添加 activeDate 状态**

找到现有状态声明区域（约第 19-45 行），在第 30 行 `endMonth` 之后添加：

```tsx
const [activeDate, setActiveDate] = useState<'today' | '7d' | '30d' | 'custom'>('custom');
```

- [ ] **Step 2: 添加 handleFilterPreset 函数**

在 `fetchLogs` 函数（约第 52-63 行）之后添加：

```tsx
const handleFilterPreset = useCallback((preset: 'today' | '7d' | '30d') => {
  setActiveDate(preset);
  setPage(0);
  const now = new Date();
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}T00:00`;
  };
  const fmtEnd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}T23:59`;
  };

  if (preset === 'today') {
    setStartMonth(fmt(now));
    setEndMonth(fmtEnd(now));
  } else if (preset === '7d') {
    const past = new Date(now);
    past.setDate(past.getDate() - 6);
    setStartMonth(fmt(past));
    setEndMonth(fmtEnd(now));
  } else if (preset === '30d') {
    const past = new Date(now);
    past.setDate(past.getDate() - 29);
    setStartMonth(fmt(past));
    setEndMonth(fmtEnd(now));
  }
}, []);
```

- [ ] **Step 3: 在筛选区域添加预设按钮组**

找到筛选栏容器 div（约第 213-252 行）。在当前日期输入框的父级 div（`flex items-center gap-1.5 bg-white rounded-lg border...`，约第 215-222 行）之前添加按钮组：

替换以下代码块（第 214-252 行）为包含预设按钮组的新筛选栏：

```tsx
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 flex-wrap">
        {/* 快捷筛选按钮组 */}
        <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1">
          <button onClick={() => handleFilterPreset('today')}
            className={'px-3 py-1.5 rounded-md text-xs font-medium transition-all ' + (activeDate === 'today' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50')}>今日</button>
          <button onClick={() => handleFilterPreset('7d')}
            className={'px-3 py-1.5 rounded-md text-xs font-medium transition-all ' + (activeDate === '7d' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50')}>7 天</button>
          <button onClick={() => handleFilterPreset('30d')}
            className={'px-3 py-1.5 rounded-md text-xs font-medium transition-all ' + (activeDate === '30d' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50')}>30 天</button>
          <button onClick={() => { setActiveDate('custom'); setPage(0); }}
            className={'px-3 py-1.5 rounded-md text-xs font-medium transition-all ' + (activeDate === 'custom' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50')}>
            <InlineIcon name="calendar" className="w-3 h-3 inline mr-1" />自定义</button>
        </div>
        {/* 自定义日期输入框 — 仅 activeDate === 'custom' 时显示 */}
        {activeDate === 'custom' && (
          <div className="flex items-center gap-1.5 bg-white rounded-lg border border-gray-200 px-3 py-1.5">
            <InlineIcon name="clock" className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input type="datetime-local" value={startMonth} onChange={function(e) { setStartMonth(e.target.value); setPage(0); }}
              className="text-xs border-0 bg-transparent focus:outline-none focus:ring-0 p-0 text-gray-700" style={{width: '9rem'}} />
            <span className="text-gray-300 shrink-0">—</span>
            <input type="datetime-local" value={endMonth} onChange={function(e) { setEndMonth(e.target.value); setPage(0); }}
              className="text-xs border-0 bg-transparent focus:outline-none focus:ring-0 p-0 text-gray-700" style={{width: '9rem'}} />
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
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
          <SelectFilter
            options={[
              { label: '全部 Key', value: '' },
              ...keys.map(k => ({ label: k.name, value: k.id })),
            ]}
            value={keyFilter}
            onChange={(v) => { setKeyFilter(v); setPage(0); }}
            placeholder="全部 Key"
          />
          <input type="text" value={modelFilter} onChange={(e) => { setModelFilter(e.target.value); setPage(0); }}
            placeholder="模型名"
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-24" />
          {(startMonth || statusFilter || keyFilter || modelFilter) && (
            <button onClick={() => { setStartMonth(''); setEndMonth(''); setStatusFilter(''); setKeyFilter(''); setModelFilter(''); setActiveDate('custom'); setPage(0); }}
              className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 whitespace-nowrap">清除</button>
          )}
        </div>
      </div>
```

注意：替换时需保留外层 `<div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">` 标签和内部内容。

- [ ] **Step 4: 验证**

1. 页面出现「今日」「7 天」「30 天」「自定义」按钮组
2. 点击「今日」→ 日志筛选为今天 → 日期输入框隐藏
3. 点击「7 天」→ 近 7 天数据 → 日期输入框隐藏
4. 点击「30 天」→ 近 30 天数据 → 日期输入框隐藏
5. 点击「自定义」→ 日期输入框显示 → 手动修改日期 → 实时筛选
6. 切换预设时分页回到第一页

- [ ] **Step 5: 提交**

```bash
git add src/app/dashboard/logs/page.tsx
git commit -m "feat: add quick date filter buttons to logs page"
```

---

## 执行

三个 Task 互不依赖，可以按任意顺序执行。

完成后执行全量验证：
1. 仪表盘图表柱子宽度合理
2. 密钥管理刷新按钮 + ConfirmDialog + 字号
3. 调用日志快捷筛选

```bash
npm run build
# 确保无编译错误
```
