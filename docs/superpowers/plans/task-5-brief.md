# Task 5: Log Page — Inline Row Expand for Details

From the plan:

**Files:**
- Modify: `src/app/dashboard/logs/page.tsx`

### Changes Needed

1. **Add `expandedLogId` state** and toggle handler (after existing state declarations):
```typescript
const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
const toggleExpand = (id: string) => {
  setExpandedLogId(prev => prev === id ? null : id);
};
```

2. **Add click handler to table rows** — change the `<tr>` className to add cursor-pointer and add `onClick`:
```tsx
<tr key={log.id}
  className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer"
  onClick={() => toggleExpand(log.id)}
>
```

3. **Add expandable detail row** after each closing `</tr>`:
```tsx
{expandedLogId === log.id && (
  <tr key={`detail-${log.id}`} className="bg-gray-50/50 border-b border-gray-100">
    <td colSpan={7} className="px-4 sm:px-6 py-4">
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <DetailField label="时间" value={toBeijingFull(log.created_at)} />
          <DetailField label="Key" value={log.relay_key_name} />
          <DetailField label="渠道" value={log.channel_name || '-'} />
          <DetailField label="模型" value={log.model} />
          <DetailField label="费用" value={log.cost ? log.cost.toFixed(6) : '0'} />
          <DetailField label="IP" value={log.ip || '-'} />
        </div>
        <div className="flex flex-wrap gap-4 text-xs">
          <TokenBadge label="输入" value={log.prompt_tokens} />
          <TokenBadge label="输出" value={log.completion_tokens} />
          {log.cached_input_tokens > 0 && (
            <TokenBadge label="缓存输入" value={log.cached_input_tokens} color="emerald" />
          )}
          <TokenBadge label="未缓存输入" value={Math.max(0, log.prompt_tokens - (log.cached_input_tokens || 0))} color="amber" />
          <TokenBadge label="总 Token" value={log.total_tokens} color="indigo" />
        </div>
        {log.status === 'fail' && log.error_message && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <InlineIcon name="triangleAlert" className="w-3.5 h-3.5 text-red-500" />
              <span className="text-xs font-medium text-red-600">错误信息</span>
            </div>
            <p className="text-xs text-red-600 break-all whitespace-pre-wrap leading-relaxed">{log.error_message}</p>
          </div>
        )}
        <div className="flex items-center gap-2 text-[10px] text-gray-400">
          <InlineIcon name="clock" className="w-3 h-3" />
          <span>日志 ID: {log.id}</span>
          <span className="text-gray-200">|</span>
          <span>{log.channel_name || '-'}</span>
        </div>
      </div>
    </td>
  </tr>
)}
```

4. **Add helper components** (place before the component return, or at bottom of file):
```tsx
function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] text-gray-400 block">{label}</span>
      <span className="text-xs text-gray-800 font-medium">{value}</span>
    </div>
  );
}

function TokenBadge({ label, value, color = 'gray' }: { label: string; value: number; color?: string }) {
  const colorMap: Record<string, string> = {
    gray: 'bg-gray-50 text-gray-600 border-gray-200',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    amber: 'bg-amber-50 text-amber-600 border-amber-200',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-medium ${colorMap[color] || colorMap.gray}`}>
      <span className="opacity-60">{label}:</span>
      <span>{value.toLocaleString()}</span>
    </span>
  );
}
```

**Important:** Also need to ensure `toBeijingFull` is imported from `@/lib/date` (it already is, line 6).

### Verification
- Run `npx tsc --noEmit` and confirm no new errors
