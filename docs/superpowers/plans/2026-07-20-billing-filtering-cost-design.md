# 模型广场筛选 + 计费系统 + 密钥金额限制 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现模型计费（每条请求算 cost）、密钥金额限额自动停用、模型广场筛选、仪表盘金额图表、日志费用列

**Architecture:** 数据库新增 `model_pricing` 表 + `relay_keys` 加 `spend_limit`/`total_spent`；代理请求完成后按用量×单价计算 cost，同步写入日志 and 累加密钥消费；前端在已有组件上增补筛选/图表/列

**Tech Stack:** SQLite (better-sqlite3), Next.js 16 App Router, React 19, Tailwind v4, Recharts

## Global Constraints

- 所有时间戳使用北京时间: `datetime('now', '+8 hours')`
- 数据库迁移通过 `_migrations` 表控制，新列用 `PRAGMA table_info` 检测列存在性（幂等）
- 图标使用 Lucide Icons（本地 SVG，禁止 CDN）
- RelayKey 接口字段改名: `balance` → `spend_limit`, `used_tokens` → `total_spent`
- 费用单位: 元，保留 6 位小数，按每 1M tokens 计价
- `spend_limit = 0` 表示无金额限制

---
### Task 1: 数据库迁移 — model_pricing 表 + relay_keys 新列

**Files:**
- Modify: `src/lib/db.ts` — 新增 v5 迁移
- Modify: `src/app/admin/backup/route.ts` — 备份恢复包含新表和新列

**Interfaces:**
- Consumes: 现有 `_migrations` 表、`relay_keys` 表结构
- Produces: `model_pricing` 表存在、`relay_keys` 表有 `spend_limit` 和 `total_spent` 列

- [ ] **Step 1: 在 `initSchema` 中添加 v5 迁移代码**

在 `src/lib/db.ts` 的 `initSchema` 函数末尾（v4 迁移之后）追加：

```typescript
// Migration: model_pricing table + relay_keys spend_limit/total_spent
const billingMigrated = db.prepare("SELECT name FROM _migrations WHERE name = 'v5_model_pricing'").get();
if (!billingMigrated) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_pricing (
      model_id TEXT PRIMARY KEY,
      prompt_price REAL NOT NULL DEFAULT 0,
      completion_price REAL NOT NULL DEFAULT 0,
      cached_prompt_price REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
    );
  `);

  const relayCols = db.prepare("PRAGMA table_info('relay_keys')").all() as { name: string }[];
  if (!relayCols.find(c => c.name === 'spend_limit')) {
    db.exec("ALTER TABLE relay_keys ADD COLUMN spend_limit REAL NOT NULL DEFAULT 0");
  }
  if (!relayCols.find(c => c.name === 'total_spent')) {
    db.exec("ALTER TABLE relay_keys ADD COLUMN total_spent REAL NOT NULL DEFAULT 0");
  }

  db.prepare("INSERT INTO _migrations (name) VALUES ('v5_model_pricing')").run();
}
```

- [ ] **Step 2: 更新备份恢复脚本**

修改 `src/app/admin/backup/route.ts`，在 GET 导出中加入 `model_pricing` 表数据；在 POST 导入中加入 `model_pricing` 的 INSERT，并对 `relay_keys` 的 INSERT 加入 `spend_limit`/`total_spent` 的 coalesce 处理。

```typescript
// GET — 导出 model_pricing
const pricing = db.prepare('SELECT * FROM model_pricing').all();
// 加入 backup data

// POST — 导入 model_pricing
if (data.model_pricing) {
  const stmt = db.prepare('INSERT OR REPLACE INTO model_pricing (model_id, prompt_price, completion_price, cached_prompt_price, updated_at) VALUES (?, ?, ?, ?, ?)');
  // ...
}

// relay_keys INSERT 兼容
// COALESCE(row.spend_limit, 0), COALESCE(row.total_spent, 0)
```

- [ ] **Step 3: 编译验证**

```bash
npx tsc --noEmit
# Expected: exit 0, no errors
```

- [ ] **Step 4: 提交**

```bash
git add src/lib/db.ts src/app/admin/backup/route.ts
git commit -m "feat: add model_pricing table and relay_keys spend_limit/total_spent columns"
```

---
### Task 2: model_pricing CRUD（lib + API）

**Files:**
- Create: `src/lib/model-pricing.ts`
- Create: `src/app/admin/pricing/route.ts`
- Modify: `src/lib/types.ts` — 新增 `ModelPricing` 接口

**Interfaces:**
- Consumes: Task 1 创建的 `model_pricing` 表
- Produces: `getModelPricing(modelId)`, `listAllPricing()`, `upsertModelPricing(data)`, `GET /admin/pricing`, `POST /admin/pricing`

- [ ] **Step 1: 新建 `src/lib/types.ts` 接口**

在 `ModelAlias` 之后加入：

```typescript
export interface ModelPricing {
  model_id: string;
  prompt_price: number;
  completion_price: number;
  cached_prompt_price: number;
  updated_at: string;
}
```

- [ ] **Step 2: 新建 `src/lib/model-pricing.ts`**

```typescript
import { getDb } from './db';
import { ModelPricing } from './types';

export function getModelPricing(modelId: string): ModelPricing | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM model_pricing WHERE model_id = ?').get(modelId) as ModelPricing | undefined;
}

export function listAllPricing(): ModelPricing[] {
  const db = getDb();
  return db.prepare('SELECT * FROM model_pricing ORDER BY model_id').all() as ModelPricing[];
}

export function upsertModelPricing(data: {
  model_id: string;
  prompt_price: number;
  completion_price: number;
  cached_prompt_price: number;
}): ModelPricing {
  const db = getDb();
  db.prepare(`
    INSERT INTO model_pricing (model_id, prompt_price, completion_price, cached_prompt_price, updated_at)
    VALUES (?, ?, ?, ?, datetime('now', '+8 hours'))
    ON CONFLICT(model_id) DO UPDATE SET
      prompt_price = excluded.prompt_price,
      completion_price = excluded.completion_price,
      cached_prompt_price = excluded.cached_prompt_price,
      updated_at = datetime('now', '+8 hours')
  `).run(data.model_id, data.prompt_price, data.completion_price, data.cached_prompt_price);
  return getModelPricing(data.model_id)!;
}

export function calculateCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
  cachedInputTokens: number
): number {
  const pricing = getModelPricing(modelId);
  if (!pricing) return 0;
  const cost =
    (promptTokens / 1000000) * pricing.prompt_price +
    (completionTokens / 1000000) * pricing.completion_price +
    (cachedInputTokens / 1000000) * pricing.cached_prompt_price;
  return Math.round(cost * 1_000_000) / 1_000_000; // 6 位小数
}
```

- [ ] **Step 3: 新建 `src/app/admin/pricing/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-middleware';
import { listAllPricing, upsertModelPricing } from '@/lib/model-pricing';

export async function GET(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;
  return NextResponse.json({ pricing: listAllPricing() });
}

export async function POST(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;
  try {
    const body = await request.json();
    const pricing = upsertModelPricing({
      model_id: body.model_id,
      prompt_price: Number(body.prompt_price) || 0,
      completion_price: Number(body.completion_price) || 0,
      cached_prompt_price: Number(body.cached_prompt_price) || 0,
    });
    return NextResponse.json({ pricing });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
```

- [ ] **Step 4: 在 admin/channels/route.ts 的 scope=models 分支加入定价信息**

在 channels route 的 `scope === 'models'` 分支中，导入 `listAllPricing`，将 pricing 数据一并返回：

```typescript
// 在 GET 中
import { listAllPricing } from '@/lib/model-pricing';
// 在 scope === 'models' 分支中
const pricingMap = Object.fromEntries(
  listAllPricing().map(p => [p.model_id, p])
);
// 加到 response
return NextResponse.json({ channels: channelsWithHealth, channelModels, aliases, pricing: pricingMap });
```

- [ ] **Step 5: tsc 验证 + 提交**

```bash
npx tsc --noEmit
git add src/lib/model-pricing.ts src/app/admin/pricing/route.ts src/lib/types.ts src/app/admin/channels/route.ts
git commit -m "feat: add model pricing CRUD lib + API"
```

---
### Task 3: 代理路由中计算 cost 并写入日志

**Files:**
- Modify: `src/app/v1/chat/completions/route.ts`

**Interfaces:**
- Consumes: `calculateCost` from Task 2, `createCallLog` 已有 `cost` 参数
- Produces: `createCallLog` 调用传入真实 `cost`，日志表中 has cost

- [ ] **Step 1: 导入 calculateCost 并修改所有 createCallLog 调用**

在 `route.ts` 顶部加入：

```typescript
import { calculateCost } from '@/lib/model-pricing';
```

找到所有 `createCallLog({...})` 调用（当前 8 处），在每个调用前计算 cost：

**成功响应（非流式）— 结果已知时：**
```typescript
const cost = calculateCost(modelName, prompt_tokens, completion_tokens, result.cachedInputTokens || 0);
createCallLog({
  // ... 现有参数
  cost,
});
```

**流式成功结束 — 拿到最终 usage 后：**
```typescript
const cost = calculateCost(modelName, prompt_tokens, completion_tokens, cachedInputTokens);
createCallLog({
  // ... 现有参数
  cost,
});
```

**失败场景 — cost 传 0（或 undefined）：**
```typescript
createCallLog({
  // ... 现有参数
  cost: 0,
});
```

在模型路由重试的场景中（变量 `modelName`），注意 `modelName` 是 resolve 后的实际模型名。

- [ ] **Step 2: tsc 验证**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: 提交**

```bash
git add src/app/v1/chat/completions/route.ts
git commit -m "feat: calculate and record cost in relay route"
```

---
### Task 4: 密钥金额限制 + 自动禁用

**Files:**
- Modify: `src/lib/keys.ts` — 更新 `checkRelayKeyQuota` + 新增自动禁用
- Modify: `src/lib/types.ts` — `RelayKey` 接口字段更新
- Modify: `src/app/v1/chat/completions/route.ts` — 请求完成后调用 spend 跟踪
- Modify: `src/app/dashboard/keys/page.tsx` — 表单字段改为 `spend_limit`

**Interfaces:**
- Consumes: `calculateCost` from Task 2, `modelName` / 用量 from relay
- Produces: `spendLimitCheck`, `recordSpendingAndAutoDisable`

- [ ] **Step 1: 更新 `RelayKey` 接口**

```typescript
export interface RelayKey {
  // ... 其余字段不变
  spend_limit: number;    // 金额上限（元），0=无限制（原 balance）
  total_spent: number;    // 累计消费金额（元，原 used_tokens）
}
```

- [ ] **Step 2: 更新 `checkRelayKeyQuota`**

当前签名：`checkRelayKeyQuota(key: string, estimatedTokens: number)`
改为：`checkRelayKeyQuota(key: string, estimatedTokens: number, estimatedCost?: number)`

```typescript
export function checkRelayKeyQuota(key: string, estimatedTokens: number, estimatedCost?: number): { valid: boolean; reason?: string } {
  const relayKey = getRelayKeyByKey(key);
  if (!relayKey) return { valid: false, reason: 'API key not found' };
  if (!relayKey.is_active) return { valid: false, reason: 'API key is disabled' };
  if (relayKey.expires_at && new Date(relayKey.expires_at) < new Date()) {
    return { valid: false, reason: 'API key has expired' };
  }
  if (relayKey.spend_limit > 0 && (relayKey.total_spent + (estimatedCost || 0)) > relayKey.spend_limit) {
    return { valid: false, reason: 'Insufficient quota' };
  }
  return { valid: true };
}
```

- [ ] **Step 3: 新增 `recordSpending` 和自动禁用**

```typescript
export function recordAndCheckSpending(keyId: string, cost: number): void {
  const db = getDb();
  db.transaction(() => {
    // 累加消费
    db.prepare("UPDATE relay_keys SET total_spent = total_spent + ?, updated_at = datetime('now', '+8 hours') WHERE id = ?")
      .run(cost, keyId);
    // 金额超限自动禁用
    db.prepare(`
      UPDATE relay_keys SET is_active = 0, updated_at = datetime('now', '+8 hours')
      WHERE id = ? AND spend_limit > 0 AND total_spent >= spend_limit AND is_active = 1
    `).run(keyId);
    // 到期自动禁用
    db.prepare(`
      UPDATE relay_keys SET is_active = 0, updated_at = datetime('now', '+8 hours')
      WHERE id = ? AND expires_at IS NOT NULL AND expires_at <= datetime('now', '+8 hours') AND is_active = 1
    `).run(keyId);
  })();
}
```

- [ ] **Step 4: 在 relay route 中调用 `recordAndCheckSpending`**

在 `route.ts` 中，所有成功/失败 `createCallLog` 调用之后，同步调用：

```typescript
import { recordAndCheckSpending } from '@/lib/keys';

// 成功时
createCallLog({...});
if (cost > 0) recordAndCheckSpending(relayKey.id, cost);

// 失败时
createCallLog({...});
// 失败不累加消费，但检查到期自动禁用
if (cost == null) recordAndCheckSpending(relayKey.id, 0);
```

注意：`recordAndCheckSpending(relayKey.id, 0)` 会触发到期检查但金额不变。

- [ ] **Step 5: 更新 keys 页面前端表单**

在 `src/app/dashboard/keys/page.tsx` 中：
- 表单字段 `balance` → `spend_limit`
- 显示的列头改为"金额上限(元)"
- 显示的总 token 改为显示总花费
- 如果接口返回的 relayKey 有 `total_spent`，显示 `¥total_spent / ¥spend_limit`

搜索 `balance` 和 `used_tokens` 的所有前端引用，统一替换。

- [ ] **Step 6: 更新现有 relayKeys 的 listKeys 等**

所有消费 `balance` 字段的地方需要确认是否已改用 `spend_limit`。检查：
- `src/app/admin/keys/route.ts` — CRUD 接口
- `src/lib/keys.ts` — `createRelayKey`、`updateRelayKey`、`listRelayKeys` 等

- [ ] **Step 7: tsc 验证 + 提交**

```bash
npx tsc --noEmit
git add src/lib/keys.ts src/lib/types.ts src/app/v1/chat/completions/route.ts src/app/dashboard/keys/page.tsx src/app/admin/keys/route.ts
git commit -m "feat: migrate keys to spend_limit/total_spent with auto-disable"
```

---
### Task 5: 渠道管理页面 — 模型定价设置 UI

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx` — 模型列表加"设置价格"按钮

**Interfaces:**
- Consumes: `GET /admin/channels?scope=models` 返回 `pricing` 映射, `POST /admin/pricing`
- Produces: 每个模型旁可点击设置三项价格

- [ ] **Step 1: 在 channels 页面的 model list 中加入定价按钮和弹窗**

在渠道卡片的模型列表 `<div>` 中，每个模型项添加"价格"按钮和弹窗。

在 channels/page.tsx 中：

```typescript
import { apiFetch } from '@/lib/fetch-with-auth';

// 组件内部状态
const [pricingMap, setPricingMap] = useState<Record<string, {prompt_price: number; completion_price: number; cached_prompt_price: number}>>({});
const [priceModal, setPriceModal] = useState<{modelId: string} | null>(null);
const [priceForm, setPriceForm] = useState({prompt_price: '', completion_price: '', cached_prompt_price: ''});

// 加载定价
useEffect(() => {
  apiFetch('/admin/pricing').then(r => r.ok && r.json()).then(d => {
    if (d?.pricing) {
      const map: Record<string, any> = {};
      d.pricing.forEach((p: any) => { map[p.model_id] = p; });
      setPricingMap(map);
    }
  });
}, [refreshKey]);

// 保存定价
const savePrice = async () => {
  if (!priceModal) return;
  await apiFetch('/admin/pricing', {
    method: 'POST',
    body: JSON.stringify({ model_id: priceModal.modelId, ...priceForm }),
  });
  setPriceModal(null);
  // 刷新
};
```

**模型列表中的按钮：**
在显示 `model.model_id` 的旁边加一个小按钮：

```tsx
<button onClick={() => {
  const p = pricingMap[model.model_id];
  setPriceForm({
    prompt_price: String(p?.prompt_price ?? ''),
    completion_price: String(p?.completion_price ?? ''),
    cached_prompt_price: String(p?.cached_prompt_price ?? ''),
  });
  setPriceModal({ modelId: model.model_id });
}} className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 border border-gray-200">
  价格
</button>
```

**定价弹窗（使用现有 Modal 组件）：**
```tsx
{priceModal && (
  <Modal title={`设置价格 — ${priceModal.modelId}`} onClose={() => setPriceModal(null)}>
    <div className="space-y-3 p-2">
      <div>
        <label className="text-xs text-gray-500">标准输入 (元/1M tokens)</label>
        <input type="number" step="0.001" className="w-full border rounded-lg p-2 text-sm" value={priceForm.prompt_price}
          onChange={e => setPriceForm(p => ({...p, prompt_price: e.target.value}))} />
      </div>
      <div>
        <label className="text-xs text-gray-500">输出 (元/1M tokens)</label>
        <input type="number" step="0.001" className="w-full border rounded-lg p-2 text-sm" value={priceForm.completion_price}
          onChange={e => setPriceForm(p => ({...p, completion_price: e.target.value}))} />
      </div>
      <div>
        <label className="text-xs text-gray-500">缓存命中输入 (元/1M tokens)</label>
        <input type="number" step="0.001" className="w-full border rounded-lg p-2 text-sm" value={priceForm.cached_prompt_price}
          onChange={e => setPriceForm(p => ({...p, cached_prompt_price: e.target.value}))} />
      </div>
      <div className="flex gap-2 pt-2">
        <button onClick={() => setPriceModal(null)} className="flex-1 py-2 rounded-lg border text-sm">取消</button>
        <button onClick={savePrice} className="flex-1 py-2 rounded-lg bg-indigo-500 text-white text-sm">保存</button>
      </div>
    </div>
  </Modal>
)}
```

- [ ] **Step 2: tsc 验证 + 提交**

```bash
npx tsc --noEmit
git add src/app/dashboard/channels/page.tsx
git commit -m "feat: add model pricing UI in channel management"
```

---
### Task 6: 模型广场筛选前端

**Files:**
- Modify: `src/app/dashboard/models/page.tsx` — 顶部统计条右侧加三个筛选下拉

**Interfaces:**
- Consumes: `GET /admin/channels?scope=models` 返回的 `channels`, `displayItems` 数组
- Produces: 前端筛选状态 → filter displayItems

- [ ] **Step 1: 在页面组件中添加筛选状态和筛选逻辑**

```typescript
// 状态
const [filterChannel, setFilterChannel] = useState('all');
const [filterStatus, setFilterStatus] = useState('all');
const [filterType, setFilterType] = useState('all');

// 筛选逻辑 — 在 displayItems 上方
const filteredItems = displayItems.filter(item => {
  if (filterChannel !== 'all' && item.channelName !== filterChannel) return false;
  if (filterStatus === '正常' && (item.channelHealth !== 'healthy' || !item.isActive)) return false;
  if (filterStatus === '异常' && item.channelHealth !== 'unhealthy') return false;
  if (filterStatus === '停用' && item.isActive) return false;
  if (filterType === '原生' && item.type !== 'model') return false;
  if (filterType === '别名' && item.type !== 'alias') return false;
  return true;
});
```

- [ ] **Step 2: 在统计条右侧加入筛选 UI**

在现有的统计条 `<div className="flex flex-wrap items-center gap-3 ...">` 中，右侧新增：

```tsx
{/* 右侧筛选 — 仅桌面 */}
<div className="hidden md:flex items-center gap-2 ml-auto">
  <select value={filterChannel} onChange={e => setFilterChannel(e.target.value)}
    className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white">
    <option value="all">全部渠道</option>
    {channels.filter(c => c.is_active).map(c => (
      <option key={c.id} value={c.name}>{c.name}</option>
    ))}
  </select>
  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
    className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white">
    <option value="all">全部状态</option>
    <option value="正常">正常</option>
    <option value="异常">异常</option>
    <option value="停用">停用</option>
  </select>
  <select value={filterType} onChange={e => setFilterType(e.target.value)}
    className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white">
    <option value="all">全部类型</option>
    <option value="原生">原生模型</option>
    <option value="别名">别名映射</option>
  </select>
</div>
```

- 统计条需要加 `flex-wrap`，左侧统计用 `flex`，右侧筛选用 `ml-auto`
- 总数从 `displayItems.length` 改为 `filteredItems.length`

- [ ] **Step 3: tsc 验证 + 提交**

```bash
npx tsc --noEmit
git add src/app/dashboard/models/page.tsx
git commit -m "feat: add channel/status/type filters to model plaza"
```

---
### Task 7: 仪表盘金额图表

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/lib/logs.ts` — `modelStats` 加上 cost 聚合

**Interfaces:**
- Consumes: `getStats` 的 `total_cost`, `dailyStats[n].cost`, `modelStats`（需加 cost）
- Produces: 今日消费卡片 + 7天消费趋势折线图 + 按模型消费排行

- [ ] **Step 1: 更新 `getStats` 的 modelStats 加上 cost**

```typescript
const modelStats = db.prepare(`
  SELECT
    model,
    COUNT(*) as calls,
    COALESCE(SUM(total_tokens), 0) as tokens,
    COALESCE(SUM(cost), 0) as total_cost
  FROM call_logs
  WHERE created_at >= datetime('now', '+8 hours', ?)
  GROUP BY model
  ORDER BY calls DESC
`).all(`-${days} days`);
```

- [ ] **Step 2: 在仪表盘页面加入金额图表**

在 `src/app/dashboard/page.tsx` 中，在现有的统计卡片区加入一个"今日消费"卡片：

```tsx
{/* 今日消费 */}
<div className="bg-white rounded-xl border border-gray-100 p-4">
  <div className="flex items-center gap-2 mb-3">
    <InlineIcon name="dollar-sign" className="w-4 h-4 text-emerald-500" />
    <span className="text-xs font-medium text-gray-500">今日消费</span>
  </div>
  <div className="text-2xl font-semibold text-gray-900">
    ¥{dailyStats.length > 0 ? dailyStats[dailyStats.length - 1].cost?.toFixed(4) || '0.0000' : '0.0000'}
  </div>
</div>
```

在图表区域加入"近 7 天消费趋势"折线图（使用 Recharts）：

```tsx
<ResponsiveContainer width="100%" height={200}>
  <AreaChart data={dailyStats}>
    <defs>
      <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
      </linearGradient>
    </defs>
    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
    <XAxis dataKey="date" tick={{fontSize: 10}} />
    <YAxis tick={{fontSize: 10}} />
    <Tooltip />
    <Area type="monotone" dataKey="cost" stroke="#6366f1" fill="url(#colorCost)" name="消费(元)" />
  </AreaChart>
</ResponsiveContainer>
```

在模型统计区域加入"按模型消费排行"柱状图：

```tsx
<ResponsiveContainer width="100%" height={200}>
  <BarChart data={modelStats.slice(0, 10)} layout="vertical">
    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
    <XAxis type="number" tick={{fontSize: 10}} />
    <YAxis type="category" dataKey="model" width={100} tick={{fontSize: 10}} />
    <Tooltip />
    <Bar dataKey="total_cost" fill="#6366f1" name="消费(元)" radius={[0, 4, 4, 0]} />
  </BarChart>
</ResponsiveContainer>
```

- [ ] **Step 3: tsc 验证 + 提交**

```bash
npx tsc --noEmit
git add src/lib/logs.ts src/app/dashboard/page.tsx
git commit -m "feat: add cost charts to dashboard"
```

---
### Task 8: 调用日志增加费用列

**Files:**
- Modify: `src/app/dashboard/logs/page.tsx`

**Interfaces:**
- Consumes: `CallLog.cost` 字段
- Produces: 表格新增"费用(元)"列

- [ ] **Step 1: 在日志表格中插入费用列**

在 `logs/page.tsx` 的表格 `<thead>` 中，在"总 token" `<th>` 之后加入：

```tsx
<th className="px-2.5 sm:px-3 py-2.5 text-[10px] font-medium text-gray-400 uppercase tracking-wider text-right hidden md:table-cell">费用(元)</th>
```

对应 `<tbody>` 的 `<td>`：

```tsx
<td className="px-2.5 sm:px-3 py-2.5 hidden md:table-cell">
  <span className="text-xs text-gray-600 tabular-nums">
    {log.cost ? `¥${log.cost.toFixed(6)}` : '-'}
  </span>
</td>
```

- [ ] **Step 2: tsc 验证 + 提交**

```bash
npx tsc --noEmit
git add src/app/dashboard/logs/page.tsx
git commit -m "feat: add cost column to call logs table"
```
