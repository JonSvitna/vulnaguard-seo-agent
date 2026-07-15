import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  OLD_COMMERCIAL_SECURITY_FOOTER,
  COMMERCIAL_SECURITY_FOOTER,
  ensureCommercialSecurityFooter,
  rewriteCommercialFooterBody,
} from "./commercial-footer.ts";

describe("ensureCommercialSecurityFooter", () => {
  it("appends soft footer when missing", () => {
    const out = ensureCommercialSecurityFooter("Hi\n\nSean\nVulnaguard LLC");
    assert.ok(out.includes(COMMERCIAL_SECURITY_FOOTER));
    assert.ok(!out.includes(OLD_COMMERCIAL_SECURITY_FOOTER));
  });

  it("is idempotent when soft footer already present", () => {
    const once = ensureCommercialSecurityFooter("Body\n\nSean\nVulnaguard LLC");
    const twice = ensureCommercialSecurityFooter(once);
    assert.equal(once, twice);
  });
});

describe("rewriteCommercialFooterBody", () => {
  it("strips old pipe footer and installs soft footer", () => {
    const body = `Hello\n\nSean\nVulnaguard LLC\n\n---\n${OLD_COMMERCIAL_SECURITY_FOOTER}`;
    const out = rewriteCommercialFooterBody(body);
    assert.ok(!out.includes(OLD_COMMERCIAL_SECURITY_FOOTER));
    assert.ok(out.includes(COMMERCIAL_SECURITY_FOOTER));
    assert.ok(out.includes("Hello"));
  });

  it("returns null when body has no old footer to rewrite", () => {
    assert.equal(rewriteCommercialFooterBody("Hello\n\nSean\nVulnaguard LLC"), null);
  });
});
