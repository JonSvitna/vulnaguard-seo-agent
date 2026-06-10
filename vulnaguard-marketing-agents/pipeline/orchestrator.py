"""
Orchestrator Agent — Pipeline Manager
Coordinates all agents in sequence and manages pipeline state.
"""

import json
from datetime import datetime
from db.database import get_conn, get_config, init_db
from agents.scout import ScoutAgent
from agents.qualifier import QualifierAgent
from agents.copywriter import CopywriterAgent
from agents.sender import SenderAgent


class Orchestrator:
    def __init__(self):
        self.name = "Orchestrator"

    def log_run(self, agent: str, status: str, leads_processed: int, details: dict):
        conn = get_conn()
        conn.execute("""
            INSERT INTO pipeline_runs (agent, status, leads_processed, details, finished_at)
            VALUES (?, ?, ?, ?, datetime('now'))
        """, (agent, status, leads_processed, json.dumps(details)))
        conn.commit()
        conn.close()

    def get_pipeline_stats(self) -> dict:
        """Get current pipeline state counts."""
        conn = get_conn()
        stats = {}
        for status in ["discovered", "qualified", "disqualified", "drafted", "approved", "sent", "replied"]:
            row = conn.execute(
                "SELECT COUNT(*) as count FROM leads WHERE status = ?", (status,)
            ).fetchone()
            stats[status] = row["count"]
        stats["total"] = sum(stats.values())

        # Recent runs
        runs = conn.execute(
            "SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 10"
        ).fetchall()
        stats["recent_runs"] = [dict(r) for r in runs]

        conn.close()
        return stats

    def run_full_pipeline(self) -> dict:
        """Run complete pipeline: Scout → Qualify → Write → (await approval) → Send."""
        print(f"\n{'='*50}")
        print(f"[{self.name}] Starting full pipeline run — {datetime.now()}")
        print(f"{'='*50}")

        results = {}

        # Step 1: Scout
        print(f"\n[{self.name}] Step 1/4: Scout")
        try:
            scout = ScoutAgent()
            result = scout.run()
            self.log_run("scout", "success", result["leads_saved"], result)
            results["scout"] = result
        except Exception as e:
            self.log_run("scout", "error", 0, {"error": str(e)})
            results["scout"] = {"error": str(e)}
            print(f"[{self.name}] Scout failed: {e}")

        # Step 2: Qualify
        print(f"\n[{self.name}] Step 2/4: Qualify")
        try:
            qualifier = QualifierAgent()
            result = qualifier.run()
            self.log_run("qualifier", "success", result["qualified"], result)
            results["qualifier"] = result
        except Exception as e:
            self.log_run("qualifier", "error", 0, {"error": str(e)})
            results["qualifier"] = {"error": str(e)}

        # Step 3: Write sequences
        print(f"\n[{self.name}] Step 3/4: Write sequences")
        try:
            copywriter = CopywriterAgent()
            result = copywriter.run()
            self.log_run("copywriter", "success", result["sequences_written"], result)
            results["copywriter"] = result
        except Exception as e:
            self.log_run("copywriter", "error", 0, {"error": str(e)})
            results["copywriter"] = {"error": str(e)}

        # Step 4: Report — await approval
        print(f"\n[{self.name}] Step 4/4: Awaiting approval")
        sender = SenderAgent()
        pending = sender.get_pending_approval_batches()
        results["pending_approval"] = len(pending)
        print(f"[{self.name}] {len(pending)} sequences ready for approval in dashboard")

        # Summary
        print(f"\n{'='*50}")
        print(f"[{self.name}] Pipeline run complete")
        print(f"  Leads found:      {results.get('scout', {}).get('leads_saved', 0)}")
        print(f"  Qualified:        {results.get('qualifier', {}).get('qualified', 0)}")
        print(f"  Sequences drafted:{results.get('copywriter', {}).get('sequences_written', 0)}")
        print(f"  Pending approval: {results.get('pending_approval', 0)}")
        print(f"{'='*50}\n")

        return results

    def run_send_approved(self) -> dict:
        """Run only the sender — for daily scheduled sends after approval."""
        sender = SenderAgent()
        result = sender.run()
        self.log_run("sender", "success", result["sent"], result)
        return result


if __name__ == "__main__":
    init_db()
    orchestrator = Orchestrator()

    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "send":
        result = orchestrator.run_send_approved()
    elif len(sys.argv) > 1 and sys.argv[1] == "stats":
        stats = orchestrator.get_pipeline_stats()
        print(json.dumps(stats, indent=2))
    else:
        result = orchestrator.run_full_pipeline()

    print(json.dumps(result, indent=2))
