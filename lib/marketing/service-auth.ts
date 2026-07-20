import { timingSafeEqual } from 'node:crypto'

export function isMarketingAutomationAuthorized(
  request: Pick<Request, 'headers'>,
  configuredSecret: string | undefined = process.env.MARKETING_AUTOMATION_SECRET,
): boolean {
  if (!configuredSecret?.trim()) return false

  const authorization = request.headers.get('authorization')
  const match = authorization?.match(/^Bearer ([^\s]+)$/)
  if (!match) return false

  const expected = Buffer.from(configuredSecret)
  const received = Buffer.from(match[1])
  const comparable = Buffer.alloc(expected.length)
  received.copy(comparable, 0, 0, expected.length)

  return received.length === expected.length && timingSafeEqual(comparable, expected)
}
