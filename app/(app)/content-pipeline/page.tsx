"use client";

import { useState, useEffect, useRef } from "react";
import { CaptureScreen } from "@/components/content-pipeline/CaptureScreen";
import { GeneratingScreen } from "@/components/content-pipeline/GeneratingScreen";
import { Dashboard } from "@/components/content-pipeline/Dashboard";
import type {
  CaptureMode,
  ContentPipelineRecord,
} from "@/vulnaguard-marketing-agents/agents/content-pipeline/types";

type View = "capture" | "generating" | "dashboard";
interface VoiceSkill { slug: string; name: string; body: string }

const PROGRESS_STEPS = [
  { label: "Extracting core idea...", pct: 20, delay: 600 },
  { label: "Writing platform posts...", pct: 50, delay: 1400 },
  { label: "Building video brief...", pct: 75, delay: 2400 },
  { label: "Finalizing content...", pct: 90, delay: 3200 },
];

export default function ContentPipelinePage() {
  const [view, setView] = useState<View>("capture");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [content, setContent] = useState<ContentPipelineRecord | null>(null);
  const [error, setError] = useState("");
  const [voiceSkillSlug, setVoiceSkillSlug] = useState<string | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Provider toggle
  const [provider, setProvider] = useState<"openai" | "claude">("openai");
  const [providerLoading, setProviderLoading] = useState(false);

  // Voice skills modal
  const [showVoiceSkills, setShowVoiceSkills] = useState(false);
  const [voiceSkills, setVoiceSkills] = useState<VoiceSkill[]>([]);
  const [vsLoading, setVsLoading] = useState(false);
  const [vsEditSlug, setVsEditSlug] = useState<string | null>(null);
  const [vsForm, setVsForm] = useState({ name: "", body: "" });
  const [vsFormOpen, setVsFormOpen] = useState(false);
  const [vsFormSaving, setVsFormSaving] = useState(false);
  const [vsFormError, setVsFormError] = useState("");

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  // Load provider setting
  useEffect(() => {
    fetch("/api/settings/ai-provider")
      .then(r => r.json())
      .then(d => {
        const cfg = (d.configs as Array<{agent_name:string;provider:string}>|undefined)
          ?.find(c => c.agent_name === "content-pipeline");
        if (cfg?.provider === "openai" || cfg?.provider === "claude") setProvider(cfg.provider);
      })
      .catch(() => {});
  }, []);

  // Listen for openVoiceSkills event from CaptureScreen
  useEffect(() => {
    const handler = () => { setShowVoiceSkills(true); loadVoiceSkills(); };
    window.addEventListener("openVoiceSkills", handler);
    return () => window.removeEventListener("openVoiceSkills", handler);
  }, []);

  const toggleProvider = async () => {
    const next: "openai" | "claude" = provider === "openai" ? "claude" : "openai";
    setProviderLoading(true);
    try {
      await fetch("/api/settings/ai-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_name: "content-pipeline", provider: next, model: next === "openai" ? "gpt-4.1" : "claude-sonnet-4-6" }),
      });
      setProvider(next);
    } catch { /* ignore */ } finally {
      setProviderLoading(false);
    }
  };

  const loadVoiceSkills = async () => {
    setVsLoading(true);
    try {
      const r = await fetch("/api/marketing/personas?type=voice");
      const d = await r.json();
      setVoiceSkills(d.personas ?? []);
    } catch { /* ignore */ } finally {
      setVsLoading(false);
    }
  };

  const openVsModal = () => { setShowVoiceSkills(true); loadVoiceSkills(); };
  const closeVsModal = () => { setShowVoiceSkills(false); setVsFormOpen(false); setVsFormError(""); };

  const openNewSkillForm = () => {
    setVsEditSlug(null);
    setVsForm({ name: "", body: "" });
    setVsFormError("");
    setVsFormOpen(true);
  };

  const openEditSkillForm = (skill: VoiceSkill) => {
    setVsEditSlug(skill.slug);
    setVsForm({ name: skill.name, body: skill.body });
    setVsFormError("");
    setVsFormOpen(true);
  };

  const saveSkill = async () => {
    if (!vsForm.name.trim() || !vsForm.body.trim()) { setVsFormError("Name and body are required."); return; }
    setVsFormSaving(true);
    setVsFormError("");
    try {
      const res = await fetch("/api/marketing/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: vsEditSlug ?? undefined, name: vsForm.name, body: vsForm.body, skill_type: "voice" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setVsFormOpen(false);
      loadVoiceSkills();
    } catch (e: any) {
      setVsFormError(e.message ?? "Save failed.");
    } finally {
      setVsFormSaving(false);
    }
  };

  const deleteSkill = async (slug: string) => {
    if (!confirm("Delete this voice skill?")) return;
    try {
      await fetch(`/api/marketing/personas/${slug}`, { method: "DELETE" });
      loadVoiceSkills();
    } catch { /* ignore */ }
  };

  const generate = async (rawInput: string, captureMode: CaptureMode, skillSlug: string | null) => {
    setVoiceSkillSlug(skillSlug);
    setError("");
    setProgress(0);
    setProgressLabel("Starting...");
    setView("generating");

    PROGRESS_STEPS.forEach(({ label, pct, delay }) => {
      const t = setTimeout(() => { setProgressLabel(label); setProgress(pct); }, delay);
      timersRef.current.push(t);
    });

    try {
      const res = await fetch("/api/content-pipeline/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput, captureMode, brand: "vulnaguard", voiceSkillSlug: skillSlug }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");

      setProgress(100);
      setProgressLabel("Done.");
      setContent(data.record);

      const t = setTimeout(() => setView("dashboard"), 400);
      timersRef.current.push(t);
    } catch (err: any) {
      timersRef.current.forEach(clearTimeout);
      setError(err.message ?? "Something went wrong. Please try again.");
      setView("capture");
    }
  };

  const reset = () => { setContent(null); setError(""); setProgress(0); setVoiceSkillSlug(null); setView("capture"); };

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-white font-sans">
      {/* Nav */}
      <nav className="border-b border-[#1F2D45] bg-[#111827] h-14 px-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
            <path d="M14 2L4 6.5V13C4 18.5 8.5 23.5 14 25C19.5 23.5 24 18.5 24 13V6.5L14 2Z" fill="#C9A84C" fillOpacity="0.15" stroke="#C9A84C" strokeWidth="1.5" />
            <path d="M10 14l2.5 2.5L18 11" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-bold text-sm tracking-wide">
            Vulnaguard <span className="text-[#C9A84C]">Content</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Voice skills manager */}
          <button
            onClick={openVsModal}
            style={{ fontSize: 12, color: "#6B7A99", background: "none", border: "1px solid #1F2D45", borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}
          >
            Voice Skills
          </button>
          {/* AI provider toggle */}
          <button
            onClick={toggleProvider}
            disabled={providerLoading}
            title={`Switch AI provider (current: ${provider})`}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 8,
              background: "#C9A84C15", border: "1px solid #C9A84C44",
              color: "#C9A84C", cursor: providerLoading ? "not-allowed" : "pointer",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: provider === "openai" ? "#10B981" : "#A78BFA", display: "inline-block" }} />
            {provider === "openai" ? "OpenAI" : "Claude"}
          </button>
          {view === "dashboard" && (
            <button
              onClick={reset}
              style={{ fontSize: 12, color: "#6B7A99", background: "none", border: "1px solid #1F2D45", borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}
            >
              ← New Post
            </button>
          )}
        </div>
      </nav>

      {view === "capture" && <CaptureScreen onSubmit={generate} error={error} />}
      {view === "generating" && <GeneratingScreen progress={progress} progressLabel={progressLabel} />}
      {view === "dashboard" && content && <Dashboard content={content} onReset={reset} error={error} voiceSkillSlug={voiceSkillSlug} />}

      {/* Voice Skills Modal */}
      {showVoiceSkills && (
        <div
          onClick={e => { if (e.target === e.currentTarget) closeVsModal(); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div style={{ background: "#111827", border: "1px solid #1F2D45", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #1F2D45" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#fff" }}>Voice Skills</h2>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6B7A99" }}>Define how your content sounds. Injected into AI prompts at generation time.</p>
              </div>
              <button onClick={closeVsModal} style={{ background: "none", border: "none", color: "#6B7A99", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>

            <div style={{ overflowY: "auto", flex: 1, padding: "16px 20px" }}>
              {vsFormOpen ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#fff" }}>{vsEditSlug ? "Edit Skill" : "New Voice Skill"}</h3>
                  <input
                    placeholder="Skill name (e.g. Sean's Voice — Vulnaguard)"
                    value={vsForm.name}
                    onChange={e => setVsForm(f => ({ ...f, name: e.target.value }))}
                    style={{ background: "#0B0F1A", border: "1px solid #1F2D45", borderRadius: 8, color: "#fff", fontSize: 13, padding: "9px 12px", outline: "none" }}
                  />
                  <textarea
                    placeholder="Paste your voice/tone guidelines here — personality, writing rules, examples of your style..."
                    value={vsForm.body}
                    onChange={e => setVsForm(f => ({ ...f, body: e.target.value }))}
                    style={{ background: "#0B0F1A", border: "1px solid #1F2D45", borderRadius: 8, color: "#fff", fontSize: 12, padding: "9px 12px", outline: "none", minHeight: 240, resize: "vertical", fontFamily: "monospace", lineHeight: 1.5 }}
                  />
                  {vsFormError && <p style={{ margin: 0, color: "#f87171", fontSize: 12 }}>{vsFormError}</p>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={saveSkill}
                      disabled={vsFormSaving}
                      style={{ flex: 1, padding: "9px 0", borderRadius: 8, fontWeight: 700, fontSize: 13, border: "none", background: "#C9A84C", color: "#0D1B2E", cursor: vsFormSaving ? "not-allowed" : "pointer" }}
                    >
                      {vsFormSaving ? "Saving…" : "Save Skill"}
                    </button>
                    <button onClick={() => setVsFormOpen(false)} style={{ padding: "9px 18px", borderRadius: 8, fontSize: 13, background: "none", border: "1px solid #1F2D45", color: "#6B7A99", cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    onClick={openNewSkillForm}
                    style={{ width: "100%", marginBottom: 14, padding: "9px 0", borderRadius: 8, fontWeight: 700, fontSize: 13, border: "1px dashed #1F2D45", background: "none", color: "#C9A84C", cursor: "pointer" }}
                  >
                    + New Voice Skill
                  </button>
                  {vsLoading ? (
                    <p style={{ color: "#6B7A99", fontSize: 13, textAlign: "center" }}>Loading…</p>
                  ) : voiceSkills.length === 0 ? (
                    <p style={{ color: "#6B7A99", fontSize: 13, textAlign: "center" }}>No voice skills yet. Create one above.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {voiceSkills.map(skill => (
                        <div key={skill.slug} style={{ background: "#0B0F1A", border: "1px solid #1F2D45", borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: "#fff", fontSize: 13, marginBottom: 3 }}>{skill.name}</div>
                            <div style={{ color: "#6B7A99", fontSize: 11, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                              {skill.body.split("\n").filter(l => !l.startsWith("#") && l.trim()).join(" ").slice(0, 120)}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            <button onClick={() => openEditSkillForm(skill)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "none", border: "1px solid #1F2D45", color: "#6B7A99", cursor: "pointer" }}>Edit</button>
                            <button onClick={() => deleteSkill(skill.slug)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "none", border: "1px solid #C0392B44", color: "#f87171", cursor: "pointer" }}>Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
