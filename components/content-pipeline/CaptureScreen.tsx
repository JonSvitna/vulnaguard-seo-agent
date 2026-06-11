"use client";

import { useRef, useState, useCallback } from "react";
import type { CaptureMode } from "@/vulnaguard-marketing-agents/agents/content-pipeline/types";

interface CaptureScreenProps {
  onSubmit: (input: string, mode: CaptureMode) => void;
  error: string;
}

export function CaptureScreen({ onSubmit, error }: CaptureScreenProps) {
  const [tab, setTab] = useState<CaptureMode>("type");
  const [textInput, setTextInput] = useState("");
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoContext, setVideoContext] = useState("");
  const recognitionRef = useRef<any>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const getActiveInput = () => {
    if (tab === "type") return textInput.trim();
    if (tab === "voice") return transcript.trim();
    if (tab === "video") return videoContext.trim() || (videoFile ? `Video file: ${videoFile.name}` : "");
    return "";
  };

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    let final = "";
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + " ";
        else interim += e.results[i][0].transcript;
      }
      setTranscript(final + interim);
    };
    rec.onerror = () => setIsRecording(false);
    rec.onend = () => setIsRecording(false);
    recognitionRef.current = rec;
    rec.start();
    setIsRecording(true);
  }, [isRecording]);

  const handleSubmit = () => {
    const input = getActiveInput();
    if (!input) return;
    onSubmit(input, tab);
  };

  const hasInput = !!getActiveInput();

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="text-center mb-9">
        <h1 className="text-3xl font-bold text-white mb-2 leading-tight">What&apos;s on your mind?</h1>
        <p className="text-[#6B7A99] text-base">Drop a raw idea. Get 5 platform-ready posts in seconds.</p>
      </div>

      <div className="bg-[#111827] border border-[#1F2D45] rounded-2xl overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-[#1F2D45]">
          {(["type", "voice", "video"] as CaptureMode[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-3.5 text-sm font-semibold transition-all duration-200 capitalize"
              style={{
                background: "none",
                border: "none",
                borderBottom: tab === t ? "2px solid #C9A84C" : "2px solid transparent",
                color: tab === t ? "#C9A84C" : "#6B7A99",
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-5">
          {tab === "type" && (
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Brain dump here. Voice memo transcript. Pasted conversation. Rough notes from a build session. Anything."
              className="w-full min-h-[180px] bg-transparent border-none text-white text-base leading-relaxed resize-none outline-none font-sans placeholder:text-[#4A5568]"
              autoFocus
            />
          )}

          {tab === "voice" && (
            <div className="flex flex-col gap-4">
              <button
                onClick={toggleRecording}
                className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all duration-200 w-fit"
                style={{
                  background: isRecording ? "#C0392B22" : "#C9A84C22",
                  border: `1px solid ${isRecording ? "#C0392B" : "#C9A84C"}`,
                  color: isRecording ? "#C0392B" : "#C9A84C",
                  cursor: "pointer",
                }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block"
                  style={{
                    background: isRecording ? "#C0392B" : "#C9A84C",
                    animation: isRecording ? "pulse 1s infinite" : "none",
                  }}
                />
                {isRecording ? "Stop Recording" : "Start Recording"}
              </button>

              {transcript ? (
                <div className="bg-[#0B0F1A] rounded-lg p-3.5 border border-[#1F2D45] text-white text-sm leading-relaxed min-h-[100px]">
                  {transcript}
                </div>
              ) : (
                !isRecording && (
                  <p className="text-[#6B7A99] text-sm leading-relaxed">
                    Hit record and talk through your idea. Doesn&apos;t need to be polished — just talk.
                  </p>
                )
              )}
            </div>
          )}

          {tab === "video" && (
            <div className="flex flex-col gap-4">
              <div
                onClick={() => videoInputRef.current?.click()}
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200"
                style={{
                  borderColor: videoFile ? "#C9A84C" : "#1F2D45",
                  background: videoFile ? "#C9A84C08" : "none",
                }}
              >
                <div className="text-3xl mb-2">🎥</div>
                <div
                  className="text-sm font-semibold"
                  style={{ color: videoFile ? "#C9A84C" : "#6B7A99" }}
                >
                  {videoFile ? videoFile.name : "Upload your face-cam clip"}
                </div>
                <div className="text-[#4A5568] text-xs mt-1">mp4, mov</div>
              </div>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
              />
              <textarea
                value={videoContext}
                onChange={(e) => setVideoContext(e.target.value)}
                placeholder="Optional: describe what you're talking about in the video so content generation is more accurate."
                className="w-full min-h-[80px] bg-[#0B0F1A] border border-[#1F2D45] rounded-lg text-white text-sm leading-relaxed resize-none outline-none p-3 font-sans placeholder:text-[#4A5568]"
              />
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3 text-red-400 text-sm px-3.5 py-2.5 bg-red-500/10 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!hasInput}
        className="w-full mt-5 py-4 rounded-xl font-bold text-base transition-all duration-200 tracking-wide disabled:cursor-not-allowed"
        style={{
          background: hasInput ? "#C9A84C" : "#1F2D45",
          color: hasInput ? "#0D1B2E" : "#6B7A99",
        }}
      >
        Generate Content →
      </button>
      <p className="text-center text-[#6B7A99] text-xs mt-2.5">
        LinkedIn · Instagram · Facebook · YouTube · Shorts
      </p>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
