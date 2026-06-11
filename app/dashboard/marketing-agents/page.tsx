"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */
import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────
interface Lead {
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
  source: string;
  status: string;
  score: number;
  score_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface PendingEmail {
  touch_number: number;
  subject: string;
  body: string;
}

interface PendingSequence {
  id: number;
  lead_id: number;
  company_name: string;
  location: string | null;
  cmmc_level_sought: string | null;
  score: number;
  contact_name: string | null;
  contact_email: string | null;
  created_at: string;
  emails: PendingEmail[];
  linkedin_message: string;
}

interface PipelineRun {
  id: number;
  agent: string;
  status: string;
  leads_processed: number;
  started_at: string;
}

interface Stats {
  discovered: number;
  qualified: number;
  disqualified: number;
  drafted: number;
  approved: number;
  sent: number;
  replied: number;
  total: number;
  recent_runs: PipelineRun[];
}

const EMPTY_STATS: Stats = {
  discovered: 0, qualified: 0, disqualified: 0,
  drafted: 0, approved: 0, sent: 0, replied: 0, total: 0,
  recent_runs: [],
};

// ─── Helpers ──────────────────────────────────────────────
function scoreColor(score: number) {
  if (score >= 8) return "#4CC98E";
  if (score >= 6) return "#C9A84C";
  return "#C94C4C";
}

function statusColor(status: string) {
  const map: Record<string, string> = {
    discovered: "#4C8EC9", qualified: "#C9A84C", drafted: "#7C6AC4",
    approved: "#4CC98E", sent: "#4CC98E", replied: "#C9A84C",
    disqualified: "#666", rejected: "#666",
  };
  return map[status] || "#666";
}

const TIERS = ["fast", "balanced", "powerful"];
const STATUS_OPTIONS = ["discovered", "qualified", "disqualified", "drafted", "approved", "sent", "replied", "rejected"];

// ─── Small components ──────────────────────────────────────
function StatCard({ label, value, color, sub }: any) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: "#666", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || "#fff", lineHeight: 1, fontFamily: "monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Badge({ label, color }: any) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.05em", padding: "2px 7px", borderRadius: 3, background: `${color}22`, color, border: `1px solid ${color}44` }}>
      {label.toUpperCase()}
    </span>
  );
}

function EmailTouch({ email, idx }: any) {
  const [open, setOpen] = useState(idx === 0);
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6, overflow: "hidden", marginBottom: 6 }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: "100%", background: open ? "rgba(201,168,76,0.08)" : "rgba(255,255,255,0.02)", border: "none", padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 10, fontFamily: "monospace", color: "#C9A84C", background: "rgba(201,168,76,0.15)", padding: "1px 6px", borderRadius: 3 }}>
            Touch {email.touch_number}
          </span>
          <span style={{ fontSize: 12, color: "#ccc" }}>{email.subject}</span>
        </div>
        <span style={{ color: "#555", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "10px 12px", background: "rgba(0,0,0,0.2)" }}>
          <pre style={{ fontSize: 12, color: "#aaa", whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.7, fontFamily: "inherit" }}>{email.body}</pre>
        </div>
      )}
    </div>
  );
}

function SequenceCard({ seq, selected, onToggle, onApprove, onReject }: any) {
  const [expanded, setExpanded] = useState(true);
  const hasEmail = !!seq.contact_email;

  return (
    <div style={{
      border: `1px solid ${selected ? "rgba(201,168,76,0.4)" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 10, overflow: "hidden", marginBottom: 12,
      background: selected ? "rgba(201,168,76,0.04)" : "rgba(255,255,255,0.02)",
      transition: "all 0.15s",
    }}>
      {/* Header */}
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <input type="checkbox" checked={selected} onChange={onToggle}
          style={{ width: 16, height: 16, accentColor: "#C9A84C", cursor: "pointer", flexShrink: 0 }} />

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{seq.company_name}</span>
            {seq.cmmc_level_sought && <Badge label={seq.cmmc_level_sought} color="#4C8EC9" />}
            <span style={{ fontSize: 11, color: "#555" }}>{seq.location}</span>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: scoreColor(seq.score), fontFamily: "monospace" }}>
              Score {seq.score}/10
            </span>
            {seq.contact_name && <span style={{ fontSize: 11, color: "#666" }}>{seq.contact_name}</span>}
            {hasEmail
              ? <span style={{ fontSize: 11, color: "#4CC98E" }}>✓ {seq.contact_email}</span>
              : <span style={{ fontSize: 11, color: "#C94C4C" }}>⚠ No email — LinkedIn only</span>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={() => setExpanded(e => !e)}
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, padding: "5px 10px", color: "#888", fontSize: 11, cursor: "pointer" }}>
            {expanded ? "Collapse" : "Review"}
          </button>
          <button onClick={() => onReject(seq.id)}
            style={{ background: "rgba(201,76,76,0.1)", border: "1px solid rgba(201,76,76,0.3)", borderRadius: 5, padding: "5px 10px", color: "#C94C4C", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
            Reject
          </button>
          <button onClick={() => onApprove(seq.id)}
            style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)", border: "none", borderRadius: 5, padding: "5px 12px", color: "#0D0F14", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>
            Approve
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "14px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Emails */}
            <div>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                Email Sequence ({seq.emails.length} touches)
              </div>
              {seq.emails.map((e: any, i: number) => <EmailTouch key={i} email={e} idx={i} />)}
            </div>

            {/* LinkedIn */}
            <div>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                LinkedIn Connection Request
              </div>
              <div style={{ background: "rgba(76,142,201,0.06)", border: "1px solid rgba(76,142,201,0.2)", borderRadius: 6, padding: "10px 12px" }}>
                <p style={{ fontSize: 12, color: "#aaa", margin: 0, lineHeight: 1.7 }}>
                  {seq.linkedin_message || "No LinkedIn message drafted."}
                </p>
                <div style={{ marginTop: 8, fontSize: 10, color: "#4C8EC9" }}>
                  {seq.linkedin_message?.length || 0} / 300 chars
                </div>
              </div>

              {/* Score breakdown */}
              <div style={{ marginTop: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: "#555", marginBottom: 6, letterSpacing: "0.05em", textTransform: "uppercase" }}>Lead score</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                    <div style={{ width: `${seq.score * 10}%`, height: "100%", borderRadius: 3, background: scoreColor(seq.score), transition: "width 0.4s" }} />
                  </div>
                  <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: scoreColor(seq.score) }}>{seq.score}/10</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Modal shell ────────────────────────────────────────────
function Modal({ title, onClose, children, width = 520 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
      <div style={{ background: "#15171F", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, width: "100%", maxWidth: width, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, width: 26, height: 26, color: "#888", cursor: "pointer", fontSize: 14 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const fieldStyle: React.CSSProperties = { width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "7px 10px", color: "#ccc", fontSize: 12, outline: "none", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { fontSize: 10, color: "#666", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em", display: "block" };

// ─── Lead modal (add / edit) ───────────────────────────────
function LeadModal({ lead, onClose, onSave }: { lead: Lead | null; onClose: () => void; onSave: (payload: Partial<Lead>) => Promise<void> }) {
  const [form, setForm] = useState<Partial<Lead>>(lead ?? {
    company_name: "", website: "", location: "", org_type: "", cmmc_level_sought: "",
    employee_count: "", contact_name: "", contact_title: "", contact_email: "", contact_linkedin: "",
    status: "discovered", score: 0,
  });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof Lead) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = k === "score" ? Number(e.target.value) : e.target.value;
    setForm(f => ({ ...f, [k]: value }));
  };

  const handleSave = async () => {
    if (!form.company_name?.trim()) return;
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  const FIELDS: { key: keyof Lead; label: string; placeholder?: string }[] = [
    { key: "company_name", label: "Company Name *" },
    { key: "website", label: "Website" },
    { key: "location", label: "Location" },
    { key: "org_type", label: "Org Type" },
    { key: "cmmc_level_sought", label: "CMMC Level Sought" },
    { key: "employee_count", label: "Employee Count" },
    { key: "contact_name", label: "Contact Name" },
    { key: "contact_title", label: "Contact Title" },
    { key: "contact_email", label: "Contact Email" },
    { key: "contact_linkedin", label: "Contact LinkedIn" },
  ];

  return (
    <Modal title={lead ? "Edit Lead" : "Add Lead"} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {FIELDS.map(f => (
          <div key={f.key} style={f.key === "company_name" ? { gridColumn: "1 / -1" } : undefined}>
            <label style={labelStyle}>{f.label}</label>
            <input style={fieldStyle} value={(form[f.key] as string) ?? ""} onChange={set(f.key)} />
          </div>
        ))}
        <div>
          <label style={labelStyle}>Status</label>
          <select style={fieldStyle} value={form.status ?? "discovered"} onChange={set("status")}>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Score (0-10)</label>
          <input type="number" min={0} max={10} style={fieldStyle} value={form.score ?? 0} onChange={set("score")} />
        </div>
      </div>

      <button onClick={handleSave} disabled={saving || !form.company_name?.trim()}
        style={{ marginTop: 16, width: "100%", padding: "10px", background: saving ? "rgba(201,168,76,0.3)" : "linear-gradient(135deg, #C9A84C, #8B6914)", border: "none", borderRadius: 8, color: "#0D0F14", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
        {saving ? "Saving..." : lead ? "Save Changes" : "Add Lead"}
      </button>
    </Modal>
  );
}

// ─── Sequence editor modal ─────────────────────────────────
function SequenceEditorModal({ leadId, companyName, onClose, onSave }: { leadId: number; companyName: string; onClose: () => void; onSave: () => Promise<void> }) {
  const [emails, setEmails] = useState<PendingEmail[]>([
    { touch_number: 1, subject: "", body: "" },
    { touch_number: 2, subject: "", body: "" },
    { touch_number: 3, subject: "", body: "" },
  ]);
  const [linkedinMessage, setLinkedinMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/marketing/leads/${leadId}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.emails?.length) {
          const byTouch: Record<number, PendingEmail> = {};
          for (const e of data.emails) byTouch[e.touch_number] = { touch_number: e.touch_number, subject: e.subject ?? "", body: e.body ?? "" };
          setEmails([1, 2, 3].map(n => byTouch[n] ?? { touch_number: n, subject: "", body: "" }));
        }
        if (data.linkedin_message?.message) setLinkedinMessage(data.linkedin_message.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [leadId]);

  const updateEmail = (idx: number, field: "subject" | "body", value: string) => {
    setEmails(es => es.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/marketing/leads/${leadId}/sequence`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails, linkedin_message: linkedinMessage }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Sequence — ${companyName}`} onClose={onClose} width={640}>
      {loading ? (
        <div style={{ padding: "30px 0", textAlign: "center", color: "#555", fontSize: 12 }}>Loading...</div>
      ) : (
        <>
          {emails.map((e, i) => (
            <div key={i} style={{ marginBottom: 14, padding: "12px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#C9A84C", marginBottom: 8 }}>Email {i + 1}</div>
              <label style={labelStyle}>Subject</label>
              <input style={{ ...fieldStyle, marginBottom: 8 }} value={e.subject} onChange={ev => updateEmail(i, "subject", ev.target.value)} />
              <label style={labelStyle}>Body</label>
              <textarea style={{ ...fieldStyle, minHeight: 100, fontFamily: "inherit", resize: "vertical" }} value={e.body} onChange={ev => updateEmail(i, "body", ev.target.value)} />
            </div>
          ))}

          <div style={{ marginBottom: 6 }}>
            <label style={labelStyle}>LinkedIn Connection Message</label>
            <textarea style={{ ...fieldStyle, minHeight: 80, fontFamily: "inherit", resize: "vertical" }} value={linkedinMessage} onChange={e => setLinkedinMessage(e.target.value)} />
          </div>

          <button onClick={handleSave} disabled={saving}
            style={{ marginTop: 10, width: "100%", padding: "10px", background: saving ? "rgba(201,168,76,0.3)" : "linear-gradient(135deg, #C9A84C, #8B6914)", border: "none", borderRadius: 8, color: "#0D0F14", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Saving..." : "Save Sequence"}
          </button>
        </>
      )}
    </Modal>
  );
}

// ─── Main Dashboard ───────────────────────────────────────
export default function MarketingAgentDashboard() {
  const [tab, setTab] = useState("approval");
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [pending, setPending] = useState<PendingSequence[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<{ msg: string; color: string } | null>(null);
  const [provider, setProvider] = useState("claude");
  const [tier, setTier] = useState("balanced");
  const [leadFilter, setLeadFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  // Settings tab state
  const [settings, setSettings] = useState({
    qualifier_min_score: "6", daily_send_limit: "50", batch_size: "10",
    smtp_host: "", smtp_from: "",
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Modal state
  const [leadModal, setLeadModal] = useState<{ mode: "add" | "edit"; lead: Lead | null } | null>(null);
  const [sequenceModal, setSequenceModal] = useState<{ leadId: number; companyName: string } | null>(null);

  const showToast = (msg: string, color: string = "#4CC98E") => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/marketing/stats");
    if (res.ok) setStats(await res.json());
  }, []);

  const fetchLeads = useCallback(async () => {
    const res = await fetch("/api/marketing/leads");
    if (res.ok) setLeads((await res.json()).leads);
  }, []);

  const fetchPending = useCallback(async () => {
    const res = await fetch("/api/marketing/approval/pending");
    if (res.ok) setPending((await res.json()).pending);
  }, []);

  const fetchConfig = useCallback(async () => {
    const res = await fetch("/api/marketing/config");
    if (!res.ok) return;
    const { config } = await res.json();
    if (config.llm_provider) setProvider(config.llm_provider);
    if (config.llm_tier) setTier(config.llm_tier);
    setSettings(s => ({
      qualifier_min_score: config.qualifier_min_score ?? s.qualifier_min_score,
      daily_send_limit: config.daily_send_limit ?? s.daily_send_limit,
      batch_size: config.batch_size ?? s.batch_size,
      smtp_host: config.smtp_host ?? s.smtp_host,
      smtp_from: config.smtp_from ?? s.smtp_from,
    }));
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchStats(), fetchLeads(), fetchPending()]);
  }, [fetchStats, fetchLeads, fetchPending]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchStats(), fetchLeads(), fetchPending(), fetchConfig()]);
      setLoading(false);
    })();
  }, [fetchStats, fetchLeads, fetchPending, fetchConfig]);

  const toggleProvider = async (p: string) => {
    setProvider(p);
    await fetch("/api/marketing/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ llm_provider: p, llm_tier: tier }),
    });
    showToast(`Switched to ${p === "claude" ? "Claude" : "OpenAI"}`, p === "claude" ? "#C9A84C" : "#74aa9c");
  };

  const changeTier = async (t: string) => {
    setTier(t);
    await fetch("/api/marketing/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ llm_provider: provider, llm_tier: t }),
    });
  };

  const approveOne = async (id: number) => {
    setPending(p => p.filter(s => s.id !== id));
    setSelected(s => { const n = new Set(s); n.delete(id); return n; });
    await fetch("/api/marketing/approval/approve", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequence_ids: [id] }),
    });
    showToast("Sequence approved — ready to send");
    await refreshAll();
  };

  const rejectOne = async (id: number) => {
    setPending(p => p.filter(s => s.id !== id));
    setSelected(s => { const n = new Set(s); n.delete(id); return n; });
    await fetch("/api/marketing/approval/reject", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequence_ids: [id] }),
    });
    showToast("Sequence rejected", "#C94C4C");
    await refreshAll();
  };

  const approveSelected = async () => {
    const ids = [...selected];
    setPending(p => p.filter(s => !ids.includes(s.id)));
    setSelected(new Set());
    await fetch("/api/marketing/approval/approve", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequence_ids: ids }),
    });
    showToast(`${ids.length} sequences approved`);
    await refreshAll();
  };

  const selectAll = () => {
    if (selected.size === pending.length) setSelected(new Set());
    else setSelected(new Set(pending.map(s => s.id)));
  };

  // ── Lead CRUD ──
  const saveLead = async (payload: Partial<Lead>) => {
    if (leadModal?.mode === "edit" && leadModal.lead) {
      const res = await fetch(`/api/marketing/leads/${leadModal.lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { showToast((await res.json()).error ?? "Failed to update lead", "#C94C4C"); return; }
      showToast("Lead updated");
    } else {
      const res = await fetch("/api/marketing/leads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { showToast((await res.json()).error ?? "Failed to add lead", "#C94C4C"); return; }
      showToast("Lead added");
    }
    setLeadModal(null);
    await refreshAll();
  };

  const deleteLead = async (lead: Lead) => {
    if (!confirm(`Delete ${lead.company_name}? This removes its sequence and emails too.`)) return;
    await fetch(`/api/marketing/leads/${lead.id}`, { method: "DELETE" });
    showToast("Lead deleted", "#C94C4C");
    await refreshAll();
  };

  const markSent = async (lead: Lead) => {
    const res = await fetch(`/api/marketing/leads/${lead.id}`);
    const data = await res.json();
    const seqId = data.sequence?.id;
    if (!seqId) { showToast("No sequence found for this lead", "#C94C4C"); return; }
    await fetch(`/api/marketing/sequences/${seqId}/mark-sent`, { method: "POST" });
    showToast("Marked as sent");
    await refreshAll();
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await fetch("/api/marketing/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      showToast("Settings saved");
    } finally {
      setSavingSettings(false);
    }
  };

  const TABS = [
    { id: "approval", label: "Approval Queue", count: pending.length },
    { id: "pipeline", label: "Pipeline", count: null },
    { id: "leads", label: "Leads", count: stats.total },
    { id: "settings", label: "Settings", count: null },
  ];

  const filteredLeads = leadFilter === "all" ? leads : leads.filter(l => l.status === leadFilter);

  return (
    <div style={{ background: "#0D0F14", minHeight: "100vh", fontFamily: "'Inter', -apple-system, sans-serif", color: "#fff" }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 999, background: "#1a1d24", border: `1px solid ${toast.color}44`, borderRadius: 8, padding: "10px 16px", fontSize: 13, color: toast.color, boxShadow: `0 4px 20px rgba(0,0,0,0.4)`, transition: "all 0.3s" }}>
          {toast.msg}
        </div>
      )}

      {/* Modals */}
      {leadModal && (
        <LeadModal lead={leadModal.lead} onClose={() => setLeadModal(null)} onSave={saveLead} />
      )}
      {sequenceModal && (
        <SequenceEditorModal
          leadId={sequenceModal.leadId}
          companyName={sequenceModal.companyName}
          onClose={() => setSequenceModal(null)}
          onSave={async () => { setSequenceModal(null); showToast("Sequence saved — added to Approval Queue"); await refreshAll(); }}
        />
      )}

      {/* Header */}
      <header style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.3)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, background: "linear-gradient(135deg, #C9A84C, #8B6914)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#0D0F14" }}>V</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.03em" }}>VULNAGUARD</div>
            <div style={{ fontSize: 10, color: "#C9A84C", letterSpacing: "0.15em", textTransform: "uppercase" }}>Marketing Agent Team</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* LLM Provider Toggle */}
          <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, overflow: "hidden" }}>
            {["claude", "openai"].map(p => (
              <button key={p} onClick={() => toggleProvider(p)}
                style={{ padding: "5px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none", background: provider === p ? (p === "claude" ? "#C9A84C" : "#74aa9c") : "transparent", color: provider === p ? "#0D0F14" : "#666", transition: "all 0.15s" }}>
                {p === "claude" ? "Claude" : "OpenAI"}
              </button>
            ))}
          </div>

          <select value={tier} onChange={e => changeTier(e.target.value)}
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "5px 10px", color: "#aaa", fontSize: 11, outline: "none", cursor: "pointer" }}>
            {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4CC98E", boxShadow: `0 0 6px #4CC98E` }} title="Manual mode" />
        </div>
      </header>

      {/* Stats bar */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 }}>
        {[
          { label: "Discovered", value: stats.discovered, color: "#4C8EC9" },
          { label: "Qualified", value: stats.qualified, color: "#C9A84C" },
          { label: "Drafted", value: stats.drafted, color: "#7C6AC4" },
          { label: "Approved", value: stats.approved, color: "#4CC98E" },
          { label: "Sent", value: stats.sent, color: "#4CC98E" },
          { label: "Replied", value: stats.replied, color: "#C9A84C" },
          { label: "Disqualified", value: stats.disqualified, color: "#555" },
        ].map(s => <StatCard key={s.label} {...s} />)}
      </div>

      {/* Tabs */}
      <div style={{ padding: "0 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: "12px 16px", background: "none", border: "none", borderBottom: `2px solid ${tab === t.id ? "#C9A84C" : "transparent"}`, color: tab === t.id ? "#C9A84C" : "#666", fontSize: 13, fontWeight: tab === t.id ? 600 : 400, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s" }}>
            {t.label}
            {t.count != null && (
              <span style={{ fontSize: 10, fontFamily: "monospace", background: tab === t.id ? "rgba(201,168,76,0.2)" : "rgba(255,255,255,0.07)", color: tab === t.id ? "#C9A84C" : "#555", padding: "1px 6px", borderRadius: 10 }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "24px", maxWidth: 1100, margin: "0 auto" }}>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#444", fontSize: 13 }}>Loading...</div>
        ) : (
        <>
        {/* ── Approval Queue ── */}
        {tab === "approval" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Approval Queue</h2>
                <p style={{ fontSize: 12, color: "#666", margin: 0 }}>Review each sequence before it sends. Approve individually or in bulk.</p>
              </div>
              {pending.length > 0 && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={selectAll} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "6px 12px", color: "#888", fontSize: 12, cursor: "pointer" }}>
                    {selected.size === pending.length ? "Deselect all" : "Select all"}
                  </button>
                  {selected.size > 0 && (
                    <button onClick={approveSelected} style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)", border: "none", borderRadius: 6, padding: "6px 14px", color: "#0D0F14", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      Approve {selected.size} selected
                    </button>
                  )}
                </div>
              )}
            </div>

            {pending.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#444" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
                <div style={{ fontSize: 14 }}>All sequences reviewed</div>
                <div style={{ fontSize: 12, marginTop: 6, color: "#333" }}>Write a sequence for a lead to send it here for approval</div>
              </div>
            ) : (
              pending.map(seq => (
                <SequenceCard key={seq.id} seq={seq}
                  selected={selected.has(seq.id)}
                  onToggle={() => setSelected(s => { const n = new Set(s); n.has(seq.id) ? n.delete(seq.id) : n.add(seq.id); return n; })}
                  onApprove={approveOne}
                  onReject={rejectOne}
                />
              ))
            )}
          </div>
        )}

        {/* ── Pipeline ── */}
        {tab === "pipeline" && (
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Pipeline Control</h2>
            <p style={{ fontSize: 12, color: "#666", marginBottom: 20 }}>Automated agent runs. Use manual lead entry and the sequence editor for now.</p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              {[
                { label: "Full Pipeline", desc: "Scout → Qualify → Write → Await approval", color: "#C9A84C" },
                { label: "Send Approved", desc: "Dispatch all approved sequences via SMTP", color: "#4CC98E" },
              ].map(a => (
                <div key={a.label} title="Automation ships in a future update — use manual lead entry for now"
                  style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${a.color}33`, borderRadius: 10, padding: "18px", textAlign: "left", cursor: "not-allowed", opacity: 0.5, position: "relative" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: a.color }}>{a.label}</div>
                    <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.05em", padding: "2px 6px", borderRadius: 3, background: "rgba(255,255,255,0.07)", color: "#888", border: "1px solid rgba(255,255,255,0.1)" }}>
                      COMING SOON
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#666" }}>{a.desc}</div>
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontSize: 11, color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Recent Runs</div>
              {stats.recent_runs.length === 0 ? (
                <div style={{ fontSize: 12, color: "#444", padding: "10px 14px" }}>No runs yet</div>
              ) : (
                stats.recent_runs.map(run => (
                  <div key={run.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 7, marginBottom: 6 }}>
                    <Badge label={run.agent} color="#4C8EC9" />
                    <Badge label={run.status} color={run.status === "success" ? "#4CC98E" : "#C94C4C"} />
                    <span style={{ fontSize: 12, color: "#666" }}>{run.leads_processed} leads</span>
                    <span style={{ fontSize: 11, color: "#444", marginLeft: "auto" }}>{run.started_at}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── Leads ── */}
        {tab === "leads" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Lead Pipeline</h2>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 6 }}>
                  {["all", ...STATUS_OPTIONS].map(s => (
                    <button key={s} onClick={() => setLeadFilter(s)}
                      style={{ padding: "4px 10px", fontSize: 11, border: `1px solid ${leadFilter === s ? "rgba(201,168,76,0.5)" : "rgba(255,255,255,0.1)"}`, borderRadius: 5, background: leadFilter === s ? "rgba(201,168,76,0.1)" : "transparent", color: leadFilter === s ? "#C9A84C" : "#666", cursor: "pointer", textTransform: "capitalize" }}>
                      {s}
                    </button>
                  ))}
                </div>
                <button onClick={() => setLeadModal({ mode: "add", lead: null })}
                  style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)", border: "none", borderRadius: 6, padding: "6px 14px", color: "#0D0F14", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                  + Add Lead
                </button>
              </div>
            </div>

            {filteredLeads.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#444", fontSize: 13 }}>No leads yet. Click "+ Add Lead" to get started.</div>
            ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["Company", "Status", "Score", "CMMC Level", "Location", "Email", "Actions"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "#555", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.08)", fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map(lead => (
                    <tr key={lead.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "10px 12px", color: "#ddd", fontWeight: 600 }}>{lead.company_name}</td>
                      <td style={{ padding: "10px 12px" }}><Badge label={lead.status} color={statusColor(lead.status)} /></td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", color: scoreColor(lead.score), fontWeight: 700 }}>{lead.score}/10</td>
                      <td style={{ padding: "10px 12px", color: "#888" }}>{lead.cmmc_level_sought || "—"}</td>
                      <td style={{ padding: "10px 12px", color: "#666" }}>{lead.location || "—"}</td>
                      <td style={{ padding: "10px 12px", color: lead.contact_email ? "#4CC98E" : "#444", fontSize: 11 }}>
                        {lead.contact_email || "—"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button onClick={() => setLeadModal({ mode: "edit", lead })}
                            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, padding: "4px 8px", color: "#888", fontSize: 11, cursor: "pointer" }}>
                            Edit
                          </button>
                          <button onClick={() => setSequenceModal({ leadId: lead.id, companyName: lead.company_name })}
                            style={{ background: "rgba(124,106,196,0.1)", border: "1px solid rgba(124,106,196,0.3)", borderRadius: 5, padding: "4px 8px", color: "#7C6AC4", fontSize: 11, cursor: "pointer" }}>
                            Sequence
                          </button>
                          {lead.status === "approved" && (
                            <button onClick={() => markSent(lead)}
                              style={{ background: "rgba(76,201,142,0.1)", border: "1px solid rgba(76,201,142,0.3)", borderRadius: 5, padding: "4px 8px", color: "#4CC98E", fontSize: 11, cursor: "pointer" }}>
                              Mark Sent
                            </button>
                          )}
                          <button onClick={() => deleteLead(lead)}
                            style={{ background: "rgba(201,76,76,0.1)", border: "1px solid rgba(201,76,76,0.3)", borderRadius: 5, padding: "4px 8px", color: "#C94C4C", fontSize: 11, cursor: "pointer" }}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </div>
        )}

        {/* ── Settings ── */}
        {tab === "settings" && (
          <div style={{ maxWidth: 560 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Agent Configuration</h2>
            <p style={{ fontSize: 12, color: "#666", marginBottom: 20 }}>Configure pipeline behavior, sending limits, and API connections.</p>

            <div style={{ marginBottom: 14, padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>LLM Provider / Tier</div>
              <div style={{ fontSize: 13, color: "#C9A84C", fontFamily: "monospace" }}>{provider} / {tier}</div>
            </div>

            {[
              { label: "Min Qualification Score", key: "qualifier_min_score" as const, placeholder: "6" },
              { label: "Daily Send Limit", key: "daily_send_limit" as const, placeholder: "50" },
              { label: "Approval Batch Size", key: "batch_size" as const, placeholder: "10" },
              { label: "SMTP Host", key: "smtp_host" as const, placeholder: "smtp.yourdomain.com" },
              { label: "Sender Email", key: "smtp_from" as const, placeholder: "outreach@vulnaguard.com" },
            ].map(setting => (
              <div key={setting.key} style={{ marginBottom: 14, padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{setting.label}</div>
                <input
                  placeholder={setting.placeholder}
                  value={settings[setting.key]}
                  onChange={e => setSettings(s => ({ ...s, [setting.key]: e.target.value }))}
                  style={fieldStyle}
                />
              </div>
            ))}

            <button onClick={saveSettings} disabled={savingSettings}
              style={{ marginTop: 8, width: "100%", padding: "10px", background: savingSettings ? "rgba(201,168,76,0.3)" : "linear-gradient(135deg, #C9A84C, #8B6914)", border: "none", borderRadius: 8, color: "#0D0F14", fontSize: 13, fontWeight: 700, cursor: savingSettings ? "not-allowed" : "pointer" }}>
              {savingSettings ? "Saving..." : "Save Settings"}
            </button>

            <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>API Keys — set in .env file</div>
              {["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "APIFY_API_KEY", "SMTP_PASSWORD"].map(k => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: "#666" }}>{k}</span>
                  <span style={{ fontSize: 11, color: "#666" }}>—</span>
                </div>
              ))}
            </div>
          </div>
        )}
        </>
        )}
      </div>

      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        select option { background: #1a1d24; }
      `}</style>
    </div>
  );
}
