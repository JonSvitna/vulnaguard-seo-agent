import type { ClayBatchSummary } from '@/lib/marketing/batch-approval'

const SAMPLE_LIMIT = 3

export const CLAY_SLACK_APPROVE_ACTION_ID = 'clay_batch_approve'
export const CLAY_SLACK_REJECT_ACTION_ID = 'clay_batch_reject'

export interface ClaySlackActionValue {
  batch_id: string
  action: 'approve' | 'reject'
}

export interface ClaySlackMessage {
  text: string
  blocks: Record<string, unknown>[]
}

function formatServices(services: Record<string, number>): string {
  const entries = Object.entries(services)
  if (!entries.length) return '_none_'
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([service, count]) => `• *${service}*: ${count}`)
    .join('\n')
}

function formatSamples(
  samples: ClayBatchSummary['samples'],
): string {
  const limited = samples.slice(0, SAMPLE_LIMIT)
  if (!limited.length) return '_No draft previews available._'
  return limited
    .map((sample, index) => {
      const subject = sample.subject?.trim() || '(no subject)'
      const preview = sample.preview?.trim() || ''
      return `*${index + 1}. ${sample.company_name}* — ${subject}\n>${preview}`
    })
    .join('\n\n')
}

function actionValue(batchId: string, action: ClaySlackActionValue['action']): string {
  const value: ClaySlackActionValue = { batch_id: batchId, action }
  return JSON.stringify(value)
}

/**
 * Pure Slack Block Kit contract for a Clay batch review message.
 * JSON-safe, side-effect free. Uses short sample previews only — never full email bodies.
 */
export function buildClaySlackMessage(summary: ClayBatchSummary): ClaySlackMessage {
  const {
    batch_id: batchId,
    draft_count: draftCount,
    lead_count: leadCount,
    average_fit_score: averageFitScore,
    services,
    samples,
    dashboard_path: dashboardPath,
  } = summary

  const text =
    `Clay batch ${batchId}: ${draftCount} drafts ready for review ` +
    `(avg fit ${averageFitScore}, ${leadCount} leads).`

  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `Clay leads ready — ${batchId}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Drafts*\n${draftCount}` },
        { type: 'mrkdwn', text: `*Leads*\n${leadCount}` },
        { type: 'mrkdwn', text: `*Avg fit score*\n${averageFitScore}` },
        { type: 'mrkdwn', text: `*Batch*\n\`${batchId}\`` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Service breakdown*\n${formatServices(services)}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Draft previews*\n${formatSamples(samples)}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Dashboard*\n<${dashboardPath}|Open Approval Queue for this batch>`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          action_id: CLAY_SLACK_APPROVE_ACTION_ID,
          text: { type: 'plain_text', text: 'Approve Batch', emoji: true },
          style: 'primary',
          value: actionValue(batchId, 'approve'),
        },
        {
          type: 'button',
          action_id: CLAY_SLACK_REJECT_ACTION_ID,
          text: { type: 'plain_text', text: 'Reject Batch', emoji: true },
          style: 'danger',
          value: actionValue(batchId, 'reject'),
        },
      ],
    },
  ]

  return { text, blocks }
}
