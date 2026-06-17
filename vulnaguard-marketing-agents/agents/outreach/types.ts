export interface OutreachLead {
  [key: string]: unknown;
  id: number;
  company_name: string;
  website: string | null;
  location: string | null;
  org_type: string | null;
  cmmc_level_sought: string | null;
  employee_count: string | null;
  contact_name: string | null;
  contact_title: string | null;
  contact_email: string | null;
  contact_linkedin: string | null;
  status: string;
  score: number;
  score_reason: string | null;
  persona_slug?: string | null;
  outreach_intent?: string | null;
}

export interface QualifierResult {
  score: number;
  score_reason: string;
}

export interface SequenceEmail {
  touch_number: number;
  subject: string;
  body: string;
}

export interface CopywriterResult {
  emails: SequenceEmail[];
  linkedin_message: string;
}
