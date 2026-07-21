# Model Pricing 别名智能同步 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复别名模型的价格存储和计费 key 不一致的问题，并在保存时自动同步到相同 (model_id + 别名) 组合的其他渠道。

**Architecture:** 当前 `model_pricing` 表以 `model_id` 为 PK 存储价格，但代理路由用用户请求的模型名（可能是别名）查价格。修正方案：有别名时用别名名称作为 pricing key 存储/查询，无别名时保持 model_id 不变。保存时后端自动匹配相同 (model_id + 别名) 组合的渠道并返回同步信息。

**Tech Stack:** Next.js 16 (App Router) + TypeScript + SQLite (better-sqlite3)

## Global Constraints

- 所有价格输入必须保留小数点验证（`/^\d+\.\d+$/`）
- 价格单位始终为 元/1M tokens
- 别名存在时，pricing key 使用别名名称；别名不存在时，使用 model_id
- 后端匹配仅对比 (model_id + alias_name) 组合完全一致的行
- 不改动数据库 schema
- 不改动代理路由的 `calculateCost(modelName, ...)` 调用（其本身正确）
- 不新建独立价格管理页面

---
### Task 1: 后端 — channels.ts 添加同步查询函数

**Files:**
- Modify: `src/lib/channels.ts`（末尾追加新函数）

**Interfaces:**
- Produces: `findChannelsWithSamePricingKey(channelModelId: string): { channels: Array<{channel_id: string, channel_name: string}>, count: number }`

- [ ] **Step 1: 在 channels.ts 末尾添加新函数**

```typescript
export function findChannelsWithSamePricingKey(channelModelId: string): {
  channels: Array<{ channel_id: string; channel_name: string }>;
  count: number;
} {
  const db = getDb();

  // 1. 获取当前 channel_model
  const cm = db.prepare('SELECT * FROM channel_models WHERE id = ?').get(channelModelId) as ChannelModel | undefined;
  if (!cm) return { channels: [], count: 0 };

  // 2. 获取当前 channel_model 的别名
  const alias = db.prepare('SELECT * FROM model_aliases WHERE channel_model_id = ? AND is_active = 1').get(channelModelId) as ModelAlias | undefined;
  const aliasName = alias?.alias_name || null;

  // 3. 查找其他 channel 中相同 model_id 的行
  const sameModelRows = db.prepare(`
    SELECT cm.id, cm.channel_id FROM channel_models cm
    WHERE cm.model_id = ? AND cm.id != ?
  `).all(cm.model_id, channelModelId) as Array<{ id: string; channel_id: string }>;

  // 4. 逐一检查别名是否匹配
  const matchedChannels: Array<{ channel_id: string; channel_name: string }> = [];
  for (const row of sameModelRows) {
    const otherAlias = db.prepare('SELECT * FROM model_aliases WHERE channel_model_id = ? AND is_active = 1').get(row.id) as ModelAlias | undefined;
    const otherAliasName = otherAlias?.alias_name || null;

    // 别名一致（同为 null 或相同字符串）才算匹配
    if ((aliasName === null && otherAliasName === null) || (aliasName !== null && otherAliasName === aliasName)) {
      const ch = db.prepare('SELECT name FROM channels WHERE id = ?').get(row.channel_id) as { name: string } | undefined;
      if (ch) matchedChannels.push({ channel_id: row.channel_id, channel_name: ch.name });
    }
  }

  return { channels: matchedChannels, count: matchedChannels.length };
}
```

- [ ] **Step 2: 本地验证编译通过**

```bash
cd D:/project/mortal-api && npx tsc --noEmit src/lib/channels.ts 2>&1 | head -20
```

Expected: 无错误输出（或仅项目层级的其他错误，无 channels.ts 相关错误）

- [ ] **Step 3: Commit**

```bash
cd D:/project/mortal-api && git add src/lib/channels.ts && git commit -m "feat: add findChannelsWithSamePricingKey helper for pricing sync
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---
### Task 2: 后端 — 更新 pricing route 接受 channel_model_id 上下文

**Files:**
- Modify: `src/app/admin/pricing/route.ts`

**Interfaces:**
- Consumes: `findChannelsWithSamePricingKey(channelModelId)` from Task 1
- Produces: POST 响应增加 `syncedChannels` 字段

- [ ] **Step 1: 更新 pricing route 的 POST 处理**

```typescript
// ============================================================
// Admin Pricing API — GET (list) + POST (upsert)
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-middleware';
import { listAllPricing, upsertModelPricing } from '@/lib/model-pricing';
import { findChannelsWithSamePricingKey } from '@/lib/channels';

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

    // 确定 pricing key：优先使用 pricing_key 字段，否则用 model_id
    const pricingKey = body.pricing_key || body.model_id;

    const pricing = upsertModelPricing({
      model_id: pricingKey,
      prompt_price: Number(body.prompt_price) || 0,
      completion_price: Number(body.completion_price) || 0,
      cached_prompt_price: Number(body.cached_prompt_price) || 0,
    });

    // 如果传了 channel_model_id，查询同步信息
    let syncedChannels: Array<{ channel_id: string; channel_name: string }> = [];
    if (body.channel_model_id) {
      const result = findChannelsWithSamePricingKey(body.channel_model_id);
      syncedChannels = result.channels;
    }

    return NextResponse.json({ pricing, syncedChannels, syncedCount: syncedChannels.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
```

- [ ] **Step 2: 编译验证**

```bash
cd D:/project/mortal-api && npx tsc --noEmit src/app/admin/pricing/route.ts 2>&1 | head -20
```

Expected: 无错误或仅模块级无关错误

- [ ] **Step 3: Commit**

```bash
cd D:/project/mortal-api && git add src/app/admin/pricing/route.ts && git commit -m "feat: update pricing route to accept channel_model_id and return sync info
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---
### Task 3: 前端 — 价格保存时使用别名作为 pricing key + 传 channel_model_id

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx:121-155`（saveChannel 函数）
- Modify: `src/app/dashboard/channels/page.tsx:93-114`（handleModelSave 函数）

**Interfaces:**
- Consumes: pricing 接口接受 `pricing_key` + `channel_model_id`（来自 Task 2）

- [ ] **Step 1: 修改 `handleModelSave` 读取别名并在保存时传递**

当前 `handleModelSave(modelId)` 中已有别名取值（第 95 行），需要把别名信息传给 `saveChannel`。最简单的方式：在 `pendingModels` 中增加 `aliasName` 字段来记录当前别名。

更新 `pendingModels` 接口 (约第 59-65 行):

```typescript
interface PendingModelChange {
  alias?: string;
  clearAlias?: boolean;
  prices?: { prompt_price: string; completion_price: string; cached_prompt_price: string };
  staged: boolean;
  deleted?: boolean;
  aliasName?: string | null;  // 新增：记录当前别名值（用于确定 pricing key）
}
```

更新 `handleModelSave`（约第 93-113 行）——在 `setPendingModels` 时记录 `aliasName`：

```typescript
const handleModelSave = (modelId: string) => {
  const getVal = (id: string) => (document.getElementById(id) as HTMLInputElement)?.value || '';
  const alias = getVal(`alias-input-${modelId}`);
  const p = getVal(`price-prompt-${modelId}`);
  const c = getVal(`price-completion-${modelId}`);
  const ch = getVal(`price-cached-${modelId}`);

  const hasPrice = p || c || ch;
  const validateDecimal = (v: string, label: string): boolean => {
    if (v === '' || v === '0') return true;
    if (!/^\d+\.\d+$/.test(v)) { alert(`${label} 价格必须包含小数点，如 28.0`); return false; }
    return true;
  };
  if (hasPrice) {
    if (!validateDecimal(p, '标准输入') || !validateDecimal(c, '输出') || !validateDecimal(ch, '缓存输入')) return;
  }

  setPendingModels(prev => {
    const isClear = prev[modelId]?.clearAlias && !alias;
    const newAliasName = isClear ? '' : (alias || null); // '' = cleared alias, null = no alias set
    return {
      ...prev,
      [modelId]: {
        alias: isClear ? '' : (alias || undefined),
        prices: hasPrice ? { prompt_price: p, completion_price: c, cached_prompt_price: ch } : undefined,
        staged: true,
        deleted: false,
        aliasName: newAliasName,
      }
    };
  });
};
```

- [ ] **Step 2: 修改 `saveChannel` 发送正确的 pricing key + channel_model_id**

更新价格保存部分（约第 146-148 行）：

```typescript
if (change.prices) {
  // 确定 pricing key：别名存在时用别名，否则用 model_id
  const pricingKey = change.aliasName || modelId;
  // 获取 channel_model 的 id（用于后端同步查询）
  const m = models.find(mm => mm.model_id === modelId);
  await apiFetch('/admin/pricing', {
    method: 'POST',
    body: JSON.stringify({
      pricing_key: pricingKey,
      model_id: modelId,  // 保留向后兼容
      channel_model_id: m?.id || '',
      prompt_price: Number(change.prices.prompt_price),
      completion_price: Number(change.prices.completion_price),
      cached_prompt_price: Number(change.prices.cached_prompt_price),
    })
  });
}
```

- [ ] **Step 3: 本地 build 验证**

```bash
cd D:/project/mortal-api && npm run build 2>&1 | tail -20
```

Expected: Build successful，无 TypeScript/语法错误

- [ ] **Step 4: Commit**

```bash
cd D:/project/mortal-api && git add src/app/dashboard/channels/page.tsx && git commit -m "fix: use alias name as pricing key when alias exists, pass channel_model_id for sync
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---
### Task 4: 前端 — 价格提示 UI 和同步反馈

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx`

- [ ] **Step 1: 在价格编辑区域添加提示文字（约第 497-532 行）**

在 `Pricing editor` 的 `<label>` 行下方添加：

```typescript
{/* Pricing editor */}
<div>
  <label className="block text-xs text-gray-500 mb-1.5">价格（元/1M tokens）</label>
  {/* 新增：定价 key 提示 */}
  {alias ? (
    <p className="text-[10px] text-gray-400 mb-2">
      此价格为 <code className="text-indigo-500 bg-indigo-50 px-1 rounded">{alias.alias_name}</code> 的全局统一价格，相同别名渠道将自动同步
    </p>
  ) : (
    <p className="text-[10px] text-gray-400 mb-2">
      此价格为 <code className="text-gray-500 bg-gray-100 px-1 rounded">{m.model_id}</code> 的全局统一价格
    </p>
  )}
  <div className="grid grid-cols-3 gap-2">
    ...
  </div>
</div>
```

- [ ] **Step 2: 在 saveChannel 后显示同步反馈（约第 146 行附近，保存成功后）**

在保存价格成功的 apiFetch 后添加 Toast 逻辑。由于当前没有 Toast 组件，使用简单的 `alert` 或在页面顶部加临时状态。最简单方案：加 `syncFeedback` 状态和临时的 Toast 消息。

在组件 state 声明区（约第 66 行后）添加：

```typescript
const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
```

在 `saveChannel` 价格保存成功后（约第 147 行后）：

```typescript
if (change.prices) {
  const pricingKey = change.aliasName || modelId;
  const m = models.find(mm => mm.model_id === modelId);
  const res = await apiFetch('/admin/pricing', {
    method: 'POST',
    body: JSON.stringify({
      pricing_key: pricingKey,
      model_id: modelId,
      channel_model_id: m?.id || '',
      prompt_price: Number(change.prices.prompt_price),
      completion_price: Number(change.prices.completion_price),
      cached_prompt_price: Number(change.prices.cached_prompt_price),
    })
  });
  if (res.ok) {
    const data = await res.json();
    if (data.syncedCount > 0) {
      setSyncFeedback(`价格已同步至 ${data.syncedCount} 个渠道（${data.syncedChannels.map((c: any) => c.channel_name).join('、')}）`);
    } else {
      setSyncFeedback(`价格已保存`);
    }
    // 3 秒后自动清除
    setTimeout(() => setSyncFeedback(null), 3000);
  }
}
```

在页面顶部（`return` 内，约第 137 行附近）添加 Toast 渲染：

```typescript
{syncFeedback && (
  <div className="fixed top-4 right-4 z-[100] bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-in slide-in-from-top-2">
    {syncFeedback}
  </div>
)}
```

- [ ] **Step 3: 编译验证**

```bash
cd D:/project/mortal-api && npm run build 2>&1 | tail -20
```

Expected: Build successful

- [ ] **Step 4: Commit**

```bash
cd D:/project/mortal-api && git add src/app/dashboard/channels/page.tsx && git commit -m "feat: add pricing hint text and sync feedback toast
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---
