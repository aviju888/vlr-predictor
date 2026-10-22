"use client";

import { useEffect, useState } from "react";
import { cn } from "@/modern/lib/cn";
import type { Driver } from "@/modern/lib/vlr/explain";
import { MODEL_LABEL, type ModelId } from "@/modern/lib/vlr/pipeline";
import type { Side, TeamMeta } from "@/modern/lib/vlr/types";
import { pc, pct, sideColor, signedPts } from "./ui";

/* ─────────────────────────────────────────────────────────
 * WHY — Thinking, as a trace of what moved the odds.
 * Each row is one signal's share of the move away from 50/50,
 * signed toward the team it favors. Rows arrive staggered while
 * the header shimmers "Weighing", then the trace settles and
 * stays open (collapse it from the header). The parent keys
 * this by matchup, so a new pick replays the trace.
 * ───────────────────────────────────────────────────────── */

export type WhyRow = { key: string; label: string; detail: string; value: number; source?: string };

export function driversToRows(drivers: Driver[], model: ModelId): WhyRow[] {
  return drivers.map((d) => ({
    key: d.key,
    label: d.label,
    detail: d.detail,
    value: d.value,
    source: model === "blend" ? (d.model === "elo" ? "Elo" : "Logistic") : undefined,
  }));
}

export function WhyTrace({
  rows,
  a,
  b,
  p,
  model,
  footnote,
  heading,
  additive = true,
}: {
  rows: WhyRow[];
  a: TeamMeta;
  b: TeamMeta;
  p: number;
  model: ModelId;
  footnote: string;
  heading?: string;
  /** rows are shares that add up to p − 50% (false for the map-by-map view) */
  additive?: boolean;
}) {
  const [settled, setSettled] = useState(false);
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 520 + rows.length * 45);
    return () => clearTimeout(t);
  }, [rows.length]);

  const fav: Side | null = p === 0.5 ? null : p > 0.5 ? "a" : "b";
  const favTeam = fav === "a" ? a : fav === "b" ? b : null;
  const meaningful = rows.filter((r) => Math.abs(r.value) >= 0.0005).length;
  const max = Math.max(0.0001, ...rows.map((r) => Math.abs(r.value)));

  return (
    <div className="w-full rounded-card bg-surface px-3 pt-2 pb-2.5 shadow-card">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="-mx-1.5 flex w-fit items-center gap-2 rounded-control px-1.5 py-1 transition-colors duration-100 hover:bg-hover"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill={settled ? "var(--ink-3)" : "var(--ink-2)"} aria-hidden>
          <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
        </svg>
        <span role="status" className="contents">
          {settled ? (
            <span className="text-[13px] font-medium whitespace-nowrap text-ink-2" style={{ animation: "fade-in 350ms ease-out both" }}>
              {heading ?? (favTeam ? `Why ${favTeam.name}` : "Why it's even")}
              <span className="font-normal text-ink-3">
                {" "}
                · {meaningful} {meaningful === 1 ? "signal" : "signals"}, {MODEL_LABEL[model]}
              </span>
            </span>
          ) : (
            <span
              className="bg-clip-text text-[13px] font-medium whitespace-nowrap text-transparent"
              style={{
                backgroundImage: "linear-gradient(90deg, var(--ink-3) 35%, var(--ink) 50%, var(--ink-3) 65%)",
                backgroundSize: "200% 100%",
                animation: "shimmer-text 1.4s linear infinite",
              }}
            >
              Weighing {rows.length} signals
            </span>
          )}
        </span>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ink-3)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform duration-300"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)" }}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-300"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr", opacity: expanded ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" }}
        inert={!expanded}
      >
        <div className="overflow-hidden">
          <div className="relative mt-1 ml-[6px] pl-4">
            <span aria-hidden className="absolute top-0 bottom-2 left-[3px] w-px bg-line" />
            <ul className="flex flex-col gap-0.5 py-1">
              {rows.map((r, i) => {
                const side: Side = r.value >= 0 ? "a" : "b";
                const quiet = Math.abs(r.value) < 0.0005;
                // signed toward the pick: + helps the favorite, − helps the other team
                const toward = fav === "b" ? -r.value : r.value;
                return (
                  <li
                    key={r.key}
                    className={cn("grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-[6px] px-1.5 py-1", quiet && "opacity-55")}
                    style={{ animation: `fade-up 320ms cubic-bezier(0.23,1,0.32,1) ${i * 45}ms both` }}
                  >
                    <span className="min-w-0">
                      <span className="flex items-baseline gap-1.5">
                        <span className="truncate text-[12.5px] font-medium text-ink">{r.label}</span>
                        {r.source && <span className="shrink-0 text-[10.5px] text-ink-3">{r.source}</span>}
                      </span>
                      <span className="num block truncate text-[11.5px] text-ink-3">{r.detail}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {/* magnitude bar, colored by the team it favors */}
                      <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-field sm:block" aria-hidden>
                        <span
                          className="block h-full rounded-full transition-[width] duration-500 ease-out-strong"
                          style={{ width: pc(Math.abs(r.value) / max), background: quiet ? "var(--line-strong)" : sideColor(side), marginLeft: side === "b" ? "auto" : undefined }}
                        />
                      </span>
                      <span className="num inline-flex h-[22px] min-w-[62px] items-center justify-end gap-1.5 rounded-[6px] bg-field px-1.5 text-[12px] font-medium text-ink">
                        {!quiet && <span className="size-1.5 rounded-full" style={{ background: sideColor(side) }} aria-hidden />}
                        {signedPts(toward)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 pr-1 text-[11.5px] leading-relaxed text-pretty text-ink-3">
              {footnote}{" "}
              {additive && (favTeam ? `Together they take ${favTeam.tag} from 50% to ${pct(Math.max(p, 1 - p))}; a minus helps ${(fav === "a" ? b : a).tag}.` : "They cancel out.")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
