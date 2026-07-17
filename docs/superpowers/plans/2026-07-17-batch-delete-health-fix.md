# 日志批量删除 & 渠道健康路由排序 & 备份修复 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 4 个独立改进：日志页复选框批量删除 + resolveModel 健康排序 + cooling_down 修复 + 备份恢复补字段

**Architecture:** 所有改动独立且小范围。前端日志页新增状态驱动的复选框/操作栏/Modal；后端 SQL 加 ORDER BY 和修正时间窗口；管理员渠道路由补充健康恢复逻辑；备份恢复补全遗漏字段。

**Tech Stack:** Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + SQLite (better-sqlite3)

## Global Constraints

- 所有图标使用 Lucide Icons（`<InlineIcon name="..." />`），本地 `public/icons/*.svg` 加载
- Tailwind CSS v4 语法，浅色主题，白底灰字
- 主色: indigo-500 (#6366f1)
- API 请求使用 `Bearer ${localStorage.getItem('admin_token')}` 认证头

---

### Task 1: 日志页——复选框批量选择 + 操作栏 + 美化删除弹框

**Files:**
- Modify: `src/app/dashboard/logs/page.tsx` — 全部前端改动

**Interfaces:**
- Consumes: 现有 `Modal` 组件 (`@/lib/modal`)、`InlineIcon` (`@/lib/icon`)、`apiFetch` (`@/lib/fetch-with-auth`)
- Produces: 完整前端功能——复选框/全选框/操作栏/删除确认弹框

- [ ] **Step 1: 新增状态变量**

在 `LogsPage` 组件中新增三个状态，替换原有的单行删除相关逻辑：

```tsx
// 在 const [expandedLogId, setExpandedLogId] = ... 之后添加：
const [selected, setSelected] = useState<Set<string>>(new Set());
// 要删除的 confirm 弹框状态，替代浏览器 confirm()
const [deleteConfirm, setDeleteConfirm] = useState<{
  type: 'single' | 'batch';
  id?: string;
  count?: number;
} | null>(null);
```

移除原有 `const [deleting, setDeleting] = useState<string | null>(null);`——不再使用。

- [ ] **Step 2: 添加全选框列到 `<thead>`**

在第一个 `<th>` 之前插入 checkbox 列：

```tsx
<tr className="border-b border-gray-100 bg-gray-50">
  <th className="w-10 px-2 py-3 text-center">
    <input type="checkbox"
      checked={logs.length > 0 && selected.size === logs.length}
      onChange={() => {
        if (selected.size === logs.length) {
          setSelected(new Set());
        } else {
          setSelected(new Set(logs.map(l => l.id)));
        }
      }}
      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
  </th>
  <th className="text-left px-3 sm:px-4 py-3 font-medium text-gray-500 text-[10px] sm:text-xs">时间 (北京时间)</th>
  {/* ... 其余 th 不变 ... */}
</tr>
```

注意 `colSpan` 要 +1（原本 `colSpan={7}` 改为 `colSpan={8}`），有两处：loading 行（第 195 行）和空状态行（第 197 行）。

- [ ] **Step 3: 每行添加 checkbox 列 + 选中高亮**

在每个 `<tr>` 的第一个 `<td>` 之前插入 checkbox 列。同时给选中行加高亮样式。

```tsx
logs.map((log) => (
  <Fragment key={log.id}>
    <tr className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer ${
      selected.has(log.id) ? 'bg-indigo-50/30 border-l-2 border-indigo-400' : ''
    }`}
      onClick={() => toggleExpand(log.id)}>
      <td className="px-2 py-3 text-center" onClick={e => e.stopPropagation()}>
        <input type="checkbox"
          checked={selected.has(log.id)}
          onChange={() => {
            const next = new Set(selected);
            next.has(log.id) ? next.delete(log.id) : next.add(log.id);
            setSelected(next);
          }}
          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
      </td>
      {/* 原有 td 不变... */}
    </tr>
    {/* expanded detail tr 的 colSpan 改为 8 */}
  </Fragment>
))
```

- [ ] **Step 4: 添加操作栏（在表格上方、过滤条件下方）**

在过滤条件 `<div>` 之后、表格 `<div>` 之前插入操作栏：

```tsx
{/* 先找到 <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm"> 过滤条件的结束 */}

{/* 在过滤条件和表格之间插入 */}
{selected.size > 0 && (
  <div className="flex items-center justify-between bg-indigo-50/50 border border-indigo-100 rounded-xl px-4 py-3 shadow-sm">
    <span className="text-sm text-indigo-700 font-medium">
      ☑ 已选 {selected.size} 条
    </span>
    <div className="flex items-center gap-2">
      <button onClick={() => setSelected(new Set())}
        className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 bg-white transition-colors">
        取消选择
      </button>
      <button onClick={() => setDeleteConfirm({ type: 'batch', count: selected.size })}
        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors">
        <InlineIcon name="trash2" className="w-3.5 h-3.5" /> 批量删除
      </button>
    </div>
  </div>
)}

{/* 接着是表格 <div className="bg-white rounded-xl..."> */}
```

- [ ] **Step 5: 添加删除确认 Modal（替换 confirm()）**

在 `<Modal open={showBatchDelete} ...>` 之后、过滤条件之前，添加新的确认弹框。此弹框用于替换单行删除和批量删除的 `confirm()` 调用：

```tsx
{/* 删除确认 Modal — 替代浏览器 confirm() */}
<Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}
  title="确认删除">
  <div className="space-y-4">
    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600 flex items-center gap-2">
      <InlineIcon name="triangleAlert" className="w-5 h-5 shrink-0" />
      {deleteConfirm?.type === 'batch'
        ? `确定删除已选的 ${deleteConfirm.count} 条日志？`
        : '确定删除此条日志？'}
      <span className="font-medium"> 此操作不可撤销。</span>
    </div>
    <div className="flex gap-3">
      <button onClick={() => setDeleteConfirm(null)}
        className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
        取消
      </button>
      <button onClick={handleConfirmDelete}
        className="flex-1 px-4 py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors flex items-center justify-center gap-2">
        <InlineIcon name="trash2" className="w-4 h-4" /> 确认删除
      </button>
    </div>
  </div>
</Modal>
```

- [ ] **Step 6: 添加 handleConfirmDelete 函数，修改单行删除按钮**

添加新函数到组件内（在 `handleBatchDeleteByDate` 之后）：

```tsx
const handleConfirmDelete = async () => {
  if (!deleteConfirm) return;
  if (deleteConfirm.type === 'single') {
    await fetch(`/admin/logs?id=${deleteConfirm.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
    });
  } else {
    for (const id of selected) {
      await fetch(`/admin/logs?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
      });
    }
  }
  setDeleteConfirm(null);
  setSelected(new Set());
  fetchLogs();
};
```

修改原有的单行删除按钮（第 221-226 行），将 `onClick` 改为弹出确认 Modal，去掉 `handleDelete` 调用：

```tsx
<button onClick={(e) => {
  e.stopPropagation();
  setDeleteConfirm({ type: 'single', id: log.id });
}}
  className="p-1.5 rounded text-red-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="删除">
  <InlineIcon name="trash2" className="w-3.5 h-3.5" />
</button>
```

移除 `handleDelete` 函数（第 60-65 行）和 `deleting` 状态变量。

- [ ] **Step 7: 修复 colSpan**

所有 `<td colSpan={7}>` 改为 `<td colSpan={8}>`（新增了 checkbox 列）：
- 第 195 行：loading 状态 `colSpan={7}` → `colSpan={8}`
- 第 197 行：空状态 `colSpan={7}` → `colSpan={8}`
- 第 229 行：展开详情行 `colSpan={7}` → `colSpan={8}`

- [ ] **Step 8: 验证编译**

```bash
cd D:/project/mortal-api && npx tsc --noEmit 2>&1 | head -30
```
Expected: 无类型错误。

- [ ] **Step 9: 提交**

```bash
git add src/app/dashboard/logs/page.tsx
git commit -m "feat: add checkbox batch selection and beautified delete modal to logs page

- Add checkbox column with select-all in table header
- Show action bar with 'N selected' when rows are checked
- Replace browser confirm() with centered Modal for single/batch delete
- Selected rows highlighted with indigo border

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: resolveModel ORDER BY + getModelsForAuto 6h 修复 + 注释更新

**Files:**
- Modify: `src/lib/channels.ts` — resolveModel() 两处加 ORDER BY（第 117、127 行）、getModelsForAuto() 时间窗口修正（第 153 行）
- Modify: `src/app/v1/chat/completions/route.ts` — 注释更新（第 187 行）

- [ ] **Step 1: resolveModel() 别名查询加 ORDER BY**

**改动①：** 限定渠道的别名查询（第 110-117 行），在 `cm.channel_id IN (${placeholders})` 之后加 ORDER BY：

```typescript
  if (allowedChannelIds && allowedChannelIds.length > 0) {
    const placeholders = allowedChannelIds.map(() => '?').join(',');
    const alias = db.prepare(`
      SELECT ma.*, cm.model_id, cm.channel_id FROM model_aliases ma
      LEFT JOIN channel_models cm ON cm.id = ma.channel_model_id
      LEFT JOIN channels c ON c.id = cm.channel_id
      WHERE ma.alias_name = ? AND ma.is_active = 1 AND c.is_active = 1
        AND cm.channel_id IN (${placeholders})
      ORDER BY
        CASE c.health_status
          WHEN 'healthy' THEN 1
          WHEN 'unknown' THEN 2
          WHEN 'cooling_down' THEN 3
          ELSE 4
        END ASC
    `).get(modelName, ...allowedChannelIds) as any;
    if (alias) return { channelId: alias.channel_id, upstreamModelId: alias.model_id };
  }
```

**改动②：** 不限渠道的回退别名查询（第 122-127 行），在 `c.is_active = 1` 之后加 ORDER BY：

```typescript
  const alias = db.prepare(`
    SELECT ma.*, cm.model_id, cm.channel_id FROM model_aliases ma
    LEFT JOIN channel_models cm ON cm.id = ma.channel_model_id
    LEFT JOIN channels c ON c.id = cm.channel_id
    WHERE ma.alias_name = ? AND ma.is_active = 1 AND c.is_active = 1
    ORDER BY
      CASE c.health_status
        WHEN 'healthy' THEN 1
        WHEN 'unknown' THEN 2
        WHEN 'cooling_down' THEN 3
        ELSE 4
      END ASC
  `).get(modelName) as any;
  if (alias) return { channelId: alias.channel_id, upstreamModelId: alias.model_id };
```

- [ ] **Step 2: getModelsForAuto() 时间窗口修正**

`src/lib/channels.ts` 第 153 行将 `datetime('now', '+8 hours')` 改为 `datetime('now', '+8 hours', '-6 hours')`：

```typescript
  const rows = db.prepare(`
    SELECT cm.model_id, c.* FROM channel_models cm
    LEFT JOIN channels c ON c.id = cm.channel_id
    WHERE cm.is_active = 1 AND c.is_active = 1
      AND c.health_status != 'unhealthy'
      AND (
        c.health_status != 'cooling_down'
        OR c.last_health_check IS NULL
        OR c.last_health_check < datetime('now', '+8 hours', '-6 hours')
      )
  `).all() as any[];
```

- [ ] **Step 3: 注释更新（8h → 6h）**

`src/app/v1/chat/completions/route.ts` 第 187 行：

```typescript
// Rate limit (429) → cooling_down (auto-recover after 6h), other errors → unhealthy
```

- [ ] **Step 4: 验证编译**

```bash
cd D:/project/mortal-api && npx tsc --noEmit 2>&1 | head -30
```
Expected: 无类型错误。

- [ ] **Step 5: 提交**

```bash
git add src/lib/channels.ts src/app/v1/chat/completions/route.ts
git commit -m "fix: prefer healthy channels in resolveModel, fix cooling_down auto-recover to 6h

- resolveModel: add ORDER BY health_status to alias queries so healthy channels
  are matched first over cooling_down ones
- getModelsForAuto: fix cooling_down window from immediate to 6h (was broken:
  last_health_check < datetime('now', '+8 hours') was always true)
- Update comment: 8h -> 6h

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 渠道连通检测成功时自动恢复健康

**Files:**
- Modify: `src/app/admin/channels/route.ts` — check-model 成功时调用 updateChannelHealth

- [ ] **Step 1: check-model 分支加健康恢复逻辑**

在 `admin/channels/route.ts` PUT 处理器的 `check-model` 分支中，请求成功后调用 `updateChannelHealth`：

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

- [ ] **Step 2: 验证编译**

```bash
cd D:/project/mortal-api && npx tsc --noEmit 2>&1 | head -30
```
Expected: 无类型错误。

- [ ] **Step 3: 提交**

```bash
git add src/app/admin/channels/route.ts
git commit -m "feat: restore channel health on successful manual health check

- When admin runs connectivity check (check-model) and it succeeds,
  automatically update channel health_status to 'healthy'
- This allows recovering from cooling_down/unhealthy without waiting
  for the auto-recovery timer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 备份恢复补 `cached_input_tokens` 字段

**Files:**
- Modify: `src/app/admin/backup/route.ts` — call_logs INSERT 加 cached_input_tokens

- [ ] **Step 1: 修改 call_logs 恢复的 INSERT 语句**

将第 75 行的 `insertLog` preprare 和后续的 `run` 调用加上 `cached_input_tokens`：

```typescript
      // Restore call_logs
      const insertLog = db.prepare(`INSERT INTO call_logs (
        id, relay_key_id, relay_key_name, model, channel_id, channel_name,
        prompt_tokens, completion_tokens, cached_input_tokens, total_tokens,
        cost, status, error_message, ip, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const l of data.call_logs || []) {
        insertLog.run(
          l.id, l.relay_key_id, l.relay_key_name, l.model,
          l.channel_id, l.channel_name,
          l.prompt_tokens, l.completion_tokens,
          l.cached_input_tokens || 0, l.total_tokens,
          l.cost || 0, l.status, l.error_message, l.ip, l.created_at
        );
      }
```

- [ ] **Step 2: 验证编译**

```bash
cd D:/project/mortal-api && npx tsc --noEmit 2>&1 | head -30
```
Expected: 无类型错误。

- [ ] **Step 3: 提交**

```bash
git add src/app/admin/backup/route.ts
git commit -m "fix: add missing cached_input_tokens to backup restore INSERT

- The call_logs restore INSERT was missing the cached_input_tokens column,
  causing restored logs to lose their cached input token counts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
