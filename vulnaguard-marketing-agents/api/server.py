"""
FastAPI backend for the marketing agent dashboard.
Endpoints: pipeline control, approval UI, stats, config.
"""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import json

from db.database import get_conn, get_config, set_config, init_db
from pipeline.orchestrator import Orchestrator
from agents.sender import SenderAgent

app = FastAPI(title="Vulnaguard Marketing Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()


# ─── Models ───────────────────────────────────────────────

class ApproveRequest(BaseModel):
    sequence_ids: list[int]

class ConfigUpdate(BaseModel):
    key: str
    value: str

class ProviderToggle(BaseModel):
    provider: str  # 'claude' | 'openai'
    tier: Optional[str] = "balanced"


# ─── Pipeline ─────────────────────────────────────────────

@app.post("/api/pipeline/run")
async def run_pipeline(background_tasks: BackgroundTasks):
    """Trigger full pipeline run in background."""
    def _run():
        orch = Orchestrator()
        orch.run_full_pipeline()

    background_tasks.add_task(_run)
    return {"status": "started", "message": "Pipeline running in background"}


@app.post("/api/pipeline/send")
async def run_send(background_tasks: BackgroundTasks):
    """Trigger send run for approved sequences."""
    def _send():
        orch = Orchestrator()
        orch.run_send_approved()

    background_tasks.add_task(_send)
    return {"status": "started", "message": "Send run started"}


@app.get("/api/pipeline/stats")
def get_stats():
    """Get current pipeline statistics."""
    orch = Orchestrator()
    return orch.get_pipeline_stats()


# ─── Leads ────────────────────────────────────────────────

@app.get("/api/leads")
def get_leads(status: Optional[str] = None, limit: int = 50):
    conn = get_conn()
    if status:
        rows = conn.execute(
            "SELECT * FROM leads WHERE status = ? ORDER BY score DESC, created_at DESC LIMIT ?",
            (status, limit)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM leads ORDER BY score DESC, created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── Approval ─────────────────────────────────────────────

@app.get("/api/approval/pending")
def get_pending():
    """Get sequences pending approval."""
    sender = SenderAgent()
    batch_size = int(get_config("batch_size", "10"))
    return sender.get_pending_approval_batches(batch_size)


@app.post("/api/approval/approve")
def approve_sequences(req: ApproveRequest):
    """Approve a batch of sequences."""
    sender = SenderAgent()
    count = sender.approve_sequences(req.sequence_ids)
    return {"approved": count}


@app.post("/api/approval/reject")
def reject_sequences(req: ApproveRequest):
    """Reject/discard drafted sequences."""
    conn = get_conn()
    for sid in req.sequence_ids:
        conn.execute(
            "UPDATE sequences SET status = 'rejected' WHERE id = ?", (sid,)
        )
        conn.execute("""
            UPDATE leads SET status = 'disqualified', updated_at = datetime('now')
            WHERE id = (SELECT lead_id FROM sequences WHERE id = ?)
        """, (sid,))
    conn.commit()
    conn.close()
    return {"rejected": len(req.sequence_ids)}


# ─── Config ───────────────────────────────────────────────

@app.get("/api/config")
def get_all_config():
    conn = get_conn()
    rows = conn.execute("SELECT key, value FROM agent_config").fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}


@app.post("/api/config")
def update_config(update: ConfigUpdate):
    set_config(update.key, update.value)
    return {"key": update.key, "value": update.value}


@app.post("/api/config/provider")
def toggle_provider(req: ProviderToggle):
    """Toggle LLM provider for all agents."""
    if req.provider not in ("claude", "openai"):
        raise HTTPException(400, "Provider must be 'claude' or 'openai'")
    set_config("llm_provider", req.provider)
    set_config("llm_tier", req.tier or "balanced")
    return {"provider": req.provider, "tier": req.tier}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
