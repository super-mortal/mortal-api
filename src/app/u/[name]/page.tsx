import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import {
  getKeyAccessState,
  getSessionById,
} from '@/lib/key-access';
import {
  getKeySummary,
  getKeyDailyTrend,
  getKeyRecentLogs,
} from '@/lib/key-stats';
import { getRelayKeyById } from '@/lib/keys';
import SetupForm from './setup-form';
import LoginForm from './login-form';
import ChangePasswordForm from './change-password-form';
import StatsView from './stats-view';

export default async function KeyPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { name } = await params;
  const { days: daysStr } = await searchParams;
  const days = daysStr === '7' ? 7 : 30;

  const state = getKeyAccessState(name);
  if (!state) notFound();

  const cookieStore = await cookies();
  const sessionId = cookieStore.get('mps')?.value;

  if (sessionId) {
    const sess = getSessionById(sessionId);
    if (sess && new Date(sess.expires_at.replace(' ', 'T') + 'Z').getTime() > Date.now()) {
      const key = getRelayKeyById(sess.relay_key_id);
      if (key && key.name === name) {
        const summary = getKeySummary(key.id);
        const trend = getKeyDailyTrend(key.id, days);
        const recent = getKeyRecentLogs(key.id, 50);
        return (
          <StatsView
            keyName={name}
            isActive={key.is_active === 1}
            summary={summary}
            trend={trend}
            days={days}
            recent={recent}
          />
        );
      }
    }
  }

  if (!state.hasPassword) return <SetupForm keyName={name} />;
  if (state.mustReset) return <ChangePasswordForm keyName={name} />;
  return <LoginForm keyName={name} />;
}