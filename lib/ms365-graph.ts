const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

export interface GraphMessage {
  id: string
  subject: string
  bodyPreview: string
  receivedDateTime: string
  from?: { emailAddress?: { address?: string } }
}

async function getGraphToken(): Promise<string> {
  const tenantId = process.env.MS365_TENANT_ID
  const clientId = process.env.MS365_CLIENT_ID
  const clientSecret = process.env.MS365_CLIENT_SECRET
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('MS365_TENANT_ID / MS365_CLIENT_ID / MS365_CLIENT_SECRET are not set')
  }

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    }),
  })
  if (!res.ok) {
    throw new Error(`MS365 token request failed: ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  return data.access_token
}

// Fetches mail received after `sinceIso`, oldest first, so callers can advance
// their cursor to the last message's receivedDateTime after processing.
export async function fetchMailSince(sinceIso: string, top = 50): Promise<GraphMessage[]> {
  const upn = process.env.MS365_USER_UPN
  if (!upn) {
    throw new Error('MS365_USER_UPN is not set')
  }
  const token = await getGraphToken()

  const params = new URLSearchParams({
    $filter: `receivedDateTime gt ${sinceIso}`,
    $orderby: 'receivedDateTime asc',
    $top: String(top),
    $select: 'id,subject,from,receivedDateTime,bodyPreview',
  })
  const res = await fetch(`${GRAPH_BASE}/users/${upn}/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`MS365 mail fetch failed: ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  return data.value ?? []
}
