// Shared, non-throwing email format validation. Syntax/domain-shape only —
// no MX lookup, no external verification API (explicit product decision,
// see docs/superpowers/specs/2026-07-27-import-validate-draft-consolidation-design.md).
// lib/marketing/clay-batch.ts imports these instead of keeping its own copy.

export function isValidDomain(value: string): boolean {
  if (value.length > 253 || value.endsWith('.') || value.includes('..')) return false;
  const labels = value.split('.');
  if (labels.length < 2 || labels.every((label) => /^\d+$/.test(label))) return false;
  return labels.every(
    (label) => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
  );
}

export function isValidEmailFormat(value: string): boolean {
  const email = value.trim().toLowerCase();
  const atIndex = email.lastIndexOf('@');
  if (atIndex <= 0) return false;
  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  const dotAtom = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;
  return localPart.length <= 64 && email.length <= 254 && dotAtom.test(localPart) && isValidDomain(domain);
}
