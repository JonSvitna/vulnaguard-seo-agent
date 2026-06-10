"""
Qualifier Agent — Lead Scoring
Scores each discovered lead 1–10 and filters to score >= min_score.
Uses LLM to assess qualification signals.
"""

import json
from db.database import get_conn, get_config
from lib.llm import get_client

SYSTEM_PROMPT = """You are a B2B lead qualification specialist for Vulnaguard Sentinel — 
a CMMC compliance intelligence platform for small defense contractors.

IDEAL CUSTOMER PROFILE:
- Small DIB subcontractor (< 50 employees)
- Has active DoD contracts or pursuing them
- Needs CMMC Level 1 or Level 2 certification
- NOT a C3PAO, RPO, consultant, or assessor
- Located in the US

Score leads 1–10 based on these criteria:
- Company size signals (< 50 employees = +2)
- Active DoD/defense contract signals (+2)
- CMMC Level 2 sought (+2, highest urgency given Nov 2026 deadline)
- Clear OSC (Organization Seeking Certification) type (+1)
- Has website / contact info (+1)
- Location in defense-heavy states (VA, MD, TX, AL, CA, FL = +1)
- Non-consultant/non-assessor (+1)

Respond ONLY with valid JSON."""


class QualifierAgent:
    def __init__(self):
        self.name = "Qualifier"
        provider = get_config("llm_provider", "claude")
        tier = get_config("llm_tier", "balanced")
        self.llm = get_client(provider=provider, tier=tier)
        self.min_score = int(get_config("qualifier_min_score", "6"))

    def score_lead(self, lead: dict) -> tuple[int, str]:
        """Score a single lead using LLM."""
        user_prompt = f"""
Score this defense contractor lead for Vulnaguard Sentinel:

Company: {lead['company_name']}
Website: {lead['website'] or 'None'}
Location: {lead['location'] or 'Unknown'}
Org Type: {lead['org_type']}
CMMC Level Sought: {lead['cmmc_level_sought']}
Employee Count: {lead['employee_count']}
Contact Email: {lead['contact_email'] or 'None'}

Return JSON:
{{
  "score": <integer 1-10>,
  "reason": "<one sentence explaining the score>",
  "disqualified": <true|false>,
  "disqualify_reason": "<if disqualified, why>"
}}"""

        try:
            result = self.llm.complete_json(SYSTEM_PROMPT, user_prompt, max_tokens=300)
            return result.get("score", 0), result.get("reason", ""), result.get("disqualified", False)
        except Exception as e:
            print(f"[{self.name}] Scoring error for {lead['company_name']}: {e}")
            return 5, "Default score (LLM error)", False

    def run(self) -> dict:
        """Score all unscored discovered leads."""
        print(f"\n[{self.name}] Starting qualification run...")
        conn = get_conn()

        leads = conn.execute(
            "SELECT * FROM leads WHERE status = 'discovered' AND score = 0"
        ).fetchall()

        print(f"[{self.name}] Scoring {len(leads)} leads...")
        qualified = 0
        disqualified = 0

        for lead in leads:
            lead = dict(lead)
            score, reason, is_disqualified = self.score_lead(lead)

            if is_disqualified or score < self.min_score:
                conn.execute(
                    "UPDATE leads SET status = 'disqualified', score = ?, score_reason = ?, updated_at = datetime('now') WHERE id = ?",
                    (score, reason, lead["id"])
                )
                disqualified += 1
            else:
                conn.execute(
                    "UPDATE leads SET status = 'qualified', score = ?, score_reason = ?, updated_at = datetime('now') WHERE id = ?",
                    (score, reason, lead["id"])
                )
                qualified += 1

            print(f"[{self.name}] {lead['company_name']} → score {score}/10 ({'qualified' if score >= self.min_score else 'disqualified'})")

        conn.commit()
        conn.close()

        print(f"[{self.name}] Done: {qualified} qualified, {disqualified} disqualified")
        return {"agent": "qualifier", "qualified": qualified, "disqualified": disqualified}


if __name__ == "__main__":
    from db.database import init_db
    init_db()
    agent = QualifierAgent()
    result = agent.run()
    print(f"\nResult: {result}")
