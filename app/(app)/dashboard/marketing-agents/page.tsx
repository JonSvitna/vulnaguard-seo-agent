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
  persona_slug: string | null;
  outreach_intent: string | null;
  category: string;
  skill_slugs: string[];
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

interface QueueEmail {
  id: number;
  sequence_id: number;
  lead_id: number;
  touch_number: number;
  subject: string | null;
  body: string | null;
  scheduled_at: string | null;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_linkedin: string | null;
  linkedin_message: string | null;
}

interface PipelineRun {
  id: number;
  agent: string;
  status: string;
  leads_processed: number;
  started_at: string;
}

interface AgentRun {
  id: number;
  agent_name: string;
  status: "success" | "error";
  input: unknown;
  output: unknown;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

interface PromptRun {
  id: number;
  agent_name: string;
  provider: string;
  model: string;
  system_prompt: string | null;
  user_prompt: string | null;
  response: string | null;
  status: "success" | "error";
  error: string | null;
  duration_ms: number | null;
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

function daysUntil(dateStr: string | null) {
  if (!dateStr) return null;
  const diffMs = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

const TIERS = ["fast", "balanced", "powerful"];
const STATUS_OPTIONS = ["discovered", "qualified", "disqualified", "drafted", "approved", "sent", "replied", "rejected"];
const CATEGORY_OPTIONS = ["sales", "partnership", "relationship_building", "referral"];
const CATEGORY_LABELS: Record<string, string> = {
  sales: "Sales", partnership: "Partnership", relationship_building: "Relationship Building", referral: "Referral",
};

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

// ─── Draft / persona picker modal ─────────────────────────
function DraftModal({ lead, onClose, onDraft }: {
  lead: { id: number; company_name: string; persona_slug: string | null; outreach_intent: string | null; status: string; skill_slugs: string[] };
  onClose: () => void;
  onDraft: (personaSlug: string | null, outreachIntent: string | null, skillSlugs: string[]) => Promise<void>;
}) {
  const [allSkills, setAllSkills] = useState<{ slug: string; name: string; skill_type: string }[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<string>(lead.persona_slug ?? "");
  const [selectedSkills, setSelectedSkills] = useState<string[]>(lead.skill_slugs ?? []);
  const [intent, setIntent] = useState<string>(lead.outreach_intent ?? "");
  const [drafting, setDrafting] = useState(false);

  useEffect(() => {
    fetch("/api/marketing/personas").then(r => r.json()).then(d => setAllSkills(d.personas ?? [])).catch(() => {});
  }, []);

  const outreachPersonas = allSkills.filter(s => s.skill_type === "persona");
  const voiceSkills = allSkills.filter(s => s.skill_type === "voice");

  const toggleSkill = (slug: string) =>
    setSelectedSkills(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);

  const handleDraft = async () => {
    setDrafting(true);
    try { await onDraft(selectedPersona || null, intent.trim() || null, selectedSkills); }
    finally { setDrafting(false); }
  };

  return (
    <Modal title={`Draft Sequence — ${lead.company_name}`} onClose={onClose}>
      {lead.status === "disqualified" && (
        <div style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 7, padding: "10px 12px", marginBottom: 14, fontSize: 12, color: "#C9A84C" }}>
          This lead was disqualified by AI scoring. Drafting will force-qualify it and generate a sequence anyway.
        </div>
      )}
      <label style={labelStyle}>What&apos;s your goal with this lead?</label>
      <textarea
        value={intent}
        onChange={e => setIntent(e.target.value)}
        placeholder="e.g. &quot;Looking for subcontract work on their CMMC compliance projects&quot; or &quot;Partnership — they serve the same clients, want a referral relationship&quot;"
        rows={3}
        style={{ ...fieldStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, marginBottom: 16 }}
      />
      <label style={labelStyle}>Outreach Persona</label>
      <select style={{ ...fieldStyle, marginBottom: 16 }} value={selectedPersona} onChange={e => setSelectedPersona(e.target.value)}>
        <option value="">— None —</option>
        {outreachPersonas.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
      </select>
      {voiceSkills.length > 0 && (
        <>
          <label style={labelStyle}>Voice Skills <span style={{ color: "#555", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(stack multiple — all apply to this draft)</span></label>
          <div style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "8px 10px", marginBottom: 20, display: "flex", flexDirection: "column", gap: 6 }}>
            {voiceSkills.map(s => (
              <label key={s.slug} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: selectedSkills.includes(s.slug) ? "#C9A84C" : "#888" }}>
                <input type="checkbox" checked={selectedSkills.includes(s.slug)} onChange={() => toggleSkill(s.slug)}
                  style={{ accentColor: "#C9A84C", width: 14, height: 14 }} />
                {s.name}
              </label>
            ))}
          </div>
        </>
      )}
      <button onClick={handleDraft} disabled={drafting}
        style={{ width: "100%", padding: "10px", background: drafting ? "rgba(201,168,76,0.3)" : "linear-gradient(135deg, #C9A84C, #8B6914)", border: "none", borderRadius: 8, color: "#0D0F14", fontSize: 13, fontWeight: 700, cursor: drafting ? "not-allowed" : "pointer" }}>
        {drafting ? "Drafting with AI..." : "Draft with AI"}
      </button>
    </Modal>
  );
}

// ─── Lead modal (add / edit) ───────────────────────────────
function LeadModal({ lead, onClose, onSave }: { lead: Lead | null; onClose: () => void; onSave: (payload: Partial<Lead>) => Promise<void> }) {
  const [form, setForm] = useState<Partial<Lead>>(lead ?? {
    company_name: "", website: "", location: "", org_type: "", cmmc_level_sought: "",
    employee_count: "", contact_name: "", contact_title: "", contact_email: "", contact_linkedin: "",
    status: "discovered", score: 0, persona_slug: null, category: "sales",
  });
  const [saving, setSaving] = useState(false);
  const [personas, setPersonas] = useState<{ slug: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/marketing/personas")
      .then(r => r.json())
      .then(d => setPersonas(d.personas ?? []))
      .catch(() => {});
  }, []);

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
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Category</label>
          <select style={fieldStyle} value={form.category ?? "sales"} onChange={set("category")}>
            {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Outreach Persona</label>
          <select style={fieldStyle} value={form.persona_slug ?? ""} onChange={e => setForm(f => ({ ...f, persona_slug: e.target.value || null }))}>
            <option value="">— None —</option>
            {personas.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
          </select>
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
function SequenceEditorModal({ leadId, companyName, initialDraft, currentPersonaSlug, onClose, onSave }: { leadId: number; companyName: string; initialDraft?: { emails: PendingEmail[]; linkedin_message: string }; currentPersonaSlug?: string | null; onClose: () => void; onSave: () => Promise<void> }) {
  const [emails, setEmails] = useState<PendingEmail[]>(
    initialDraft?.emails ?? [
      { touch_number: 1, subject: "", body: "" },
      { touch_number: 2, subject: "", body: "" },
      { touch_number: 3, subject: "", body: "" },
    ]
  );
  const [linkedinMessage, setLinkedinMessage] = useState(initialDraft?.linkedin_message ?? "");
  const [loading, setLoading] = useState(!initialDraft);
  const [saving, setSaving] = useState(false);
  const [personas, setPersonas] = useState<{ slug: string; name: string }[]>([]);
  const [regenPersona, setRegenPersona] = useState<string>(currentPersonaSlug ?? "");
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (initialDraft) return;
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
  }, [leadId, initialDraft]);

  useEffect(() => {
    fetch("/api/marketing/personas").then(r => r.json()).then(d => setPersonas(d.personas ?? [])).catch(() => {});
  }, []);

  const regenerateWithAI = async () => {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/marketing/leads/${leadId}/run-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona_slug: regenPersona || null }),
      });
      const data = await res.json();
      if (!res.ok || !data.draft) return;
      const draft = data.draft as { emails: PendingEmail[]; linkedin_message: string };
      setEmails(draft.emails);
      setLinkedinMessage(draft.linkedin_message);
    } finally {
      setRegenerating(false);
    }
  };

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
      {/* Regenerate with AI */}
      <div style={{ marginBottom: 16, padding: "12px 14px", background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.2)", borderRadius: 8, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={labelStyle}>Persona</label>
          <select style={{ ...fieldStyle }} value={regenPersona} onChange={e => setRegenPersona(e.target.value)}>
            <option value="">— None (default voice) —</option>
            {personas.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
          </select>
        </div>
        <button onClick={regenerateWithAI} disabled={regenerating}
          style={{ padding: "8px 16px", background: regenerating ? "rgba(201,168,76,0.3)" : "linear-gradient(135deg, #C9A84C, #8B6914)", border: "none", borderRadius: 6, color: "#0D0F14", fontSize: 12, fontWeight: 700, cursor: regenerating ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
          {regenerating ? "Drafting..." : "Draft with AI"}
        </button>
      </div>

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

// ─── Persona editor modal ─────────────────────────────────
function PersonaEditorModal({ persona, onClose, onSave, skillType = "persona" }: {
  persona: { slug: string; name: string; body: string } | null;
  onClose: () => void;
  onSave: () => void;
  skillType?: "persona" | "voice";
}) {
  const [name, setName] = useState(persona?.name ?? "");
  const [body, setBody] = useState(persona?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [aiWriting, setAiWriting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const writeWithAI = async () => {
    if (!description.trim()) return;
    setAiWriting(true);
    setAiError(null);
    try {
      const res = await fetch("/api/marketing/personas/draft-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, skill_type: skillType }),
      });
      const data = await res.json();
      if (!res.ok) { setAiError(data.error ?? "AI write failed"); return; }
      setBody(data.body);
    } finally {
      setAiWriting(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/marketing/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: persona?.slug, name, body, skill_type: skillType }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Save failed"); return; }
      onSave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={persona ? `Edit — ${persona.name}` : skillType === "voice" ? "New Voice Skill" : "New Persona"} onClose={onClose} width={640}>
      <p style={{ fontSize: 12, color: "#666", margin: "0 0 14px" }}>
        {skillType === "voice"
          ? "Voice skills shape how the AI writes — your tone, subject line style, phrases you use, things you'd never say. Stack multiple skills per draft."
          : "Personas shape how the AI writes your outreach — tone, angle, CTA, and talking points. Write it yourself or describe your style and let AI draft it."}
      </p>

      {/* AI draft section */}
      <div style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.2)", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
        <label style={{ ...labelStyle, color: "#C9A84C" }}>Describe your style (AI will write the body)</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="e.g. I'm a founder who's been through CMMC audits. Direct, no buzzwords. I talk like a coworker, not a salesperson. I lead with the problem, not the pitch."
          rows={3}
          style={{ ...fieldStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, marginBottom: 8 }}
        />
        {aiError && <div style={{ color: "#C94C4C", fontSize: 11, marginBottom: 6 }}>{aiError}</div>}
        <button onClick={writeWithAI} disabled={aiWriting || !description.trim()}
          style={{ padding: "7px 16px", background: aiWriting ? "rgba(201,168,76,0.3)" : "linear-gradient(135deg, #C9A84C, #8B6914)", border: "none", borderRadius: 6, color: "#0D0F14", fontSize: 12, fontWeight: 700, cursor: (aiWriting || !description.trim()) ? "not-allowed" : "pointer" }}>
          {aiWriting ? "Writing..." : "Write with AI →"}
        </button>
      </div>

      {error && <div style={{ color: "#C94C4C", fontSize: 12, marginBottom: 10 }}>{error}</div>}
      <label style={labelStyle}>Persona Name</label>
      <input style={{ ...fieldStyle, marginBottom: 12 }} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. New Startup Introduction" />
      <label style={labelStyle}>Persona Body (Markdown)</label>
      <textarea
        style={{ ...fieldStyle, minHeight: 280, fontFamily: "monospace", fontSize: 12, resize: "vertical", marginBottom: 14 }}
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder={`# My Persona\n**Stage:** ...\n**Value prop:** ...\n**Tone:** ...\n**CTA:** ...\n\n## Extended Instructions\n...`}
      />
      <button onClick={handleSave} disabled={saving || !name.trim() || !body.trim()}
        style={{ width: "100%", padding: "10px", background: (saving || !name.trim() || !body.trim()) ? "rgba(201,168,76,0.3)" : "linear-gradient(135deg, #C9A84C, #8B6914)", border: "none", borderRadius: 8, color: "#0D0F14", fontSize: 13, fontWeight: 700, cursor: (saving || !name.trim() || !body.trim()) ? "not-allowed" : "pointer" }}>
        {saving ? "Saving..." : persona ? "Save Changes" : skillType === "voice" ? "Create Skill" : "Create Persona"}
      </button>
    </Modal>
  );
}

// ─── Lead history modal ────────────────────────────────────
function describeRun(run: AgentRun): string {
  if (run.agent_name === "qualifier") {
    if (run.status === "success") {
      const output = run.output as { score?: number; score_reason?: string } | null;
      return `Qualified — score ${output?.score ?? "?"}/10: ${output?.score_reason ?? ""}`;
    }
    return `Qualification failed: ${run.error ?? "Unknown error"}`;
  }
  if (run.agent_name === "copywriter") {
    if (run.status === "success") {
      const output = run.output as { emails?: unknown[] } | null;
      return `Sequence drafted — ${output?.emails?.length ?? 0} emails + LinkedIn message`;
    }
    return `Draft failed: ${run.error ?? "Unknown error"}`;
  }
  return `${run.agent_name} ${run.status}`;
}

function PromptRunRow({ prompt }: { prompt: PromptRun }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ marginBottom: 10, padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 12, color: prompt.status === "success" ? "#ddd" : "#C94C4C" }}>
          {prompt.agent_name} — <span style={{ color: "#4C8EC9" }}>{prompt.provider}/{prompt.model}</span>
          {prompt.status === "error" && ` — failed: ${prompt.error ?? "unknown error"}`}
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ fontSize: 11, color: "#4C8EC9", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          {expanded ? "Hide prompt" : "View prompt"}
        </button>
      </div>
      <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
        {new Date(prompt.started_at).toLocaleString()}
        {prompt.duration_ms != null && ` · ${(prompt.duration_ms / 1000).toFixed(1)}s`}
      </div>
      {expanded && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#aaa", fontFamily: "monospace", whiteSpace: "pre-wrap", maxHeight: 240, overflowY: "auto", background: "rgba(0,0,0,0.25)", padding: 8, borderRadius: 6 }}>
          {prompt.system_prompt && <><strong style={{ color: "#888" }}>System:</strong>{"\n"}{prompt.system_prompt}{"\n\n"}</>}
          {prompt.user_prompt && <><strong style={{ color: "#888" }}>User:</strong>{"\n"}{prompt.user_prompt}{"\n\n"}</>}
          {prompt.response && <><strong style={{ color: "#888" }}>Response:</strong>{"\n"}{prompt.response}</>}
        </div>
      )}
    </div>
  );
}

function LeadHistoryModal({ leadId, companyName, onClose }: { leadId: number; companyName: string; onClose: () => void }) {
  const [runs, setRuns] = useState<AgentRun[] | null>(null);
  const [prompts, setPrompts] = useState<PromptRun[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/marketing/leads/${leadId}/history`)
      .then(res => res.json())
      .then(data => { setRuns(data.runs); setPrompts(data.prompts ?? []); })
      .catch(() => setError(true));
  }, [leadId]);

  return (
    <Modal title={`History — ${companyName}`} onClose={onClose} width={520}>
      {error ? (
        <div style={{ padding: "20px 0", textAlign: "center", color: "#C94C4C", fontSize: 12 }}>Failed to load history.</div>
      ) : runs === null ? (
        <div style={{ padding: "20px 0", textAlign: "center", color: "#555", fontSize: 12 }}>Loading...</div>
      ) : runs.length === 0 ? (
        <div style={{ padding: "20px 0", textAlign: "center", color: "#555", fontSize: 12 }}>No AI activity yet for this lead.</div>
      ) : (
        <>
          {runs.map(run => (
            <div key={run.id} style={{ marginBottom: 10, padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: run.status === "success" ? "#ddd" : "#C94C4C" }}>{describeRun(run)}</div>
              <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>{new Date(run.started_at).toLocaleString()}</div>
            </div>
          ))}
          {prompts && prompts.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, margin: "16px 0 8px" }}>Prompts sent</div>
              {prompts.map(prompt => <PromptRunRow key={prompt.id} prompt={prompt} />)}
            </>
          )}
        </>
      )}
    </Modal>
  );
}

// ─── Main Dashboard ───────────────────────────────────────
export default function MarketingAgentDashboard() {
  type LeadColumnKey = "company" | "status" | "score" | "cmmc" | "location" | "email" | "persona" | "actions";
  type LeadSortKey = "company_name" | "status" | "score" | "cmmc_level_sought" | "location" | "contact_email" | "persona_slug";

  const [tab, setTab] = useState("approval");
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [pending, setPending] = useState<PendingSequence[]>([]);
  const [queue, setQueue] = useState<{ due: QueueEmail[]; upcoming: QueueEmail[] }>({ due: [], upcoming: [] });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<{ msg: string; color: string } | null>(null);
  const [provider, setProvider] = useState("claude");
  const [tier, setTier] = useState("balanced");
  const [leadFilter, setLeadFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [leadSearch, setLeadSearch] = useState("");
  const [leadSelected, setLeadSelected] = useState<Set<number>>(new Set());
  const [leadSort, setLeadSort] = useState<{ key: LeadSortKey | null; direction: "asc" | "desc" | null }>({ key: null, direction: null });
  const [leadColWidths, setLeadColWidths] = useState<Record<LeadColumnKey, number>>({
    company: 180,
    status: 110,
    score: 90,
    cmmc: 120,
    location: 140,
    email: 220,
    persona: 130,
    actions: 320,
  });
  const [leadResize, setLeadResize] = useState<{ column: LeadColumnKey; startX: number; startWidth: number } | null>(null);
  const [loading, setLoading] = useState(true);

  // Settings tab state
  const [settings, setSettings] = useState({
    qualifier_min_score: "6", daily_send_limit: "50", batch_size: "10",
    smtp_from: "",
  });
  const [resendConfigured, setResendConfigured] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [testingEmail, setTestingEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ ok: boolean; error?: string } | null>(null);

  // Personas tab state
  const [personasList, setPersonasList] = useState<{ slug: string; name: string; preview: string; body: string }[]>([]);
  const [personaEditorModal, setPersonaEditorModal] = useState<{ persona: { slug: string; name: string; body: string } | null; skillType?: "persona" | "voice" } | null>(null);
  const [deletingPersonaSlug, setDeletingPersonaSlug] = useState<string | null>(null);

  // Skills tab state
  const [skillsList, setSkillsList] = useState<{ slug: string; name: string; preview: string; body: string }[]>([]);

  // Leads pagination
  const PAGE_SIZE = 25;
  const [leadsPage, setLeadsPage] = useState(1);

  // Modal state
  const [leadModal, setLeadModal] = useState<{ mode: "add" | "edit"; lead: Lead | null } | null>(null);
  const [sequenceModal, setSequenceModal] = useState<{ leadId: number; companyName: string; currentPersonaSlug?: string | null; initialDraft?: { emails: PendingEmail[]; linkedin_message: string } } | null>(null);
  const [draftModal, setDraftModal] = useState<{ id: number; company_name: string; persona_slug: string | null; outreach_intent: string | null; status: string; skill_slugs: string[] } | null>(null);
  const [historyModal, setHistoryModal] = useState<{ leadId: number; companyName: string } | null>(null);
  const [aiRunningId, setAiRunningId] = useState<number | null>(null);

  // Bulk import (Scout — text paste)
  const [importText, setImportText] = useState("");
  const [importCategory, setImportCategory] = useState("sales");
  const [importing, setImporting] = useState(false);

  // CSV/Excel import
  type CsvMapping = Record<string, string | null>;
  type CsvRow = Record<string, string>;
  const [csvMapping, setCsvMapping] = useState<CsvMapping | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvPersona, setCsvPersona] = useState<string>("");
  const [csvPersonas, setCsvPersonas] = useState<{ slug: string; name: string }[]>([]);
  const [csvCategory, setCsvCategory] = useState<string>("sales");
  const [csvParsing, setCsvParsing] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);

  const LEAD_FIELD_LABELS: Record<string, string> = {
    company_name: "Company Name *", website: "Website", location: "Location",
    org_type: "Org Type", cmmc_level_sought: "CMMC Level", employee_count: "Employee Count",
    contact_name: "Contact Name", contact_title: "Contact Title",
    contact_email: "Contact Email", contact_linkedin: "Contact LinkedIn",
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/marketing/leads/import-file", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "Failed to parse file", "#C94C4C"); return; }
      setCsvMapping(data.suggested_mapping);
      setCsvHeaders(data.headers);
      setCsvRows(data.all_rows);
      const pRes = await fetch("/api/marketing/personas");
      const pData = await pRes.json();
      setCsvPersonas(pData.personas ?? []);
    } finally {
      setCsvParsing(false);
      e.target.value = "";
    }
  };

  const confirmCsvImport = async () => {
    if (!csvMapping || !csvRows.length) return;
    setCsvImporting(true);
    try {
      const res = await fetch("/api/marketing/leads/import-confirm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping: csvMapping, all_rows: csvRows, persona_slug: csvPersona || null, category: csvCategory }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "Import failed", "#C94C4C"); return; }
      showToast(`Imported ${data.imported} lead${data.imported === 1 ? "" : "s"} (${data.skipped_duplicates} skipped) — ${data.qualified} qualified`);
      setCsvMapping(null); setCsvRows([]); setCsvPersona(""); setCsvCategory("sales");
      await refreshAll();
    } finally {
      setCsvImporting(false);
    }
  };

  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [sendingBatch, setSendingBatch] = useState(false);
  const [sendingEmailId, setSendingEmailId] = useState<number | null>(null);
  const [bulkLeadStatus, setBulkLeadStatus] = useState("");
  const [bulkLeadCategory, setBulkLeadCategory] = useState("");
  const [bulkUpdatingLeads, setBulkUpdatingLeads] = useState(false);

  const runFullPipeline = async () => {
    setPipelineRunning(true);
    try {
      const res = await fetch("/api/marketing/pipeline/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "Pipeline failed", "#C94C4C"); return; }
      if (data.processed === 0) { showToast("No discovered leads to process", "#C9A84C"); return; }
      showToast(`Pipeline complete — ${data.drafted} drafted, ${data.disqualified} disqualified${data.errors ? `, ${data.errors} errors` : ""}`);
      await refreshAll();
    } finally {
      setPipelineRunning(false);
    }
  };

  const sendBatch = async () => {
    setSendingBatch(true);
    try {
      const res = await fetch("/api/marketing/send-queue/send-batch", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "Batch send failed", "#C94C4C"); return; }
      if (data.capped) { showToast(data.message ?? "Daily send limit reached", "#C9A84C"); return; }
      if (data.total === 0 && !data.skipped_linkedin) { showToast("No emails due right now", "#C9A84C"); return; }
      const parts = [`Sent ${data.sent}/${data.total}`];
      if (data.failed) parts.push(`${data.failed} failed`);
      if (data.skipped_linkedin) parts.push(`${data.skipped_linkedin} LinkedIn-only skipped`);
      if (data.remaining_today != null) parts.push(`${data.remaining_today} remaining today`);
      showToast(parts.join(" · "));
      await refreshAll();
    } finally {
      setSendingBatch(false);
    }
  };

  const sendSingleEmail = async (item: QueueEmail) => {
    setSendingEmailId(item.id);
    try {
      const res = await fetch(`/api/marketing/emails/${item.id}/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "Send failed", "#C94C4C"); return; }
      setQueue(q => ({ ...q, due: q.due.filter(e => e.id !== item.id) }));
      showToast(`Touch ${item.touch_number} sent to ${item.contact_email}`);
      await refreshAll();
    } finally {
      setSendingEmailId(null);
    }
  };

  const updateSelectedLeads = async () => {
    if (leadSelected.size === 0) return;
    if (!bulkLeadStatus && !bulkLeadCategory) {
      showToast("Choose a bulk status or category", "#C9A84C");
      return;
    }

    setBulkUpdatingLeads(true);
    try {
      const res = await fetch("/api/marketing/leads/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [...leadSelected],
          set_status: bulkLeadStatus || undefined,
          set_category: bulkLeadCategory || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Bulk update failed", "#C94C4C");
        return;
      }

      const parts = [`Updated ${data.updated} lead${data.updated === 1 ? "" : "s"}`];
      if (bulkLeadStatus) parts.push(`status → ${bulkLeadStatus}`);
      if (bulkLeadCategory) parts.push(`category → ${CATEGORY_LABELS[bulkLeadCategory] ?? bulkLeadCategory}`);
      showToast(parts.join(" · "));
      setLeadSelected(new Set());
      setBulkLeadStatus("");
      setBulkLeadCategory("");
      await refreshAll();
    } finally {
      setBulkUpdatingLeads(false);
    }
  };

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

  const fetchQueue = useCallback(async () => {
    const res = await fetch("/api/marketing/send-queue");
    if (res.ok) setQueue(await res.json());
  }, []);

  const fetchConfig = useCallback(async () => {
    const res = await fetch("/api/marketing/config");
    if (!res.ok) return;
    const { config, resend_configured } = await res.json();
    if (resend_configured !== undefined) setResendConfigured(resend_configured);
    if (config.llm_provider) setProvider(config.llm_provider);
    if (config.llm_tier) setTier(config.llm_tier);
    setSettings(s => ({
      qualifier_min_score: config.qualifier_min_score ?? s.qualifier_min_score,
      daily_send_limit: config.daily_send_limit ?? s.daily_send_limit,
      batch_size: config.batch_size ?? s.batch_size,

      smtp_from: config.smtp_from ?? s.smtp_from,
    }));
  }, []);

  const fetchPersonas = useCallback(async () => {
    const res = await fetch("/api/marketing/personas?type=persona");
    if (res.ok) {
      const data = await res.json();
      setPersonasList(data.personas ?? []);
    }
  }, []);

  const fetchSkills = useCallback(async () => {
    const res = await fetch("/api/marketing/personas?type=voice");
    if (res.ok) {
      const data = await res.json();
      setSkillsList(data.personas ?? []);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchStats(), fetchLeads(), fetchPending(), fetchQueue()]);
  }, [fetchStats, fetchLeads, fetchPending, fetchQueue]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchStats(), fetchLeads(), fetchPending(), fetchQueue(), fetchConfig(), fetchPersonas(), fetchSkills()]);
      setLoading(false);
    })();
  }, [fetchStats, fetchLeads, fetchPending, fetchQueue, fetchConfig, fetchPersonas, fetchSkills]);

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
    if (!confirm(`Mark all touches for ${lead.company_name} as sent? This cannot be undone.`)) return;
    const res = await fetch(`/api/marketing/leads/${lead.id}`);
    const data = await res.json();
    const seqId = data.sequence?.id;
    if (!seqId) { showToast("No sequence found for this lead", "#C94C4C"); return; }
    await fetch(`/api/marketing/sequences/${seqId}/mark-sent`, { method: "POST" });
    showToast("Marked as sent");
    await refreshAll();
  };

  const markLinkedInSent = async (item: QueueEmail) => {
    setSendingEmailId(item.id);
    try {
      const res = await fetch(`/api/marketing/emails/${item.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manual: true }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "Mark failed", "#C94C4C"); return; }
      showToast(`Touch ${item.touch_number} for ${item.company_name} marked as sent`);
      await refreshAll();
    } finally {
      setSendingEmailId(null);
    }
  };

  const runAI = (lead: Lead) => {
    setDraftModal({ id: lead.id, company_name: lead.company_name, persona_slug: lead.persona_slug, outreach_intent: lead.outreach_intent, status: lead.status, skill_slugs: lead.skill_slugs ?? [] });
  };

  const requalifyLead = async (lead: Lead) => {
    try {
      const res = await fetch(`/api/marketing/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "qualified" }),
      });
      if (!res.ok) { showToast("Requalify failed", "#C94C4C"); return; }
      showToast(`${lead.company_name} requalified`);
      await refreshAll();
    } catch {
      showToast("Requalify failed", "#C94C4C");
    }
  };

  const executeDraft = async (lead: { id: number; company_name: string; status?: string }, personaSlug: string | null, outreachIntent: string | null, skillSlugs: string[] = []) => {
    setDraftModal(null);
    setAiRunningId(lead.id);
    try {
      const res = await fetch(`/api/marketing/leads/${lead.id}/run-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona_slug: personaSlug,
          outreach_intent: outreachIntent,
          skill_slugs: skillSlugs,
          force_qualify: lead.status === "disqualified",
        }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "AI run failed", "#C94C4C"); return; }

      if (data.draft) {
        // Open modal immediately — before refreshAll so React doesn't race the state update
        setSequenceModal({ leadId: lead.id, companyName: data.lead.company_name, currentPersonaSlug: personaSlug, initialDraft: data.draft });
      } else {
        const updated: Lead = data.lead;
        if (updated.status === "disqualified") {
          showToast(`Disqualified (score ${updated.score}/10) — use Requalify or Override & Draft to force a sequence.`, "#C94C4C");
        } else {
          showToast(`Lead is now ${updated.status}`);
        }
      }
      // Refresh list in background after modal is already set
      refreshAll().catch(() => {});
    } finally {
      setAiRunningId(null);
    }
  };

  const copyEmail = async (item: QueueEmail) => {
    const text = `To: ${item.contact_email ?? "(no email on file)"}\nSubject: ${item.subject ?? ""}\n\n${item.body ?? ""}`;
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard");
  };

  const markEmailSent = async (item: QueueEmail) => {
    setQueue(q => ({ ...q, due: q.due.filter(e => e.id !== item.id) }));
    await fetch(`/api/marketing/emails/${item.id}/mark-sent`, { method: "POST" });
    showToast(`Touch ${item.touch_number} for ${item.company_name} marked sent`);
    await refreshAll();
  };

  const runImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    try {
      const res = await fetch("/api/marketing/scout/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: importText, category: importCategory }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "Bulk import failed", "#C94C4C"); return; }
      showToast(`Imported ${data.imported} lead${data.imported === 1 ? "" : "s"} (${data.skipped_duplicates} duplicate${data.skipped_duplicates === 1 ? "" : "s"} skipped) — ${data.qualified} qualified, ${data.disqualified} disqualified`);
      setImportText("");
      await refreshAll();
    } finally {
      setImporting(false);
    }
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
    { id: "queue", label: "Send Queue", count: queue.due.length },
    { id: "pipeline", label: "Pipeline", count: null },
    { id: "leads", label: "Leads", count: stats.total },
    { id: "personas", label: "Personas", count: personasList.length },
    { id: "skills", label: "Skills", count: skillsList.length },
    { id: "settings", label: "Settings", count: null },
  ];

  const filteredLeads = leads.filter((lead) => {
    if (leadFilter !== "all" && lead.status !== leadFilter) return false;
    if (categoryFilter !== "all" && lead.category !== categoryFilter) return false;
    return true;
  });

  const getLeadSortValue = (lead: Lead, key: LeadSortKey): string | number => {
    if (key === "score") return lead.score;
    if (key === "company_name") return lead.company_name?.toLowerCase() ?? "";
    if (key === "status") return lead.status?.toLowerCase() ?? "";
    if (key === "cmmc_level_sought") return lead.cmmc_level_sought?.toLowerCase() ?? "";
    if (key === "location") return lead.location?.toLowerCase() ?? "";
    if (key === "contact_email") return lead.contact_email?.toLowerCase() ?? "";
    return lead.persona_slug?.toLowerCase() ?? "";
  };

  const cycleLeadSort = (key: LeadSortKey) => {
    setLeadSort(prev => {
      if (prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return { key: null, direction: null };
    });
  };

  useEffect(() => {
    if (!leadResize) return;

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - leadResize.startX;
      const nextWidth = Math.max(80, leadResize.startWidth + delta);
      setLeadColWidths(prev => ({ ...prev, [leadResize.column]: nextWidth }));
    };

    const onMouseUp = () => setLeadResize(null);

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [leadResize]);

  const searchedLeads = filteredLeads.filter(lead => {
    const q = leadSearch.trim().toLowerCase();
    if (!q) return true;
    const haystack = [
      lead.company_name,
      lead.status,
      lead.cmmc_level_sought,
      lead.location,
      lead.contact_email,
      lead.persona_slug,
      lead.category,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  const visibleLeads = [...searchedLeads].sort((a, b) => {
    if (!leadSort.key || !leadSort.direction) return 0;
    const aVal = getLeadSortValue(a, leadSort.key);
    const bVal = getLeadSortValue(b, leadSort.key);
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return leadSort.direction === "asc" ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(visibleLeads.length / PAGE_SIZE));
  const normalizedLeadsPage = Math.min(leadsPage, totalPages);
  const paginatedLeads = visibleLeads.slice((normalizedLeadsPage - 1) * PAGE_SIZE, normalizedLeadsPage * PAGE_SIZE);
  const allVisibleSelected = paginatedLeads.length > 0 && paginatedLeads.every(l => leadSelected.has(l.id));
  const someVisibleSelected = paginatedLeads.some(l => leadSelected.has(l.id));

  useEffect(() => {
    if (leadsPage !== normalizedLeadsPage) {
      setLeadsPage(normalizedLeadsPage);
    }
  }, [leadsPage, normalizedLeadsPage]);

  return (
    <div style={{ background: "#0D0F14", minHeight: "100%", fontFamily: "'Inter', -apple-system, sans-serif", color: "#fff" }}>

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
          initialDraft={sequenceModal.initialDraft}
          currentPersonaSlug={sequenceModal.currentPersonaSlug}
          onClose={() => setSequenceModal(null)}
          onSave={async () => { setSequenceModal(null); showToast("Sequence saved — added to Approval Queue"); await refreshAll(); }}
        />
      )}
      {draftModal && (
        <DraftModal
          lead={draftModal}
          onClose={() => setDraftModal(null)}
          onDraft={(personaSlug, outreachIntent, skillSlugs) => executeDraft(draftModal, personaSlug, outreachIntent, skillSlugs)}
        />
      )}
      {historyModal && (
        <LeadHistoryModal
          leadId={historyModal.leadId}
          companyName={historyModal.companyName}
          onClose={() => setHistoryModal(null)}
        />
      )}
      {personaEditorModal !== null && (
        <PersonaEditorModal
          persona={personaEditorModal.persona}
          skillType={personaEditorModal.skillType ?? "persona"}
          onClose={() => setPersonaEditorModal(null)}
          onSave={async () => {
            setPersonaEditorModal(null);
            if (personaEditorModal.skillType === "voice") { await fetchSkills(); showToast("Skill saved"); }
            else { await fetchPersonas(); showToast("Persona saved"); }
          }}
        />
      )}

      {/* Header */}
      <header style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "flex-end", background: "rgba(0,0,0,0.3)", position: "sticky", top: 0, zIndex: 100 }}>
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

        {/* ── Send Queue ── */}
        {tab === "queue" && (
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Send Queue</h2>
            {!resendConfigured && (
              <div style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.4)", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 12, color: "#C9A84C" }}>
                <strong>Resend not configured.</strong> Email sending is disabled until you add <span style={{ fontFamily: "monospace" }}>RESEND_API_KEY</span> to your environment variables.
                Go to <strong>Settings → API Keys</strong> to verify your key is set, then set a <strong>From Address</strong> in the Marketing section.
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: "#666", margin: 0 }}>
                Touches due now from approved sequences. Send via Resend or copy to your email client.
              </p>
              {queue.due.length > 0 && (
                <button onClick={sendBatch} disabled={sendingBatch}
                  style={{ background: sendingBatch ? "rgba(76,201,142,0.3)" : "linear-gradient(135deg, #4CC98E, #2A7A56)", border: "none", borderRadius: 6, padding: "7px 16px", color: "#0D0F14", fontSize: 12, fontWeight: 700, cursor: sendingBatch ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
                  {sendingBatch ? "Sending..." : `Send All Due (${queue.due.length})`}
                </button>
              )}
            </div>

            {queue.due.length === 0 && queue.upcoming.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#444" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
                <div style={{ fontSize: 14 }}>Nothing due right now</div>
                <div style={{ fontSize: 12, marginTop: 6, color: "#333" }}>Approve a sequence to schedule its touches</div>
              </div>
            ) : (
              <>
                {queue.due.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#444", padding: "10px 0 20px" }}>All caught up — nothing due right now.</div>
                ) : (
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ fontSize: 11, color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Due</div>
                    {queue.due.map(item => (
                      <div key={item.id} style={{ border: "1px solid rgba(76,201,142,0.3)", borderRadius: 10, background: "rgba(76,201,142,0.04)", padding: "14px 16px", marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{item.company_name}</span>
                            <span style={{ fontSize: 10, fontFamily: "monospace", color: "#4CC98E", background: "rgba(76,201,142,0.15)", padding: "1px 6px", borderRadius: 3 }}>
                              Touch {item.touch_number}
                            </span>
                            {item.contact_name && <span style={{ fontSize: 11, color: "#666" }}>{item.contact_name}</span>}
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {item.contact_email ? (
                              <button onClick={() => sendSingleEmail(item)} disabled={sendingEmailId === item.id}
                                style={{ background: sendingEmailId === item.id ? "rgba(76,201,142,0.3)" : "linear-gradient(135deg, #4CC98E, #2A7A56)", border: "none", borderRadius: 5, padding: "5px 10px", color: "#0D0F14", fontSize: 11, fontWeight: 700, cursor: sendingEmailId === item.id ? "not-allowed" : "pointer" }}>
                                {sendingEmailId === item.id ? "Sending..." : "Send via Resend"}
                              </button>
                            ) : (
                              <button onClick={() => markLinkedInSent(item)} disabled={sendingEmailId === item.id}
                                style={{ background: sendingEmailId === item.id ? "rgba(76,142,201,0.3)" : "linear-gradient(135deg, #4C8EC9, #2A5A8B)", border: "none", borderRadius: 5, padding: "5px 10px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: sendingEmailId === item.id ? "not-allowed" : "pointer" }}>
                                {sendingEmailId === item.id ? "Marking..." : "Mark LinkedIn Sent"}
                              </button>
                            )}
                            <button onClick={() => copyEmail(item)}
                              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, padding: "5px 10px", color: "#888", fontSize: 11, cursor: "pointer" }}>
                              Copy
                            </button>
                            <button onClick={() => markEmailSent(item)}
                              style={{ background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 5, padding: "5px 10px", color: "#C9A84C", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                              Mark Sent
                            </button>
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: item.contact_email ? "#4CC98E" : "#C94C4C", marginBottom: 8 }}>
                          {item.contact_email ? `To: ${item.contact_email}` : "No email on file — LinkedIn only"}
                        </div>
                        <div style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, padding: "10px 12px" }}>
                          <div style={{ fontSize: 12, color: "#C9A84C", marginBottom: 6, fontWeight: 600 }}>{item.subject}</div>
                          <pre style={{ fontSize: 12, color: "#aaa", whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.7, fontFamily: "inherit" }}>{item.body}</pre>
                        </div>
                        {item.touch_number === 1 && item.linkedin_message && (
                          <div style={{ marginTop: 8, background: "rgba(76,142,201,0.06)", border: "1px solid rgba(76,142,201,0.2)", borderRadius: 6, padding: "10px 12px" }}>
                            <div style={{ fontSize: 10, color: "#555", marginBottom: 6, letterSpacing: "0.1em", textTransform: "uppercase" }}>LinkedIn Connection Request</div>
                            <p style={{ fontSize: 12, color: "#aaa", margin: 0, lineHeight: 1.7 }}>{item.linkedin_message}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {queue.upcoming.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Upcoming</div>
                    {queue.upcoming.map(item => {
                      const days = daysUntil(item.scheduled_at);
                      return (
                        <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 7, marginBottom: 6, opacity: 0.6 }}>
                          <span style={{ fontSize: 13, color: "#aaa" }}>{item.company_name}</span>
                          <span style={{ fontSize: 10, fontFamily: "monospace", color: "#7C6AC4", background: "rgba(124,106,196,0.15)", padding: "1px 6px", borderRadius: 3 }}>
                            Touch {item.touch_number}
                          </span>
                          <span style={{ fontSize: 11, color: "#555", marginLeft: "auto" }}>
                            {days == null ? "Not scheduled" : days <= 0 ? "Due now" : `Due in ${days} day${days === 1 ? "" : "s"}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Pipeline ── */}
        {tab === "pipeline" && (
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Pipeline Control</h2>
            <p style={{ fontSize: 12, color: "#666", marginBottom: 20 }}>Automated agent runs. Use manual lead entry and the sequence editor for now.</p>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(76,142,201,0.3)", borderRadius: 10, padding: "18px", marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#4C8EC9", marginBottom: 6 }}>Bulk Import (AI)</div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>
                Paste company listings, directory text, or notes. Claude will extract leads and add them as "discovered".
              </div>
              <textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder="Paste company listings, directory text, or notes here..."
                style={{ ...fieldStyle, minHeight: 120, fontFamily: "inherit", resize: "vertical", marginBottom: 10 }}
              />
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Category</label>
                <select style={fieldStyle} value={importCategory} onChange={e => setImportCategory(e.target.value)}>
                  {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
              </div>
              <button onClick={runImport} disabled={importing || !importText.trim()}
                style={{ background: importing || !importText.trim() ? "rgba(76,142,201,0.3)" : "linear-gradient(135deg, #4C8EC9, #2A4F7C)", border: "none", borderRadius: 6, padding: "8px 16px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: importing || !importText.trim() ? "not-allowed" : "pointer" }}>
                {importing ? "Importing..." : "Import Leads"}
              </button>
            </div>

            {/* CSV / Excel Import */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(124,106,196,0.3)", borderRadius: 10, padding: "18px", marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#7C6AC4", marginBottom: 6 }}>Import CSV / Excel</div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>
                Upload a .csv, .xlsx, or .xls file. AI will suggest the column mapping — you confirm before anything is imported.
              </div>

              {!csvMapping ? (
                <label style={{ display: "inline-block", cursor: csvParsing ? "not-allowed" : "pointer" }}>
                  <input type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={handleFileUpload} disabled={csvParsing} />
                  <span style={{ display: "inline-block", background: csvParsing ? "rgba(124,106,196,0.3)" : "linear-gradient(135deg, #7C6AC4, #4A3A8C)", borderRadius: 6, padding: "8px 16px", color: "#fff", fontSize: 12, fontWeight: 700 }}>
                    {csvParsing ? "Parsing file..." : "Choose File"}
                  </span>
                </label>
              ) : (
                <div>
                  <div style={{ fontSize: 12, color: "#aaa", marginBottom: 12 }}>
                    Mapping {csvRows.length} rows. Adjust any columns below, then confirm.
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                    {Object.keys(LEAD_FIELD_LABELS).map(field => (
                      <div key={field}>
                        <label style={{ ...labelStyle }}>{LEAD_FIELD_LABELS[field]}</label>
                        <select
                          style={{ ...fieldStyle, fontSize: 11 }}
                          value={csvMapping[field] ?? ""}
                          onChange={e => setCsvMapping(m => ({ ...m!, [field]: e.target.value || null }))}
                        >
                          <option value="">— skip —</option>
                          {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>Category</label>
                    <select style={fieldStyle} value={csvCategory} onChange={e => setCsvCategory(e.target.value)}>
                      {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>Outreach Persona (optional)</label>
                    <select style={fieldStyle} value={csvPersona} onChange={e => setCsvPersona(e.target.value)}>
                      <option value="">— None —</option>
                      {csvPersonas.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={confirmCsvImport} disabled={csvImporting}
                      style={{ background: csvImporting ? "rgba(124,106,196,0.3)" : "linear-gradient(135deg, #7C6AC4, #4A3A8C)", border: "none", borderRadius: 6, padding: "8px 16px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: csvImporting ? "not-allowed" : "pointer" }}>
                      {csvImporting ? "Importing..." : `Confirm Import (${csvRows.length} rows)`}
                    </button>
                    <button onClick={() => { setCsvMapping(null); setCsvRows([]); setCsvPersona(""); }}
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "8px 16px", color: "#888", fontSize: 12, cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 10, padding: "18px" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#C9A84C", marginBottom: 4 }}>Full Pipeline</div>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 14 }}>
                  Qualifies all discovered leads and drafts sequences for the top fits. Processes up to {settings.batch_size} leads per run.
                </div>
                <button onClick={runFullPipeline} disabled={pipelineRunning}
                  style={{ background: pipelineRunning ? "rgba(201,168,76,0.3)" : "linear-gradient(135deg, #C9A84C, #8B6914)", border: "none", borderRadius: 6, padding: "8px 18px", color: "#0D0F14", fontSize: 12, fontWeight: 700, cursor: pipelineRunning ? "not-allowed" : "pointer" }}>
                  {pipelineRunning ? "Running..." : "Run Pipeline"}
                </button>
              </div>
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(76,201,142,0.3)", borderRadius: 10, padding: "18px" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#4CC98E", marginBottom: 4 }}>Send Approved</div>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 14 }}>
                  Sends all due emails in the queue via Resend. Requires <span style={{ fontFamily: "monospace", color: "#888" }}>RESEND_API_KEY</span> and a verified from address.
                </div>
                <button onClick={sendBatch} disabled={sendingBatch}
                  style={{ background: sendingBatch ? "rgba(76,201,142,0.3)" : "linear-gradient(135deg, #4CC98E, #2A7A56)", border: "none", borderRadius: 6, padding: "8px 18px", color: "#0D0F14", fontSize: 12, fontWeight: 700, cursor: sendingBatch ? "not-allowed" : "pointer" }}>
                  {sendingBatch ? "Sending..." : "Send All Due"}
                </button>
              </div>
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
                    <button key={s} onClick={() => { setLeadFilter(s); setLeadsPage(1); }}
                      style={{ padding: "4px 10px", fontSize: 11, border: `1px solid ${leadFilter === s ? "rgba(201,168,76,0.5)" : "rgba(255,255,255,0.1)"}`, borderRadius: 5, background: leadFilter === s ? "rgba(201,168,76,0.1)" : "transparent", color: leadFilter === s ? "#C9A84C" : "#666", cursor: "pointer", textTransform: "capitalize" }}>
                      {s}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {["all", ...CATEGORY_OPTIONS].map(c => (
                    <button key={c} onClick={() => { setCategoryFilter(c); setLeadsPage(1); }}
                      style={{ padding: "4px 10px", fontSize: 11, border: `1px solid ${categoryFilter === c ? "rgba(124,106,196,0.5)" : "rgba(255,255,255,0.1)"}`, borderRadius: 5, background: categoryFilter === c ? "rgba(124,106,196,0.1)" : "transparent", color: categoryFilter === c ? "#7C6AC4" : "#666", cursor: "pointer" }}>
                      {c === "all" ? "all" : CATEGORY_LABELS[c]}
                    </button>
                  ))}
                </div>
                <button onClick={() => setLeadModal({ mode: "add", lead: null })}
                  style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)", border: "none", borderRadius: 6, padding: "6px 14px", color: "#0D0F14", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                  + Add Lead
                </button>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
              <input
                value={leadSearch}
                onChange={e => setLeadSearch(e.target.value)}
                placeholder="Filter leads by company, status, location, email, persona..."
                style={{ ...fieldStyle, maxWidth: 520 }}
              />
              <div style={{ fontSize: 11, color: "#666" }}>
                {leadSelected.size} selected
              </div>
            </div>

            {leadSelected.size > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
                <span style={{ fontSize: 11, color: "#888", fontWeight: 600 }}>{leadSelected.size} lead{leadSelected.size === 1 ? "" : "s"} selected</span>
                <select
                  value={bulkLeadStatus}
                  onChange={e => setBulkLeadStatus(e.target.value)}
                  style={{ ...fieldStyle, maxWidth: 170, paddingTop: 7, paddingBottom: 7 }}
                >
                  <option value="">Bulk status</option>
                  {STATUS_OPTIONS.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
                <select
                  value={bulkLeadCategory}
                  onChange={e => setBulkLeadCategory(e.target.value)}
                  style={{ ...fieldStyle, maxWidth: 210, paddingTop: 7, paddingBottom: 7 }}
                >
                  <option value="">Bulk category</option>
                  {CATEGORY_OPTIONS.map(category => (
                    <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={updateSelectedLeads}
                  disabled={bulkUpdatingLeads}
                  style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)", border: "none", borderRadius: 6, padding: "7px 14px", color: "#0D0F14", fontSize: 12, fontWeight: 700, cursor: bulkUpdatingLeads ? "not-allowed" : "pointer", opacity: bulkUpdatingLeads ? 0.7 : 1 }}
                >
                  {bulkUpdatingLeads ? "Updating..." : "Apply to selected"}
                </button>
                <button
                  type="button"
                  onClick={() => setLeadSelected(new Set())}
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "7px 12px", color: "#888", fontSize: 12, cursor: "pointer" }}
                >
                  Clear selection
                </button>
              </div>
            )}

            {visibleLeads.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#444", fontSize: 13 }}>
                {leads.length === 0 ? "No leads yet. Click \"+ Add Lead\" to get started." : "No leads match the current filter."}
              </div>
            ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: 38 }} />
                  <col style={{ width: leadColWidths.company }} />
                  <col style={{ width: leadColWidths.status }} />
                  <col style={{ width: leadColWidths.score }} />
                  <col style={{ width: leadColWidths.cmmc }} />
                  <col style={{ width: leadColWidths.location }} />
                  <col style={{ width: leadColWidths.email }} />
                  <col style={{ width: leadColWidths.persona }} />
                  <col style={{ width: leadColWidths.actions }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "8px 6px", color: "#555", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.08)", fontSize: 10 }}>
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        ref={el => { if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected; }}
                        onChange={() => {
                          if (allVisibleSelected) {
                            setLeadSelected(prev => {
                              const next = new Set(prev);
                              for (const lead of paginatedLeads) next.delete(lead.id);
                              return next;
                            });
                            return;
                          }
                          setLeadSelected(prev => {
                            const next = new Set(prev);
                            for (const lead of paginatedLeads) next.add(lead.id);
                            return next;
                          });
                        }}
                        style={{ width: 14, height: 14, accentColor: "#C9A84C", cursor: "pointer" }}
                      />
                    </th>
                    {[
                      { id: "company" as const, label: "Company", sortKey: "company_name" as const },
                      { id: "status" as const, label: "Status", sortKey: "status" as const },
                      { id: "score" as const, label: "Score", sortKey: "score" as const },
                      { id: "cmmc" as const, label: "CMMC Level", sortKey: "cmmc_level_sought" as const },
                      { id: "location" as const, label: "Location", sortKey: "location" as const },
                      { id: "email" as const, label: "Email", sortKey: "contact_email" as const },
                      { id: "persona" as const, label: "Persona", sortKey: "persona_slug" as const },
                      { id: "actions" as const, label: "Actions", sortKey: null },
                    ].map(col => (
                      <th key={col.id} style={{ position: "relative", textAlign: "left", padding: "8px 12px", color: "#555", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.08)", fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap", userSelect: "none" }}>
                        {col.sortKey ? (
                          <button
                            type="button"
                            onClick={() => cycleLeadSort(col.sortKey)}
                            style={{ background: "transparent", border: "none", padding: 0, color: "inherit", font: "inherit", letterSpacing: "inherit", textTransform: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
                          >
                            {col.label}
                            <span style={{ color: leadSort.key === col.sortKey ? "#C9A84C" : "#444", fontSize: 10 }}>
                              {leadSort.key === col.sortKey ? (leadSort.direction === "asc" ? "▲" : leadSort.direction === "desc" ? "▼" : "↕") : "↕"}
                            </span>
                          </button>
                        ) : (
                          col.label
                        )}
                        <span
                          onMouseDown={(ev) => {
                            ev.preventDefault();
                            setLeadResize({ column: col.id, startX: ev.clientX, startWidth: leadColWidths[col.id] });
                          }}
                          style={{ position: "absolute", top: 0, right: 0, width: 8, height: "100%", cursor: "col-resize" }}
                          title="Drag to resize"
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedLeads.map(lead => (
                    <tr key={lead.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "10px 6px" }}>
                        <input
                          type="checkbox"
                          checked={leadSelected.has(lead.id)}
                          onChange={() => setLeadSelected(prev => {
                            const next = new Set(prev);
                            if (next.has(lead.id)) next.delete(lead.id);
                            else next.add(lead.id);
                            return next;
                          })}
                          style={{ width: 14, height: 14, accentColor: "#C9A84C", cursor: "pointer" }}
                        />
                      </td>
                      <td style={{ padding: "10px 12px", color: "#ddd", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={lead.company_name}>
                        <button
                          type="button"
                          onClick={() => setLeadModal({ mode: "edit", lead })}
                          style={{ background: "transparent", border: "none", padding: 0, margin: 0, color: "inherit", font: "inherit", fontWeight: 600, cursor: "pointer", textAlign: "left", width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                          {lead.company_name}
                        </button>
                      </td>
                      <td style={{ padding: "10px 12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><Badge label={lead.status} color={statusColor(lead.status)} /></td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", color: scoreColor(lead.score), fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.score}/10</td>
                      <td style={{ padding: "10px 12px", color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={lead.cmmc_level_sought ?? "—"}>{lead.cmmc_level_sought || "—"}</td>
                      <td style={{ padding: "10px 12px", color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={lead.location ?? "—"}>{lead.location || "—"}</td>
                      <td style={{ padding: "10px 12px", color: lead.contact_email ? "#4CC98E" : "#444", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={lead.contact_email ?? "—"}>
                        {lead.contact_email || "—"}
                      </td>
                      <td style={{ padding: "10px 12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {lead.persona_slug ? (
                          <span style={{ fontSize: 10, fontFamily: "monospace", color: "#7C6AC4", background: "rgba(124,106,196,0.12)", border: "1px solid rgba(124,106,196,0.25)", borderRadius: 3, padding: "2px 6px" }}>
                            {lead.persona_slug}
                          </span>
                        ) : <span style={{ color: "#444", fontSize: 11 }}>—</span>}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "nowrap", overflowX: "auto", whiteSpace: "nowrap", alignItems: "center" }}>
                          <button onClick={() => setLeadModal({ mode: "edit", lead })}
                            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, padding: "3px 7px", color: "#888", fontSize: 10, cursor: "pointer", flexShrink: 0 }}>
                            Edit
                          </button>
                          {lead.status === "disqualified" && (
                            <button onClick={() => requalifyLead(lead)}
                              style={{ background: "rgba(76,201,142,0.1)", border: "1px solid rgba(76,201,142,0.3)", borderRadius: 5, padding: "3px 7px", color: "#4CC98E", fontSize: 10, cursor: "pointer", flexShrink: 0 }}>
                              Requalify
                            </button>
                          )}
                          {(lead.status === "discovered" || lead.status === "qualified" || lead.status === "disqualified") && (
                            <button onClick={() => runAI(lead)} disabled={aiRunningId === lead.id}
                              style={{ background: lead.status === "disqualified" ? "rgba(201,76,76,0.1)" : "rgba(201,168,76,0.1)", border: `1px solid ${lead.status === "disqualified" ? "rgba(201,76,76,0.3)" : "rgba(201,168,76,0.3)"}`, borderRadius: 5, padding: "3px 7px", color: lead.status === "disqualified" ? "#C94C4C" : "#C9A84C", fontSize: 10, cursor: aiRunningId === lead.id ? "not-allowed" : "pointer", opacity: aiRunningId === lead.id ? 0.6 : 1, flexShrink: 0 }}>
                              {aiRunningId === lead.id ? "Running..." : lead.status === "discovered" ? "Run AI" : lead.status === "disqualified" ? "Override & Draft" : "Re-Draft (AI)"}
                            </button>
                          )}
                          <button onClick={() => setSequenceModal({ leadId: lead.id, companyName: lead.company_name, currentPersonaSlug: lead.persona_slug })}
                            style={{ background: "rgba(124,106,196,0.1)", border: "1px solid rgba(124,106,196,0.3)", borderRadius: 5, padding: "3px 7px", color: "#7C6AC4", fontSize: 10, cursor: "pointer", flexShrink: 0 }}>
                            Sequence
                          </button>
                          <button onClick={() => setHistoryModal({ leadId: lead.id, companyName: lead.company_name })}
                            style={{ background: "rgba(76,142,201,0.1)", border: "1px solid rgba(76,142,201,0.3)", borderRadius: 5, padding: "3px 7px", color: "#4C8EC9", fontSize: 10, cursor: "pointer", flexShrink: 0 }}>
                            History
                          </button>
                          {lead.status === "approved" && (
                            <button onClick={() => markSent(lead)}
                              style={{ background: "rgba(76,201,142,0.1)", border: "1px solid rgba(76,201,142,0.3)", borderRadius: 5, padding: "3px 7px", color: "#4CC98E", fontSize: 10, cursor: "pointer", flexShrink: 0 }}>
                              Mark Sent
                            </button>
                          )}
                          <button onClick={() => deleteLead(lead)}
                            style={{ background: "rgba(201,76,76,0.1)", border: "1px solid rgba(201,76,76,0.3)", borderRadius: 5, padding: "3px 7px", color: "#C94C4C", fontSize: 10, cursor: "pointer", flexShrink: 0 }}>
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
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "14px 0 4px", fontSize: 12, color: "#666" }}>
                <button onClick={() => setLeadsPage(p => Math.max(1, p - 1))} disabled={leadsPage === 1}
                  style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, padding: "4px 10px", color: leadsPage === 1 ? "#333" : "#888", cursor: leadsPage === 1 ? "default" : "pointer", fontSize: 11 }}>
                  ← Prev
                </button>
                <span>Page {leadsPage} of {totalPages}</span>
                <button onClick={() => setLeadsPage(p => Math.min(totalPages, p + 1))} disabled={leadsPage === totalPages}
                  style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, padding: "4px 10px", color: leadsPage === totalPages ? "#333" : "#888", cursor: leadsPage === totalPages ? "default" : "pointer", fontSize: 11 }}>
                  Next →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Personas ── */}
        {tab === "personas" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Outreach Personas</h2>
                <p style={{ fontSize: 12, color: "#666", margin: 0 }}>Each persona shapes the AI's tone, angle, and talking points when drafting email sequences.</p>
              </div>
              <button onClick={() => setPersonaEditorModal({ persona: null })}
                style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)", border: "none", borderRadius: 6, padding: "8px 16px", color: "#0D0F14", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                + New Persona
              </button>
            </div>

            {personasList.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#444" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✍</div>
                <div style={{ fontSize: 14 }}>No personas yet</div>
                <div style={{ fontSize: 12, marginTop: 6, color: "#333" }}>Create one to give your outreach a distinct voice</div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {personasList.map(p => (
                  <div key={p.slug} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, background: "rgba(255,255,255,0.02)", padding: "16px 18px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{p.name}</span>
                          <span style={{ fontSize: 10, fontFamily: "monospace", color: "#666", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3, padding: "1px 6px" }}>{p.slug}</span>
                        </div>
                        <p style={{ fontSize: 12, color: "#666", margin: 0, lineHeight: 1.6 }}>{p.preview}</p>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => setPersonaEditorModal({ persona: { slug: p.slug, name: p.name, body: p.body } })}
                          style={{ background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 5, padding: "5px 10px", color: "#C9A84C", fontSize: 11, cursor: "pointer" }}>
                          Edit
                        </button>
                        <button onClick={async () => {
                          if (!confirm(`Delete persona "${p.name}"?`)) return;
                          setDeletingPersonaSlug(p.slug);
                          await fetch(`/api/marketing/personas/${p.slug}`, { method: "DELETE" });
                          setDeletingPersonaSlug(null);
                          await fetchPersonas();
                          showToast("Persona deleted");
                        }} disabled={deletingPersonaSlug === p.slug}
                          style={{ background: "rgba(201,76,76,0.1)", border: "1px solid rgba(201,76,76,0.3)", borderRadius: 5, padding: "5px 10px", color: "#C94C4C", fontSize: 11, cursor: "pointer" }}>
                          {deletingPersonaSlug === p.slug ? "..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Skills ── */}
        {tab === "skills" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Voice Skills</h2>
                <p style={{ fontSize: 12, color: "#666", margin: 0 }}>Skills shape how the AI writes — your tone, subject line style, phrases you use, things you&apos;d never say. Stack multiple skills per draft.</p>
              </div>
              <button onClick={() => setPersonaEditorModal({ persona: null, skillType: "voice" })}
                style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)", border: "none", borderRadius: 6, padding: "8px 16px", color: "#0D0F14", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                + New Skill
              </button>
            </div>
            {skillsList.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#444" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🎙</div>
                <div style={{ fontSize: 14 }}>No voice skills yet</div>
                <div style={{ fontSize: 12, marginTop: 6, color: "#333" }}>Create one to make your outreach sound like you, not an AI</div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {skillsList.map(s => (
                  <div key={s.slug} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, background: "rgba(255,255,255,0.02)", padding: "16px 18px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{s.name}</span>
                          <span style={{ fontSize: 10, fontFamily: "monospace", color: "#7C6AC4", background: "rgba(124,106,196,0.1)", border: "1px solid rgba(124,106,196,0.2)", borderRadius: 3, padding: "1px 6px" }}>{s.slug}</span>
                        </div>
                        <p style={{ fontSize: 12, color: "#666", margin: 0, lineHeight: 1.6 }}>{s.preview}</p>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => setPersonaEditorModal({ persona: { slug: s.slug, name: s.name, body: s.body }, skillType: "voice" })}
                          style={{ background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 5, padding: "5px 10px", color: "#C9A84C", fontSize: 11, cursor: "pointer" }}>
                          Edit
                        </button>
                        <button onClick={async () => {
                          if (!confirm(`Delete skill "${s.name}"?`)) return;
                          await fetch(`/api/marketing/personas/${s.slug}`, { method: "DELETE" });
                          await fetchSkills();
                          showToast("Skill deleted");
                        }}
                          style={{ background: "rgba(201,76,76,0.1)", border: "1px solid rgba(201,76,76,0.3)", borderRadius: 5, padding: "5px 10px", color: "#C94C4C", fontSize: 11, cursor: "pointer" }}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
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
              { label: "From Address (Resend)", key: "smtp_from" as const, placeholder: "outreach@yourdomain.com" },
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

            {/* Test Resend */}
            <div style={{ marginTop: 16, padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Test Email Sending</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={testEmailTo}
                  onChange={e => { setTestEmailTo(e.target.value); setTestEmailResult(null); }}
                  style={{ ...fieldStyle, flex: 1 }}
                />
                <button
                  onClick={async () => {
                    if (!testEmailTo.trim()) return;
                    setTestingEmail(true);
                    setTestEmailResult(null);
                    try {
                      const res = await fetch("/api/marketing/test-email", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ to: testEmailTo.trim() }),
                      });
                      const data = await res.json();
                      setTestEmailResult(res.ok ? { ok: true } : { ok: false, error: data.error });
                    } finally {
                      setTestingEmail(false);
                    }
                  }}
                  disabled={testingEmail || !testEmailTo.trim()}
                  style={{ padding: "7px 14px", background: testingEmail ? "rgba(76,201,142,0.3)" : "linear-gradient(135deg, #4CC98E, #2A7A56)", border: "none", borderRadius: 6, color: "#0D0F14", fontSize: 12, fontWeight: 700, cursor: testingEmail ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
                  {testingEmail ? "Sending..." : "Send Test"}
                </button>
              </div>
              {testEmailResult && (
                <div style={{ marginTop: 8, fontSize: 12, color: testEmailResult.ok ? "#4CC98E" : "#C94C4C" }}>
                  {testEmailResult.ok ? "✓ Delivered — Resend is configured correctly" : `✗ ${testEmailResult.error}`}
                </div>
              )}
            </div>

            <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>API Keys — set in Railway env vars</div>
                <button
                  onClick={async () => { const r = await fetch("/api/marketing/config"); const d = await r.json(); if (d.resend_configured !== undefined) setResendConfigured(d.resend_configured); }}
                  style={{ fontSize: 10, color: "#6B7A99", background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "3px 8px", cursor: "pointer" }}
                >
                  Recheck
                </button>
              </div>
              {["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "RESEND_API_KEY"].map(k => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: "#666" }}>{k}</span>
                  <span style={{ fontSize: 11, color: resendConfigured && k === "RESEND_API_KEY" ? "#4CC98E" : "#C94C4C" }}>
                    {resendConfigured && k === "RESEND_API_KEY" ? "✓ set" : k === "RESEND_API_KEY" ? "✗ not found" : "—"}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 24, padding: "14px 16px", background: "rgba(201,76,76,0.04)", border: "1px solid rgba(201,76,76,0.15)", borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "#C94C4C", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Admin Actions</div>
              <p style={{ fontSize: 12, color: "#666", margin: "0 0 10px" }}>Mark all current leads as Partnership category + Qualified status. Use once to tag government-sourced leads already in the system.</p>
              <button onClick={async () => {
                if (!confirm("This will update ALL leads to category=partnership and status=qualified. Continue?")) return;
                const res = await fetch("/api/marketing/leads/bulk-update", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ set_category: "partnership", set_status: "qualified" }),
                });
                const data = await res.json();
                if (res.ok) { showToast(`Updated ${data.updated} leads`); await fetchLeads(); }
                else showToast(data.error ?? "Failed", "#C94C4C");
              }}
                style={{ padding: "7px 16px", background: "rgba(201,76,76,0.1)", border: "1px solid rgba(201,76,76,0.3)", borderRadius: 6, color: "#C94C4C", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                Mark All Leads: Partnership + Qualified
              </button>
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
