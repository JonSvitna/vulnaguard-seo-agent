export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { runMigrations } = await import('@/lib/db/migrate')
  const { getPool } = await import('@/lib/db')
  const { applied } = await runMigrations(getPool())
  if (applied.length > 0) {
    console.log('[db] applied migrations:', applied.join(', '))
  }

  if (process.env.DISABLE_SEND_BATCH_SCHEDULER === 'true') return

  const intervalMinutes = Number(process.env.SEND_BATCH_INTERVAL_MINUTES) || 15
  const { runSendBatch } = await import('@/lib/send-batch')
  const { syncResendStatus } = await import('@/lib/sync-resend-status')
  const { checkStopReplies } = await import('@/lib/check-stop-replies')

  setInterval(async () => {
    try {
      const result = await runSendBatch()
      if (result.sent > 0 || result.failed > 0) {
        console.log('[send-batch-scheduler]', result)
      }
    } catch (err) {
      console.error('[send-batch-scheduler] failed', err)
    }

    try {
      const syncResult = await syncResendStatus()
      if (syncResult.delivered > 0 || syncResult.bounced > 0) {
        console.log('[resend-status-sync]', syncResult)
      }
    } catch (err) {
      console.error('[resend-status-sync] failed', err)
    }

    try {
      const stopResult = await checkStopReplies()
      if (!stopResult.ok || stopResult.unsubscribed > 0 || stopResult.errors.length > 0) {
        console.log('[stop-reply-check]', stopResult)
      }
    } catch (err) {
      console.error('[stop-reply-check] failed', err)
    }
  }, intervalMinutes * 60 * 1000)

  console.log(`[send-batch-scheduler] started, running every ${intervalMinutes}m (includes Resend delivery status sync + STOP-reply check)`)
}
