'use client';

interface HealthBadgeProps {
  health_status: string;
  is_active: number;
  cooldown_until?: string | null;
}

interface CheckItem {
  checked_at: string;
  ok: number;
  kind: string | null;
  latency_ms: number;
  error?: string | null;
}

interface HealthBarProps {
  recent_checks: CheckItem[];
  uptime_pct: number;
  avg_latency_ms: number;
}

const badgeConfig: Record<string, { cls: string; label: string; tooltip: string }> = {
  healthy:       { cls: 'bg-emerald-50 text-emerald-600',        label: '正常',      tooltip: '最近请求成功，渠道正常工作中' },
  cooling_down:  { cls: 'bg-amber-50 text-amber-600',            label: '额度冷却',  tooltip: '因额度/限流原因暂不可用，按冷却时间自动恢复' },
  unhealthy:     { cls: 'bg-red-50 text-red-500',                label: '异常',      tooltip: '渠道出现故障，正在按退避策略重试' },
  unknown:       { cls: 'bg-gray-100 text-gray-500',             label: '未检测',    tooltip: '尚未进行过健康检测' },
};

export function HealthBadge({ health_status, is_active, cooldown_until }: HealthBadgeProps) {
  if (!is_active) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-400" title="该渠道已被管理员停用">
        已停用
      </span>
    );
  }

  const cfg = badgeConfig[health_status] || badgeConfig.unknown;
  let tip = cfg.tooltip;
  if (health_status === 'cooling_down' && cooldown_until) {
    tip += ` — 预计 ${cooldown_until} 后恢复（管理员可手动检测提前恢复）`;
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.cls}`} title={tip}>
      {cfg.label}
    </span>
  );
}

export function HealthBar({ recent_checks, uptime_pct, avg_latency_ms }: HealthBarProps) {
  if (recent_checks.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="w-2 h-3 rounded-[2px] bg-gray-100" />
          ))}
        </div>
        <span className="text-[10px] text-gray-400">暂无数据</span>
      </div>
    );
  }

  const dotColor = (check: CheckItem) => {
    if (!check.ok) {
      if (check.kind === 'quota') return 'bg-amber-400';
      return 'bg-red-400';
    }
    return 'bg-emerald-400';
  };

  const maxDots = 24;
  const checks = recent_checks.slice(-maxDots); // 取最近 24 条
  const firstRow = checks.slice(0, 12);
  const secondRow = checks.slice(12, 24);

  const DotRow = ({ items }: { items: CheckItem[] }) => (
    <div className="flex gap-0.5 items-end">
      {items.map((check, i) => (
        <div
          key={i}
          className={`w-2 h-3 rounded-[2px] ${dotColor(check)}`}
          title={`${check.checked_at?.slice(0, 16) || '?'} · ${check.ok ? '成功' : (check.kind === 'quota' ? '额度上限' : '失败')} · ${check.latency_ms}ms${check.error ? ' · ' + check.error : ''}`}
        />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <DotRow items={firstRow} />
        <span className="text-[10px] text-gray-500 whitespace-nowrap">{uptime_pct}%</span>
      </div>
      {secondRow.length > 0 && (
        <div className="flex items-center gap-2">
          <DotRow items={secondRow} />
          <span className="text-[10px] text-gray-500 whitespace-nowrap">
            <span title="平均响应时间">{avg_latency_ms}ms</span>
          </span>
        </div>
      )}
    </div>
  );
}
