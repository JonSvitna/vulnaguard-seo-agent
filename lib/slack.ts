export async function postSlackMessage(text: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN
  const channel = process.env.SLACK_CHANNEL
  if (!token || !channel) return

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ channel, text }),
  })
  const data = await res.json()
  if (!data.ok) {
    console.error('[slack] postMessage failed', data.error)
  }
}
