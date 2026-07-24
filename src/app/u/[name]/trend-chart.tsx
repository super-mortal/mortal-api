'use client';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { DailyBucket } from '@/lib/key-stats';

export default function TrendChart({ data }: { data: DailyBucket[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line yAxisId="left" type="monotone" dataKey="calls" name="调用次数" stroke="#6366f1" dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="tokens" name="Token" stroke="#10b981" dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="cost" name="费用 (¥)" stroke="#f59e0b" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
