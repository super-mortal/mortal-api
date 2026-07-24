# 渠道管理 / 账单导出 多处优化设计

**日期**: 2026-07-24
**项目**: mortal-api (Next.js 16 + TypeScript + better-sqlite3 + Tailwind v4)
**范围**: 渠道管理页 + 账单导出 + 模型行交互

---

## 背景

本次 brainstorm 来源于用户对当前 3 个页面（渠道管理、模型行交互、账单导出）共 8 项问题的反馈，其中 4 项涉及 UI/样式，4 项涉及逻辑/交互。所有 UI 改动均通过视觉伴侣与用户逐屏确认。

---

## 改动清单

### ① 渠道卡片布局重构（UI）
**目标文件**: `src/app/dashboard/channels/page.tsx` line 462-489

**问题**：当前 HealthBar 占两行 12+12，"正常/异常/额度冷却" 文字徽章挤在渠道名右边，操作按钮区布局松散。

**目标布局**（三块式，绝对定位中点）：

```
┌─────────────────────────────────────────────────────────────┐
│  DeepSeek 官方                                                │
│  https://api.deepseek.com · 自动 · 模型: 4 个                 │
│                                                              │
│         ┌─ 徽章 → 24个点 → 96% | 320ms ─┐                   │
│         (absolute left:50% transform:translateX(-50%))       │
│                                                              │
│                                       ✏ 检测 ⌄ ⏻ 🗑         │
└─────────────────────────────────────────────────────────────┘
```

**详细规格**：
- **第 1 块（左）**：渠道名 + URL + meta（flex:1, min-width:0），完全保留原样
- **第 2 块（中）**：`position:absolute; left:50%; transform:translateX(-50%)`，水平方向三个元素：
  - **左 → 徽章**：`<span>` `正常`/`异常`/`额度冷却 25:13`
    - 正常：`bg-emerald-50 text-emerald-700 border-emerald-200`
    - 异常：`bg-red-50 text-red-700 border-red-200`
    - 冷却：`bg-amber-50 text-amber-700 border-amber-200`
    - 样式：`text-[10px] px-2 py-0.5 rounded-full border`
  - **中 → HealthBar**：单行 24 个点（高 16px，宽 4px，gap 2px）
    - 绿 `#10b981` / 黄 `#fbbf24` / 红 `#ef4444`
  - **右 → 数字**：`flex gap-1.5 font-mono text-[11px]`
    - 顺序：**先成功率，再延迟**
    - 格式：`96% | 320ms`（竖线分隔）
    - 颜色：成功率用绿色 `#059669`，延迟用深灰 `#374151`，竖线用浅灰 `#d1d5db`
- **第 3 块（右）**：操作按钮（原位保留）
  - 编辑 / 连通检测 / 展开 / Switch / 删除
  - `margin-left: auto` 推到最右

**删除**：
- name 边的徽章（重复了）
- `?` helpCircle 图标及 tooltip（用户没要求添加，原属过度设计）

**实现要点**：
- 外层 `<div>` 需 `position: relative` 才能让中块 `absolute` 生效
- 24 个点的数据来源：`ch.recent_checks || []` 取最近 24 次
- 数字来源：`uptime_pct`（成功率）+ `avg_latency_ms`（平均延迟），延迟缺失时显示 `—`
- 不显示中文标签（用户明确要求"不要显示中文"）

---

### ② 优先级语义反转（逻辑）
**目标文件**: `src/app/dashboard/channels/page.tsx` line 382-407（handleDragEnd）+ `src/lib/channels.ts`（路由逻辑）

**当前语义**：priority 数字小 = 靠前（drag-reorder 时 `priority = idx`）

**目标语义**：priority 数字大 = 优先级高

**改动**：
1. `handleDragEnd` 中持久化：`priority = count - idx`（即 idx=0 → priority=count，idx=count-1 → priority=1）
2. 路由时按 `priority DESC` 排序（原来是 `priority ASC`）
3. UI 显示：`ch.priority === 0 ? "自动" : "优先 {ch.priority}"`（保持，0=自动不变）
4. priority input 提示语更新为"数字越大优先级越高"
5. 现有数据库 priority 值需反转（migration 或运行时反转）

**回退策略**：新规则启用前，先在后台 SQL 反转：`UPDATE channels SET priority = -priority WHERE priority != 0`（0 保持自动语义）

---

### ③ 模型行快捷删除（交互）
**目标文件**: `src/app/dashboard/channels/page.tsx` line 227-234（handleModelDelete）

**当前行为**：模型行右侧 trash2 按钮 → `handleModelDelete` → `setDeleteModelConfirm` → 弹出 ConfirmDialog → 用户确认 → 写入 pendingModels（标记 staged） → 用户最后点保存才真正 DELETE

**目标行为**：模型行右侧 trash2 按钮 → 立即 `apiFetch(DELETE)` → 删完 `fetchAll()` 刷新 → **不弹任何确认对话框**

**保留**：展开面板里的"删除"按钮（line 758-761）保留 ConfirmDialog 流程（多步编辑场景）

**实现**：
- 新增函数 `quickDeleteModel(modelId)` 直接 DELETE，立即刷新
- 模型行 trash2 `onClick` 改为调用 `quickDeleteModel`
- 删除 `pendingModels[m.model_id].deleted` 这条路径（不再走 staged 队列）

---

### ④ 价格同步刷新（数据）
**目标文件**: `src/app/dashboard/channels/page.tsx` line 154-225（handleModelSave）+ line 141-149（pricing useEffect）

**问题**：在渠道 A 设置模型 M 价格后，渠道 B 的 M 实际数据库已写入，但前端 `pricingMap[m.model_id]` 没刷新，渠道 B 展开后 input 仍是空的。

**修复**：
- `handleModelSave` 保存成功后，调用 `refreshPricingMap()` 重新拉 `/admin/pricing`
- `refreshPricingMap` 函数：直接重写 `pricingMap`（PATCH 现有 row + 替换行）
- 同步设置时（`data.syncedChannels` 返回的渠道），对应渠道的 input 通过 `defaultValue` 重新渲染时自动显示新值

**实现**：
```ts
const refreshPricingMap = async () => {
  const r = await apiFetch('/admin/pricing');
  if (r.ok) {
    const d = await r.json();
    const map: Record<string, any> = {};
    d.pricing.forEach((p: any) => { map[p.model_id] = p; });
    setPricingMap(map);
  }
};
// handleModelSave 成功后调用 refreshPricingMap()
```

---

### ⑤ 价格保存 alert() → 统一组件（UI）
**目标文件**: `src/app/dashboard/channels/page.tsx` line 162-169

**问题**：line 164 使用 `alert('${label} 价格必须包含小数点...')`，浏览器原生丑陋

**修复**：
- 新增 state `priceValidationError: string | null`
- 校验失败时 `setPriceValidationError('价格必须包含小数点，如 28.0')`
- 用项目现有的 `ConfirmDialog`（variant="info"）展示
- line 174 `alert('模型不存在')`、line 181/188 `alert('删除旧别名失败')`/`alert('创建别名失败')`、line 214 `alert('保存价格失败')`、line 223 `alert('保存失败...')` 全部统一替换

---

### ⑥ 价格同步通知样式（UI）
**目标文件**: `src/app/dashboard/channels/page.tsx` line 926-930

**当前样式**：
```tsx
<div className="fixed top-4 right-4 z-[100] bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-in slide-in-from-top-2">
  {syncFeedback}
</div>
```

**目标样式**（浅色卡片）：
```tsx
<div className="fixed top-4 right-4 z-[100] bg-white border border-emerald-200 px-4 py-3 rounded-xl shadow-lg text-sm flex items-center gap-2 animate-in slide-in-from-top-2">
  <span className="inline-flex w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full items-center justify-center text-xs font-bold">✓</span>
  <span className="text-gray-700"><strong className="text-emerald-700">价格已同步</strong>至 {syncedCount} 个渠道</span>
</div>
```

**关键改动**：
- `bg-emerald-600 text-white` → `bg-white border border-emerald-200 text-gray-700`
- 加绿色圆形对勾图标
- 加 `✓` 前缀

---

### ⑦ 账单导出选项 + 汇总字段配色（UI + 交互）
**目标文件**: `src/app/dashboard/logs/page.tsx`（导出按钮 + 汇总）+ `src/lib/billing.ts`（导出逻辑）

**7a. 导出前弹对话框**

新增 state `exportDialogOpen`，点击"导出账单"时先弹对话框：

```tsx
<Modal open={exportDialogOpen} onClose={...} title="导出账单">
  <div className="space-y-3">
    <p className="text-xs text-gray-500">时间范围: ... · 共 N 条</p>
    <label className="flex items-start gap-3 p-3 border-2 border-indigo-500 bg-indigo-50 rounded-lg cursor-pointer">
      <input type="checkbox" checked={includeLatency} onChange={...}>
      <div>
        <div className="text-sm font-semibold">包含延迟 (latency_ms) 列</div>
        <div className="text-xs text-gray-500">便于排查慢调用</div>
      </div>
    </label>
    <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer">
      <input type="checkbox" checked={!includeLatency} onChange={...}>
      <div>
        <div className="text-sm">不包含延迟列</div>
        <div className="text-xs text-gray-500">表格更精简</div>
      </div>
    </label>
    <div className="flex gap-2 justify-end pt-2">
      <button onClick={close}>取消</button>
      <button onClick={confirmExport}>确认导出</button>
    </div>
  </div>
</Modal>
```

**7b. 导出时按 includeLatency 决定是否生成 latency_ms 列**

`src/lib/billing.ts` 中 `exportBillingExcel` 函数接受 `includeLatency: boolean`，根据它动态生成 `CENTER_COLS` 和列定义。

**7c. 汇总字段 4 色徽章**

明细表格顶部汇总（line 200+ 附近）改为 4 个 badge：

```tsx
<div className="flex flex-wrap gap-2.5">
  <div className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded-md">
    <span className="text-xs text-blue-500 font-medium">总请求</span>
    <span className="text-sm text-blue-800 font-bold font-mono">{totalRequests}</span>
  </div>
  <div className="inline-flex items-center gap-1.5 bg-purple-50 border border-purple-200 px-2.5 py-1.5 rounded-md">
    <span className="text-xs text-purple-500 font-medium">总 Tokens</span>
    <span className="text-sm text-purple-800 font-bold font-mono">{totalTokens.toLocaleString()}</span>
  </div>
  <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-md">
    <span className="text-xs text-emerald-500 font-medium">总费用</span>
    <span className="text-sm text-emerald-800 font-bold font-mono">¥ {totalCost.toFixed(4)}</span>
  </div>
  <div className="inline-flex items-center gap-1.5 bg-cyan-50 border border-cyan-200 px-2.5 py-1.5 rounded-md">
    <span className="text-xs text-cyan-500 font-medium">平均延迟</span>
    <span className="text-sm text-cyan-800 font-bold font-mono">{avgLatency}ms</span>
  </div>
</div>
```

颜色映射：
- 总请求 → 蓝（blue）
- 总 Tokens → 紫（purple）
- 总费用 → 绿（emerald）
- 平均延迟 → 青（cyan）

---

### ⑧ 按模型汇总表（UI）
**目标文件**: `src/lib/billing.ts`（导出时生成 "按模型汇总" sheet）+ `src/app/dashboard/logs/page.tsx`（如果有 UI 预览）

**改动**：
1. **删"模型别名"列**（不展示、不导出）
2. **表头固定"模型ID"**（居中、加粗、color #374151）
3. **数据列**：有别名显示别名（橙色 monospace `#d97706` font-weight 600）；无别名显示原 `model_id`（灰色 monospace `#374151`）
4. **所有列居中**：`text-align: center` for every column
5. **居中排版**：表头居中、数据居中

**实现**：
```ts
// billing.ts 中的"按模型汇总"sheet
const colDef2: XLSX.ColInfo[] = [
  { wch: 18 }, // 模型ID（居中）
  { wch: 12 }, // 调用次数（居中）
  { wch: 14 }, // 总 Tokens（居中）
  { wch: 12 }, // 总费用（居中）
];
const summaryData = modelStats.map(m => {
  const aliasName = m.alias_name; // 后端 JOIN 时取别名
  return {
    '模型ID': aliasName || m.model_id, // 智能显示
    '调用次数': m.count,
    '总 Tokens': m.total_tokens.toLocaleString(),
    '总费用': `¥ ${m.total_cost.toFixed(4)}`,
  };
});
```

样式属性：`cell.s = { alignment: { horizontal: 'center' } }` 应用到所有 cell。

---

## 不在范围

- 渠道优先级相关的拖拽体验优化（保留现状）
- 健康度图表的色彩调整（仅做 24 点 + 数字）
- 账单导出对话框的其他字段（如"按 Key 拆分"等）

---

## 验证

每项任务完成后必须通过：

1. `npx tsc --noEmit` exit 0
2. 手动浏览器验证（开发服务器）
3. 现有功能不被破坏：
   - 模型别名同步（修改/删除/创建全流程）
   - 拖拽排序
   - 价格同步（修改渠道 A 后渠道 B 实时刷新）
   - 账单导出（XLSX 文件能正常打开）

---

## 任务拆分（暂定 9 项）

| # | 任务 | 文件 |
|---|---|---|
| 1 | 渠道卡片布局重构（v8：徽章+24点+数字 横排，移到中点）| channels/page.tsx |
| 2 | 优先级反转（拖拽 + 路由 + 提示语）| channels/page.tsx + lib/channels.ts |
| 3 | 模型行快捷删除（直接 DELETE，不走 pending）| channels/page.tsx |
| 4 | 价格同步刷新 pricingMap | channels/page.tsx |
| 5 | alert() → ConfirmDialog 统一 | channels/page.tsx |
| 6 | 价格通知 → 浅色卡片样式 | channels/page.tsx |
| 7 | 账单导出对话框 + 汇总字段 4 色徽章 + includeLatency 逻辑 | logs/page.tsx + billing.ts |
| 8 | 按模型汇总表（删别名列 + 智能显示 + 居中）| billing.ts |
| 9 | 数据库 priority 反转 SQL（一次性）| 单独脚本 |