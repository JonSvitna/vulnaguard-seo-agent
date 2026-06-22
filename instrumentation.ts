export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.DISABLE_SEND_BATCH_SCHEDULER === 'true') return

  const intervalMinutes = Number(process.env.SEND_BATCH_INTERVAL_MINUTES) || 15
  const { runSendBatch } = await import('@/lib/send-batch')

  setInterval(async () => {
    try {
      const result = await runSendBatch()
      if (result.sent > 0 || result.failed > 0) {
        console.log('[send-batch-scheduler]', result)
      }
    } catch (err) {
      console.error('[send-batch-scheduler] failed', err)
    }
  }, intervalMinutes * 60 * 1000)

  console.log(`[send-batch-scheduler] started, running every ${intervalMinutes}m`)
}
