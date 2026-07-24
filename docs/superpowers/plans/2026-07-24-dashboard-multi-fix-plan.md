# Dashboard 多处修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Mortal API Dashboard 上 8 个独立但相关的体验/正确性问题，统一状态命名与日志延迟字段

**Architecture:** 后端先加 v8 migration 加 `latency_ms` 列，stats API 修复 modelStats 字段，前端 dashboard 各页做 UI 修复 + UX 改进。改动按依赖顺序串行：DB → 后端 API → 前端。

**Tech Stack:** Next.js 16 App Router, TypeScript, better-sqlite3, Recharts, Tailwind CSS v4, Lucide Icons

**Spec:** `docs/superpowers/specs/2026-07-24-dashboard-multi-fix-design.md`

---

## Global Constraints

- **默认 0 表示"无限制"或"自动"**，不要把 0 当无效值删掉（适用于 spend_limit、priority、latency_ms）
- **北京时区**：`datetime('now', '+8 hours')` 用于所有 created_at、updated_at、expires_at
- **图标必须本地**：所有 `InlineIcon name="..."` 必须来自 `public/icons/*.svg`，新增需 `node scripts/download-lucide-icons.js`
- **TypeScript 严格**：每个 task 结束前跑 `npx tsc --noEmit`，期望 exit code 0、无输出
- **migration 命名**：`v8_<feature>` 写入 `_migrations` 表
- **commit message 风格**：`feat(keys):` / `fix(stats):` / `refactor(channels):` / `docs:` / `chore:`
- **每个 task 独立 commit + push**（用户历史偏好：每次 task 完成就 push）

---

## Task 1: call_logs 加 latency_ms 字段 + 写入耗时 + dashboard/日志展示 + 导出账单

**Files:**
- Modify: `src/lib/db.ts`（加 v8 migration）
- Modify: `src/lib/logs.ts`（createCallLog 接 latency_ms）
- Modify: `src/app/v1/chat/completions/route.ts`（4 处 createCallLog 加 Date.now 计时 + latency 入参）
- Modify: `src/app/dashboard/logs/page.tsx`（详情 TokenBadge + 列表列 + 导出列）

**Interfaces:**
- Consumes: 现有 `createCallLog({ relay_key_id, ..., cost })`
- Produces: `createCallLog({ ..., latency_ms?: number })` 写入 `call_logs.latency_ms` 列

### Step 1.1: 写 v8 migration

打开 `src/lib/db.ts` 找到 `_migrations` 的处理逻辑（之前 v6/v7 在约 220-275 行），在最后追加：

```typescript
// Migration v8: call_logs.latency_ms
const v8Migrated = db.prepare("SELECT name FROM _migrations WHERE name = 'v8_latency_ms'").get();
if (!v8Migrated) {
  db.exec(`ALTER TABLE call_logs ADD COLUMN latency_ms INTEGER NOT NULL DEFAULT 0`);
  db.prepare(`INSERT INTO _migrations (name) VALUES ('v8_latency_ms')`).run();
}
```

### Step 1.2: 跑 tsc 验证

运行：`cd /d/project/mortal-api && npx tsc --noEmit`
预期：exit 0，无输出。

### Step 1.3: commit migration

```bash
cd /d/project/mortal-api
git add src/lib/db.ts
git commit -m "feat(db): v8 migration adds call_logs.latency_ms"
git push origin main
```

### Step 1.4: 改 createCallLog 接 latency_ms

打开 `src/lib/logs.ts`，找到 `createCallLog` 函数（约 8-47 行），把函数签名改为：

```typescript
export interface CreateCallLogInput {
  relay_key_id?: string;
  relay_key_name?: string;
  model: string;
  channel_id?: string;
  channel_name?: string;
  prompt_tokens: number;
  completion_tokens: number;
  cached_input_tokens?: number;
  total_tokens: number;
  cost: number;
  status: 'success' | 'fail';
  error_message?: string;
  ip?: string;
  latency_ms?: number;  // 新增
}

export function createCallLog(data: CreateCallLogInput): CallLog {
  // ... 现有逻辑，把 latency_ms 加到 INSERT 列与 values
  db.prepare(`
    INSERT INTO call_logs (id, relay_key_id, relay_key_name, model, channel_id, channel_name,
      prompt_tokens, completion_tokens, cached_input_tokens, total_tokens, cost,
      status, error_message, ip, latency_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))
  `).run(id, data.relay_key_id ?? null, data.relay_key_name ?? null, data.model,
    data.channel_id ?? null, data.channel_name ?? null,
    data.prompt_tokens, data.completion_tokens, cachedInput, data.total_tokens, data.cost,
    data.status, data.error_message ?? null, data.ip ?? null, data.latency_ms ?? 0);
  // ... 末尾不变
}
```

如果原函数不是用 interface 入参，直接在 inline object 加 `latency_ms?: number` 字段也行。

### Step 1.5: 改 route.ts 4 处 createCallLog

打开 `src/app/v1/chat/completions/route.ts`，在主 POST 函数顶部（大约 line 38 之后、`runtime = 'nodejs'` 之后）：

```typescript
const t0 = Date.now();
```

找到所有 4 处 `createCallLog({...})` 调用（约 line 143, 175, 197, 245 附近），每处都加 `latency_ms: Date.now() - t0,`

### Step 1.6: 改 dashboard/logs 详情 + 列表 + 导出

打开 `src/app/dashboard/logs/page.tsx`。

#### 详情 TokenBadge
找到 line 446-453 那 6 个 `TokenBadge`（输入/输出/缓存输入/未缓存输入/总 Token/费用），在末尾加第 7 个：

```tsx
<TokenBadge label="延迟" value={`${log.latency_ms} ms`} color="bg-cyan-50 text-cyan-700 border-cyan-200" />
```

如果 `TokenBadge` 组件不接受 `color` props，去 `src/lib/token-badge.tsx`（或类似文件）给组件加：

```typescript
export function TokenBadge({ label, value, color = 'bg-gray-50 text-gray-700 border-gray-200' }: { label: string; value: string | number; color?: string }) {
  // 现有逻辑，把硬编码的 className 改为 `${color}`
}
```

#### 列表表格新增列
找到 `<table>` 内的 `<thead>`（约 line 460-470），新增 `<th>`：

```tsx
<th className="text-right px-2.5 sm:px-3 py-2.5 font-medium text-gray-500 text-[11px]">延迟 (ms)</th>
```

在 `<tbody>` 对应行渲染 `{log.latency_ms}`（按 td 列对齐方式匹配）。

#### 账单导出
找到导出按钮实现（搜 `导出` / `exportLogs` / `xlsx` / `XLSX` / `csv`），给 CSV 和 XLSX 的列都加 `latency_ms`：
- CSV header: `"延迟 (ms)"`
- CSV row: `${log.latency_ms}`
- XLSX header: `'延迟 (ms)'`
- XLSX row: `log.latency_ms`

### Step 1.7: 跑 tsc + build

```bash
cd /d/project/mortal-api
npx tsc --noEmit
npm run build
```

预期：tsc exit 0、build exit 0、出现"Compiled successfully"。

### Step 1.8: commit + push

```bash
cd /d/project/mortal-api
git add src/lib/logs.ts src/app/v1/chat/completions/route.ts src/app/dashboard/logs/page.tsx
git commit -m "feat(logs): record latency_ms end-to-end (route+log+ui+export)"
git push origin main
```

---

## Task 2: stats modelStats 加 avg_cost + dashboard 改 chart + 智能切换 statCards

**Files:**
- Modify: `src/app/admin/stats/route.ts`（modelStats SQL）
- Modify: `src/app/dashboard/page.tsx`（chart + statCards）

**Interfaces:**
- Consumes: `data.modelStats[].total_cost, calls`
- Produces: `data.modelStats[].avg_cost` 字段；statCards 智能切换 label/value/sub

### Step 2.1: 改 stats route.ts modelStats SQL

打开 `src/app/admin/stats/route.ts` line 77-88，把 SQL 改为：

```typescript
const modelStats = db.prepare(`
  SELECT
    model,
    COUNT(*) as calls,
    COALESCE(SUM(total_tokens), 0) as tokens,
    COALESCE(SUM(completion_tokens), 0) as completion_tokens,
    COALESCE(SUM(cached_input_tokens), 0) as cached_tokens,
    COALESCE(SUM(prompt_tokens - cached_input_tokens), 0) as uncached_tokens,
    COALESCE(SUM(cost), 0) as total_cost,
    COALESCE(SUM(cost) * 1.0 / NULLIF(COUNT(*), 0), 0) as avg_cost
  FROM call_logs ${whereClause}
  GROUP BY model
  ORDER BY calls DESC
`).all(...params);
```

### Step 2.2: 改 dashboard chart

打开 `src/app/dashboard/page.tsx`：
- line 349-360 区域：
  - `<h3>按模型消费排行</h3>` → `<h3>模型平均调用成本排行</h3>`
  - `<p>各模型消费金额</p>` → `<p>按总消费 ÷ 调用次数，单位 元/次</p>`
  - `<Bar dataKey="total_cost" ...>` → `<Bar dataKey="avg_cost" ...>`
  - tooltip formatter: `[\`¥\${Number(value).toFixed(4)}/次\`, '平均成本']`

### Step 2.3: 改 statCards 智能切换

在 line 99-101 之后插入：

```typescript
const rangeLabel = activeDate === 'today' ? '今日' : activeDate === '7d' ? '7 天' : activeDate === '30d' ? '30 天' : '全部';
const costCardLabel = activeDate === 'today' ? '今日消费' : '区间消费';
const costCardValue = activeDate === 'today'
  ? (data.dailyStats.length > 0 ? data.dailyStats[data.dailyStats.length - 1].cost?.toFixed(4) : '0.0000')
  : data.stats.total_cost.toFixed(4);
```

把 line 107 那行 `{ label: '今日消费', value: todayCost, sub: '今日', ... }` 改为：

```typescript
{ label: costCardLabel, value: '¥' + costCardValue, sub: rangeLabel, color: 'text-emerald-600', icon: 'dollar-sign' },
```

同时**删除** line 99-101 那段 `const todayCost`（已被上面替换）。

### Step 2.4: 验证 dashboard 类型

`DashboardData.modelStats` 接口（line 21）加：

```typescript
total_cost: number;
avg_cost: number;
```

### Step 2.5: 跑 tsc + build

```bash
cd /d/project/mortal-api
npx tsc --noEmit
npm run build
```

预期：tsc 0、build 0。

### Step 2.6: commit + push

```bash
cd /d/project/mortal-api
git add src/app/admin/stats/route.ts src/app/dashboard/page.tsx
git commit -m "fix(stats): add avg_cost to modelStats; smart cost card label"
git push origin main
```

---

## Task 3: 密钥金额上限 input UX 修复

**Files:**
- Modify: `src/app/dashboard/keys/page.tsx`（line 274-277 创建弹窗 + line 371-374 编辑弹窗）

### Step 3.1: 修改创建弹窗 input

打开 `src/app/dashboard/keys/page.tsx`，line 274-277，把：

```tsx
<label className="block text-xs text-gray-500 mb-1.5">金额上限(元) (0=无限制)</label>
<input type="number" value={newSpendLimit} onChange={(e) => setNewSpendLimit(Number(e.target.value))}
  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
```

改为：

```tsx
<label className="block text-xs text-gray-500 mb-1.5">金额上限(元) (0=无限制)</label>
<input type="number" min={0} value={newSpendLimit}
  onChange={(e) => setNewSpendLimit(Number(e.target.value))}
  onFocus={(e) => e.target.select()}
  onWheel={(e) => e.currentTarget.blur()}
  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
```

### Step 3.2: 修改编辑弹窗 input

line 371-374，把：

```tsx
<label className="block text-xs text-gray-500 mb-1.5">金额上限(元)</label>
<input type="number" value={showEdit.spend_limit} onChange={(e) => setShowEdit({...showEdit, spend_limit: Number(e.target.value)})}
  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
```

改为：

```tsx
<label className="block text-xs text-gray-500 mb-1.5">金额上限(元)</label>
<input type="number" min={0} value={showEdit.spend_limit}
  onChange={(e) => setShowEdit({...showEdit, spend_limit: Number(e.target.value)})}
  onFocus={(e) => e.target.select()}
  onWheel={(e) => e.currentTarget.blur()}
  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
```

### Step 3.3: 跑 tsc

```bash
cd /d/project/mortal-api
npx tsc --noEmit
```

预期：exit 0。

### Step 3.4: commit + push

```bash
cd /d/project/mortal-api
git add src/app/dashboard/keys/page.tsx
git commit -m "fix(keys): make spend-limit input selectable and wheel-safe"
git push origin main
```

---

## Task 4: 后端新增 GET /admin/channels?scope=api-key&id=xxx 临时解密接口

**Files:**
- Modify: `src/app/admin/channels/route.ts`

**Interfaces:**
- Produces: `{ api_key: string }` —— 仅 admin token 鉴权通过

### Step 4.1: 加 GET scope=api-key 处理

打开 `src/app/admin/channels/route.ts`，找到 GET 方法开头（约 line 14-30 附近）。在 GET handler 最开始 `requireAdmin` 之后、scope 分发之前，插入：

```typescript
const url = new URL(request.url);
const scope = url.searchParams.get('scope');
const targetId = url.searchParams.get('id');

if (scope === 'api-key' && targetId) {
  const db = getDb();
  const row = db.prepare('SELECT api_key FROM channels WHERE id = ?').get(targetId) as { api_key: string } | undefined;
  if (!row) return NextResponse.json({ error: '渠道不存在' }, { status: 404 });
  // 解密并返回（参考该文件已有的解密逻辑，可能是 decryptChannelApiKey 或类似）
  const apiKey = decryptChannelApiKey(row.api_key);
  console.log('[api-key-view]', { channel_id: targetId, at: new Date().toISOString() });
  return NextResponse.json({ api_key: apiKey });
}
```

如果现有解密函数叫别的名字（如 `decrypt`、`decryptKey`），用实际的名字。

### Step 4.2: 跑 tsc + build

```bash
cd /d/project/mortal-api
npx tsc --noEmit
npm run build
```

预期：tsc 0、build 0。

### Step 4.3: commit + push

```bash
cd /d/project/mortal-api
git add src/app/admin/channels/route.ts
git commit -m "feat(channels): add api-key plaintext view endpoint with audit log"
git push origin main
```

---

## Task 5: dashboard/models 状态筛选统一命名

**Files:**
- Modify: `src/app/dashboard/models/page.tsx`

### Step 5.1: 修改筛选条件字符串

打开 `src/app/dashboard/models/page.tsx`，找到 line 123-126（filterStatus 比较），把：

```typescript
if (filterStatus === '正常') { ... }
if (filterStatus === '异常') { ... }
```

改为：

```typescript
if (filterStatus === 'healthy') { ... }
if (filterStatus === 'unhealthy') { ... }
```

如果内部其他判断也用"正常"/"异常"，全文替换为 `health_status` 枚举值。

### Step 5.2: 修改筛选选项 UI

line 165-166 那行 `{ label: '正常', value: '正常', color: 'green' }` 等，改为：

```typescript
{ label: '正常', value: 'healthy', color: 'green' },
{ label: '异常', value: 'unhealthy', color: 'red' },
{ label: '额度冷却', value: 'cooling_down', color: 'amber' },
{ label: '未检测', value: 'unknown', color: 'gray' },
```

### Step 5.3: 跑 tsc

```bash
cd /d/project/mortal-api
npx tsc --noEmit
```

预期：exit 0。

### Step 5.4: commit + push

```bash
cd /d/project-mortal-api 2>/dev/null || cd /d/project/mortal-api
git add src/app/dashboard/models/page.tsx
git commit -m "refactor(models): unify status filter values with channels health_status"
git push origin main
```

---

## Task 6: 渠道编辑 sidePanel 眼睛按钮 → 拉真实明文

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx`（line 562-567 眼睛 onClick）

### Step 6.1: 修改眼睛按钮 onClick

打开 `src/app/dashboard/channels/page.tsx`，找到 line 562-567 那段眼睛按钮，把：

```tsx
{panelEditId && (
  <button type="button" onClick={() => setShowApiKey(!showApiKey)}
    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600">
    {showApiKey ? <InlineIcon name="eyeOff" className="w-4 h-4" /> : <InlineIcon name="eye" className="w-4 h-4" />}
  </button>
)}
```

改为：

```tsx
{panelEditId && (
  <button type="button"
    onClick={async () => {
      if (showApiKey) {
        setShowApiKey(false);
        setPanelForm(f => ({ ...f, api_key: '••••••••••••••••••' }));
        return;
      }
      try {
        const res = await apiFetch(`/admin/channels?scope=api-key&id=${panelEditId}`);
        if (res.ok) {
          const d = await res.json();
          setPanelForm(f => ({ ...f, api_key: d.api_key }));
          setShowApiKey(true);
        }
      } catch (e) { console.error('拉取 api key 失败', e); }
    }}
    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600">
    {showApiKey ? <InlineIcon name="eyeOff" className="w-4 h-4" /> : <InlineIcon name="eye" className="w-4 h-4" />}
  </button>
)}
```

### Step 6.2: 跑 tsc

```bash
cd /d/project/mortal-api
npx tsc --noEmit
```

预期：exit 0。

### Step 6.3: commit + push

```bash
cd /d/project/mortal-api
git add src/app/dashboard/channels/page.tsx
git commit -m "fix(channels): sidePanel eye button fetches real api_key"
git push origin main
```

---

## Task 7: 渠道 chModal（小模态）补眼睛按钮

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx`（line 107 加 state；line 828-832 input 加眼睛）

### Step 7.1: 加 state

line 107 附近：

```typescript
const [showApiKey, setShowApiKey] = useState(false);
```

改为同位置加：

```typescript
const [showApiKey, setShowApiKey] = useState(false);
const [modalShowApiKey, setModalShowApiKey] = useState(false);
```

### Step 7.2: 改 modalForm api_key 初始化

line 479 附近：

```typescript
setModalForm({ name: ch.name, base_url: ch.base_url, api_key: '', priority: ch.priority, notes: ch.notes });
```

把 `api_key: ''` 改为 `api_key: '••••••••••••••••••'`（与 sidePanel 一致）。

### Step 7.3: 改 chModal input

line 828 附近，把：

```tsx
<input type="password" value={modalForm.api_key} onChange={e => setModalForm({...modalForm, api_key: e.target.value})}
  className="..." placeholder={modalEditId ? '留空保持不变' : 'sk-...'} />
```

改为：

```tsx
<div className="relative">
  <input type={modalShowApiKey ? 'text' : 'password'} value={modalForm.api_key}
    onChange={e => setModalForm({...modalForm, api_key: e.target.value})}
    className="w-full px-3 py-2.5 pr-10 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
    placeholder={modalEditId ? '••••••••••••••••••' : 'sk-...'} />
  {modalEditId && (
    <button type="button"
      onClick={async () => {
        if (modalShowApiKey) {
          setModalShowApiKey(false);
          setModalForm(f => ({ ...f, api_key: '••••••••••••••••••' }));
          return;
        }
        try {
          const res = await apiFetch(`/admin/channels?scope=api-key&id=${modalEditId}`);
          if (res.ok) {
            const d = await res.json();
            setModalForm(f => ({ ...f, api_key: d.api_key }));
            setModalShowApiKey(true);
          }
        } catch (e) { console.error('拉取 api key 失败', e); }
      }}
      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600">
      {modalShowApiKey ? <InlineIcon name="eyeOff" className="w-4 h-4" /> : <InlineIcon name="eye" className="w-4 h-4" />}
    </button>
  )}
</div>
```

### Step 7.4: 关闭 modal 时重置

搜 `setChModal(false)` 那一行（line 807 附近），把：

```typescript
onClose={() => { setChModal(false); setModalForm({ name: '', base_url: '', api_key: '', priority: 0, notes: '' }); setModalEditId(null); }}
```

改为：

```typescript
onClose={() => { setChModal(false); setModalForm({ name: '', base_url: '', api_key: '', priority: 0, notes: '' }); setModalEditId(null); setModalShowApiKey(false); }}
```

### Step 7.5: 跑 tsc

```bash
cd /d/project/mortal-api
npx tsc --noEmit
```

预期：exit 0。

### Step 7.6: commit + push

```bash
cd /d/project/mortal-api
git add src/app/dashboard/channels/page.tsx
git commit -m "fix(channels): chModal also has eye button for api_key"
git push origin main
```

---

## Task 8: 模型与别名行 — 展开箭头改删除图标

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx`（line 622-644）

### Step 8.1: 改 chevron 为 trash2 + stopPropagation

打开 `src/app/dashboard/channels/page.tsx`，找到 line 622-644，把整段：

```tsx
<div
  className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
  onClick={() => setExpandedModelId(isExpanded ? null : m.id)}
>
  <code className="text-sm font-semibold text-gray-800 font-mono truncate">{m.model_id}</code>
  {pendingModels[m.model_id]?.deleted && (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-200 shrink-0">待删除</span>
  )}
  <span className="text-gray-300 text-xs shrink-0">──→</span>
  {alias ? (
    <code className="text-sm font-semibold text-amber-700 font-mono truncate">{alias.alias_name}</code>
  ) : (
    <span className="text-xs text-gray-400 italic truncate">未设置别名</span>
  )}
  <span className="ml-auto flex items-center gap-2 shrink-0">
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${pricingMap[m.model_id] ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-amber-50 text-amber-600 border border-amber-200'}`}>
      {pricingMap[m.model_id] ? '¥' : '未定价'}
    </span>
    <InlineIcon name={isExpanded ? 'chevronUp' : 'chevronDown'} className="w-3.5 h-3.5 text-gray-400" />
  </span>
</div>
```

改为：

```tsx
<div
  className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
  onClick={() => setExpandedModelId(isExpanded ? null : m.id)}
>
  <code className="text-sm font-semibold text-gray-800 font-mono truncate">{m.model_id}</code>
  {pendingModels[m.model_id]?.deleted && (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-200 shrink-0">待删除</span>
  )}
  <span className="text-gray-300 text-xs shrink-0">──→</span>
  {alias ? (
    <code className="text-sm font-semibold text-amber-700 font-mono truncate">{alias.alias_name}</code>
  ) : (
    <span className="text-xs text-gray-400 italic truncate">未设置别名</span>
  )}
  <span className="ml-auto flex items-center gap-2 shrink-0">
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${pricingMap[m.model_id] ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-amber-50 text-amber-600 border border-amber-200'}`}>
      {pricingMap[m.model_id] ? '¥' : '未定价'}
    </span>
    <button type="button"
      onClick={(e) => { e.stopPropagation(); handleModelDelete(m.model_id); }}
      title="删除该 model"
      className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
      <InlineIcon name="trash2" className="w-3.5 h-3.5" />
    </button>
  </span>
</div>
```

### Step 8.2: 跑 tsc

```bash
cd /d/project/mortal-api
npx tsc --noEmit
```

预期：exit 0。

### Step 8.3: commit + push

```bash
cd /d/project/mortal-api
git add src/app/dashboard/channels/page.tsx
git commit -m "refactor(channels): replace model-row chevron with delete icon"
git push origin main
```

---

## Task 9: 渠道卡片布局 + 帮助图标

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx`（line 462-489 卡片头；顶部加帮助图标）

### Step 9.1: 调 HealthBar 位置

打开 `src/app/dashboard/channels/page.tsx`，找到 line 462-489 那段卡片头布局，改为：

```tsx
<div className="p-4 sm:p-5">
  <div className="flex items-start justify-between gap-3">
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-0.5">
        <h3 className="font-semibold text-gray-900 text-sm sm:text-base">{ch.name}</h3>
        <HealthBadge health_status={ch.health_status} is_active={ch.is_active} cooldown_until={ch.cooldown_until} />
        <span className="group relative shrink-0">
          <button type="button" className="p-1 rounded text-gray-300 hover:text-gray-500">
            <InlineIcon name="helpCircle" className="w-3.5 h-3.5" />
          </button>
          <span className="absolute -top-2 left-6 bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none z-50 delay-500 w-72">
            渠道顺序 = 优先级（数字小=靠前；同优先级按创建时间；0=自动）。实际请求路由只看健康度。
          </span>
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500 mt-0.5">
        <code className="text-gray-400 font-mono text-[10px]">{ch.base_url}</code>
        {ch.notes && <span>· {ch.notes}</span>}
        <span>· {ch.priority === 0 && !ch.dragged ? <span className="text-gray-400">自动</span> : <>优先 {ch.priority}</>}</span>
        <span>· 模型: {models.length} 个</span>
      </div>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      <HealthBar recent_checks={ch.recent_checks || []} uptime_pct={ch.uptime_pct ?? 100} avg_latency_ms={ch.avg_latency_ms ?? 0} />
      <div className="flex items-center gap-0.5">
        {/* 原来的编辑/连通检测/删除按钮组（line 477-500 区间） */}
      </div>
    </div>
  </div>
</div>
```

具体调整：
- 删除原 line 474-476 那段 `<div className="mt-2 md:mt-0 md:mx-3 md:flex-1 hidden md:block">` 包裹的 HealthBar
- 把 HealthBar 放进一个**新的 `<div className="flex items-center gap-2 shrink-0">`**，跟操作按钮组并排
- 操作按钮组（line 477-500 那一坨编辑/连通检测/删除）原样保留在新 div 里
- 状态徽章 `HealthBadge` 紧贴 `h3` 后面
- "优先 N" 改为 `ch.priority === 0 ? "自动" : "优先 N"`（如果 ch.dragged 字段不存在，用 ch.priority 直接判断）

### Step 9.2: 添加 helpCircle 图标（如果缺失）

```bash
cd /d/project/mortal-api
ls public/icons/helpCircle.svg 2>/dev/null || echo "missing"
```

如果缺失，编辑 `scripts/download-lucide-icons.js` 的 `neededIcons` 数组加 `'helpCircle'`，然后：

```bash
node scripts/download-lucide-icons.js
```

### Step 9.3: 跑 tsc + build

```bash
cd /d/project/mortal-api
npx tsc --noEmit
npm run build
```

预期：tsc 0、build 0。

### Step 9.4: commit + push

```bash
cd /d/project/mortal-api
git add src/app/dashboard/channels/page.tsx public/icons/helpCircle.svg scripts/download-lucide-icons.js
git commit -m "refactor(channels): card layout + priority help tooltip"
git push origin main
```

---

## Self-Review

### Spec coverage

| Spec section | Task |
|---|---|
| ① modelStats SQL + chart | Task 2 |
| ② statCards 智能切换 | Task 2 |
| ③ keys input UX | Task 3 |
| ④.1 channels 卡片布局 | Task 9 |
| ④.2 dashboard/models 状态统一 | Task 5 |
| ⑤.1 后端 api-key 接口 | Task 4 |
| ⑤.2 sidePanel 眼睛 | Task 6 |
| ⑤.3 chModal 眼睛 | Task 7 |
| ⑥ 删除图标 | Task 8 |
| ⑦ 帮助图标 + 自动 label | Task 9 |
| ⑧.1 v8 migration | Task 1 |
| ⑧.2 latency 写入 | Task 1 |
| ⑧.3 详情 TokenBadge | Task 1 |
| ⑧.4 列表列 | Task 1 |
| ⑧.5 导出列 | Task 1 |

所有 spec 改动都有 task。✓

### Placeholder scan

无 TBD / TODO / "implement later"。✓

### Type consistency

- `CreateCallLogInput` 接口在 Task 1.4 定义，Task 1.5 使用
- `DashboardData.modelStats` 在 Task 2.4 扩展 avg_cost / total_cost
- `panelForm.api_key` 占位符 `'••••••••••••••••••'` 在 Task 6、Task 7、Task 9 一致

### 顺序依赖

- Task 1（DB migration）必须先于 Task 2（stats SQL 引用 model 列）→ 实际不依赖，因为 Task 2 改的是 modelStats 不是 latency。但跑 build 时 migration v8 已写入，所以顺序 OK
- Task 4（后端 api-key 接口）必须先于 Task 6、7（前端调用）→ ✓
- Task 9（卡片布局）改了 HealthBar 位置，会让 Task 6/7/8 的 line 号略有偏移，但都是局部替换，影响小

### 顺序约束

**严格串行**（每个 task 跑 tsc 后才进下一个）：

```
Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8 → Task 9
```

每个 task 独立 commit + push。