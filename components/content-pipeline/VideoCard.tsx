"use client";

import { useState } from "react";
import type { VideoBrief } from "@/vulnaguard-marketing-agents/agents/content-pipeline/types";

interface VideoCardProps {
  brief: VideoBrief;
  script: string | null;
  onGenerate: () => void;
  generating: boolean;
}

export function VideoCard({ brief, script, onGenerate, generating }: VideoCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!script) return;
    await navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[#161E2E] border border-[#1F2D45] rounded-xl p-5 col-span-full">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm bg-red-500/10 border border-red-500/20 text-red-500">
          ▶
        </div>
        <span className="text-white font-semibold text-sm">Video Brief</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="bg-[#111827] rounded-lg p-3 border border-[#1F2D45]">
          <div className="text-[#C9A84C] text-xs font-bold uppercase tracking-wider mb-1.5">Hook</div>
          <div className="text-white text-sm leading-relaxed">{brief.hook}</div>
        </div>
        <div className="bg-[#111827] rounded-lg p-3 border border-[#1F2D45]">
          <div className="text-[#C9A84C] text-xs font-bold uppercase tracking-wider mb-1.5">CTA</div>
          <div className="text-white text-sm leading-relaxed">{brief.cta}</div>
        </div>
      </div>

      <div className="bg-[#111827] rounded-lg p-3 border border-[#1F2D45] mb-4">
        <div className="text-[#C9A84C] text-xs font-bold uppercase tracking-wider mb-2">Key Points</div>
        {brief.points.map((p, i) => (
          <div key={i} className="flex gap-2.5 items-start mb-2 last:mb-0">
            <span className="text-[#C9A84C] font-bold text-xs min-w-[16px]">{i + 1}.</span>
            <span className="text-white text-sm leading-relaxed">{p}</span>
          </div>
        ))}
      </div>

      {script ? (
        <div className="space-y-3">
          <div className="bg-[#111827] rounded-lg p-4 border border-[#1F2D45]">
            <div className="text-[#C9A84C] text-xs font-bold uppercase tracking-wider mb-2">
              Speaking Script
            </div>
            <p className="text-white text-base leading-loose whitespace-pre-line font-sans">
              {script}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200"
              style={{
                background: copied ? "#2ECC7122" : "#C9A84C15",
                border: `1px solid ${copied ? "#2ECC7144" : "#C9A84C44"}`,
                color: copied ? "#2ECC71" : "#C9A84C",
              }}
            >
              {copied ? "✓ Copied" : "Copy Script"}
            </button>
            <button
              onClick={onGenerate}
              disabled={generating}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-[#1F2D45] text-[#6B7A99] hover:text-white transition-colors duration-200 disabled:cursor-not-allowed"
              style={{ background: "none" }}
            >
              {generating ? "Regenerating..." : "Regenerate Script"}
            </button>
          </div>
          <div className="text-[#6B7A99] text-xs leading-relaxed px-1">
            Read this on camera, then drop the recording into HyperFrames (or any editor) to produce the final video.
          </div>
        </div>
      ) : (
        <button
          onClick={onGenerate}
          disabled={generating}
          className="w-full py-3 rounded-xl font-bold text-sm transition-all duration-200 disabled:cursor-not-allowed"
          style={{
            background: generating ? "#1F2D45" : "#C9A84C",
            color: generating ? "#6B7A99" : "#0D1B2E",
          }}
        >
          {generating ? "Writing script..." : "Generate Speaking Script"}
        </button>
      )}
    </div>
  );
}
