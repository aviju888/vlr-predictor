"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowCounterClockwise,
  CaretDown,
  Check,
  Prohibit,
  Shuffle,
} from "@phosphor-icons/react";
import GlideMenu from "@/modern/components/atoms/GlideMenu";
import { RollingNumber } from "@/modern/components/craft/RollingNumber";
import { cn } from "@/modern/lib/cn";
import { playSfx } from "@/modern/lib/sfx";
import {
  mapSetRange,
  simulateSeries,
  simulateVeto,
  winsNeeded,
  type BestOf,
  type LatticeEdge,
  type LatticeNode,
  type Scoreline,
} from "@/modern/lib/vlr/series";
import type { Side, TeamMeta } from "@/modern/lib/vlr/types";
import {
  pc,
  pct,
  pctNum,
  r2,
  Segmented,
  sideColor,
  TeamMark,
  useDismiss,
  useReducedMotionPref,
  useWidth,
} from "./ui";

/* ─────────────────────────────────────────────────────────
 * SERIES SIMULATOR — map odds → a best-of-3 or best-of-5.
 *
 *   veto      each team bans its weakest map, picks its best
 *   slots     the maps in play order; click one to swap maps
 *   lattice   every score the series can pass through. Columns
 *             are maps played, rows are the score gap. Line width
 *             is how likely the series walks that branch; red is
 *             a map for team A, blue for team B.
 *   outcome   series odds and the scorelines, most likely first
 *
 * Geometry is animated with motion, so changing teams, model,
 * order or format mid-animation just retargets.
 * ───────────────────────────────────────────────────────── */

const EASE = [0.23, 1, 0.32, 1] as const;

type Override = { key: string; order: string[] } | null;

function SlotMenu({
  index,
  map,
  pool,
  order,
  odds,
  aTag,
  onPick,
  label,
}: {
  index: number;
  map: string;
  pool: string[];
  order: string[];
  odds: Record<string, number>;
  aTag: string;
  onPick: (m: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  const p = odds[map] ?? 0.5;
  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full min-w-0 flex-col gap-1 rounded-[8px] bg-inset px-2 py-1.5 text-left shadow-hairline transition-colors duration-100 hover:bg-hover",
          open && "bg-hover",
        )}
      >
        <span className="flex w-full items-center gap-1">
          <span className="num text-[10.5px] font-medium text-ink-3">
            {index + 1}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
            {map}
          </span>
          <CaretDown size={10} weight="bold" className="shrink-0 text-ink-3" />
        </span>
        <span className="flex w-full items-center gap-1.5">
          <span
            className="relative h-1 min-w-0 flex-1 overflow-hidden rounded-full"
            style={{ background: "var(--team-b)" }}
            aria-hidden
          >
            <motion.span
              className="absolute inset-y-0 left-0 border-r-2 border-inset"
              style={{ background: "var(--team-a)" }}
              initial={false}
              animate={{ width: pc(p) }}
              transition={{ duration: 0.45, ease: EASE }}
            />
          </span>
          <span className="num shrink-0 text-[11px] text-ink-2">{pct(p)}</span>
        </span>
        <span className="truncate text-[10.5px] text-ink-3">{label}</span>
      </button>
      {open && (
        <div
          className="absolute top-full left-0 z-30 mt-1 w-48 rounded-[10px] bg-surface p-1 shadow-overlay"
          style={{
            animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both",
            transformOrigin: "top left",
          }}
          role="listbox"
        >
          <p className="px-2 pt-1 pb-1 text-[11px] text-ink-3">
            Map {index + 1}, {aTag} odds
          </p>
          <GlideMenu
            className="flex flex-col gap-px"
            highlightClassName="inset-x-0 rounded-[6px] bg-hover"
          >
            {pool.map((m) => {
              const at = order.indexOf(m);
              return (
                <button
                  key={m}
                  type="button"
                  role="option"
                  aria-selected={m === map}
                  data-menu-row
                  onClick={() => {
                    onPick(m);
                    setOpen(false);
                    playSfx("tap", 0.6);
                  }}
                  className="relative z-10 flex h-7.5 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[12.5px] text-ink"
                >
                  <span className="min-w-0 flex-1 truncate">{m}</span>
                  <span className="text-[11px] text-ink-3">
                    {m === map
                      ? ""
                      : at >= 0
                        ? `swap with ${at + 1}`
                        : "unused"}
                  </span>
                  <span className="num w-9 text-right text-[12px] text-ink-2">
                    {pct(odds[m] ?? 0.5)}
                  </span>
                  <Check
                    size={11}
                    weight="bold"
                    className={cn("shrink-0", m !== map && "invisible")}
                  />
                </button>
              );
            })}
          </GlideMenu>
        </div>
      )}
    </div>
  );
}

function Lattice({
  nodes,
  edges,
  bestOf,
  a,
  b,
}: {
  nodes: LatticeNode[];
  edges: LatticeEdge[];
  bestOf: BestOf;
  a: TeamMeta;
  b: TeamMeta;
}) {
  const [ref, width, measured] = useWidth<HTMLDivElement>(560);
  const reduce = useReducedMotionPref();
  const need = winsNeeded(bestOf);
  const pad = width < 420 ? 44 : 48;
  const gap = bestOf === 3 ? 34 : 28;
  const top = 32;
  const height = top * 2 + 2 * need * gap;
  const x = (played: number) => r2(pad + (played * (width - 2 * pad)) / bestOf);
  const y = (sa: number, sb: number) => r2(top + (sb - sa + need) * gap);
  const t = reduce ? { duration: 0 } : { duration: 0.55, ease: EASE };
  const [hover, setHover] = useState<string | null>(null);
  const hovered = hover ? nodes.find((n) => `${n.a}-${n.b}` === hover) : null;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {measured && (
        <>
          {/* column labels: the map being played between two columns */}
          {Array.from({ length: bestOf }, (_, i) => (
            <span
              key={i}
              className="num pointer-events-none absolute top-0 -translate-x-1/2 text-[10.5px] text-ink-3"
              style={{ left: r2((x(i) + x(i + 1)) / 2) }}
            >
              M{i + 1}
            </span>
          ))}
          <svg
            width={width}
            height={height}
            className="absolute inset-0 overflow-visible"
            aria-hidden
          >
            <AnimatePresence initial={false}>
              {edges.map((e) => {
                const id = `${e.from.a}-${e.from.b}>${e.to.a}-${e.to.b}`;
                return (
                  <motion.line
                    key={id}
                    initial={{
                      opacity: 0,
                      x1: x(e.map),
                      y1: y(e.from.a, e.from.b),
                      x2: x(e.map),
                      y2: y(e.from.a, e.from.b),
                    }}
                    animate={{
                      opacity: r2(0.22 + 0.78 * Math.min(1, e.flow * 1.6)),
                      x1: x(e.map),
                      y1: y(e.from.a, e.from.b),
                      x2: x(e.map + 1),
                      y2: y(e.to.a, e.to.b),
                      strokeWidth: r2(1.5 + 11 * e.flow),
                    }}
                    exit={{ opacity: 0, transition: { duration: 0.15 } }}
                    transition={t}
                    stroke={sideColor(e.side)}
                    strokeLinecap="round"
                  />
                );
              })}
              {nodes
                .filter((n) => !n.terminal)
                .map((n) => (
                  <motion.circle
                    key={`n-${n.a}-${n.b}`}
                    initial={{
                      opacity: 0,
                      cx: x(n.a + n.b),
                      cy: y(n.a, n.b),
                      r: 0,
                    }}
                    animate={{
                      opacity: 1,
                      cx: x(n.a + n.b),
                      cy: y(n.a, n.b),
                      r: r2(3.5 + 4.5 * Math.sqrt(n.reach)),
                    }}
                    exit={{ opacity: 0, transition: { duration: 0.15 } }}
                    transition={t}
                    fill="var(--surface)"
                    stroke="var(--ink-2)"
                    strokeWidth={1.75}
                  />
                ))}
            </AnimatePresence>
          </svg>

          {/* hover targets + labels for every node, in HTML so text stays crisp at any width */}
          <AnimatePresence initial={false}>
            {nodes.map((n) => {
              const id = `${n.a}-${n.b}`;
              const left = x(n.a + n.b);
              const topY = y(n.a, n.b);
              if (n.terminal) {
                const side = n.winner as Side;
                return (
                  <motion.div
                    key={`t-${id}`}
                    className="absolute z-10"
                    initial={{ opacity: 0, left, top: topY, scale: 0.96 }}
                    animate={{ opacity: 1, left, top: topY, scale: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    transition={t}
                    style={{ x: "-50%", y: "-50%" }}
                    onPointerEnter={() => setHover(id)}
                    onPointerLeave={() => setHover(null)}
                  >
                    <span
                      className={cn(
                        "num inline-flex h-[22px] items-center gap-1.5 rounded-full bg-surface pr-2 pl-1.5 text-[11.5px] whitespace-nowrap shadow-btn",
                        hover === id && "shadow-[0_0_0_1.5px_var(--ink-2)]",
                      )}
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ background: sideColor(side) }}
                        aria-hidden
                      />
                      <span className="font-medium text-ink">
                        {n.a}-{n.b}
                      </span>
                      <span className="text-ink-3">{pct(n.reach)}</span>
                    </span>
                  </motion.div>
                );
              }
              return (
                <motion.button
                  key={`h-${id}`}
                  type="button"
                  aria-label={`${n.a}-${n.b}: reached ${pct(n.reach)} of the time`}
                  className="absolute z-10 size-6 rounded-full"
                  initial={{ left, top: topY }}
                  animate={{ left, top: topY }}
                  transition={t}
                  style={{ x: "-50%", y: "-50%" }}
                  onPointerEnter={() => setHover(id)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(id)}
                  onBlur={() => setHover(null)}
                />
              );
            })}
          </AnimatePresence>

          {hovered && !hovered.terminal && (
            <span
              className="insight-chart-tooltip pointer-events-none absolute z-20"
              style={{
                left: r2(
                  Math.min(Math.max(x(hovered.a + hovered.b), 80), width - 80),
                ),
                top: y(hovered.a, hovered.b) - 34,
                transform: "translateX(-50%)",
              }}
            >
              <span className="font-medium">
                {a.tag} {hovered.a}-{hovered.b} {b.tag}
              </span>
              <span className="opacity-70">reached {pct(hovered.reach)}</span>
            </span>
          )}
        </>
      )}
    </div>
  );
}

function Scorelines({
  lines,
  a,
  b,
}: {
  lines: Scoreline[];
  a: TeamMeta;
  b: TeamMeta;
}) {
  const max = Math.max(...lines.map((l) => l.p), 0.0001);
  return (
    <ul className="flex flex-col gap-1">
      {lines.map((l, i) => {
        const t = l.winner === "a" ? a : b;
        return (
          <li
            key={`${l.a}-${l.b}`}
            className="grid grid-cols-[auto_minmax(0,1fr)_44px] items-center gap-2.5 text-[12.5px]"
          >
            <span className="flex w-[104px] items-center gap-1.5 truncate">
              <TeamMark tag={t.tag} side={l.winner} size="xs" />
              <span className="num font-medium text-ink">
                {l.winner === "a" ? `${l.a}-${l.b}` : `${l.b}-${l.a}`}
              </span>
              {i === 0 && (
                <span className="text-[11px] text-ink-3">likeliest</span>
              )}
            </span>
            <span
              className="h-2 overflow-hidden rounded-full bg-field"
              aria-hidden
            >
              <motion.span
                className="block h-full rounded-full"
                style={{ background: sideColor(l.winner) }}
                initial={false}
                animate={{ width: pc(l.p / max) }}
                transition={{ duration: 0.5, ease: EASE }}
              />
            </span>
            <span className="num text-right text-ink-2">{pct(l.p)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function SeriesSimulator({
  a,
  b,
  odds,
  pool,
  bestOf,
  onBestOf,
  modelLabel,
}: {
  a: TeamMeta;
  b: TeamMeta;
  /** P(A takes the map) on every map in the pool */
  odds: Record<string, number>;
  pool: string[];
  bestOf: BestOf;
  onBestOf: (bo: BestOf) => void;
  modelLabel: string;
}) {
  const matchKey = `${a.name}|${b.name}|${bestOf}`;
  const [override, setOverride] = useState<Override>(null);
  const veto = useMemo(
    () => simulateVeto(pool, odds, bestOf),
    [pool, odds, bestOf],
  );
  const order =
    override && override.key === matchKey && override.order.length === bestOf
      ? override.order
      : veto.order;
  const edited = order !== veto.order && order.join() !== veto.order.join();
  const sim = useMemo(
    () =>
      simulateSeries(
        order.map((m) => odds[m] ?? 0.5),
        bestOf,
      ),
    [order, odds, bestOf],
  );
  const range = useMemo(
    () => mapSetRange(pool, odds, bestOf),
    [pool, odds, bestOf],
  );
  const pA = sim.pA;
  const fav: Side = pA >= 0.5 ? "a" : "b";
  const favTeam = fav === "a" ? a : b;

  const labelFor = (m: string) => {
    if (edited) return "your order";
    const step = veto.steps.find((s) => s.map === m);
    if (!step || step.kind === "decider") return "decider";
    return `${(step.by === "a" ? a : b).tag} pick`;
  };

  const setSlot = (i: number, m: string) => {
    const next = [...order];
    const j = next.indexOf(m);
    if (j >= 0) next[j] = next[i];
    next[i] = m;
    setOverride({ key: matchKey, order: next });
  };

  const shuffle = () => {
    // rotate the order by one: the same maps, a different decider
    setOverride({ key: matchKey, order: [...order.slice(1), order[0]] });
    playSfx("toggle", 0.6);
  };

  return (
    <div className="w-full overflow-hidden rounded-card bg-surface shadow-card">
      <div className="primitive-card-bar flex flex-wrap items-center justify-between gap-2 border-b border-line">
        <span className="text-[13px] font-medium text-ink">
          Series simulator
        </span>
        <div className="flex items-center gap-1.5">
          {edited ? (
            <button
              type="button"
              onClick={() => {
                setOverride(null);
                playSfx("toggle", 0.6);
              }}
              className="press inline-flex h-6.5 items-center gap-1 rounded-chip px-1.5 text-[12px] font-medium text-ink-2 hover:bg-hover hover:text-ink"
            >
              <ArrowCounterClockwise size={12} weight="bold" />
              Back to veto
            </button>
          ) : (
            <button
              type="button"
              onClick={shuffle}
              className="press inline-flex h-6.5 items-center gap-1 rounded-chip px-1.5 text-[12px] font-medium text-ink-2 hover:bg-hover hover:text-ink"
              title="Same maps, a different order"
            >
              <Shuffle size={12} weight="bold" />
              Reorder
            </button>
          )}
          <Segmented
            label="Series format"
            value={String(bestOf) as "3" | "5"}
            onChange={(v) => {
              onBestOf(Number(v) as BestOf);
              playSfx("toggle", 0.6);
            }}
            options={[
              { key: "3", label: "Bo3" },
              { key: "5", label: "Bo5" },
            ]}
            className="w-[104px]"
          />
        </div>
      </div>

      {/* veto line */}
      <div
        className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-2 text-[11.5px]"
        aria-label="Simulated veto"
      >
        <span className="mr-1 text-ink-3">Veto</span>
        {veto.steps.map((s, i) => (
          <span
            key={`${s.kind}-${s.map}`}
            className={cn(
              "inline-flex h-[22px] items-center gap-1 rounded-full px-2",
              s.kind === "ban"
                ? "bg-field text-ink-3"
                : "bg-inset text-ink-2 shadow-hairline",
            )}
            style={{ animation: `fade-in 240ms ease-out ${i * 40}ms both` }}
          >
            {s.kind === "ban" && <Prohibit size={11} weight="bold" />}
            {s.by ? (
              <span className="font-medium text-ink-2">
                {(s.by === "a" ? a : b).tag}
              </span>
            ) : (
              <span className="font-medium text-ink-2">Decider</span>
            )}
            {s.kind === "ban" ? (
              <span className="line-through decoration-ink-3/60">{s.map}</span>
            ) : (
              <span className="text-ink">{s.map}</span>
            )}
          </span>
        ))}
      </div>

      <div className="primitive-card-pad flex flex-col gap-3">
        <div
          className={cn(
            "grid gap-1.5",
            bestOf === 3 ? "grid-cols-3" : "grid-cols-3 sm:grid-cols-5",
          )}
        >
          {order.map((m, i) => (
            <SlotMenu
              key={`${i}`}
              index={i}
              map={m}
              pool={pool}
              order={order}
              odds={odds}
              aTag={a.tag}
              onPick={(next) => setSlot(i, next)}
              label={labelFor(m)}
            />
          ))}
        </div>

        <Lattice
          nodes={sim.nodes}
          edges={sim.edges}
          bestOf={bestOf}
          a={a}
          b={b}
        />

        <div className="grid gap-4 border-t border-line pt-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <p className="text-[11.5px] font-medium text-ink-3">
              Series odds · {modelLabel}
            </p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-[26px] leading-none font-semibold tracking-[-0.03em] text-ink">
                <RollingNumber
                  value={pctNum(Math.max(pA, 1 - pA))}
                  suffix="%"
                />
              </span>
              <span className="text-[13px] text-ink-2">{favTeam.name}</span>
            </p>
            <div
              className="mt-2 flex h-2 w-full overflow-hidden rounded-full"
              aria-hidden
            >
              <motion.span
                className="h-full rounded-l-full"
                style={{ background: "var(--team-a)" }}
                initial={false}
                animate={{ width: `calc(${pc(pA)} - 1px)` }}
                transition={{ duration: 0.5, ease: EASE }}
              />
              <span className="h-full w-[2px] shrink-0 bg-surface" />
              <span
                className="h-full flex-1 rounded-r-full"
                style={{ background: "var(--team-b)" }}
              />
            </div>
            <p className="num mt-1.5 flex justify-between text-[11.5px] text-ink-3">
              <span>
                {a.tag} {pct(pA)}
              </span>
              <span>
                {b.tag} {pct(1 - pA)}
              </span>
            </p>
            <p className="mt-2.5 text-[11.5px] leading-relaxed text-pretty text-ink-3">
              {range.sets === 1 ? (
                <>
                  A best-of-{bestOf} from a {pool.length}-map pool plays every
                  map, so only the order is left to choose.{" "}
                </>
              ) : pct(range.min.pA) === pct(range.max.pA) ? (
                <>
                  {a.tag} wins{" "}
                  <span className="num text-ink-2">{pct(range.min.pA)}</span> on
                  all {range.sets} possible map sets.{" "}
                </>
              ) : (
                <>
                  Across all {range.sets} possible map sets, {a.tag} wins{" "}
                  <span className="num text-ink-2">
                    {pct(range.min.pA)} to {pct(range.max.pA)}
                  </span>
                  .{" "}
                </>
              )}
              Map order only changes the scorelines. The series odds stay put
              because maps are treated as independent, as in the original.
            </p>
          </div>
          <div>
            <p className="mb-1.5 text-[11.5px] font-medium text-ink-3">
              Scorelines
            </p>
            <Scorelines lines={sim.scorelines} a={a} b={b} />
            <p className="num mt-2 text-[11.5px] text-ink-3">
              Expected maps played {sim.expectedMaps.toFixed(2)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
