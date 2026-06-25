"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar,
} from "recharts";

interface SentDay {
  day: string;
  sent: number;
  delivered: number;
  bounced: number;
}

interface TokenUsage {
  agent_name: string;
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number | null;
}

interface FunnelStage {
  stage: string;
  count: number;
}

interface UsageStats {
  sentOverTime: SentDay[];
  tokenUsage: TokenUsage[];
  totals: { cost: number; input_tokens: number; output_tokens: number };
  funnel: FunnelStage[];
}

const EMPTY: UsageStats = {
  sentOverTime: [],
  tokenUsage: [],
  totals: { cost: 0, input_tokens: 0, output_tokens: 0 },
  funnel: [],
};

const FUNNEL_COLORS: Record<string, string> = {
  discovered: "#4C8EC9",
  qualified: "#C9A84C",
  drafted: "#7C6AC4",
  approved: "#4CC98E",
  sent: "#4CC98E",
};

const FUNNEL_LABELS: Record<string, string> = {
  discovered: "Discovered",
  qualified: "Qualified",
  drafted: "Drafted",
  approved: "Approved",
  sent: "Sent",
};

function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let raf: number;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

function MetricCard({ label, value, format, color, sub, onClick, delay = 0 }: {
  label: string;
  value: number;
  format: (n: number) => string;
  color: string;
  sub?: string;
  onClick?: () => void;
  delay?: number;
}) {
  const animated = useCountUp(value);
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: "easeOut" }}
      whileHover={onClick ? { background: "rgba(255,255,255,0.06)" } : undefined}
      style={{
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 8, padding: "14px 16px", textAlign: "left", cursor: onClick ? "pointer" : "default",
        display: "block", width: "100%",
      }}
    >
      <div style={{ fontSize: 11, color: "#666", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1, fontFamily: "monospace" }}>{format(animated)}</div>
      {sub && <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>{sub}</div>}
    </motion.button>
  );
}

export function UsagePanel({ onFunnelClick }: { onFunnelClick: (stage: string) => void }) {
  const [data, setData] = useState<UsageStats>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/marketing/usage-stats");
      if (res.ok) setData(await res.json());
      setLoading(false);
    })();
  }, []);

  const totalSent30d = data.sentOverTime.reduce((s, d) => s + d.sent, 0);
  const totalBounced30d = data.sentOverTime.reduce((s, d) => s + d.bounced, 0);
  const maxFunnel = Math.max(1, ...data.funnel.map((f) => f.count));

  if (loading) {
    return <div style={{ padding: "24px", color: "#444", fontSize: 13 }}>Loading usage stats...</div>;
  }

  return (
    <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      {/* Top metric row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        <MetricCard label="Sent (30d)" value={totalSent30d} format={(n) => Math.round(n).toLocaleString()} color="#4CC98E" delay={0} />
        <MetricCard label="Bounced (30d)" value={totalBounced30d} format={(n) => Math.round(n).toLocaleString()} color="#C94C4C" delay={0.05} />
        <MetricCard label="AI Tokens (30d)" value={data.totals.input_tokens + data.totals.output_tokens} format={(n) => Math.round(n).toLocaleString()} color="#7C6AC4" delay={0.1} />
        <MetricCard label="Est. AI Cost (30d)" value={data.totals.cost} format={(n) => `$${n.toFixed(2)}`} color="#C9A84C" sub="list pricing, approximate" delay={0.15} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        {/* Sent over time */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.4 }}
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "12px 16px" }}>
          <div style={{ fontSize: 11, color: "#666", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Emails sent — last 30 days</div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={data.sentOverTime}>
              <defs>
                <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4CC98E" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#4CC98E" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="bounceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#C94C4C" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#C94C4C" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#555" }} tickFormatter={(d: string) => d.slice(5)} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#555" }} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={{ background: "#161A22", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, fontSize: 11 }} />
              <Area type="monotone" dataKey="sent" stroke="#4CC98E" fill="url(#sentGrad)" strokeWidth={2} animationDuration={600} />
              <Area type="monotone" dataKey="bounced" stroke="#C94C4C" fill="url(#bounceGrad)" strokeWidth={2} animationDuration={600} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Funnel */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25, duration: 0.4 }}
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "12px 16px" }}>
          <div style={{ fontSize: 11, color: "#666", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Pipeline funnel</div>
          {data.funnel.map((f, i) => (
            <motion.div key={f.stage}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ delay: 0.3 + i * 0.06, duration: 0.4, ease: "easeOut" }}
              style={{ transformOrigin: "left", marginBottom: 8, cursor: "pointer" }}
              onClick={() => onFunnelClick(f.stage)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#888", marginBottom: 3 }}>
                <span>{FUNNEL_LABELS[f.stage] ?? f.stage}</span>
                <span style={{ fontFamily: "monospace", color: "#aaa" }}>{f.count}</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.max(3, (f.count / maxFunnel) * 100)}%`,
                  background: FUNNEL_COLORS[f.stage] ?? "#666",
                  borderRadius: 4,
                }} />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Token usage by agent/model */}
      {data.tokenUsage.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35, duration: 0.4 }}
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "12px 16px", marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "#666", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
            AI usage by agent — last 30 days
          </div>
          <ResponsiveContainer width="100%" height={Math.max(100, data.tokenUsage.length * 32)}>
            <BarChart data={data.tokenUsage} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: "#555" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="agent_name" tick={{ fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false} width={110} />
              <Tooltip
                contentStyle={{ background: "#161A22", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, fontSize: 11 }}
              />
              <Bar dataKey="input_tokens" stackId="t" fill="#4C8EC9" radius={[4, 0, 0, 4]} animationDuration={600} />
              <Bar dataKey="output_tokens" stackId="t" fill="#7C6AC4" radius={[0, 4, 4, 0]} animationDuration={600} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 10, color: "#666" }}>
            <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#4C8EC9", borderRadius: 2, marginRight: 4 }} />input tokens</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#7C6AC4", borderRadius: 2, marginRight: 4 }} />output tokens</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
