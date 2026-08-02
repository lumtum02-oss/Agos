export async function register() {
  if (process.env.ENABLE_BACKGROUND_JOBS !== 'true') return;
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureBootstrap } = await import('@/server/lib/bootstrap');
    ensureBootstrap();
  }
}
