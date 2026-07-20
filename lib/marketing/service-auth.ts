import { timingSafeEqual } from 'node:crypto'

type Comparator = (left: NodeJS.ArrayBufferView, right: NodeJS.ArrayBufferView) => boolean

export function constantTimeEqual(
  left: string,
  right: string,
  comparator: Comparator = timingSafeEqual,
): boolean {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  const paddedLength = Math.max(leftBytes.length, rightBytes.length, 1)
  const paddedLeft = Buffer.alloc(paddedLength)
  const paddedRight = Buffer.alloc(paddedLength)
  leftBytes.copy(paddedLeft)
  rightBytes.copy(paddedRight)

  const contentsMatch = comparator(paddedLeft, paddedRight)
  return contentsMatch && leftBytes.length === rightBytes.length
}

export function isMarketingAutomationAuthorized(
  request: Pick<Request, 'headers'>,
  configuredSecret: string | undefined = process.env.MARKETING_AUTOMATION_SECRET,
): boolean {
  if (!configuredSecret?.trim()) return false

  const authorization = request.headers.get('authorization')
  const match = authorization?.match(/^Bearer ([^\s]+)$/)
  if (!match) return false

  return constantTimeEqual(match[1], configuredSecret)
}
