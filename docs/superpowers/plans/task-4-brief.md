# Task 4: Dashboard Page — Default Today, Date Fix, Auto-Refresh

From the plan:

**Files:**
- Modify: `src/app/dashboard/page.tsx`

### Changes Needed

1. **Change default `activeDate`** from `'7d'` to `'today'`:
```typescript
const [activeDate, setActiveDate] = useState('today');
```

2. **Fix `buildUrl()` today branch** — replace incorrect month-only query with proper date range:
```typescript
if (activeDate === 'today') {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  params.set('start_date', `${y}-${m}-${d} 00:00:00`);
  params.set('end_date', `${y}-${m}-${d} 23:59:59`);
}
```

3. **Add 60s auto-refresh timer** for today mode:
```typescript
useEffect(() => {
  if (activeDate !== 'today') return;
  const timer = setInterval(() => { fetchStats(); }, 60000);
  return () => clearInterval(timer);
}, [activeDate, fetchStats]);
```

### Verification
- Run `npx tsc --noEmit` and confirm no new errors
