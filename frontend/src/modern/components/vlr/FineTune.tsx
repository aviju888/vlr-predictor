"use client";

import { useRef } from "react";
import { Info } from "@phosphor-icons/react";
import { RollingNumber } from "@/modern/components/craft/RollingNumber";
import { cn } from "@/modern/lib/cn";
import { playSfx } from "@/modern/lib/sfx";
import { DEFAULT_KNOBS, MODEL_IDS, MODEL_LABEL, type Calib, type Fit, type Knobs, type ModelId } from "@/modern/lib/vlr/pipeline";
import { Segmented } from "./ui";

/* ─────────────────────────────────────────────────────────
 * FINE-TUNE — the Fine-tune Card as a model inspector.
 * Each knob is a scrub field: drag the label (↔), use ↑/↓
 * (⇧ for ×10), or type. Every change refits all three models
 * on all 71 maps in the browser and the held-out accuracy
 * rolls to the new number. The whole page follows the knobs.
 * ───────────────────────────────────────────────────────── */

type Field = { key: keyof Knobs; label: string; title: string; min: number; max: number; step: number; decimals: number; suffix?: string; scale?: number };

const FIELDS: Field[] = [
  { key: "k", label: "K", title: "Elo K-factor: points moved per unit of surprise", min: 4, max: 96, step: 1, decimals: 0 },
  { key: "halfLife", label: "Half-life", title: "Days for an old result to count half (features and Elo drift)", min: 5, max: 365, step: 1, decimals: 0, suffix: "d" },
  { key: "l2", label: "L2", title: "Logistic regression L2 strength (1 / C). Higher shrinks the weights", min: 0.1, max: 30, step: 0.1, decimals: 1 },
  { key: "mapShare", label: "Map K", title: "Share of K that goes to each team's per-map rating", min: 0, max: 100, step: 5, decimals: 0, suffix: "%", scale: 100 },
];

function ScrubField({ f, value, onChange, active }: { f: Field; value: number; onChange: (v: number) => void; active: boolean }) {
  const drag = useRef<{ x: number; v: number } | null>(null);
  const scale = f.scale ?? 1;
  const shown = value * scale;
  const clamp = (v: number) => {
    const snapped = Math.round(v / f.step) * f.step;
    return Math.min(f.max, Math.max(f.min, Number(snapped.toFixed(f.decimals))));
  };
  const emit = (v: number) => {
    const next = clamp(v);
    if (next !== shown) {
      onChange(next / scale);
      playSfx("tick", 0.35);
    }
  };
  return (
    <label
      className="flex h-6.5 min-w-0 items-center gap-1 rounded-chip py-1 pr-1 pl-0.5 transition-[background-color,box-shadow] duration-200"
      style={{ background: active ? "var(--accent-tint)" : "var(--field)", boxShadow: active ? "0 0 0 1px var(--accent)" : "none" }}
      title={f.title}
    >
      <span
        role="slider"
        aria-label={f.title}
        aria-valuenow={shown}
        aria-valuemin={f.min}
        aria-valuemax={f.max}
        tabIndex={0}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, v: shown };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          emit(drag.current.v + ((e.clientX - drag.current.x) / 3) * f.step);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={(e) => {
          const mult = e.shiftKey ? 10 : 1;
          if (e.key === "ArrowUp" || e.key === "ArrowRight") {
            e.preventDefault();
            emit(shown + f.step * mult);
          } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
            e.preventDefault();
            emit(shown - f.step * mult);
          }
        }}
        className="flex h-full shrink-0 cursor-ew-resize touch-none items-center rounded-[4px] px-0.5 text-[12px] text-ink-3 select-none hover:text-ink-2 focus-visible:text-accent-ink focus-visible:outline-none"
      >
        {f.label}
      </span>
      <input
        inputMode="decimal"
        value={shown.toFixed(f.decimals)}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/[^\d.]/g, ""));
          if (!Number.isNaN(n)) emit(n);
        }}
        aria-label={`${f.title} value`}
        className="num min-w-0 flex-1 bg-transparent text-right text-[12px] text-ink outline-none"
      />
      {f.suffix && <span className="shrink-0 pr-0.5 text-[11.5px] text-ink-3">{f.suffix}</span>}
    </label>
  );
}

export function FineTune({
  knobs,
  onKnobs,
  model,
  onModel,
  calib,
  fit,
  baseFit,
}: {
  knobs: Knobs;
  onKnobs: (k: Knobs) => void;
  model: ModelId;
  onModel: (m: ModelId) => void;
  calib: Calib;
  fit: Fit;
  baseFit: Fit;
}) {
  const edited = FIELDS.some((f) => knobs[f.key] !== DEFAULT_KNOBS[f.key]);
  const now = fit.valid[model][calib];
  const base = baseFit.valid[model][calib];
  const dAcc = (now.accuracy - base.accuracy) * 100;
  const dLL = now.logLoss - base.logLoss;
  // which knobs actually reach this model
  const reaches: Record<ModelId, (keyof Knobs)[]> = { elo: ["k", "halfLife", "mapShare"], lr: ["halfLife", "l2"], blend: ["k", "halfLife", "l2", "mapShare"] };

  return (
    <div className="relative w-full rounded-card bg-surface shadow-raised">
      <div className="primitive-card-bar flex items-center justify-between border-b border-line">
        <span className="text-[13px] font-medium text-ink">Model knobs</span>
        {edited ? (
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-green" style={{ animation: "pop-in 250ms cubic-bezier(0.23,1,0.32,1) both" }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Edited
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="flex size-4.5 items-center justify-center rounded-[5px] border border-accent/30 bg-accent-tint" aria-hidden>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="var(--accent)">
                <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
              </svg>
            </span>
            <span
              className="bg-clip-text text-[12px] font-medium text-transparent"
              style={{
                backgroundImage: "linear-gradient(90deg, var(--accent) 35%, var(--accent-ink) 50%, var(--accent) 65%)",
                backgroundSize: "200% 100%",
                animation: "shimmer-text 1.4s linear infinite",
              }}
            >
              Drag a label
            </span>
          </span>
        )}
      </div>

      <div className="primitive-card-pad flex flex-col gap-2 border-b border-line">
        <p className="text-[12.5px] font-medium text-ink">Score</p>
        <Segmented label="Model to score" value={model} onChange={onModel} options={MODEL_IDS.map((id) => ({ key: id, label: MODEL_LABEL[id] }))} />
        <div className="mt-1 grid min-w-0 grid-cols-2 gap-2">
          {FIELDS.map((f) => (
            <div key={f.key} className={cn("min-w-0 transition-opacity duration-200", !reaches[model].includes(f.key) && "opacity-45")}>
              <ScrubField f={f} value={knobs[f.key]} active={knobs[f.key] !== DEFAULT_KNOBS[f.key]} onChange={(v) => onKnobs({ ...knobs, [f.key]: v })} />
            </div>
          ))}
        </div>
      </div>

      <div className="primitive-card-pad flex flex-col gap-1 border-b border-line">
        <p className="text-[11.5px] font-medium text-ink-3">
          {MODEL_LABEL[model]} on Toronto · {calib === "platt" ? "Platt" : "raw"}
        </p>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[30px] leading-none font-semibold tracking-[-0.03em] text-ink">
            <RollingNumber value={now.accuracy * 100} decimals={1} suffix="%" />
          </span>
          <span className={cn("num text-[12px] font-medium", Math.abs(dAcc) < 0.05 ? "text-ink-3" : dAcc > 0 ? "text-green" : "text-ink-2")}>
            {Math.abs(dAcc) < 0.05 ? "same as default" : `${dAcc > 0 ? "+" : "−"}${Math.abs(dAcc).toFixed(1)} pts vs default`}
          </span>
        </div>
        <p className="num flex items-baseline justify-between text-[12px] text-ink-3">
          <span>
            Log loss <span className="text-ink-2">{now.logLoss.toFixed(3)}</span>
          </span>
          <span>{Math.abs(dLL) < 0.0005 ? "" : `${dLL > 0 ? "+" : "−"}${Math.abs(dLL).toFixed(3)} vs default`}</span>
        </p>
      </div>

      <div className="primitive-card-footer flex items-start justify-between gap-2">
        <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-pretty text-ink-3">
          <Info size={13} weight="bold" className="mt-[2px] shrink-0" />
          Defaults were set before scoring Toronto. Chasing this number with the knobs tunes on the test set.
        </p>
        <button
          type="button"
          disabled={!edited}
          onClick={() => {
            onKnobs(DEFAULT_KNOBS);
            playSfx("toggle");
          }}
          className="h-6.5 shrink-0 rounded-chip px-2 text-[12px] font-medium text-ink-2 transition-colors duration-100 hover:bg-hover hover:text-ink disabled:opacity-40"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
