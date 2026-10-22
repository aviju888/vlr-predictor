"use client";

import { useState } from "react";
import { ArrowRight, Info, Warning } from "@phosphor-icons/react";
import { Button } from "@/modern/components/atoms/Button";
import { RollingNumber } from "@/modern/components/craft/RollingNumber";
import { cn } from "@/modern/lib/cn";
import { playSfx } from "@/modern/lib/sfx";
import type { ReliabilityBin } from "@/modern/lib/vlr/metrics";
import { MODEL_LABEL, type Calib, type ModelId } from "@/modern/lib/vlr/pipeline";
import type { Side, TeamMeta } from "@/modern/lib/vlr/types";
import { confidenceOf, Meter, pc, pct, pctNum, sideColor, TeamMark, Verdict } from "./ui";

/* ─────────────────────────────────────────────────────────
 * PICK CARD — Recommendation Card for one matchup.
 * The card holds its shape: title is the pick, the bar is the
 * split, the meter is how sure. "Other models" opens the drawer
 * with the other two models' picks; choosing one promotes it.
 * Under the bar sits the held-out check for this confidence
 * band, so "86%" always comes with "and 86% calls won X%".
 * ───────────────────────────────────────────────────────── */

export type PickOption = { model: ModelId; p: number };

/** score: 1 hit, 0 miss, 0.5 no call, -1 the map wasn't played */
export type PickResult = { winner: Side; score: number; label: string; caveat?: string } | null;

export function PickCard({
  a,
  b,
  subject,
  options,
  model,
  calib,
  bin,
  result,
  onModel,
  onSimulate,
  seriesMode,
  bestOf = 3,
}: {
  bestOf?: number;
  a: TeamMeta;
  b: TeamMeta;
  /** "Ascent" or "a best-of-3" */
  subject: string;
  options: PickOption[];
  model: ModelId;
  calib: Calib;
  /** the held-out reliability bin this confidence falls in */
  bin: ReliabilityBin | null;
  /** the real result, when the picker is rewound to a played match */
  result: PickResult;
  onModel: (m: ModelId) => void;
  onSimulate: () => void;
  seriesMode: boolean;
}) {
  const [open, setOpen] = useState(false);
  const active = options.find((o) => o.model === model) ?? options[0];
  const others = options.filter((o) => o.model !== active.model);
  const p = active.p;
  const fav: Side | null = p === 0.5 ? null : p > 0.5 ? "a" : "b";
  const favTeam = fav === "a" ? a : fav === "b" ? b : null;
  const conf = confidenceOf(p);
  const verb = seriesMode ? "wins" : "takes";

  return (
    <div className="w-full overflow-hidden rounded-card bg-surface shadow-card">
      <div className="primitive-card-pad">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11.5px] font-medium text-ink-3">
              {MODEL_LABEL[active.model]} pick · {calib === "platt" ? "Platt-scaled" : "raw odds"}
            </p>
            <h2 key={`${active.model}-${favTeam?.name}-${subject}`} className="mt-0.5 text-[15px] font-semibold tracking-[-0.01em] text-balance text-ink" style={{ animation: "fade-in 180ms ease-out both" }}>
              {favTeam ? (
                <>
                  {favTeam.name} {verb} {subject}
                </>
              ) : (
                <>No favorite on {subject}</>
              )}
            </h2>
          </div>
          <span className="shrink-0 text-[30px] leading-none font-semibold tracking-[-0.03em] text-ink">
            <RollingNumber value={pctNum(Math.max(p, 1 - p))} suffix="%" />
          </span>
        </div>

        {/* the split: team A from the left, team B from the right, a 2px gap between */}
        <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full" role="img" aria-label={`${a.name} ${pct(p)}, ${b.name} ${pct(1 - p)}`}>
          <span className="h-full rounded-l-full transition-[width] duration-500 ease-out-strong" style={{ width: `calc(${pc(p)} - 1px)`, background: sideColor("a") }} />
          <span className="h-full w-[2px] shrink-0 bg-surface" />
          <span className="h-full flex-1 rounded-r-full" style={{ background: sideColor("b") }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[12px]">
          <span className="flex items-center gap-1.5 text-ink-2">
            <TeamMark tag={a.tag} side="a" size="xs" />
            {a.name}
            <span className="num font-medium text-ink">{pct(p)}</span>
          </span>
          <span className="flex items-center gap-1.5 text-ink-2">
            <span className="num font-medium text-ink">{pct(1 - p)}</span>
            {b.name}
            <TeamMark tag={b.tag} side="b" size="xs" />
          </span>
        </div>

        {result ? (
          <div className="mt-3 rounded-control bg-inset px-2.5 py-2 text-[12.5px] shadow-hairline" style={{ animation: "fade-up 320ms cubic-bezier(0.23,1,0.32,1) both" }}>
            <span className="flex items-center justify-between gap-3">
              <span className="min-w-0 text-ink-2">{result.label}</span>
              {result.score >= 0 && <Verdict score={result.score} />}
            </span>
            {result.caveat && (
              <span className="mt-1 flex items-start gap-1 text-[11.5px] leading-relaxed text-orange">
                <Warning size={11} weight="bold" className="mt-[3px] shrink-0" />
                {result.caveat}
              </span>
            )}
          </div>
        ) : (
          bin &&
          bin.n > 0 && (
            <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed text-pretty text-ink-3">
              <Info size={13} weight="bold" className="mt-[2px] shrink-0" />
              <span>
                On held-out Toronto maps, {MODEL_LABEL[active.model]}&apos;s {Math.round(bin.lo * 100)} to {Math.round(Math.min(1, bin.hi) * 100)}% calls won{" "}
                <span className="num font-medium text-ink-2">
                  {Math.round(bin.hit * bin.n)} of {bin.n}
                </span>{" "}
                ({Math.round(bin.hit * 100)}%).
              </span>
            </p>
          )
        )}
      </div>

      {/* other models: a distinct drawer under the pick */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-300"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
        inert={!open}
      >
        <div className="overflow-hidden">
          <div className="border-t border-line px-2 py-2">
            <p className="px-1.5 pb-1 text-[11px] font-medium text-ink-3">Other models</p>
            {others.map((o) => {
              const c = confidenceOf(o.p);
              const side: Side | null = o.p === 0.5 ? null : o.p > 0.5 ? "a" : "b";
              const t = side === "a" ? a : side === "b" ? b : null;
              return (
                <button
                  key={o.model}
                  type="button"
                  onClick={() => {
                    onModel(o.model);
                    playSfx("tap", 0.6);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-control px-1.5 py-1.5 text-left transition-colors duration-100 hover:bg-hover"
                >
                  <Meter level={c.level} />
                  <span className="w-16 shrink-0 text-[12.5px] font-medium text-ink">{MODEL_LABEL[o.model]}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px] text-ink-2">
                    {t && side ? <TeamMark tag={t.tag} side={side} size="xs" /> : null}
                    <span className="truncate">{t ? `${t.name} ${pct(Math.max(o.p, 1 - o.p))}` : "No favorite"}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-3">{c.short}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="primitive-card-footer flex items-center justify-between gap-3 border-t border-line">
        <span className="flex items-center gap-2">
          <Meter level={conf.level} />
          <span className="text-[12.5px] font-medium text-ink-2">
            <span className="sm:hidden">{conf.short}</span>
            <span className="hidden sm:inline">{conf.label}</span>
          </span>
        </span>
        <span className="-mr-0.5 flex items-center gap-2">
          <Button variant="secondary" size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={cn("px-2.5")}>
            Other models
          </Button>
          <Button variant="accent" size="sm" onClick={onSimulate}>
            {seriesMode ? "See the series" : `Simulate Bo${bestOf}`}
            <ArrowRight size={12} weight="bold" />
          </Button>
        </span>
      </div>
    </div>
  );
}
