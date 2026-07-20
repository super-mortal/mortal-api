export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startHealthMonitor } = await import('@/lib/health-monitor');
    startHealthMonitor();
  }
}
