"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { CaptureMode } from "@/vulnaguard-marketing-agents/agents/content-pipeline/types";

interface VoiceSkill { slug: string; name: string }

interface CaptureScreenProps {
  onSubmit: (input: string, mode: CaptureMode, voiceSkillSlug: string | null) => void;
  error: string;
}

const LS_KEY = "content_pipeline_voice_skill";

export function CaptureScreen({ onSubmit, error }: CaptureScreenProps) {
  const [tab, setTab] = useState<CaptureMode>("type");
  const [textInput, setTextInput] = useState("");
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoContext, setVideoContext] = useState("");
  const recognitionRef = useRef<any>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Voice skill selection
  const [voiceSkills, setVoiceSkills] = useState<VoiceSkill[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<string>("");

  useEffect(() => {
    fetch("/api/marketing/personas?type=voice")
      .then(r => r.json())
      .then(d => {
        const skills: VoiceSkill[] = d.personas ?? [];
        setVoiceSkills(skills);
        // Restore last selection or default to first
        const saved = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;
        if (saved && skills.some(s => s.slug === saved)) {
          setSelectedSkill(saved);
        } else if (skills.length > 0) {
          setSelectedSkill(skills[0].slug);
        }
      })
      .catch(() => {});
  }, []);

  const handleSkillChange = (slug: string) => {
    setSelectedSkill(slug);
    if (typeof window !== "undefined") localStorage.setItem(LS_KEY, slug);
  };

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
    onSubmit(input, tab, selectedSkill || null);
  };

  const hasInput = !!getActiveInput();

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="text-center mb-9">
        <h1 className="text-3xl font-bold text-white mb-2 leading-tight">What&apos;s on your mind?</h1>
        <p style={{ color: "#6B7A99" }} className="text-base">Drop a raw idea. Get 5 platform-ready posts in seconds.</p>
      </div>

      <div style={{ background: "#111827", border: "1px solid #1F2D45", borderRadius: 16, overflow: "hidden" }}>
        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #1F2D45" }}>
          {(["type", "voice", "video"] as CaptureMode[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: "14px 0", fontSize: 14, fontWeight: 600,
                background: "none", border: "none",
                borderBottom: tab === t ? "2px solid #C9A84C" : "2px solid transparent",
                color: tab === t ? "#C9A84C" : "#6B7A99",
                cursor: "pointer", textTransform: "capitalize",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div style={{ padding: 20 }}>
          {tab === "type" && (
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Brain dump here. Voice memo transcript. Pasted conversation. Rough notes from a build session. Anything."
              style={{ width: "100%", minHeight: 180, background: "transparent", border: "none", color: "#fff", fontSize: 15, lineHeight: 1.6, resize: "none", outline: "none", fontFamily: "inherit" }}
              autoFocus
            />
          )}

          {tab === "voice" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <button
                onClick={toggleRecording}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 20px", borderRadius: 12, fontWeight: 700, fontSize: 14,
                  background: isRecording ? "#C0392B22" : "#C9A84C22",
                  border: `1px solid ${isRecording ? "#C0392B" : "#C9A84C"}`,
                  color: isRecording ? "#C0392B" : "#C9A84C",
                  cursor: "pointer", width: "fit-content",
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: isRecording ? "#C0392B" : "#C9A84C", display: "inline-block", animation: isRecording ? "pulse 1s infinite" : "none" }} />
                {isRecording ? "Stop Recording" : "Start Recording"}
              </button>
              {transcript ? (
                <div style={{ background: "#0B0F1A", borderRadius: 8, padding: "14px", border: "1px solid #1F2D45", color: "#fff", fontSize: 14, lineHeight: 1.6, minHeight: 100 }}>
                  {transcript}
                </div>
              ) : !isRecording && (
                <p style={{ color: "#6B7A99", fontSize: 14, lineHeight: 1.6 }}>
                  Hit record and talk through your idea. Doesn&apos;t need to be polished — just talk.
                </p>
              )}
            </div>
          )}

          {tab === "video" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div
                onClick={() => videoInputRef.current?.click()}
                style={{
                  border: `2px dashed ${videoFile ? "#C9A84C" : "#1F2D45"}`,
                  background: videoFile ? "#C9A84C08" : "none",
                  borderRadius: 12, padding: "32px", textAlign: "center", cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>🎥</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: videoFile ? "#C9A84C" : "#6B7A99" }}>
                  {videoFile ? videoFile.name : "Upload your face-cam clip"}
                </div>
                <div style={{ color: "#4A5568", fontSize: 12, marginTop: 4 }}>mp4, mov</div>
              </div>
              <input ref={videoInputRef} type="file" accept="video/*" style={{ display: "none" }} onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)} />
              <textarea
                value={videoContext}
                onChange={(e) => setVideoContext(e.target.value)}
                placeholder="Optional: describe what you're talking about in the video so content generation is more accurate."
                style={{ width: "100%", minHeight: 80, background: "#0B0F1A", border: "1px solid #1F2D45", borderRadius: 8, color: "#fff", fontSize: 14, lineHeight: 1.6, resize: "none", outline: "none", padding: 12, fontFamily: "inherit" }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Voice skill selector */}
      {voiceSkills.length > 0 && (
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ fontSize: 11, color: "#6B7A99", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>Voice Skill</label>
          <select
            value={selectedSkill}
            onChange={e => handleSkillChange(e.target.value)}
            style={{ flex: 1, background: "#111827", border: "1px solid #1F2D45", borderRadius: 8, color: "#C9A84C", fontSize: 13, padding: "7px 10px", outline: "none", cursor: "pointer" }}
          >
            <option value="">— None (default) —</option>
            {voiceSkills.map(s => (
              <option key={s.slug} value={s.slug}>{s.name}</option>
            ))}
          </select>
          <a
            href="#voice-skills"
            onClick={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent("openVoiceSkills")); }}
            style={{ fontSize: 11, color: "#6B7A99", textDecoration: "none", whiteSpace: "nowrap" }}
          >
            Manage →
          </a>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 12, color: "#f87171", fontSize: 14, padding: "10px 14px", background: "rgba(239,68,68,0.1)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.2)" }}>
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!hasInput}
        style={{
          width: "100%", marginTop: 20, padding: "16px 0", borderRadius: 12, fontWeight: 700,
          fontSize: 16, border: "none", cursor: hasInput ? "pointer" : "not-allowed",
          background: hasInput ? "#C9A84C" : "#1F2D45",
          color: hasInput ? "#0D1B2E" : "#6B7A99",
          letterSpacing: "0.02em",
        }}
      >
        Generate Content →
      </button>
      <p style={{ textAlign: "center", color: "#6B7A99", fontSize: 12, marginTop: 10 }}>
        LinkedIn · Instagram · Facebook · YouTube · Shorts
      </p>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
