# 日志批量删除 & 渠道健康路由排序 & 备份修复 设计文档

**日期:** 2026-07-17
**状态:** 已批准设计

## 1. 概述

本 spec 包含四个独立但同批次处理的改进：

| # | 模块 | 说明 |
|---|------|------|
| 1 | 调用日志页 | 新增复选框批量选择 + 批量删除 + 美化删除确认弹框 |
| 2 | `resolveModel()` | 别名匹配时按健康状况排序（健康优先） |
| 3 | cooling_down 机制 | 自动恢复从 8h 改为 6h + 手动检测恢复健康 |
| 4 | 备份恢复 | 修复 `call_logs` 恢复时遗漏 `cached_input_tokens` 字段 |

## 2. 详细设计

### 2.1 日志页：复选框批量删除 + 美化弹框

**涉及文件:**
- `src/app/dashboard/logs/page.tsx` — 全部前端改动

**状态新增:**
```typescript
const [selected, setSelected] = useState<Set<string>>(new Set());
// 删除确认弹框：替代浏览器原生 confirm()
const [deleteConfirm, setDeleteConfirm] = useState<{
  type: 'single' | 'batch';
  id?: string;     // single 时为删除的日志 ID
  count?: number;  // batch 时为选中数量
} | null>(null);
```

**复选框渲染:**

表格 `<thead>` 最左新增一列（`<th>`），宽度 `w-10`，包含全选框：

```tsx
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
```

每行 `<tr>` 最左新增一列 checkbox，点击 checkbox 时不触发行展开（`e.stopPropagation()`）：

```tsx
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
```

选中行加高亮样式：`className += ' bg-indigo-50/30 border-l-2 border-indigo-400'`

**操作栏:**

当 `selected.size > 0` 时，在表格上方、过滤条件下方渲染操作栏：

```tsx
{selected.size > 0 && (
  <div className="flex items-center justify-between bg-indigo-50/50 border border-indigo-100 rounded-xl px-4 py-3">
    <span className="text-sm text-indigo-700 font-medium">
      ☑ 已选 {selected.size} 条
    </span>
    <div className="flex items-center gap-2">
      <button onClick={() => setSelected(new Set())}
        className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 bg-white">
        取消选择
      </button>
      <button onClick={() => setDeleteConfirm({ type: 'batch', count: selected.size })}
        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors">
        <InlineIcon name="trash2" className="w-3.5 h-3.5" /> 批量删除
      </button>
    </div>
  </div>
)}
```

**删除确认弹框（替换 confirm()）：**

使用现有的 `Modal` 组件，居中显示，带警告样式：

```tsx
<Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}
  title="确认删除">
  <div className="space-y-4">
    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600 flex items-center gap-2">
      <InlineIcon name="triangleAlert" className="w-5 h-5 shrink-0" />
      {deleteConfirm?.type === 'batch'
        ? `确定删除已选的 ${deleteConfirm.count} 条日志？`
        : '确定删除此条日志？'}
      <span className="font-medium">此操作不可撤销。</span>
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

`handleConfirmDelete` 逻辑：

```typescript
const handleConfirmDelete = async () => {
  if (!deleteConfirm) return;
  if (deleteConfirm.type === 'single') {
    await fetch(`/admin/logs?id=${deleteConfirm.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
    });
  } else {
    // batch: 逐个删除选中的日志
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

**原有单行删除按钮**的 `onClick` 改为：

```tsx
onClick={(e) => {
  e.stopPropagation();
  setDeleteConfirm({ type: 'single', id: log.id });
}}
```

移除原有的 `handleDelete` 函数和 `deleting` 状态，不再使用 `confirm()`。

---

### 2.2 `resolveModel()` 排序——健康渠道优先

**涉及文件:**
- `src/lib/channels.ts` — 两处 SQL 加 ORDER BY

**改动①：限定渠道的别名查询（第 110-117 行）**

```sql
WHERE ma.alias_name = ? AND ma.is_active = 1 AND c.is_active = 1
  AND cm.channel_id IN (${placeholders})
ORDER BY
  CASE c.health_status
    WHEN 'healthy' THEN 1
    WHEN 'unknown' THEN 2
    WHEN 'cooling_down' THEN 3
    ELSE 4
  END ASC
```

**改动②：不限渠道的回退别名查询（第 122-127 行）**

```sql
WHERE ma.alias_name = ? AND ma.is_active = 1 AND c.is_active = 1
ORDER BY
  CASE c.health_status
    WHEN 'healthy' THEN 1
    WHEN 'unknown' THEN 2
    WHEN 'cooling_down' THEN 3
    ELSE 4
  END ASC
```

效果：同一个别名在多渠道注册时，优先命中 `healthy` 渠道，仅当无健康渠道时才落到 `cooling_down`。

---

### 2.3 cooling_down 6h + 手动检测恢复

**涉及文件:**
- `src/app/v1/chat/completions/route.ts` — 注释更新
- `src/lib/channels.ts` — `getModelsForAuto()` 条件修正
- `src/app/admin/channels/route.ts` — `check-model` 成功时恢复健康

**2.3.1 8h → 6h 注释更新**

`route.ts` 第 187 行：
```
// Rate limit (429) → cooling_down (auto-recover after 6h), other errors → unhealthy
```

**2.3.2 `getModelsForAuto()` 条件修正**

当前 bug：`last_health_check < datetime('now', '+8 hours')` 在 cooling_down 后立即可用，无等待期。

修正后（保持原有结构，仅修复时间窗口）：
```sql
AND c.health_status != 'unhealthy'
AND (
  c.health_status != 'cooling_down'
  OR c.last_health_check IS NULL
  OR c.last_health_check < datetime('now', '+8 hours', '-6 hours')
)
```

逻辑：`datetime('now', '+8 hours', '-6 hours')` = 当前北京时间减 6 小时。只有 `last_health_check` 早于 6 小时前的 cooling_down 渠道才被包含，即 6 小时自动恢复。

**2.3.3 手动检测恢复健康**

`admin/channels/route.ts` PUT 处理器 `check-model` 分支，检测成功时自动恢复：

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

---

### 2.4 备份恢复补 `cached_input_tokens`

**涉及文件:**
- `src/app/admin/backup/route.ts` — INSERT 语句和参数补上 `cached_input_tokens`

```typescript
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

## 3. 改动清单汇总

| # | 文件 | 改动类型 | 说明 |
|---|------|----------|------|
| 1 | `src/app/dashboard/logs/page.tsx` | 前端 | 新增复选框、全选框、操作栏、删除确认弹框 |
| 2 | `src/lib/channels.ts` (resolveModel) | SQL | 两处别名查询加 ORDER BY health_status |
| 3 | `src/lib/channels.ts` (getModelsForAuto) | SQL | cooling_down 过滤条件改为 6h 自动恢复 |
| 4 | `src/app/v1/chat/completions/route.ts` | 注释 | 8h → 6h 注释更新 |
| 5 | `src/app/admin/channels/route.ts` | 后端 | check-model 成功时调用 updateChannelHealth |
| 6 | `src/app/admin/backup/route.ts` | 后端 | call_logs restore 补上 cached_input_tokens |

## 4. 不变的区域

- `call_logs` 表的 schema 不变（`cached_input_tokens` 列已存在）
- Key 管理、渠道管理（不含排序和恢复）、模型管理页面不变
- 代理转发逻辑（`proxy.ts`）不变
- 自动路由 `getModelsForAuto()` 的随机选择逻辑不变

## 5. 验证要点

1. 日志页勾选 0 条 → 操作栏不显示
2. 勾选 1 条 → 显示"已选 1 条"，可批量删除
3. 全选框勾选 → 当前页全部选中；再点 → 全部取消
4. 单行删除弹框居中、带警告图标，取消/确认功能正常
5. 批量删除弹框显示正确条数
6. 创建一个别名关联到两个渠道（一个 healthy、一个 cooling_down）→ 请求始终落到 healthy
7. cooling_down 渠道 6 小时后自动出现在 auto 路由中
8. 渠道管理中连通检测成功 → 渠道状态恢复为"正常"
9. 导出备份 → 修改 `cached_input_tokens` → 导入 → 确认数据正确恢复
