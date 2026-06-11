"use client";

import type { VideoBrief } from "@/vulnaguard-marketing-agents/agents/content-pipeline/types";

interface VideoCardProps {
  brief: VideoBrief;
  hyperframesResult: string | null;
  onGenerate: () => void;
  generating: boolean;
}

export function VideoCard({ brief, hyperframesResult, onGenerate, generating }: VideoCardProps) {
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

      {hyperframesResult ? (
        <div className="text-green-400 text-sm p-3 bg-green-400/10 rounded-lg border border-green-400/20">
          ✓ Video project created in HyperFrames. Open HyperFrames to preview and render.
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
          {generating ? "Creating HyperFrames project..." : "Generate Video with HyperFrames →"}
        </button>
      )}
    </div>
  );
}
