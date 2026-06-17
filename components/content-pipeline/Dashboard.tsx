"use client";

import { useState } from "react";
import { PlatformCard } from "./PlatformCard";
import { VideoCard } from "./VideoCard";
import type { ContentPipelineRecord } from "@/vulnaguard-marketing-agents/agents/content-pipeline/types";

interface DashboardProps {
  content: ContentPipelineRecord;
  onReset: () => void;
  error: string;
  voiceSkillSlug?: string | null;
}

const PLATFORMS = ["linkedin", "instagram", "facebook", "youtube_desc", "youtube_short"] as const;

export function Dashboard({ content, onReset, error, voiceSkillSlug }: DashboardProps) {
  const [tab, setTab] = useState<"text" | "video" | "hyperframes">("text");
  const [posts, setPosts] = useState<Record<string, string>>({
    linkedin: content.linkedin,
    instagram: content.instagram,
    facebook: content.facebook,
    youtube_desc: content.youtube_desc,
    youtube_short: content.youtube_short,
  });
  const [discarded, setDiscarded] = useState<Record<string, boolean>>({});
  const [script, setScript] = useState<string | null>(content.video_script ?? null);
  const [scriptGenerating, setScriptGenerating] = useState(false);
  const [scriptError, setScriptError] = useState("");

  // HyperFrames state
  const [hfPrompt, setHfPrompt] = useState<string | null>(content.hyperframes_prompt ?? null);
  const [hfGenerating, setHfGenerating] = useState(false);
  const [hfError, setHfError] = useState("");
  const [hfCopied, setHfCopied] = useState(false);

  const visiblePosts = PLATFORMS.filter((p) => !discarded[p]);

  const generateScript = async () => {
    setScriptGenerating(true);
    setScriptError("");
    try {
      const res = await fetch("/api/content-pipeline/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: content.id,
          brief: content.video_brief,
          coreIdea: content.core_idea,
          brand: content.brand,
          voiceSkillSlug: voiceSkillSlug ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setScript(data.script);
    } catch (err: any) {
      setScriptError(err.message ?? "Script generation failed.");
    } finally {
      setScriptGenerating(false);
    }
  };

  const generateHyperFrames = async () => {
    setHfGenerating(true);
    setHfError("");
    try {
      const res = await fetch("/api/content-pipeline/hyperframes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record_id: content.id, voice_skill_slug: voiceSkillSlug ?? null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setHfPrompt(data.prompt);
    } catch (err: any) {
      setHfError(err.message ?? "HyperFrames prompt generation failed.");
    } finally {
      setHfGenerating(false);
    }
  };

  const copyHfPrompt = async () => {
    if (!hfPrompt) return;
    try {
      await navigator.clipboard.writeText(hfPrompt);
      setHfCopied(true);
      setTimeout(() => setHfCopied(false), 2000);
    } catch {
      // fallback — select the textarea
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Core idea banner */}
      <div className="bg-[#C9A84C11] border border-[#C9A84C33] rounded-xl px-4 py-3 mb-6 flex items-start gap-3">
        <span className="text-[#C9A84C] text-base mt-0.5">💡</span>
        <p className="text-[#C9A84C] text-sm leading-relaxed">{content.core_idea}</p>
      </div>

      {/* Tabs + reset */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2 flex-wrap">
          {(["text", "video", "hyperframes"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200"
              style={{
                border: `1px solid ${tab === t ? "#C9A84C" : "#1F2D45"}`,
                background: tab === t ? "#C9A84C15" : "none",
                color: tab === t ? "#C9A84C" : "#6B7A99",
                cursor: "pointer",
              }}
            >
              {t === "text" ? "Text Posts" : t === "video" ? "Video" : "HyperFrames"}
            </button>
          ))}
        </div>
        <button
          onClick={onReset}
          className="text-[#6B7A99] hover:text-white text-sm border border-[#1F2D45] rounded-lg px-3.5 py-1.5 transition-colors duration-200"
          style={{ background: "none", cursor: "pointer" }}
        >
          ← New Post
        </button>
      </div>

      {error && (
        <div className="mb-4 text-red-400 text-sm px-3.5 py-2.5 bg-red-500/10 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      {tab === "text" && (
        visiblePosts.length === 0 ? (
          <div className="text-center text-[#6B7A99] py-16 text-sm">
            All posts discarded.{" "}
            <button onClick={onReset} className="text-[#C9A84C] font-semibold" style={{ background: "none", border: "none", cursor: "pointer" }}>
              Start a new one →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {visiblePosts.map((platform) => (
              <PlatformCard
                key={platform}
                platform={platform}
                content={posts[platform]}
                onEdit={(val) => setPosts((p) => ({ ...p, [platform]: val }))}
                onDiscard={() => setDiscarded((d) => ({ ...d, [platform]: true }))}
              />
            ))}
          </div>
        )
      )}

      {tab === "video" && (
        <div>
          {scriptError && (
            <div className="mb-4 text-red-400 text-sm px-3.5 py-2.5 bg-red-500/10 rounded-lg border border-red-500/20">
              {scriptError}
            </div>
          )}
          <VideoCard
            brief={content.video_brief}
            script={script}
            onGenerate={generateScript}
            generating={scriptGenerating}
          />
        </div>
      )}

      {tab === "hyperframes" && (
        <div>
          {hfError && (
            <div className="mb-4 text-red-400 text-sm px-3.5 py-2.5 bg-red-500/10 rounded-lg border border-red-500/20">
              {hfError}
            </div>
          )}

          <div style={{ background: "#111827", border: "1px solid #1F2D45", borderRadius: 16, padding: 24 }}>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ color: "#fff", fontWeight: 700, fontSize: 16, margin: 0 }}>HyperFrames Prompt Generator</h2>
              <p style={{ color: "#6B7A99", fontSize: 13, marginTop: 6 }}>
                Generates a ready-to-run Claude Code prompt. Paste it into your Claude Code session to build the video composition.
              </p>
            </div>

            {/* Video brief summary */}
            <div style={{ background: "#0B0F1A", border: "1px solid #1F2D45", borderRadius: 8, padding: "12px 14px", marginBottom: 18, fontSize: 13, color: "#9BABBF", lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, color: "#C9A84C", marginBottom: 4 }}>Hook</div>
              <div style={{ marginBottom: 8 }}>{content.video_brief.hook}</div>
              <div style={{ fontWeight: 600, color: "#C9A84C", marginBottom: 4 }}>Key Points</div>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                {content.video_brief.points.map((pt, i) => <li key={i}>{pt}</li>)}
              </ol>
              {content.video_brief.cta && (
                <>
                  <div style={{ fontWeight: 600, color: "#C9A84C", marginTop: 8, marginBottom: 4 }}>CTA</div>
                  <div>{content.video_brief.cta}</div>
                </>
              )}
            </div>

            {!hfPrompt ? (
              <button
                onClick={generateHyperFrames}
                disabled={hfGenerating}
                style={{
                  padding: "12px 24px", borderRadius: 10, fontWeight: 700, fontSize: 14, border: "none",
                  background: hfGenerating ? "#1F2D45" : "#C9A84C",
                  color: hfGenerating ? "#6B7A99" : "#0D1B2E",
                  cursor: hfGenerating ? "not-allowed" : "pointer",
                }}
              >
                {hfGenerating ? "Generating…" : "Generate HyperFrames Prompt"}
              </button>
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: "#6B7A99", textTransform: "uppercase", letterSpacing: "0.08em" }}>Generated Prompt</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={copyHfPrompt}
                      style={{
                        padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "none",
                        background: hfCopied ? "#22543D" : "#C9A84C22",
                        color: hfCopied ? "#68D391" : "#C9A84C",
                        cursor: "pointer",
                      }}
                    >
                      {hfCopied ? "Copied!" : "Copy Prompt"}
                    </button>
                    <button
                      onClick={generateHyperFrames}
                      disabled={hfGenerating}
                      style={{
                        padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: "none", border: "1px solid #1F2D45", color: "#6B7A99",
                        cursor: hfGenerating ? "not-allowed" : "pointer",
                      }}
                    >
                      {hfGenerating ? "Regenerating…" : "Regenerate"}
                    </button>
                  </div>
                </div>
                <pre
                  style={{
                    background: "#0B0F1A", border: "1px solid #1F2D45", borderRadius: 8,
                    padding: "14px", color: "#C9D1D9", fontSize: 12, lineHeight: 1.6,
                    overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
                    maxHeight: 500, overflowY: "auto", margin: 0, fontFamily: "monospace",
                  }}
                >
                  {hfPrompt}
                </pre>
                <p style={{ marginTop: 10, fontSize: 11, color: "#4A5568", lineHeight: 1.5 }}>
                  Copy this prompt, open your Claude Code session, and paste it to build the HyperFrames video composition locally.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
