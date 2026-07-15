export const OLD_COMMERCIAL_SECURITY_FOOTER =
  "Sean Murrill | Vulnaguard LLC | 980 Joshua Tree Ct, Owings Mills, MD 21117 | Reply STOP to opt out.";

export const COMMERCIAL_SECURITY_FOOTER =
  'Vulnaguard LLC · Owings Mills, MD\nIf you\'d rather not hear from us, reply "unsubscribe".';

export function ensureCommercialSecurityFooter(body: string): string {
  if (body.includes(COMMERCIAL_SECURITY_FOOTER)) return body;
  return `${body.trimEnd()}\n\n${COMMERCIAL_SECURITY_FOOTER}`;
}

/**
 * Replace legacy pipe STOP footer with soft legal.
 * Returns null if the old footer is not present (caller should skip).
 */
export function rewriteCommercialFooterBody(body: string): string | null {
  if (!body.includes(OLD_COMMERCIAL_SECURITY_FOOTER)) return null;
  let next = body;
  const oldBlock = new RegExp(
    `(?:\\n*---\\n*)?${escapeRegExp(OLD_COMMERCIAL_SECURITY_FOOTER)}`,
    "g"
  );
  next = next.replace(oldBlock, "").trimEnd();
  return ensureCommercialSecurityFooter(next);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
