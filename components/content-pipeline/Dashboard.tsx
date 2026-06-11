"use client";

import { useState } from "react";
import { PlatformCard } from "./PlatformCard";
import { VideoCard } from "./VideoCard";
import type { ContentPipelineRecord } from "@/vulnaguard-marketing-agents/agents/content-pipeline/types";

interface DashboardProps {
  content: ContentPipelineRecord;
  onReset: () => void;
  error: string;
}

const PLATFORMS = ["linkedin", "instagram", "facebook", "youtube_desc", "youtube_short"] as const;

export function Dashboard({ content, onReset, error }: DashboardProps) {
  const [tab, setTab] = useState<"text" | "video">("text");
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

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Core idea banner */}
      <div className="bg-[#C9A84C11] border border-[#C9A84C33] rounded-xl px-4 py-3 mb-6 flex items-start gap-3">
        <span className="text-[#C9A84C] text-base mt-0.5">💡</span>
        <p className="text-[#C9A84C] text-sm leading-relaxed">{content.core_idea}</p>
      </div>

      {/* Tabs + reset */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2">
          {(["text", "video"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 capitalize"
              style={{
                border: `1px solid ${tab === t ? "#C9A84C" : "#1F2D45"}`,
                background: tab === t ? "#C9A84C15" : "none",
                color: tab === t ? "#C9A84C" : "#6B7A99",
                cursor: "pointer",
              }}
            >
              {t === "text" ? "Text Posts" : "Video"}
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
    </div>
  );
}
