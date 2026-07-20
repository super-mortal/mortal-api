# 四项修复与优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `/v1/models` 重复模型、日志批量删除慢、渠道测试不透传上游报错，并提取 Dashboard 共享 UI 组件减负。

**Architecture:** 四个彼此独立的改动，分别落在不同文件，可分开实现与提交。Task 1/2/3 是针对性 bug 修复，Task 4 是纯前端 UI 去重（不拆大文件、不动逻辑）。

**Tech Stack:** Next.js 16 App Router, TypeScript, SQLite (better-sqlite3), Tailwind CSS v4, Lucide Icons (本地)。

## Global Constraints

- 所有图标使用 Lucide，本地 `public/icons/` 加载（`<InlineIcon>` / `<Icon>`），禁止 CDN
- 浅色主题，主色 indigo-500
- better-sqlite3 同步 API；批量写操作包在 `db.transaction()` 中
- 无测试框架，验证方式为手动验证 + `npm run build` 编译通过
- 遵循 `src/lib/` 现有模块划分与代码风格
- **明确不改** `src/lib/channels.ts` 中 `resolveModel` 的多渠道路由/健康度排序逻辑

---

### Task 1: `/v1/models` 模型列表按模型 ID 去重

**Files:**
- Modify: `src/app/v1/models/route.ts:40-78`

**Interfaces:**
- Consumes: `channel_models`、`model_aliases`、`channels` 表（只读）；现有 key 校验逻辑
- Produces: `GET /v1/models` 响应 `data` 数组中每个 `id` 唯一，`owned_by` 统一为 `'mortal'`

**背景问题：** 当前别名查询与直模型查询都返回 `owned_by = c.name`（渠道名）。同一 `model_id` 挂在 N 个渠道下时，`SELECT DISTINCT cm.model_id, c.name as owned_by` 产生 N 行（每渠道一行），客户端看到重复模型。

- [ ] **Step 1: 直模型查询去掉 owned_by 并按 model_id 去重**

将 `src/app/v1/models/route.ts` 第 40-45 行：

```typescript
  const channelModels = db.prepare(`
    SELECT DISTINCT cm.model_id, c.name as owned_by, c.id as channel_id
    FROM channel_models cm
    LEFT JOIN channels c ON c.id = cm.channel_id
    WHERE ${channelWhere}
  `).all(...channelModelsParams) as any[];
```

改为：

```typescript
  const channelModels = db.prepare(`
    SELECT DISTINCT cm.model_id
    FROM channel_models cm
    LEFT JOIN channels c ON c.id = cm.channel_id
    WHERE ${channelWhere}
  `).all(...channelModelsParams) as any[];
```

- [ ] **Step 2: 别名查询去掉 owned_by（仍取 model_id 用于别名遮蔽判断）**

将第 47-53 行：

```typescript
  const aliases = db.prepare(`
    SELECT ma.alias_name, cm.model_id, c.name as owned_by
    FROM model_aliases ma
    LEFT JOIN channel_models cm ON cm.id = ma.channel_model_id
    LEFT JOIN channels c ON c.id = cm.channel_id
    WHERE ma.is_active = 1 AND ${channelWhere}
  `).all(...aliasesParams) as any[];
```

改为：

```typescript
  const aliases = db.prepare(`
    SELECT ma.alias_name, cm.model_id
    FROM model_aliases ma
    LEFT JOIN channel_models cm ON cm.id = ma.channel_model_id
    LEFT JOIN channels c ON c.id = cm.channel_id
    WHERE ma.is_active = 1 AND ${channelWhere}
  `).all(...aliasesParams) as any[];
```

- [ ] **Step 3: 拼装 allModels 时按 id 去重、owned_by 统一为 'mortal'**

将第 60-73 行：

```typescript
  const allModels: { id: string; object: string; created: number; owned_by: string }[] = [];
  const seen = new Set<string>();

  for (const a of aliases) {
    if (allowedModels.length > 0 && !allowedModels.includes(a.alias_name)) continue;
    allModels.push({ id: a.alias_name, object: 'model', created: Math.floor(Date.now() / 1000), owned_by: a.owned_by || 'mortal' });
    seen.add(a.alias_name);
  }

  for (const m of channelModels) {
    if (aliasedModelIds.has(m.model_id)) continue;
    if (allowedModels.length > 0 && !allowedModels.includes(m.model_id)) continue;
    allModels.push({ id: m.model_id, object: 'model', created: Math.floor(Date.now() / 1000), owned_by: m.owned_by || 'mortal' });
  }
```

改为：

```typescript
  const allModels: { id: string; object: string; created: number; owned_by: string }[] = [];
  const seen = new Set<string>();

  for (const a of aliases) {
    if (allowedModels.length > 0 && !allowedModels.includes(a.alias_name)) continue;
    if (seen.has(a.alias_name)) continue;
    allModels.push({ id: a.alias_name, object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'mortal' });
    seen.add(a.alias_name);
  }

  for (const m of channelModels) {
    if (aliasedModelIds.has(m.model_id)) continue;
    if (allowedModels.length > 0 && !allowedModels.includes(m.model_id)) continue;
    if (seen.has(m.model_id)) continue;
    allModels.push({ id: m.model_id, object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'mortal' });
    seen.add(m.model_id);
  }
```

- [ ] **Step 4: 验证编译**

Run: `cd D:/project/mortal-api && npm run build`
Expected: 编译通过，无类型错误。

- [ ] **Step 5: 手动验证去重**

启动 `npm run dev`，用有效 key 请求 `GET /v1/models`。确认：当同一模型 ID 挂在多个渠道下时，响应 `data` 中该 `id` 只出现一次；`owned_by` 为 `'mortal'`。

- [ ] **Step 6: Commit**

```bash
cd D:/project/mortal-api && git add src/app/v1/models/route.ts && git commit -m "fix: dedupe /v1/models by model id, unify owned_by to mortal

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 日志批量删除提速（按 ID 列表批量删）

**Files:**
- Modify: `src/lib/logs.ts`（在 `deleteCallLog` 后新增函数）
- Modify: `src/app/admin/logs/route.ts:32-51`
- Modify: `src/app/dashboard/logs/page.tsx:119-154`

**Interfaces:**
- Consumes: 现有 `call_logs` 表；前端 `selected: Set<string>` 状态
- Produces:
  - `deleteCallLogsByIds(ids: string[]): number` — 返回删除行数
  - `DELETE /admin/logs`，body `{ ids: string[] }` → `{ success: true, deleted: number }`

**背景问题：** 前端批量删除串行 `await` 循环，每条一次 HTTP 往返，删 100 条约 10 秒。改为一次请求一条 SQL。

- [ ] **Step 1: 新增 `deleteCallLogsByIds` 到 `src/lib/logs.ts`**

在 `deleteCallLog` 函数（第 85-89 行）之后插入：

```typescript
export function deleteCallLogsByIds(ids: string[]): number {
  if (!ids || ids.length === 0) return 0;
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  const stmt = db.prepare(`DELETE FROM call_logs WHERE id IN (${placeholders})`);
  const runMany = db.transaction((list: string[]) => stmt.run(...list).changes);
  return runMany(ids);
}
```

- [ ] **Step 2: 后端 DELETE 支持 body 传 ids**

将 `src/app/admin/logs/route.ts` 第 32-51 行整个 `DELETE` 函数：

```typescript
export async function DELETE(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const startDate = searchParams.get('start_date');

  // Bulk delete by date range
  if (startDate) {
    const endDate = normalizeDate(searchParams.get('end_date') || undefined);
    const count = deleteCallLogsByDate(normalizeDate(startDate)!, endDate);
    return NextResponse.json({ success: true, deleted: count });
  }

  // Single delete by id
  if (!id) return NextResponse.json({ error: 'id or start_date required' }, { status: 400 });
  const deleted = deleteCallLog(id);
  return NextResponse.json({ success: deleted });
}
```

改为（新增 body `ids` 分支，置于最前）：

```typescript
export async function DELETE(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;

  // Bulk delete by explicit id list (request body)
  try {
    const body = await request.json().catch(() => null);
    if (body && Array.isArray(body.ids) && body.ids.length > 0) {
      const deletedCount = deleteCallLogsByIds(body.ids.filter((x: any) => typeof x === 'string'));
      return NextResponse.json({ success: true, deleted: deletedCount });
    }
  } catch {
    // fall through to query-param handling below
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const startDate = searchParams.get('start_date');

  // Bulk delete by date range
  if (startDate) {
    const endDate = normalizeDate(searchParams.get('end_date') || undefined);
    const count = deleteCallLogsByDate(normalizeDate(startDate)!, endDate);
    return NextResponse.json({ success: true, deleted: count });
  }

  // Single delete by id
  if (!id) return NextResponse.json({ error: 'id, ids, or start_date required' }, { status: 400 });
  const deleted = deleteCallLog(id);
  return NextResponse.json({ success: deleted });
}
```

同时把第 6 行的 import 改为：

```typescript
import { listCallLogs, deleteCallLog, deleteCallLogsByDate, deleteCallLogsByIds } from '@/lib/logs';
```

- [ ] **Step 3: 前端批量删除改单次请求**

将 `src/app/dashboard/logs/page.tsx` 第 119-154 行 `handleConfirmDelete` 的批量分支（`const errors: string[] = [];` 起到 `fetchLogs();` 止）：

```typescript
    const errors: string[] = [];
    setDeletingInProgress(true);
    setDeleteMsg(`正在删除 ${selected.size} 条日志...`);
    for (const id of selected) {
      try {
        const res = await fetch(`/admin/logs?id=${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
        });
        if (!res.ok) errors.push(id);
      } catch { errors.push(id); }
    }
    setDeleteConfirm(null);
    setSelected(new Set());
    setDeletingInProgress(false);
    if (errors.length > 0) {
      setDeleteMsg(`删除完成，但 ${errors.length} 条删除失败`);
      setTimeout(() => setDeleteMsg(null), 5000);
    } else {
      setDeleteMsg(`已删除 ${selected.size - errors.length} 条日志`);
      setTimeout(() => setDeleteMsg(null), 3000);
    }
    fetchLogs();
```

改为：

```typescript
    const count = selected.size;
    setDeletingInProgress(true);
    setDeleteMsg(`正在删除 ${count} 条日志...`);
    let failed = false;
    try {
      const res = await fetch('/admin/logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
        body: JSON.stringify({ ids: [...selected] }),
      });
      if (!res.ok) failed = true;
    } catch { failed = true; }
    setDeleteConfirm(null);
    setSelected(new Set());
    setDeletingInProgress(false);
    if (failed) {
      setDeleteMsg('批量删除失败，请重试');
      setTimeout(() => setDeleteMsg(null), 5000);
    } else {
      setDeleteMsg(`已删除 ${count} 条日志`);
      setTimeout(() => setDeleteMsg(null), 3000);
    }
    fetchLogs();
```

- [ ] **Step 4: 验证编译**

Run: `cd D:/project/mortal-api && npm run build`
Expected: 编译通过。

- [ ] **Step 5: 手动验证提速**

启动 `npm run dev`，进入调用日志页，全选当前页（或勾选几十条），点"批量删除"。确认：删除在约 1 秒内完成（不再是逐条 ~10s），提示"已删除 N 条日志"，列表刷新后对应记录消失。

- [ ] **Step 6: Commit**

```bash
cd D:/project/mortal-api && git add src/lib/logs.ts src/app/admin/logs/route.ts src/app/dashboard/logs/page.tsx && git commit -m "feat: batch delete logs by id list in a single request

Replace per-row serial DELETE loop with one transactional IN-clause delete.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 渠道测试模型透传上游真实报错

**Files:**
- Modify: `src/app/admin/channels/route.ts:105-127`
- Modify: `src/app/dashboard/channels/page.tsx:43-44,105-125,227-233`

**Interfaces:**
- Consumes: 上游 `POST {base_url}/chat/completions` 的错误响应 body
- Produces: `PUT /admin/channels` (`_action: 'check-model'`) 响应新增 `error?: string`；前端新增 `checkError: string | null` 状态

**背景问题：** `check-model` 失败时只返回 `{ healthy, status, latency }`，不读上游 body；`catch` 只返回"超时"。管理员看不到上游真实错误。

- [ ] **Step 1: 后端读取并透传上游错误 body**

将 `src/app/admin/channels/route.ts` 第 105-127 行 `check-model` 分支：

```typescript
    if (body._action === 'check-model' && body.model_id) {
      const apiKey = resolveChannelApiKey(channel);
      if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 400 });
      try {
        const url = getChatUrl(channel.base_url);
        var start = Date.now();
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: body.model_id, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
          signal: AbortSignal.timeout(10000),
        });
        var latency = Date.now() - start;

        // ✅ 检测成功 → 恢复健康
        if (res.ok) {
          updateChannelHealth(channel.id, 'healthy');
        }

        return NextResponse.json({ healthy: res.ok, status: res.status, latency: latency + 'ms' });
      } catch {
        return NextResponse.json({ healthy: false, latency: '超时' }, { status: 200 });
      }
    }
```

改为：

```typescript
    if (body._action === 'check-model' && body.model_id) {
      const apiKey = resolveChannelApiKey(channel);
      if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 400 });
      try {
        const url = getChatUrl(channel.base_url);
        var start = Date.now();
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: body.model_id, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
          signal: AbortSignal.timeout(10000),
        });
        var latency = Date.now() - start;

        // ✅ 检测成功 → 恢复健康
        if (res.ok) {
          updateChannelHealth(channel.id, 'healthy');
          return NextResponse.json({ healthy: true, status: res.status, latency: latency + 'ms' });
        }

        // ❌ 失败 → 读取上游真实错误 body
        const rawText = await res.text().catch(() => '');
        let upstreamError = rawText;
        try {
          const parsed = JSON.parse(rawText);
          if (parsed?.error?.message) upstreamError = parsed.error.message;
          else if (typeof parsed?.error === 'string') upstreamError = parsed.error;
          else if (parsed?.message) upstreamError = parsed.message;
        } catch {
          // 非 JSON（如 HTML 错误页）→ 用原文
        }
        upstreamError = (upstreamError || `HTTP ${res.status}`).slice(0, 500);

        return NextResponse.json({ healthy: false, status: res.status, latency: latency + 'ms', error: upstreamError });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ healthy: false, latency: '超时', error: msg.slice(0, 500) }, { status: 200 });
      }
    }
```

- [ ] **Step 2: 前端新增 checkError 状态**

在 `src/app/dashboard/channels/page.tsx` 第 44 行 `const [checkLatency, setCheckLatency] = useState<string | null>(null);` 之后新增一行：

```typescript
  const [checkError, setCheckError] = useState<string | null>(null);
```

- [ ] **Step 3: doHealthCheck 记录 error**

将第 110-116 行 `doHealthCheck` 的 try 块：

```typescript
    try {
      const res = await apiFetch('/admin/channels', { method: 'PUT', body: JSON.stringify({ id: checkChannel.id, model_id: checkSelectedModel, _action: 'check-model' }) });
      const data = await res.json();
      setCheckDone(data.healthy ? 'ok' : 'fail');
      setCheckLatency(data.latency || null);
    } catch { setCheckDone('fail'); }
```

改为：

```typescript
    try {
      const res = await apiFetch('/admin/channels', { method: 'PUT', body: JSON.stringify({ id: checkChannel.id, model_id: checkSelectedModel, _action: 'check-model' }) });
      const data = await res.json();
      setCheckDone(data.healthy ? 'ok' : 'fail');
      setCheckLatency(data.latency || null);
      setCheckError(data.healthy ? null : (data.error || null));
    } catch { setCheckDone('fail'); setCheckError('请求异常'); }
```

- [ ] **Step 4: openCheckModal / 模型切换时重置 checkError**

第 118-125 行 `openCheckModal` 中，在 `setCheckLatency(null);` 后加 `setCheckError(null);`：

```typescript
  const openCheckModal = (ch: Channel) => {
    setCheckChannel(ch);
    const models = modelsForChannel(ch.id);
    setCheckSelectedModel(models.length > 0 ? models[0].model_id : '');
    setCheckDone(null);
    setCheckLatency(null);
    setCheckError(null);
    setCheckModal(true);
  };
```

第 220 行模型切换 `onChange` 中，在 `setCheckLatency(null);` 后加 `setCheckError(null);`：

```typescript
            <select value={checkSelectedModel} onChange={function(e) { setCheckSelectedModel(e.target.value); setCheckDone(null); setCheckLatency(null); setCheckError(null); }}
```

同时更新 Modal `onClose`（第 215 行）在关闭时重置：`setCheckModal(false); setCheckDone(null); setCheckLatency(null); setCheckError(null);`

- [ ] **Step 5: 检测结果显示错误详情**

将第 227-233 行结果展示块：

```tsx
          {checkDone && (
            <div className={'px-4 py-3 rounded-lg text-sm flex items-center gap-2 ' + (checkDone === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200')}>
              <InlineIcon name={checkDone === 'ok' ? 'check' : 'x'} className="w-4 h-4 shrink-0" />
              <span>{checkDone === 'ok' ? '连接正常' : '连接异常'}</span>
              {checkLatency && <span className="text-xs opacity-75 ml-auto font-mono">{checkLatency}</span>}
            </div>
          )}
```

改为：

```tsx
          {checkDone && (
            <div className={'px-4 py-3 rounded-lg text-sm ' + (checkDone === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200')}>
              <div className="flex items-center gap-2">
                <InlineIcon name={checkDone === 'ok' ? 'check' : 'x'} className="w-4 h-4 shrink-0" />
                <span>{checkDone === 'ok' ? '连接正常' : '连接异常'}</span>
                {checkLatency && <span className="text-xs opacity-75 ml-auto font-mono">{checkLatency}</span>}
              </div>
              {checkDone === 'fail' && checkError && (
                <p className="mt-1.5 text-xs break-all whitespace-pre-wrap leading-relaxed opacity-90">{checkError}</p>
              )}
            </div>
          )}
```

- [ ] **Step 6: 验证编译**

Run: `cd D:/project/mortal-api && npm run build`
Expected: 编译通过。

- [ ] **Step 7: 手动验证报错透传**

启动 `npm run dev`，进入渠道管理 → 选一个有问题的渠道（如错误 API Key 或不存在的模型）做连通性检测。确认：失败时在"连接异常"下方显示上游返回的真实错误文本（如 `invalid api key` / `model not found`），而非只有状态码。

- [ ] **Step 8: Commit**

```bash
cd D:/project/mortal-api && git add src/app/admin/channels/route.ts src/app/dashboard/channels/page.tsx && git commit -m "feat: surface upstream error message in channel model health check

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 提取 Dashboard 共享 UI 组件（聚焦去重）

**Files:**
- Create: `src/lib/ui.tsx`
- Modify: `src/app/dashboard/page.tsx`、`keys/page.tsx`、`channels/page.tsx`、`logs/page.tsx`、`models/page.tsx`、`backup/page.tsx`、`layout.tsx`（仅替换重复片段为组件引用）

**Interfaces:**
- Consumes: 现有 `<InlineIcon>`、Tailwind 类
- Produces: `src/lib/ui.tsx` 导出 `<Spinner>`、`<EmptyState>`、`<StatusBadge>`、`<TableEmpty>`，被各 dashboard 页面 import

**背景问题：** 加载 spinner、空状态、状态徽章等 UI 片段在多页面复制粘贴。抽为共享组件，纯去重，不动布局/样式值/逻辑。

- [ ] **Step 1: 创建 `src/lib/ui.tsx`，实现 4 个共享组件**

新建文件，内容：

```tsx
'use client';

import React from 'react';
import { InlineIcon } from './icon';

/** 居中加载 spinner（用于整页/区块加载态） */
export function Spinner({ className = 'w-6 h-6' }: { className?: string }) {
  return <InlineIcon name="loaderCircle" className={`${className} animate-spin text-indigo-600`} />;
}

/** 空状态：图标 + 文案 */
export function EmptyState({ icon, text, className = '' }: { icon: string; text: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center text-gray-400 ${className}`}>
      <InlineIcon name={icon} className="w-8 h-8 mb-2 text-gray-300" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

/** 状态徽章 pill */
export function StatusBadge({ variant, icon, label }: { variant: 'success' | 'fail'; icon: string; label: string }) {
  const cls = variant === 'success'
    ? 'bg-emerald-50/80 text-emerald-600 border-emerald-200/50'
    : 'bg-red-50/80 text-red-500 border-red-200/50';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${cls}`}>
      <InlineIcon name={icon} className="w-2.5 h-2.5 mr-0.5" />{label}
    </span>
  );
}

/** 表格加载/空行 */
export function TableEmpty({ colSpan, loading, text }: { colSpan: number; loading?: boolean; text?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-16 text-center">
        {loading
          ? <InlineIcon name="loaderCircle" className="w-5 h-5 animate-spin text-indigo-600 inline" />
          : <p className="text-sm text-gray-400">{text || '暂无数据'}</p>}
      </td>
    </tr>
  );
}
```

- [ ] **Step 2: 替换 logs 页表格加载/空行与状态徽章**

在 `src/app/dashboard/logs/page.tsx` 顶部 import 区加：

```typescript
import { TableEmpty, StatusBadge } from '@/lib/ui';
```

将第 368-374 行：

```tsx
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-16 text-center"><InlineIcon name="loaderCircle" className="w-5 h-5 animate-spin text-indigo-600 inline" /></td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-16 text-center">
                  <div className="text-gray-300 text-3xl mb-2"><InlineIcon name="list" className="w-8 h-8 mx-auto" /></div>
                  <p className="text-sm text-gray-400">暂无调用记录</p>
                </td></tr>
              ) : logs.map((log) => (
```

改为：

```tsx
              {loading ? (
                <TableEmpty colSpan={8} loading />
              ) : logs.length === 0 ? (
                <TableEmpty colSpan={8} text="暂无调用记录" />
              ) : logs.map((log) => (
```

将第 396-405 行状态徽章块：

```tsx
                      {log.status === 'success' ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50/80 text-emerald-600 border border-emerald-200/50">
                          <InlineIcon name="check" className="w-2.5 h-2.5 mr-0.5" />成功
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-50/80 text-red-500 border border-red-200/50 cursor-help" title={log.error_message || ''}>
                          <InlineIcon name="x" className="w-2.5 h-2.5 mr-0.5" />失败
                        </span>
                      )}
```

改为（保留失败时的 `title` 提示，故失败分支单独包一层 span）：

```tsx
                      {log.status === 'success' ? (
                        <StatusBadge variant="success" icon="check" label="成功" />
                      ) : (
                        <span className="cursor-help" title={log.error_message || ''}>
                          <StatusBadge variant="fail" icon="x" label="失败" />
                        </span>
                      )}
```

- [ ] **Step 3: 替换 models 页与 layout 的整页 spinner**

`src/app/dashboard/models/page.tsx` 顶部 import 加 `import { Spinner } from '@/lib/ui';`，将第 45 行：

```tsx
  if (loading) return (<div className="flex items-center justify-center h-64"><InlineIcon name="loaderCircle" className="w-6 h-6 animate-spin text-indigo-600" /></div>);
```

改为：

```tsx
  if (loading) return (<div className="flex items-center justify-center h-64"><Spinner /></div>);
```

`src/app/dashboard/layout.tsx` 顶部 import 加 `import { Spinner } from '@/lib/ui';`，将第 38 行：

```tsx
  if (loading) return (<div className="min-h-screen flex items-center justify-center bg-gray-50"><InlineIcon name="loaderCircle" className="w-6 h-6 animate-spin text-indigo-600" /></div>);
```

改为：

```tsx
  if (loading) return (<div className="min-h-screen flex items-center justify-center bg-gray-50"><Spinner /></div>);
```

- [ ] **Step 4: 替换 channels 页整页 spinner 与空状态**

`src/app/dashboard/channels/page.tsx` 顶部 import 加 `import { Spinner, EmptyState } from '@/lib/ui';`。

第 164 行：

```tsx
  if (loading) return <div className="flex items-center justify-center h-64"><InlineIcon name="loaderCircle" className="w-6 h-6 animate-spin text-indigo-600" /></div>;
```

改为：

```tsx
  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>;
```

第 394 行：

```tsx
        <div className="text-center py-16 text-gray-400"><InlineIcon name="plug" className="w-10 h-10 mx-auto mb-3 text-gray-200" /><p>暂无渠道</p></div>
```

改为：

```tsx
        <div className="py-16"><EmptyState icon="plug" text="暂无渠道" /></div>
```

- [ ] **Step 5: 验证编译**

Run: `cd D:/project/mortal-api && npm run build`
Expected: 编译通过，无类型/导入错误。

- [ ] **Step 6: 手动视觉回归**

启动 `npm run dev`，逐一打开 dashboard 的 logs / models / channels 页。确认：加载态 spinner、空状态、状态徽章的视觉与改动前一致（图标、颜色、间距无变化）。

- [ ] **Step 7: Commit**

```bash
cd D:/project/mortal-api && git add src/lib/ui.tsx src/app/dashboard && git commit -m "refactor: extract shared Spinner/EmptyState/StatusBadge/TableEmpty UI components

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 实施顺序与全量验证

四个 Task 独立，可任意顺序。建议：Task 2 → Task 1 → Task 3 → Task 4。每个 Task 独立提交。

全部完成后：

```bash
cd D:/project/mortal-api && npm run build
# 确保无编译错误
```
