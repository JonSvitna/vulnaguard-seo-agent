export const CLAY_FIT_THRESHOLD = 70;

export const CLAY_SERVICE_TO_BUSINESS_LINE = {
  cybersecurity: 'commercial_security',
  compliance_cmmc: 'cmmc',
  website_design: 'website_dev',
  systems_automation: 'systems_automation',
} as const;

type ClayService = keyof typeof CLAY_SERVICE_TO_BUSINESS_LINE;

export interface NormalizedClayLead {
  external_source_id: string;
  batch_id: string;
  company_name: string;
  website: string;
  contact_name?: string;
  contact_title?: string;
  contact_email: string;
  location?: string;
  source: 'clay';
  source_detail: 'scheduled_clay_table';
  fit_score: number;
  fit_reason: string;
  recommended_service: ClayService;
  category: 'clay_leads';
  business_line: (typeof CLAY_SERVICE_TO_BUSINESS_LINE)[ClayService];
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${key.replaceAll('_', ' ')} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${key.replaceAll('_', ' ')} must be a non-empty string when provided`);
  }
  return value.trim();
}

function normalizeEmail(value: string): string {
  const email = value.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new TypeError('email must be a valid email address');
  }
  return email;
}

function normalizeDomain(value: string): string {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (url.username || url.password || !url.hostname.includes('.')) throw new Error('invalid');
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    throw new TypeError('website must contain a valid domain');
  }
}

export function normalizeClayLead(input: unknown): NormalizedClayLead {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Clay lead must be an object');
  }
  const row = input as Record<string, unknown>;

  const fitScore = row.fit_score;
  if (!Number.isInteger(fitScore) || (fitScore as number) < 0 || (fitScore as number) > 100) {
    throw new TypeError('fit score must be an integer from 0 to 100');
  }
  if ((fitScore as number) < CLAY_FIT_THRESHOLD) {
    throw new RangeError(`fit score must be at least ${CLAY_FIT_THRESHOLD}`);
  }

  const service = row.recommended_service;
  if (typeof service !== 'string' || !(service in CLAY_SERVICE_TO_BUSINESS_LINE)) {
    throw new TypeError('recommended service is not supported');
  }
  const recommendedService = service as ClayService;

  const normalized: NormalizedClayLead = {
    external_source_id: requiredString(row, 'clay_row_id'),
    batch_id: requiredString(row, 'batch_id'),
    company_name: requiredString(row, 'company_name'),
    website: normalizeDomain(requiredString(row, 'website')),
    contact_email: normalizeEmail(requiredString(row, 'email')),
    source: 'clay',
    source_detail: 'scheduled_clay_table',
    fit_score: fitScore as number,
    fit_reason: requiredString(row, 'fit_reason'),
    recommended_service: recommendedService,
    category: 'clay_leads',
    business_line: CLAY_SERVICE_TO_BUSINESS_LINE[recommendedService],
  };

  const contactName = optionalString(row, 'contact_name');
  const contactTitle = optionalString(row, 'title');
  const location = optionalString(row, 'location');
  if (contactName) normalized.contact_name = contactName;
  if (contactTitle) normalized.contact_title = contactTitle;
  if (location) normalized.location = location;

  return normalized;
}
