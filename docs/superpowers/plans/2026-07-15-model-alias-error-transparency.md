# 模型别名强制映射 & 错误透明透传 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 别名映射后原始 model_id 隐藏（仅别名可用），上游错误原样透传下游。

**Architecture:** 路由层 + API 层 + UI 层共 5 处独立改动，每处 1-5 行核心逻辑变化，无新增依赖。

**Tech Stack:** Next.js 16 (App Router) + TypeScript + SQLite (better-sqlite3)

## Global Constraints

- 所有文件在现有目录结构中原地修改，不创建新文件
- 不改动 `getModelsForAuto()`（自动路由保持内部逻辑不变）
- 不改动 `/v1/models` 端点（现有代码已过滤原始 model_id）
- 不改动模型广场（现有代码已正确展示别名信息）
- 不改动调用日志（记录的是用户请求时传入的 modelName）
- 不改动 `src/lib/types.ts`

---

### Task 1: 路由层 — resolveModel() 别名过滤

**Files:**
- Modify: `src/lib/channels.ts:119-124`

**Interfaces:**
- Consumes: `resolveModel(modelName: string)` — 现有函数签名，不改参数/返回类型
- Produces: 有别名时原始 model_id 解析返回 null

- [ ] **Step 1: 理解当前代码**

当前 `resolveModel()` 第 119-124 行：
```typescript
// 2. Check direct model_id match (only if channel is active)
const model = db.prepare(`
  SELECT cm.*, c.is_active as ch_active FROM channel_models cm
  LEFT JOIN channels c ON c.id = cm.channel_id
  WHERE cm.model_id = ? AND cm.is_active = 1 AND c.is_active = 1
`).get(modelName) as any;
```

- [ ] **Step 2: 修改 SQL，排除有别名的模型**

```typescript
// 2. Check direct model_id match (only if channel is active, NO alias exists)
const model = db.prepare(`
  SELECT cm.*, c.is_active as ch_active FROM channel_models cm
  LEFT JOIN channels c ON c.id = cm.channel_id
  LEFT JOIN model_aliases ma ON ma.channel_model_id = cm.id AND ma.is_active = 1
  WHERE cm.model_id = ? AND cm.is_active = 1 AND c.is_active = 1
    AND ma.id IS NULL
`).get(modelName) as any;
```

改动说明：加了一个 `LEFT JOIN model_aliases` 和 `AND ma.id IS NULL`。如果该 channel_model 有活跃别名，`ma.id` 不为 NULL，这条 WHERE 就不匹配，返回 null → 用户收到 404。

- [ ] **Step 3: 本地验证**

```bash
# 启动 dev server
npm run dev &
sleep 5

# 确认有别名时原始名无法访问
curl -s http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-mortal-$(这里填一个已知的 key)" \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-v4-pro","messages":[{"role":"user","content":"hi"}]}' | head -c 200
```

预期返回类似 `{"error":{"message":"Model \"deepseek-v4-pro\" not found","type":"invalid_request_error"}}`

- [ ] **Step 4: 提交**

```bash
git add src/lib/channels.ts
git commit -m "feat: resolveModel() rejects original model_id when alias exists

Add LEFT JOIN model_aliases + ma.id IS NULL to the direct model_id
lookup, so models with active aliases cannot be accessed by their
original name.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 代理层 — callUpstream() 抛出结构化错误

**Files:**
- Modify: `src/lib/proxy.ts:44` 和 `src/lib/proxy.ts:82`

**Interfaces:**
- Consumes: `callUpstream(channel, relayReq, apiKey)` / `callUpstreamStreaming(channel, relayReq, apiKey)` — 现有签名
- Produces: 错误对象携带 `.status` 和 `.body` 属性

- [ ] **Step 1: 修改 callUpstream() 错误抛出**

第 44 行附近：
```typescript
// 改动前
if (!res.ok) throw new Error(`Upstream error ${res.status}: ${await res.text()}`);

// 改动后
if (!res.ok) {
  const text = await res.text();
  const err: any = new Error(text);
  err.status = res.status;
  err.body = text;
  throw err;
}
```

- [ ] **Step 2: 修改 callUpstreamStreaming() 错误抛出**

第 82 行附近：
```typescript
// 改动前
if (!res.ok) throw new Error(`Upstream error ${res.status}: ${await res.text()}`);

// 改动后
if (!res.ok) {
  const text = await res.text();
  const err: any = new Error(text);
  err.status = res.status;
  err.body = text;
  throw err;
}
```

- [ ] **Step 3: 提交**

```bash
git add src/lib/proxy.ts
git commit -m "feat: callUpstream() throws structured error with status + body

Preserve upstream HTTP status code and raw response body in the thrown
error, enabling downstream catch blocks to reconstruct the original
error response.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: API 层 — 上游错误透明透传

**Files:**
- Modify: `src/app/api/v1/chat/completions/route.ts:165-175`

**Interfaces:**
- Consumes: `err` 对象有 `.status` 和 `.body` 属性（来自 Task 2）
- Produces: 上游错误 JSON 原样返回给客户端

- [ ] **Step 1: 修改外层 catch 块（第 165-175 行）**

```typescript
// 改动前
  } catch (err) {
    updateChannelHealth(channel.id, 'unhealthy');
    createCallLog({
      relay_key_id: relayKey.id, relay_key_name: relayKey.name,
      model: modelName, channel_id: channel.id, channel_name: channel.name,
      prompt_tokens: 0, completion_tokens: 0,
      status: 'fail', error_message: err instanceof Error ? err.message : 'Upstream error',
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    });
    return NextResponse.json({ error: { message: `Upstream error: ${err instanceof Error ? err.message : ''}`, type: 'server_error' } }, { status: 502 });
  }

// 改动后
  } catch (err: any) {
    updateChannelHealth(channel.id, 'unhealthy');
    createCallLog({
      relay_key_id: relayKey.id, relay_key_name: relayKey.name,
      model: modelName, channel_id: channel.id, channel_name: channel.name,
      prompt_tokens: 0, completion_tokens: 0,
      status: 'fail', error_message: err.body || (err instanceof Error ? err.message : 'Upstream error'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    });

    let status = err.status || 502;
    let errorBody: any;
    try {
      errorBody = JSON.parse(err.body || '{}');
    } catch {
      errorBody = { error: { message: err.body || err.message || 'Upstream error', type: 'server_error' } };
    }
    return NextResponse.json(errorBody, { status });
  }
```

注意：`err: any` 取代 `err` 是因为我们要访问自定义属性 `.status` 和 `.body`。

- [ ] **Step 2: 本地验证 — 模拟上游错误**

可以临时修改一个渠道的 base_url 为无效地址来触发错误：

```bash
# 请求一个不存在模型触发 404
curl -s -w "\nHTTP %{http_code}\n" http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-mortal-xxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"nonexistent-model","messages":[{"role":"user","content":"hi"}]}'
```

预期返回 `{"error":{"message":"Model \"nonexistent-model\" not found..."}}` 且 HTTP 404。

- [ ] **Step 3: 提交**

```bash
git add src/app/api/v1/chat/completions/route.ts
git commit -m "feat: pass through upstream errors verbatim

Remove 'Upstream error:' prefix wrapping. Reconstruct upstream's
original error JSON and HTTP status code for the client.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: UI 层 — Key 管理模型选择器过滤

**Files:**
- Modify: `src/app/dashboard/keys/page.tsx:64-78`

**Interfaces:**
- Consumes: `getModelsForChannels(chIds: string[])` — 现有签名
- Produces: 返回数组只包含别名（有别名时）或原始 model_id（无别名时）

- [ ] **Step 1: 修改 getModelsForChannels() 函数**

```typescript
// 改动前（第 64-78 行）
const getModelsForChannels = useCallback(async (chIds: string[]): Promise<string[]> => {
  const res = await apiFetch('/api/admin/channels?scope=models');
  if (!res.ok) return [];
  const d = await res.json();
  if (chIds.length === 0) {
    const models = (d.channelModels || []).map((m: any) => m.model_id);
    const aliases = (d.aliases || []).map((a: any) => a.alias_name);
    return [...new Set([...models, ...aliases])].sort();
  }
  const chModels = (d.channelModels || []).filter((m: any) => chIds.includes(m.channel_id));
  const models = chModels.map((m: any) => m.model_id);
  const cmIds = new Set(chModels.map((m: any) => m.id));
  const aliases = (d.aliases || []).filter((a: any) => cmIds.has(a.channel_model_id)).map((a: any) => a.alias_name);
  return [...new Set([...models, ...aliases])].sort();
}, []);

// 改动后
const getModelsForChannels = useCallback(async (chIds: string[]): Promise<string[]> => {
  const res = await apiFetch('/api/admin/channels?scope=models');
  if (!res.ok) return [];
  const d = await res.json();
  
  // 如果未选择渠道，获取全部 channel_models
  const chModels = chIds.length === 0
    ? (d.channelModels || [])
    : (d.channelModels || []).filter((m: any) => chIds.includes(m.channel_id));
  
  const chModelIds = new Set(chModels.map((m: any) => m.id));
  const aliases = (d.aliases || []).filter((a: any) => a.is_active);
  
  // 哪些 channel_model 有别名
  const aliasedModelIds = new Set(
    aliases.filter((a: any) => chModelIds.has(a.channel_model_id)).map((a: any) => a.channel_model_id)
  );
  
  // 别名作为选项
  const aliasOptions = aliases
    .filter((a: any) => chModelIds.has(a.channel_model_id))
    .map((a: any) => a.alias_name);
  
  // 原始 model_id 中排除有别名的那部分
  const nativeOptions = chModels
    .filter((m: any) => !aliasedModelIds.has(m.id))
    .map((m: any) => m.model_id);
  
  return [...aliasOptions, ...nativeOptions].sort();
}, []);
```

- [ ] **Step 2: 本地验证**

启动 dev server → 登录管理后台 → Key 管理 → 创建/编辑 Key → 选择渠道 → 查看模型下拉列表。有别名模型的原始 model_id 不应该出现。

- [ ] **Step 3: 提交**

```bash
git add src/app/dashboard/keys/page.tsx
git commit -m "feat: filter out aliased model_ids in key management UI

getModelsForChannels() now returns only alias names for models that
have active aliases, hiding the original model_id from the ComboBox.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: UI 层 — 渠道管理别名卡片展示

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx:320-345`

**Interfaces:**
- Consumes: `channels`, `channelModels`, `aliases` state — 无改动
- Produces: 别名模型卡片以 alias_name 为主展示，model_id 灰字小号

- [ ] **Step 1: 修改模型卡片的渲染逻辑（第 320-345 行附近）**

```typescript
// 改动前（模型卡片渲染区域）
{models.map(m => {
  const als = aliasesForModel(m.id);
  const alias = als.length > 0 ? als[0] : null;
  return (
    <div key={m.id} className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3 group shadow-sm hover:border-indigo-200 transition-all">
      {/* Left: model_id */}
      <code className="text-sm font-semibold text-gray-800 font-mono flex-1 truncate">{m.model_id}</code>
      {/* Arrow */}
      <InlineIcon name="arrowRight" className="w-4 h-4 text-gray-300 shrink-0" />
      {/* Right: alias (or add button) */}
      {alias ? (
        <div className="flex-1 flex items-center gap-1.5 min-w-0">
          <span className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 font-mono truncate flex-1">{alias.alias_name}</span>
          <button onClick={() => deleteAlias(alias.id)} className="p-1 rounded text-red-200 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"><InlineIcon name="x" className="w-3 h-3" /></button>
        </div>
      ) : (
        <button onClick={() => { setAliasChannelModelId(m.id); setAliasName(''); setAliasModal(true); }}
          className="flex-1 flex items-center justify-center gap-1 text-xs text-gray-400 border border-dashed border-gray-300 rounded-lg px-2.5 py-1 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all">
          <InlineIcon name="plus" className="w-3 h-3" /> 别名</button>
      )}
      {/* Delete model */}
      <button onClick={() => deleteModel(m.id)} className="p-1 rounded text-red-200 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all shrink-0"><InlineIcon name="x" className="w-3 h-3" /></button>
    </div>
  );
})}

// 改动后
{models.map(m => {
  const als = aliasesForModel(m.id);
  const alias = als.length > 0 ? als[0] : null;
  return (
    <div key={m.id} className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3 group shadow-sm hover:border-indigo-200 transition-all">
      {/* Left: primary display */}
      <div className="flex-1 min-w-0">
        {alias ? (
          <>
            <div className="flex items-center gap-1.5">
              <code className="text-sm font-semibold text-amber-700 font-mono truncate">{alias.alias_name}</code>
              <button onClick={() => deleteAlias(alias.id)} className="p-0.5 rounded text-red-200 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"><InlineIcon name="x" className="w-3 h-3" /></button>
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5 font-mono">
              <span className="text-gray-300">model: </span>{m.model_id}
            </div>
          </>
        ) : (
          <>
            <code className="text-sm font-semibold text-gray-800 font-mono truncate block">{m.model_id}</code>
            <button onClick={() => { setAliasChannelModelId(m.id); setAliasName(''); setAliasModal(true); }}
              className="mt-1 inline-flex items-center gap-1 text-[10px] text-gray-400 border border-dashed border-gray-300 rounded px-2 py-0.5 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all">
              <InlineIcon name="plus" className="w-3 h-3" /> 别名</button>
          </>
        )}
      </div>
      {/* Right: delete model */}
      <button onClick={() => deleteModel(m.id)} className="p-1 rounded text-red-200 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all shrink-0"><InlineIcon name="x" className="w-3 h-3" /></button>
    </div>
  );
})}
```

布局变化：
- **有别名时**：别名（琥珀色大字）+ `model: deepseek-v4-pro` 灰字小号 + 别名删除按钮放在别名的行上
- **无别名时**：原始 model_id（深色大字）+ 添加别名按钮（虚线小按钮）

- [ ] **Step 2: 本地验证**

启动 dev server → 登录管理后台 → 渠道管理 → 展开一个有别名映射的渠道 → 卡片应显示别名为主、原始模型 ID 为灰字小字。

- [ ] **Step 3: 提交**

```bash
git add src/app/dashboard/channels/page.tsx
git commit -m "feat: swap alias/model_id display in channel cards

Alias name becomes the primary display (amber) with model_id in small
gray text below. Non-aliased models show model_id with an add-alias
button inline.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 自审清单

| 检查项 | 结果 |
|--------|------|
| Spec 覆盖 | 5 个文件中 spec 提到的每处改动都有对应 task |
| 占位符 | 无 "TBD"/"TODO" 或模糊步骤 |
| 类型一致性 | `err.status` / `err.body` 在 Task 2 定义，Task 3 消费，一致 |
| 命令完整性 | 每步都有实际命令和预期输出 |
