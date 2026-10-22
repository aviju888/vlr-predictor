"use client";

import { useMemo, useRef, useState } from "react";
import { CaretDown, Check, Sword } from "@phosphor-icons/react";
import GlideMenu from "@/modern/components/atoms/GlideMenu";
import { RollingNumber } from "@/modern/components/craft/RollingNumber";
import { ScrollFade } from "@/modern/components/craft/ScrollFade";
import { cn } from "@/modern/lib/cn";
import { formatDate, teamTag, winnerName } from "@/modern/lib/vlr/dataset";
import { MODEL_IDS, MODEL_LABEL, type Calib, type Fit, type ModelId } from "@/modern/lib/vlr/pipeline";
import type { Dataset, Side, TeamMeta } from "@/modern/lib/vlr/types";
import { duel as buildDuel, type DuelCell } from "@/modern/lib/vlr/views";
import { CheckGlyph, pc, pct, sideColor, TeamMark, useDismiss } from "./ui";

/* ─────────────────────────────────────────────────────────
 * MODEL DUEL — two models, the same matches.
 *   This match   both models' odds for the picker's matchup
 *   Held out     every Toronto map in date order, one row per
 *                model: filled = right, hollow = wrong. Columns
 *                where they picked different teams are shaded,
 *                and listed underneath with who was right.
 * ───────────────────────────────────────────────────────── */

function ModelMenu({ value, other, onChange, align }: { value: ModelId; other: ModelId; onChange: (m: ModelId) => void; align: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 items-center gap-1.5 rounded-control bg-surface pr-1.5 pl-2.5 text-[12.5px] font-medium text-ink shadow-btn transition-colors duration-100 hover:bg-hover"
      >
        {MODEL_LABEL[value]}
        <CaretDown size={11} weight="bold" className="text-ink-3" />
      </button>
      {open && (
        <div
          className={cn("absolute top-full z-30 mt-1.5 w-36 rounded-[10px] bg-surface p-1 shadow-overlay", align === "left" ? "left-0" : "right-0")}
          style={{ animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: align === "left" ? "top left" : "top right" }}
          role="listbox"
        >
          <GlideMenu className="flex flex-col gap-px" highlightClassName="inset-x-0 rounded-[6px] bg-hover">
            {MODEL_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={id === value}
                disabled={id === other}
                data-menu-row
                onClick={() => {
                  onChange(id);
                  setOpen(false);
                }}
                className="relative z-10 flex h-7.5 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[12.5px] text-ink disabled:opacity-40"
              >
                <span className="flex-1">{MODEL_LABEL[id]}</span>
                {id === other && <span className="text-[11px] text-ink-3">other side</span>}
                <Check size={11} weight="bold" className={cn(id !== value && "invisible")} />
              </button>
            ))}
          </GlideMenu>
        </div>
      )}
    </div>
  );
}

function OddsBar({ label, p, a, b }: { label: string; p: number; a: TeamMeta; b: TeamMeta }) {
  const side: Side | null = p === 0.5 ? null : p > 0.5 ? "a" : "b";
  const t = side === "a" ? a : side === "b" ? b : null;
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)_92px] items-center gap-2.5 text-[12.5px]">
      <span className="font-medium text-ink">{label}</span>
      <span className="flex h-2 overflow-hidden rounded-full" aria-hidden>
        <span className="h-full rounded-l-full transition-[width] duration-500 ease-out-strong" style={{ width: `calc(${pc(p)} - 1px)`, background: sideColor("a") }} />
        <span className="h-full w-[2px] shrink-0 bg-surface" />
        <span className="h-full flex-1 rounded-r-full" style={{ background: sideColor("b") }} />
      </span>
      <span className="flex items-center justify-end gap-1.5 text-ink-2">
        {t && side && <TeamMark tag={t.tag} side={side} size="xs" />}
        <span className="num">{t ? pct(Math.max(p, 1 - p)) : "50%"}</span>
      </span>
    </div>
  );
}

/* a bar on phones, a square once there's room */
const CELL = "block h-3 w-full rounded-[2px] sm:h-auto sm:aspect-square";

function Cell({ score }: { score: number }) {
  if (score === 0.5) return <span className={cn(CELL, "bg-line-strong")} />;
  return score === 1 ? <span className={cn(CELL, "bg-ink")} /> : <span className={cn(CELL, "shadow-[inset_0_0_0_1.25px_var(--line-strong)]")} />;
}

export function ModelDuel({
  ds,
  fit,
  calib,
  a,
  b,
  current,
  subject,
}: {
  ds: Dataset;
  fit: Fit;
  calib: Calib;
  a: TeamMeta;
  b: TeamMeta;
  /** both-model odds (P(A)) for the picker's matchup */
  current: Record<ModelId, number>;
  subject: string;
}) {
  const [m1, setM1] = useState<ModelId>("elo");
  const [m2, setM2] = useState<ModelId>("lr");
  const [hover, setHover] = useState<DuelCell | null>(null);
  const d = useMemo(() => buildDuel(ds, fit, m1, m2, calib), [ds, fit, m1, m2, calib]);
  const side = (p: number) => (p === 0.5 ? 0 : p > 0.5 ? 1 : -1);
  const agree = side(current[m1]) === side(current[m2]);
  const dis = d.cells.filter((c) => c.disagree);
  const l1 = MODEL_LABEL[m1];
  const l2 = MODEL_LABEL[m2];

  return (
    <div className="w-full overflow-hidden rounded-card bg-surface shadow-card">
      <div className="primitive-card-bar flex items-center justify-between gap-3 border-b border-line">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
          <Sword size={14} weight="bold" className="text-ink-3" />
          Model duel
        </span>
        <span className="flex items-center gap-1.5 text-[12px] text-ink-3">
          <ModelMenu value={m1} other={m2} onChange={setM1} align="right" />
          vs
          <ModelMenu value={m2} other={m1} onChange={setM2} align="right" />
        </span>
      </div>

      <div className="primitive-card-pad flex flex-col gap-2 border-b border-line">
        <p className="text-[11.5px] font-medium text-ink-3">
          This match · {a.tag} vs {b.tag} on {subject}
        </p>
        <OddsBar label={l1} p={current[m1]} a={a} b={b} />
        <OddsBar label={l2} p={current[m2]} a={a} b={b} />
        <p className="text-[12px] text-pretty text-ink-2">
          {agree ? (
            <>They back the same team.</>
          ) : (
            <>
              They disagree: {l1} backs {side(current[m1]) > 0 ? a.name : b.name}, {l2} backs {side(current[m2]) > 0 ? a.name : b.name}.
            </>
          )}
        </p>
      </div>

      <div className="primitive-card-pad flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <p className="text-[11.5px] font-medium text-ink-3">Held out · {d.cells.length} Toronto maps</p>
          <div className="flex items-baseline gap-4">
            {(
              [
                [l1, d.acc1],
                [l2, d.acc2],
              ] as const
            ).map(([label, acc]) => (
              <span key={label} className="flex items-baseline gap-1.5">
                <span className="text-[12px] text-ink-3">{label}</span>
                <span className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
                  <RollingNumber value={acc * 100} decimals={1} suffix="%" />
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="relative" onPointerLeave={() => setHover(null)}>
          <div className="grid gap-x-px sm:gap-x-[3px]" style={{ gridTemplateColumns: `minmax(40px, 52px) repeat(${d.cells.length}, minmax(0, 1fr))` }}>
            {[0, 1].map((row) => (
              <div key={row} className="contents">
                <span className="flex items-center text-[11px] text-ink-3">{row === 0 ? l1 : l2}</span>
                {d.cells.map((c) => (
                  <span
                    key={`${row}-${c.id}`}
                    onPointerEnter={() => setHover(c)}
                    className={cn("flex items-center px-px py-[3px] sm:px-px", c.disagree && "bg-hover-2", row === 0 ? "rounded-t-[3px]" : "rounded-b-[3px]", hover?.id === c.id && "bg-field")}
                  >
                    <Cell score={row === 0 ? c.s1 : c.s2} />
                  </span>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-2 min-h-[20px] text-[11.5px] text-ink-3">
            {hover ? (
              <span className="num">
                {formatDate(hover.m.date, { year: false })} · {teamTag(hover.m.a)} vs {teamTag(hover.m.b)} · {hover.m.map} · {l1} {teamTag(hover.p1 >= 0.5 ? hover.m.a : hover.m.b)} {pct(Math.max(hover.p1, 1 - hover.p1))}, {l2}{" "}
                {teamTag(hover.p2 >= 0.5 ? hover.m.a : hover.m.b)} {pct(Math.max(hover.p2, 1 - hover.p2))} · {teamTag(winnerName(hover.m))} won
              </span>
            ) : (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[2px] bg-ink" /> right
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[2px] shadow-[inset_0_0_0_1.25px_var(--line-strong)]" /> wrong
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-3 rounded-[2px] bg-hover-2" /> they disagree
                </span>
              </span>
            )}
          </div>
        </div>

        <p className="text-[12.5px] text-pretty text-ink-2">
          {d.disagreements === 0 ? (
            <>They picked the same team on every held-out map.</>
          ) : (
            <>
              They picked different teams on <span className="num font-medium text-ink">{d.disagreements}</span> of {d.cells.length} maps.{" "}
              {d.right1 === d.right2 ? (
                <>Each was right on {d.right1}.</>
              ) : (
                <>
                  {d.right1 > d.right2 ? l1 : l2} was right on <span className="num font-medium text-ink">{Math.max(d.right1, d.right2)}</span> of them,{" "}
                  {d.right1 > d.right2 ? l2 : l1} on <span className="num">{Math.min(d.right1, d.right2)}</span>.
                </>
              )}
            </>
          )}
        </p>

        {dis.length > 0 && (
          <ScrollFade className="max-h-[188px] rounded-control bg-inset shadow-hairline" style={{ scrollbarWidth: "thin" }}>
            <ul>
              {dis.map((c) => {
                const won = winnerName(c.m);
                const who = c.s1 > c.s2 ? l1 : c.s2 > c.s1 ? l2 : null;
                return (
                  <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-[var(--grid-line)] px-2.5 py-1.5 text-[12px] last:border-b-0">
                    <span className="min-w-0">
                      <span className="num block truncate text-ink">
                        {formatDate(c.m.date, { year: false })} · {teamTag(c.m.a)} vs {teamTag(c.m.b)} · {c.m.map}
                      </span>
                      <span className="num block truncate text-[11.5px] text-ink-3">
                        {l1} {teamTag(c.p1 >= 0.5 ? c.m.a : c.m.b)} {pct(Math.max(c.p1, 1 - c.p1))} · {l2} {teamTag(c.p2 >= 0.5 ? c.m.a : c.m.b)}{" "}
                        {pct(Math.max(c.p2, 1 - c.p2))} · {teamTag(won)} won
                      </span>
                    </span>
                    <span className="flex items-center gap-1 text-[12px] font-medium text-ink-2">
                      {who ? (
                        <>
                          <CheckGlyph size={11} className="text-green" />
                          {who}
                        </>
                      ) : (
                        <span className="text-ink-3">neither</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </ScrollFade>
        )}
      </div>
    </div>
  );
}
