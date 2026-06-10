"""
Copywriter Agent — Personalized Outreach
Writes 3-touch email sequences + LinkedIn connection message per lead.
Uses Alex Hormozi direct-response framework.
"""

from db.database import get_conn, get_config
from lib.llm import get_client

SYSTEM_PROMPT = """You are a direct-response copywriter for Vulnaguard Sentinel — 
a CMMC compliance intelligence platform for small defense contractors.

PRODUCT: Vulnaguard Sentinel
- Continuous CMMC compliance monitoring (not point-in-time)
- Automated evidence collection for C3PAO assessments  
- Web application vulnerability scanning mapped to CMMC controls
- Built for small DIB subcontractors (< 50 employees)
- Free security health check at vulnaguard.com/security-health-check

URGENCY: CMMC Level 2 enforcement deadline is November 2026. 
Companies without certification risk losing DoD contracts.

FRAMEWORK (Alex Hormozi direct-response):
- Lead with the specific painful problem they have RIGHT NOW
- Quantify the cost of inaction (lost contracts, failed audits)
- Present Sentinel as the obvious solution
- Single clear CTA per email
- No fluff, no corporate speak, short sentences

TONE: Direct, credible, peer-to-peer (not salesy). 
Write like a fellow defense industry professional, not a vendor.

Respond ONLY with valid JSON."""


class CopywriterAgent:
    def __init__(self):
        self.name = "Copywriter"
        provider = get_config("llm_provider", "claude")
        tier = get_config("llm_tier", "balanced")
        self.llm = get_client(provider=provider, tier=tier)

    def write_sequence(self, lead: dict) -> dict:
        """Write full 3-touch email sequence + LinkedIn message for a lead."""
        user_prompt = f"""
Write a 3-touch cold outreach sequence for this lead:

Company: {lead['company_name']}
Location: {lead['location']}
CMMC Level Sought: {lead['cmmc_level_sought']}
Contact Name: {lead['contact_name'] or 'there'}
Contact Title: {lead['contact_title'] or 'decision maker'}

Return this exact JSON structure:
{{
  "email_1": {{
    "subject": "<subject line — specific, curiosity-driven, < 8 words>",
    "body": "<cold intro email — 100-150 words. Problem → cost of inaction → Sentinel → single CTA to free health check>"
  }},
  "email_2": {{
    "subject": "<follow-up subject — reference email 1, < 8 words>",
    "body": "<follow-up — 80-100 words. Acknowledge no reply, add proof point or stat about CMMC failures, softer CTA>"
  }},
  "email_3": {{
    "subject": "<breakup subject — final touch>",
    "body": "<breakup email — 50-70 words. Acknowledge this is last reach out, leave door open, no hard sell>"
  }},
  "linkedin_message": "<connection request message — 200-300 chars, personalized, no pitch yet>"
}}"""

        try:
            return self.llm.complete_json(SYSTEM_PROMPT, user_prompt, max_tokens=1500)
        except Exception as e:
            print(f"[{self.name}] Writing error for {lead['company_name']}: {e}")
            return None

    def save_sequence(self, lead: dict, copy: dict) -> int:
        """Save drafted sequence to database."""
        conn = get_conn()

        # Create sequence record
        cursor = conn.execute(
            "INSERT INTO sequences (lead_id, status) VALUES (?, 'drafted')",
            (lead["id"],)
        )
        sequence_id = cursor.lastrowid

        delay_days = get_config("sequence_delay_days", "4,9").split(",")
        delays = [0] + [int(d) for d in delay_days]

        # Save 3 emails
        for i, (key, delay) in enumerate(zip(["email_1", "email_2", "email_3"], delays), 1):
            email = copy.get(key, {})
            scheduled = f"datetime('now', '+{delay} days')" if delay > 0 else "datetime('now')"
            conn.execute(f"""
                INSERT INTO emails (sequence_id, lead_id, touch_number, subject, body, channel, status, scheduled_at)
                VALUES (?, ?, ?, ?, ?, 'email', 'drafted', {scheduled})
            """, (sequence_id, lead["id"], i, email.get("subject", ""), email.get("body", "")))

        # Save LinkedIn message
        if copy.get("linkedin_message"):
            conn.execute("""
                INSERT INTO linkedin_messages (sequence_id, lead_id, message, status)
                VALUES (?, ?, ?, 'drafted')
            """, (sequence_id, lead["id"], copy["linkedin_message"]))

        # Update lead status
        conn.execute(
            "UPDATE leads SET status = 'drafted', updated_at = datetime('now') WHERE id = ?",
            (lead["id"],)
        )

        conn.commit()
        conn.close()
        return sequence_id

    def run(self) -> dict:
        """Write sequences for all qualified leads."""
        print(f"\n[{self.name}] Starting copywriting run...")
        conn = get_conn()
        leads = conn.execute(
            "SELECT * FROM leads WHERE status = 'qualified'"
        ).fetchall()
        conn.close()

        print(f"[{self.name}] Writing sequences for {len(leads)} leads...")
        written = 0
        failed = 0

        for lead in leads:
            lead = dict(lead)
            print(f"[{self.name}] Writing for {lead['company_name']}...")
            copy = self.write_sequence(lead)
            if copy:
                self.save_sequence(lead, copy)
                written += 1
            else:
                failed += 1

        print(f"[{self.name}] Done: {written} sequences written, {failed} failed")
        return {"agent": "copywriter", "sequences_written": written, "failed": failed}


if __name__ == "__main__":
    from db.database import init_db
    init_db()
    agent = CopywriterAgent()
    result = agent.run()
    print(f"\nResult: {result}")
