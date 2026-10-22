"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ChartScatter, Table } from "@phosphor-icons/react";
import { ScrollFade } from "@/modern/components/craft/ScrollFade";
import { cn } from "@/modern/lib/cn";
import { formatDate, teamTag, winnerName } from "@/modern/lib/vlr/dataset";
import { callScore, type ReliabilityBin } from "@/modern/lib/vlr/metrics";
import { MODEL_IDS, MODEL_LABEL, type Calib, type Fit, type ModelId } from "@/modern/lib/vlr/pipeline";
import type { Dataset, Match } from "@/modern/lib/vlr/types";
import { binInterval, probOf } from "@/modern/lib/vlr/views";
import { pct, r2, rate, Segmented, useReducedMotionPref, useWidth, Verdict } from "./ui";

/* ─────────────────────────────────────────────────────────
 * CALIBRATION PLOT — a reliability diagram on held-out maps.
 * x: the probability the model gave the favorite (50–100%).
 * y: how often the favorite actually won.
 * On the diagonal = calibrated; below it = overconfident.
 * Dots are bins (area ∝ maps), whiskers are 95% intervals,
 * hollow dots are the other calibration for comparison.
 * Hover a bin to list its maps. Table view is one click away.
 * ───────────────────────────────────────────────────────── */

const EASE = [0.23, 1, 0.32, 1] as const;

function BinMatches({ bin, ds, fit, model, calib }: { bin: ReliabilityBin; ds: Dataset; fit: Fit; model: ModelId; calib: Calib }) {
  const byId = useMemo(() => new Map(ds.matches.map((m) => [m.id, m])), [ds]);
  const ms = bin.ids.map((id) => byId.get(id)).filter(Boolean) as Match[];
  return (
    <ScrollFade className="max-h-[164px]" style={{ scrollbarWidth: "thin" }}>
      <ul className="flex flex-col">
        {ms.map((m) => {
          const p = probOf(fit, m.id, model, calib);
          const fav = p >= 0.5 ? m.a : m.b;
          return (
            <li key={m.id} className="grid grid-cols-[44px_minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-[var(--grid-line)] py-1.5 text-[12px] last:border-b-0">
              <span className="num text-ink-3">{formatDate(m.date, { year: false })}</span>
              <span className="min-w-0 truncate text-ink-2">
                <span className="text-ink">{teamTag(m.a)}</span> vs <span className="text-ink">{teamTag(m.b)}</span> · {m.map}
              </span>
              <span className="num text-ink-2">
                {teamTag(fav)} {pct(Math.max(p, 1 - p))}
              </span>
              <Verdict score={callScore(p, winnerName(m) === m.a ? 1 : 0)} />
            </li>
          );
        })}
      </ul>
    </ScrollFade>
  );
}

export function CalibrationPlot({
  ds,
  fit,
  model,
  calib,
  onModel,
  onCalib,
}: {
  ds: Dataset;
  fit: Fit;
  model: ModelId;
  calib: Calib;
  onModel: (m: ModelId) => void;
  onCalib: (c: Calib) => void;
}) {
  const [ref, width, measured] = useWidth<HTMLDivElement>(560);
  const reduce = useReducedMotionPref();
  const [hover, setHover] = useState<number | null>(null);
  const [view, setView] = useState<"plot" | "table">("plot");
  const other: Calib = calib === "platt" ? "raw" : "platt";
  const active = fit.valid[model][calib];
  const ghost = fit.valid[model][other];

  const L = 40;
  const R = Math.max(L + 120, width - 14);
  const T = 26;
  const B = 206;
  const HB = 238; // histogram baseline
  const H = 280;
  const xs = (c: number) => r2(L + ((c - 0.5) / 0.5) * (R - L));
  const ys = (h: number) => r2(B - h * (B - T));
  const maxN = Math.max(1, ...active.bins.map((b) => b.n), ...ghost.bins.map((b) => b.n));
  const rOf = (n: number) => r2(4 + 7 * Math.sqrt(n / maxN));
  const t = reduce ? { duration: 0 } : { duration: 0.55, ease: EASE };
  const hb = hover === null ? null : active.bins[hover];

  return (
    <div className="w-full overflow-hidden rounded-card bg-surface shadow-card">
      <div className="primitive-card-bar flex flex-wrap items-center justify-between gap-2 border-b border-line">
        <span className="text-[13px] font-medium text-ink">Calibration on Toronto</span>
        <div className="flex items-center gap-1.5">
          <Segmented label="Model" size="xs" value={model} onChange={onModel} options={MODEL_IDS.map((id) => ({ key: id, label: MODEL_LABEL[id] }))} className="w-[196px]" />
          <Segmented
            label="Calibration"
            size="xs"
            value={calib}
            onChange={onCalib}
            options={[
              { key: "platt", label: "Platt" },
              { key: "raw", label: "Raw" },
            ]}
            className="w-[104px]"
          />
          <button
            type="button"
            aria-label={view === "plot" ? "Show as a table" : "Show as a chart"}
            title={view === "plot" ? "Table view" : "Chart view"}
            onClick={() => setView((v) => (v === "plot" ? "table" : "plot"))}
            className="press primitive-icon-button text-ink-3 hover:bg-hover hover:text-ink"
          >
            {view === "plot" ? <Table size={14} weight="bold" /> : <ChartScatter size={14} weight="bold" />}
          </button>
        </div>
      </div>

      {view === "plot" ? (
        <div ref={ref} className="relative px-1 pt-2" onPointerLeave={() => setHover(null)}>
          <svg width={width} height={H} className="block overflow-visible transition-opacity duration-200" style={{ opacity: measured ? 1 : 0 }} role="img" aria-label={`Reliability diagram for ${MODEL_LABEL[model]}, ${calib === "platt" ? "Platt-scaled" : "raw"}`}>
            {/* grid + axes: solid hairlines */}
            {[0, 0.25, 0.5, 0.75, 1].map((h) => (
              <g key={h}>
                <line x1={L} x2={R} y1={ys(h)} y2={ys(h)} stroke="var(--line)" strokeWidth={1} />
                <text x={L - 8} y={ys(h) + 3.5} textAnchor="end" className="num fill-ink-3 text-[10.5px]">
                  {Math.round(h * 100)}%
                </text>
              </g>
            ))}
            {[0.5, 0.6, 0.7, 0.8, 0.9, 1].map((c) => (
              <text key={c} x={xs(c)} y={HB + 16} textAnchor="middle" className="num fill-ink-3 text-[10.5px]">
                {Math.round(c * 100)}%
              </text>
            ))}
            <text x={r2((L + R) / 2)} y={H - 3} textAnchor="middle" className="fill-ink-3 text-[10.5px]">
              Model&apos;s odds for the favorite
            </text>
            <line x1={xs(0.5)} y1={ys(0.5)} x2={xs(1)} y2={ys(1)} stroke="var(--line-strong)" strokeWidth={1.5} />
            <text x={xs(0.62)} y={ys(0.62) - 8} textAnchor="middle" className="fill-ink-3 text-[10.5px]" transform={`rotate(${r2((-Math.atan2(ys(0.5) - ys(1), xs(1) - xs(0.5)) * 180) / Math.PI)} ${xs(0.62)} ${ys(0.62) - 8})`}>
              calibrated
            </text>

            {/* bin bands: hover targets */}
            {active.bins.map((b, i) => (
              <rect
                key={`band-${i}`}
                x={xs(b.lo)}
                y={T}
                width={r2(xs(Math.min(1, b.hi)) - xs(b.lo))}
                height={HB - T}
                fill={hover === i ? "var(--hover)" : "transparent"}
                onPointerEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                tabIndex={b.n ? 0 : -1}
                aria-label={`${Math.round(b.lo * 100)} to ${Math.round(Math.min(1, b.hi) * 100)}%: ${b.n} maps`}
              />
            ))}

            {/* ghost: the other calibration */}
            {ghost.bins.map((b, i) =>
              b.n ? <circle key={`g-${i}`} cx={xs(b.conf)} cy={ys(b.hit)} r={rOf(b.n)} fill="none" stroke="var(--ink-3)" strokeOpacity={0.6} strokeWidth={1.25} className="pointer-events-none" /> : null,
            )}

            {/* active: whiskers, line, dots */}
            {active.bins.map((b, i) => {
              if (!b.n) return null;
              const [lo, hi] = binInterval(b.hit, b.n);
              return (
                <motion.line
                  key={`ci-${i}`}
                  initial={false}
                  animate={{ x1: xs(b.conf), x2: xs(b.conf), y1: ys(lo), y2: ys(hi) }}
                  transition={t}
                  stroke="var(--ink-3)"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  className="pointer-events-none"
                />
              );
            })}
            {active.bins.map((b, i) =>
              b.n ? (
                <motion.circle
                  key={`d-${i}`}
                  initial={false}
                  animate={{ cx: xs(b.conf), cy: ys(b.hit), r: rOf(b.n) }}
                  transition={t}
                  fill="var(--ink)"
                  stroke="var(--surface)"
                  strokeWidth={2}
                  className="pointer-events-none"
                />
              ) : null,
            )}

            {/* bin counts under the plot */}
            {active.bins.map((b, i) => {
              const cx = xs((b.lo + Math.min(1, b.hi)) / 2);
              const h = r2((b.n / maxN) * 18);
              return (
                <g key={`h-${i}`} className="pointer-events-none">
                  <rect x={r2(cx - 9)} y={r2(HB - h)} width={18} height={Math.max(h, 1)} rx={2} fill={b.n ? "var(--ink-3)" : "var(--line)"} fillOpacity={b.n ? 0.45 : 1} />
                  <text x={cx} y={r2(HB - h - 4)} textAnchor="middle" className="num fill-ink-3 text-[10px]">
                    {b.n}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="pointer-events-none absolute top-2 left-[42px] text-[10.5px] text-ink-3">How often the favorite won</p>
        </div>
      ) : (
        <div className="px-3 py-2">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[11.5px] text-ink-3">
                <th className="py-1.5 font-medium">Model said</th>
                <th className="py-1.5 text-right font-medium">Maps</th>
                <th className="py-1.5 text-right font-medium">Avg call</th>
                <th className="py-1.5 text-right font-medium">Favorite won</th>
                <th className="py-1.5 text-right font-medium">95% interval</th>
              </tr>
            </thead>
            <tbody>
              {active.bins.map((b, i) => {
                const [lo, hi] = binInterval(b.hit, b.n);
                return (
                  <tr key={i} className="num border-t border-[var(--grid-line)] text-ink-2">
                    <td className="py-1.5 text-ink">
                      {Math.round(b.lo * 100)} to {Math.round(Math.min(1, b.hi) * 100)}%
                    </td>
                    <td className="py-1.5 text-right">{b.n}</td>
                    <td className="py-1.5 text-right">{b.n ? pct(b.conf) : "·"}</td>
                    <td className="py-1.5 text-right">{b.n ? rate(b.hit) : "·"}</td>
                    <td className="py-1.5 text-right">{b.n ? `${Math.round(lo * 100)} to ${Math.round(hi * 100)}%` : "·"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t border-line px-3 py-2.5">
        {hb && hb.n > 0 && view === "plot" ? (
          <div style={{ animation: "fade-in 160ms ease-out both" }}>
            <p className="mb-1 text-[12px] text-ink-2">
              <span className="font-medium text-ink">
                {Math.round(hb.lo * 100)} to {Math.round(Math.min(1, hb.hi) * 100)}% calls
              </span>
              <span className="num">
                {" "}
                · {hb.n} maps · said {pct(hb.conf)}, favorites won {rate(hb.hit)}
              </span>
            </p>
            <BinMatches bin={hb} ds={ds} fit={fit} model={model} calib={calib} />
          </div>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5 text-[12px]">
            {(
              [
                ["Brier", active.brier, ghost.brier],
                ["Log loss", active.logLoss, ghost.logLoss],
                ["ECE", active.ece, ghost.ece],
              ] as const
            ).map(([label, v, g]) => (
              <span key={label} className="flex items-baseline gap-1.5">
                <span className="text-ink-3">{label}</span>
                <span className="num font-medium text-ink">{v.toFixed(3)}</span>
                <span className={cn("num text-[11.5px]", v <= g ? "text-green" : "text-ink-3")}>
                  {other === "raw" ? "raw" : "Platt"} {g.toFixed(3)}
                </span>
              </span>
            ))}
            <span className="w-full text-[11.5px] text-ink-3">
              Hollow dots are the {other === "raw" ? "raw" : "Platt-scaled"} odds. Hover a bin to see its maps. Lower is better for all three.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
