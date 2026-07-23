export const CLAY_FIT_THRESHOLD = 70;

export const CLAY_SERVICE_TO_BUSINESS_LINE = {
  cybersecurity: 'commercial_security',
  compliance_cmmc: 'cmmc',
  website_design: 'website_dev',
  systems_automation: 'systems_automation',
} as const;

type ClayService = keyof typeof CLAY_SERVICE_TO_BUSINESS_LINE;

const LEAD_SOURCES = ['clay', 'origami'] as const;
type LeadSource = (typeof LEAD_SOURCES)[number];

const SOURCE_DETAIL: Record<LeadSource, string> = {
  clay: 'scheduled_clay_table',
  origami: 'scheduled_origami_run',
};

export interface NormalizedClayLead {
  external_source_id: string;
  batch_id: string;
  company_name: string;
  website: string;
  contact_name?: string;
  contact_title?: string;
  contact_email: string;
  location?: string;
  source: LeadSource;
  source_detail: string;
  fit_score: number;
  fit_reason: string;
  recommended_service: ClayService;
  category: string;
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

function isValidDomain(value: string): boolean {
  if (value.length > 253 || value.endsWith('.') || value.includes('..')) return false;
  const labels = value.split('.');
  if (labels.length < 2 || labels.every((label) => /^\d+$/.test(label))) return false;
  return labels.every(
    (label) => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
  );
}

function normalizeEmail(value: string): string {
  const email = value.toLowerCase();
  const atIndex = email.lastIndexOf('@');
  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  const dotAtom = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;
  if (
    atIndex <= 0 ||
    localPart.length > 64 ||
    email.length > 254 ||
    !dotAtom.test(localPart) ||
    !isValidDomain(domain)
  ) {
    throw new TypeError('email must be a valid email address');
  }
  return email;
}

function normalizeDomain(value: string): string {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const domain = url.hostname.toLowerCase().replace(/^www\./, '');
    if (url.username || url.password || !isValidDomain(domain)) throw new Error('invalid');
    return domain;
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
  if (typeof service !== 'string' || !Object.hasOwn(CLAY_SERVICE_TO_BUSINESS_LINE, service)) {
    throw new TypeError('recommended service is not supported');
  }
  const recommendedService = service as ClayService;

  const rawSource = row.source;
  if (rawSource !== undefined && (typeof rawSource !== 'string' || !LEAD_SOURCES.includes(rawSource as LeadSource))) {
    throw new TypeError('source is not supported');
  }
  const source: LeadSource = (rawSource as LeadSource | undefined) ?? 'clay';

  const normalized: NormalizedClayLead = {
    external_source_id: requiredString(row, 'clay_row_id'),
    batch_id: requiredString(row, 'batch_id'),
    company_name: requiredString(row, 'company_name'),
    website: normalizeDomain(requiredString(row, 'website')),
    contact_email: normalizeEmail(requiredString(row, 'email')),
    source,
    source_detail: SOURCE_DETAIL[source],
    fit_score: fitScore as number,
    fit_reason: requiredString(row, 'fit_reason'),
    recommended_service: recommendedService,
    category: `${source}_leads`,
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
