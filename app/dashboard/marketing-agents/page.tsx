"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities */
import { useState, useCallback } from "react";

const API = "http://localhost:8000";

// ─── Mock data for standalone demo ───────────────────────
const MOCK_STATS = {
  discovered: 12, qualified: 8, disqualified: 4,
  drafted: 6, approved: 2, sent: 3, replied: 1, total: 36,
  recent_runs: [
    { id: 1, agent: "scout", status: "success", leads_processed: 12, started_at: "2026-06-10 09:00:00" },
    { id: 2, agent: "qualifier", status: "success", leads_processed: 8, started_at: "2026-06-10 09:02:00" },
    { id: 3, agent: "copywriter", status: "success", leads_processed: 6, started_at: "2026-06-10 09:05:00" },
  ]
};

const MOCK_PENDING = [
  {
    id: 1, company_name: "Apex Defense Solutions LLC", location: "Huntsville, AL",
    cmmc_level_sought: "Level 2", score: 9, contact_email: "it@apexdefense.example.com",
    contact_name: "Mike Torres", created_at: "2026-06-10 09:05:00",
    emails: [
      { touch_number: 1, subject: "CMMC Level 2 deadline — are you covered?", body: "Mike,\n\nMost defense subcontractors in Huntsville are 6 months from the November 2026 CMMC enforcement date and still running point-in-time assessments.\n\nThat's a problem. If your C3PAO audit finds gaps, you have no time to fix them before contracts are at risk.\n\nVulnaguard Sentinel gives Apex Defense continuous CMMC monitoring — you see your compliance posture daily, not quarterly. Evidence collection is automated, so your next assessment takes days instead of months.\n\nFree security health check (10 min): vulnaguard.com/security-health-check\n\nWorth a look before November.\n\nSean\nVulnaguard" },
      { touch_number: 2, subject: "Re: CMMC coverage for Apex Defense", body: "Mike,\n\nFollowing up on my note last week.\n\n43% of DoD subcontractors who failed their first C3PAO assessment cited inadequate evidence documentation as the primary reason — not technical gaps, paperwork.\n\nSentinel automates that documentation layer. If you're already doing the security work, the audit prep shouldn't be the bottleneck.\n\nStill happy to do the free health check if timing works.\n\nSean" },
      { touch_number: 3, subject: "Last note — Apex Defense + CMMC", body: "Mike,\n\nI'll keep this short — last reach out.\n\nIf CMMC compliance tooling isn't a priority right now, I get it. If that changes before November, vulnaguard.com is there.\n\nGood luck with the certification push.\n\nSean" },
    ],
    linkedin_message: "Hi Mike — saw Apex Defense is pursuing CMMC Level 2. I work with defense subcontractors on continuous compliance monitoring. Would love to connect."
  },
  {
    id: 2, company_name: "TechShield Systems Inc", location: "Tysons Corner, VA",
    cmmc_level_sought: "Level 2", score: 8, contact_email: "cto@techshield.example.com",
    contact_name: "Rachel Kim", created_at: "2026-06-10 09:06:00",
    emails: [
      { touch_number: 1, subject: "TechShield's CMMC posture — quick question", body: "Rachel,\n\nIT services firms supporting DoD primes are in a tough spot with CMMC — you're responsible for your own Level 2 certification, but also need to demonstrate compliance to your prime contractors.\n\nDouble the audit exposure. Half the bandwidth.\n\nVulnaguard Sentinel was built for exactly this: continuous monitoring across your CUI environment with automated evidence collection for both your own assessment and client-facing reporting.\n\nFree health check takes 10 minutes: vulnaguard.com/security-health-check\n\nSean\nVulnaguard" },
      { touch_number: 2, subject: "Re: TechShield CMMC posture", body: "Rachel,\n\nOne more thought on my previous note.\n\nIT services companies tend to have the widest CUI footprint of any subcontractor type — client data, system access, support tooling. That scope makes evidence collection the hardest part of any C3PAO audit.\n\nSentinel maps your existing controls to CMMC domains automatically. Most clients cut their SSP prep time by 60%.\n\nHappy to show you a 15-minute demo if you'd like.\n\nSean" },
      { touch_number: 3, subject: "Closing the loop — TechShield", body: "Rachel,\n\nFinal note from me.\n\nIf CMMC tooling moves up the priority list before November, I'd love to help. If not, best of luck with the certification.\n\nvulnaguard.com when you're ready.\n\nSean" },
    ],
    linkedin_message: "Hi Rachel — noticed TechShield is working toward CMMC Level 2. We help IT services firms supporting DoD primes streamline their compliance monitoring. Would be great to connect."
  },
  {
    id: 3, company_name: "BlueStar Federal Group", location: "San Antonio, TX",
    cmmc_level_sought: "Level 1", score: 7, contact_email: "",
    contact_name: "", created_at: "2026-06-10 09:07:00",
    emails: [
      { touch_number: 1, subject: "CMMC Level 1 — is BlueStar covered?", body: "Hi BlueStar Federal team,\n\nLogistics and supply chain subcontractors often underestimate CMMC Level 1 scope — it applies to any system that processes FCI, not just CUI.\n\nVulnaguard Sentinel's free security health check identifies your Level 1 exposure in under 10 minutes.\n\nvulnaguard.com/security-health-check\n\nSean\nVulnaguard" },
      { touch_number: 2, subject: "Re: BlueStar CMMC Level 1", body: "Following up on my previous note about CMMC Level 1 coverage for BlueStar.\n\nLevel 1 self-attestation requirements tightened significantly in 2025 — the annual affirmation now requires documented evidence that all 17 practices are in place.\n\nSentinel makes that documentation automatic. Worth 10 minutes to check your posture.\n\nSean" },
      { touch_number: 3, subject: "Last note — BlueStar Federal", body: "Last outreach from me.\n\nIf CMMC compliance tooling becomes relevant for BlueStar Federal, vulnaguard.com is there.\n\nGood luck with your contracts.\n\nSean" },
    ],
    linkedin_message: "Hi — saw BlueStar Federal Group is pursuing CMMC Level 1. We help defense logistics subcontractors with automated compliance monitoring. Would love to connect."
  },
];

const MOCK_LEADS = [
  { id: 1, company_name: "Apex Defense Solutions LLC", status: "drafted", score: 9, location: "Huntsville, AL", cmmc_level_sought: "Level 2", contact_email: "it@apexdefense.example.com" },
  { id: 2, company_name: "TechShield Systems Inc", status: "drafted", score: 8, location: "Tysons Corner, VA", cmmc_level_sought: "Level 2", contact_email: "cto@techshield.example.com" },
  { id: 3, company_name: "BlueStar Federal Group", status: "drafted", score: 7, location: "San Antonio, TX", cmmc_level_sought: "Level 1", contact_email: "" },
  { id: 4, company_name: "Precision Defense Corp", status: "qualified", score: 8, location: "Baltimore, MD", cmmc_level_sought: "Level 2", contact_email: "" },
  { id: 5, company_name: "Orion Systems LLC", status: "sent", score: 7, location: "Dayton, OH", cmmc_level_sought: "Level 2", contact_email: "ops@orion.example.com" },
  { id: 6, company_name: "NovaTech Federal", status: "replied", score: 9, location: "Arlington, VA", cmmc_level_sought: "Level 2", contact_email: "it@novatech.example.com" },
  { id: 7, company_name: "Midwest Defense Parts", status: "disqualified", score: 3, location: "Detroit, MI", cmmc_level_sought: "Unknown", contact_email: "" },
];

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

const PROVIDER_MODELS: Record<string, string[]> = {
  claude: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-6"],
  openai: ["gpt-4o-mini", "gpt-4o"],
};

// ─── Components ───────────────────────────────────────────
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
            <Badge label={seq.cmmc_level_sought} color="#4C8EC9" />
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

// ─── Main Dashboard ───────────────────────────────────────
export default function MarketingAgentDashboard() {
  const [tab, setTab] = useState("approval");
  const [stats, setStats] = useState(MOCK_STATS);
  const [pending, setPending] = useState(MOCK_PENDING);
  const [leads, setLeads] = useState(MOCK_LEADS);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<{ msg: string; color: string } | null>(null);
  const [provider, setProvider] = useState("claude");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [leadFilter, setLeadFilter] = useState("all");
  const [useMock, setUseMock] = useState(true);

  const showToast = (msg: string, color: string = "#4CC98E") => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 3500);
  };

  const apiCall = useCallback(async (path: string, method: string = "GET", body: any = null) => {
    if (useMock) return null;
    const res = await fetch(`${API}${path}`, {
      method, headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : null,
    });
    return res.json();
  }, [useMock]);

  const runPipeline = async () => {
    setRunning(true);
    showToast("Pipeline running: Scout → Qualify → Write...", "#C9A84C");
    await apiCall("/api/pipeline/run", "POST");
    setTimeout(() => { setRunning(false); showToast("Pipeline complete — sequences ready for review"); }, useMock ? 3000 : 10000);
  };

  const runSend = async () => {
    setRunning(true);
    await apiCall("/api/pipeline/send", "POST");
    showToast("Send run started — approved emails dispatching via SMTP");
    setTimeout(() => setRunning(false), 2000);
  };

  const toggleProvider = async (p: string) => {
    setProvider(p);
    setModel(PROVIDER_MODELS[p][1]);
    await apiCall("/api/config/provider", "POST", { provider: p, tier: "balanced" });
    showToast(`Switched to ${p === "claude" ? "Claude Sonnet" : "GPT-4o"}`, p === "claude" ? "#C9A84C" : "#74aa9c");
  };

  const approveOne = (id: number) => {
    setPending(p => p.filter(s => s.id !== id));
    setSelected(s => { const n = new Set(s); n.delete(id); return n; });
    apiCall("/api/approval/approve", "POST", { sequence_ids: [id] });
    showToast("Sequence approved — queued for send");
    setStats(s => ({ ...s, approved: s.approved + 1, drafted: Math.max(0, s.drafted - 1) }));
  };

  const rejectOne = (id: number) => {
    setPending(p => p.filter(s => s.id !== id));
    setSelected(s => { const n = new Set(s); n.delete(id); return n; });
    apiCall("/api/approval/reject", "POST", { sequence_ids: [id] });
    showToast("Sequence rejected", "#C94C4C");
  };

  const approveSelected = () => {
    const ids = [...selected];
    ids.forEach(id => { setPending(p => p.filter(s => s.id !== id)); });
    setSelected(new Set());
    apiCall("/api/approval/approve", "POST", { sequence_ids: ids });
    showToast(`${ids.length} sequences approved`);
    setStats(s => ({ ...s, approved: s.approved + ids.length, drafted: Math.max(0, s.drafted - ids.length) }));
  };

  const selectAll = () => {
    if (selected.size === pending.length) setSelected(new Set());
    else setSelected(new Set(pending.map(s => s.id)));
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

          <select value={model} onChange={e => setModel(e.target.value)}
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "5px 10px", color: "#aaa", fontSize: 11, outline: "none", cursor: "pointer" }}>
            {PROVIDER_MODELS[provider].map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <button onClick={runPipeline} disabled={running}
            style={{ background: running ? "rgba(201,168,76,0.2)" : "linear-gradient(135deg, #C9A84C, #8B6914)", border: "none", borderRadius: 6, padding: "6px 14px", color: running ? "#666" : "#0D0F14", fontSize: 12, fontWeight: 700, cursor: running ? "not-allowed" : "pointer" }}>
            {running ? "Running..." : "⚡ Run Pipeline"}
          </button>

          <div style={{ width: 7, height: 7, borderRadius: "50%", background: running ? "#C9A84C" : "#4CC98E", boxShadow: `0 0 6px ${running ? "#C9A84C" : "#4CC98E"}` }} />
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
                <div style={{ fontSize: 12, marginTop: 6, color: "#333" }}>Run the pipeline to generate new sequences</div>
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
            <p style={{ fontSize: 12, color: "#666", marginBottom: 20 }}>Run agents individually or trigger the full sequence.</p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              {[
                { label: "Full Pipeline", desc: "Scout → Qualify → Write → Await approval", action: runPipeline, color: "#C9A84C" },
                { label: "Send Approved", desc: "Dispatch all approved sequences via SMTP", action: runSend, color: "#4CC98E" },
              ].map(a => (
                <button key={a.label} onClick={a.action} disabled={running}
                  style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${a.color}33`, borderRadius: 10, padding: "18px", textAlign: "left", cursor: running ? "not-allowed" : "pointer", opacity: running ? 0.5 : 1, transition: "all 0.15s" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: a.color, marginBottom: 6 }}>{a.label}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>{a.desc}</div>
                </button>
              ))}
            </div>

            <div>
              <div style={{ fontSize: 11, color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Recent Runs</div>
              {stats.recent_runs.map(run => (
                <div key={run.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 7, marginBottom: 6 }}>
                  <Badge label={run.agent} color="#4C8EC9" />
                  <Badge label={run.status} color={run.status === "success" ? "#4CC98E" : "#C94C4C"} />
                  <span style={{ fontSize: 12, color: "#666" }}>{run.leads_processed} leads</span>
                  <span style={{ fontSize: 11, color: "#444", marginLeft: "auto" }}>{run.started_at}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Leads ── */}
        {tab === "leads" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Lead Pipeline</h2>
              <div style={{ display: "flex", gap: 6 }}>
                {["all", "qualified", "drafted", "sent", "replied", "disqualified"].map(s => (
                  <button key={s} onClick={() => setLeadFilter(s)}
                    style={{ padding: "4px 10px", fontSize: 11, border: `1px solid ${leadFilter === s ? "rgba(201,168,76,0.5)" : "rgba(255,255,255,0.1)"}`, borderRadius: 5, background: leadFilter === s ? "rgba(201,168,76,0.1)" : "transparent", color: leadFilter === s ? "#C9A84C" : "#666", cursor: "pointer", textTransform: "capitalize" }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["Company", "Status", "Score", "CMMC Level", "Location", "Email"].map(h => (
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
                      <td style={{ padding: "10px 12px", color: "#888" }}>{lead.cmmc_level_sought}</td>
                      <td style={{ padding: "10px 12px", color: "#666" }}>{lead.location}</td>
                      <td style={{ padding: "10px 12px", color: lead.contact_email ? "#4CC98E" : "#444", fontSize: 11 }}>
                        {lead.contact_email || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Settings ── */}
        {tab === "settings" && (
          <div style={{ maxWidth: 560 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Agent Configuration</h2>
            <p style={{ fontSize: 12, color: "#666", marginBottom: 20 }}>Configure pipeline behavior, sending limits, and API connections.</p>

            {[
              { label: "LLM Provider", key: "llm_provider", value: provider, type: "display" },
              { label: "Active Model", key: "model", value: model, type: "display" },
              { label: "Min Qualification Score", key: "qualifier_min_score", placeholder: "6", type: "input" },
              { label: "Daily Send Limit", key: "daily_send_limit", placeholder: "50", type: "input" },
              { label: "Approval Batch Size", key: "batch_size", placeholder: "10", type: "input" },
              { label: "SMTP Host", key: "smtp_host", placeholder: "smtp.yourdomain.com", type: "input" },
              { label: "Sender Email", key: "smtp_from", placeholder: "outreach@vulnaguard.com", type: "input" },
            ].map(setting => (
              <div key={setting.key} style={{ marginBottom: 14, padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{setting.label}</div>
                {setting.type === "display"
                  ? <div style={{ fontSize: 13, color: "#C9A84C", fontFamily: "monospace" }}>{setting.value}</div>
                  : <input placeholder={setting.placeholder} style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "6px 10px", color: "#ccc", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                }
              </div>
            ))}

            <button onClick={() => showToast("Settings saved")}
              style={{ marginTop: 8, width: "100%", padding: "10px", background: "linear-gradient(135deg, #C9A84C, #8B6914)", border: "none", borderRadius: 8, color: "#0D0F14", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Save Settings
            </button>

            <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>API Keys — set in .env file</div>
              {["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "APIFY_API_KEY", "SMTP_PASSWORD"].map(k => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: "#666" }}>{k}</span>
                  <span style={{ fontSize: 11, color: "#4CC98E" }}>✓ set</span>
                </div>
              ))}
            </div>
          </div>
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
