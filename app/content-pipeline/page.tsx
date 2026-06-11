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
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Cleanup timers on unmount
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  const generate = async (rawInput: string, captureMode: CaptureMode) => {
    setError("");
    setProgress(0);
    setProgressLabel("Starting...");
    setView("generating");

    // Kick off progress animation
    PROGRESS_STEPS.forEach(({ label, pct, delay }) => {
      const t = setTimeout(() => {
        setProgressLabel(label);
        setProgress(pct);
      }, delay);
      timersRef.current.push(t);
    });

    try {
      const res = await fetch("/api/content-pipeline/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput, captureMode, brand: "vulnaguard" }),
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

  const reset = () => {
    setContent(null);
    setError("");
    setProgress(0);
    setView("capture");
  };

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-white font-sans">
      {/* Nav */}
      <nav className="border-b border-[#1F2D45] bg-[#111827] h-14 px-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
            <path
              d="M14 2L4 6.5V13C4 18.5 8.5 23.5 14 25C19.5 23.5 24 18.5 24 13V6.5L14 2Z"
              fill="#C9A84C"
              fillOpacity="0.15"
              stroke="#C9A84C"
              strokeWidth="1.5"
            />
            <path
              d="M10 14l2.5 2.5L18 11"
              stroke="#C9A84C"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="font-bold text-sm tracking-wide">
            Vulnaguard <span className="text-[#C9A84C]">Content</span>
          </span>
        </div>
        {view === "dashboard" && (
          <button
            onClick={reset}
            className="text-[#6B7A99] hover:text-white text-xs border border-[#1F2D45] rounded-lg px-3 py-1.5 transition-colors"
            style={{ background: "none", cursor: "pointer" }}
          >
            ← New Post
          </button>
        )}
      </nav>

      {/* Views */}
      {view === "capture" && (
        <CaptureScreen onSubmit={generate} error={error} />
      )}
      {view === "generating" && (
        <GeneratingScreen progress={progress} progressLabel={progressLabel} />
      )}
      {view === "dashboard" && content && (
        <Dashboard content={content} onReset={reset} error={error} />
      )}
    </div>
  );
}
