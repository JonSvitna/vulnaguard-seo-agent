"use client";

import { useState } from "react";

const PLATFORM_LIMITS: Record<string, number> = {
  linkedin: 3000,
  instagram: 2200,
  facebook: 63206,
  youtube_desc: 5000,
  youtube_short: 500,
};

const PLATFORM_META: Record<string, { label: string; icon: string; color: string }> = {
  linkedin: { label: "LinkedIn", icon: "in", color: "#0077B5" },
  instagram: { label: "Instagram", icon: "IG", color: "#E1306C" },
  facebook: { label: "Facebook", icon: "f", color: "#1877F2" },
  youtube_desc: { label: "YouTube Description", icon: "▶", color: "#FF0000" },
  youtube_short: { label: "YouTube Shorts Script", icon: "⚡", color: "#FF0000" },
};

interface PlatformCardProps {
  platform: string;
  content: string;
  onEdit: (val: string) => void;
  onDiscard: () => void;
}

export function PlatformCard({ platform, content, onEdit, onDiscard }: PlatformCardProps) {
  const [copied, setCopied] = useState(false);
  const meta = PLATFORM_META[platform];
  const limit = PLATFORM_LIMITS[platform];
  const count = content.length;
  const pct = Math.min((count / limit) * 100, 100);
  const over = count > limit;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[#161E2E] border border-[#1F2D45] rounded-xl p-5 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold font-mono"
            style={{ background: meta.color + "22", border: `1px solid ${meta.color}44`, color: meta.color }}
          >
            {meta.icon}
          </div>
          <span className="text-white font-semibold text-sm">{meta.label}</span>
        </div>
        <button
          onClick={onDiscard}
          className="text-[#6B7A99] hover:text-white text-lg leading-none px-1.5 py-0.5 rounded"
          title="Discard"
        >
          ×
        </button>
      </div>

      {/* Editable content */}
      <textarea
        value={content}
        onChange={(e) => onEdit(e.target.value)}
        className="bg-[#111827] border border-[#1F2D45] rounded-lg text-white text-sm leading-relaxed p-3 resize-y min-h-[140px] w-full outline-none focus:border-[#C9A84C44] font-sans"
      />

      {/* Footer */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1">
          <div className="h-[3px] bg-[#1F2D45] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${pct}%`,
                background: over ? "#C0392B" : pct > 85 ? "#F39C12" : "#C9A84C",
              }}
            />
          </div>
          <span className={`text-xs mt-1 block ${over ? "text-red-500" : "text-[#6B7A99]"}`}>
            {count.toLocaleString()} / {limit.toLocaleString()} chars
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 whitespace-nowrap"
          style={{
            background: copied ? "#2ECC7122" : "#C9A84C15",
            border: `1px solid ${copied ? "#2ECC7144" : "#C9A84C44"}`,
            color: copied ? "#2ECC71" : "#C9A84C",
          }}
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
