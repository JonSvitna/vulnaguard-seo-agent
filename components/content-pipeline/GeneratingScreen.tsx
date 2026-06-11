"use client";

const STEPS = [
  { label: "Extracting core idea", threshold: 20 },
  { label: "Writing platform posts", threshold: 50 },
  { label: "Building video brief", threshold: 75 },
  { label: "Sending to HyperFrames", threshold: 90 },
];

interface GeneratingScreenProps {
  progress: number;
  progressLabel: string;
}

export function GeneratingScreen({ progress, progressLabel }: GeneratingScreenProps) {
  return (
    <div className="max-w-md mx-auto px-6 py-20 flex flex-col items-center gap-8">
      {/* Shield icon */}
      <svg width="36" height="36" viewBox="0 0 28 28" fill="none">
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

      {/* Progress bar */}
      <div className="w-full text-center">
        <div className="text-white text-base font-semibold mb-5">
          {progressLabel || "Starting..."}
        </div>
        <div className="h-1 bg-[#1F2D45] rounded-full overflow-hidden w-full">
          <div
            className="h-full bg-[#C9A84C] rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-[#6B7A99] text-xs mt-2">{progress}%</div>
      </div>

      {/* Step list */}
      <div className="flex flex-col gap-2.5 w-full">
        {STEPS.map((step, i) => {
          const prev = STEPS[i - 1]?.threshold ?? 0;
          const done = progress > step.threshold;
          const active = progress <= step.threshold && progress > prev;
          return (
            <div
              key={step.label}
              className="flex items-center gap-3 text-sm transition-colors duration-300"
              style={{ color: done ? "#2ECC71" : active ? "#F0F4FF" : "#6B7A99" }}
            >
              <span className="text-base w-4 text-center">
                {done ? "✓" : active ? "→" : "○"}
              </span>
              {step.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
