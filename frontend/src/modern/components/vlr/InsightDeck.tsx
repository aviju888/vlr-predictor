"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Liveline, type LivelinePoint, type LivelineSeries } from "liveline";
import { formatDate, teamTag } from "@/modern/lib/vlr/dataset";
import { ELO_BASE, type EloRun } from "@/modern/lib/vlr/models/elo";
import { recencyWeight } from "@/modern/lib/vlr/features";
import { MODEL_LABEL, type Calib, type Fit, type ModelId } from "@/modern/lib/vlr/pipeline";
import type { Dataset, Side, TeamMeta } from "@/modern/lib/vlr/types";
import { mapRecords, upsets as findUpsets, type Upset } from "@/modern/lib/vlr/views";
import { pc, pct, sideColor, TeamMark, teamHex, useIsDark } from "./ui";

/* ─────────────────────────────────────────────────────────
 * INSIGHTS — Insight Cards on the data behind the pick.
 *   Form      both teams' Elo rating after every match day
 *   Map pool  each team's record on every map
 *   Upsets    how often the favorite lost on held-out maps
 * Each page ends with one action that moves the rest of the
 * page (filter the records, switch the map, rewind).
 * ───────────────────────────────────────────────────────── */

const SPAN = 42;

/** evenly spaced points ending at `t0` (ms), as liveline expects */
function toPoints(vals: number[], t0: number): LivelinePoint[] {
  const n = vals.length;
  return vals.map((value, i) => ({ time: Math.floor(t0 / 1000) - (n - 1 - i) * (SPAN / Math.max(1, n - 1)), value }));
}

function chartIndexFromPointer(event: React.PointerEvent<HTMLDivElement>, count: number) {
  const rect = event.currentTarget.getBoundingClientRect();
  const progress = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  return Math.round(progress * (count - 1));
}

/** each team's rating on every match day, drifting between the days it plays */
export function ratingSeries(ds: Dataset, elo: EloRun, team: string, halfLife: number): { date: string; r: number }[] {
  const days = [...new Map(ds.matches.map((m) => [m.date, m.day])).entries()];
  const traj = elo.trajectory[team] ?? [];
  return days.map(([date, day]) => {
    const last = [...traj].reverse().find((p) => p.day <= day);
    if (!last) return { date, r: ELO_BASE };
    return { date, r: ELO_BASE + (last.r - ELO_BASE) * recencyWeight(day - last.day, halfLife) };
  });
}

/**
 * Liveline frames time around "now" and freezes its y-range once paused,
 * so it runs live for a moment (the range settles on every point), then
 * pauses. Keyed by matchup so each new pair gets a fresh chart.
 */
function FormChart({ series, dark }: { series: LivelineSeries[]; dark: boolean }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setPaused(true), 1400);
    return () => clearTimeout(t);
  }, []);
  return (
    <Liveline
      data={[]}
      value={0}
      series={series}
      theme={dark ? "dark" : "light"}
      grid={false}
      pulse={false}
      window={SPAN + 4}
      paused={paused}
      scrub={false}
      cursor="default"
      lineWidth={2}
      lerpSpeed={0.4}
      padding={{ top: 10, right: 0, bottom: 8, left: 0 }}
      style={{ height: "auto", flex: "1 1 0", minHeight: 0 }}
      formatValue={(v) => Math.round(v).toLocaleString("en-US")}
      formatTime={() => ""}
    />
  );
}

function FormCard({ ds, fit, a, b }: { ds: Dataset; fit: Fit; a: TeamMeta; b: TeamMeta }) {
  const dark = useIsDark();
  const hex = teamHex(dark);
  const sa = useMemo(() => ratingSeries(ds, fit.elo, a.name, fit.knobs.halfLife), [ds, fit, a.name]);
  const sb = useMemo(() => ratingSeries(ds, fit.elo, b.name, fit.knobs.halfLife), [ds, fit, b.name]);
  const [now, setNow] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const key = `${a.name}|${b.name}|${fit.knobs.k}|${fit.knobs.halfLife}|${fit.knobs.mapShare}|${dark}`;
  useEffect(() => {
    // liveline frames time around "now", so stamp the points after mount
    const id = requestAnimationFrame(() => setNow(Date.now()));
    return () => cancelAnimationFrame(id);
  }, [key]);
  const n = sa.length;
  const series: LivelineSeries[] = useMemo(
    () =>
      now === null
        ? []
        : [
            { id: a.name, label: a.tag, data: toPoints(sa.map((p) => p.r), now), value: sa[sa.length - 1].r, color: hex.a },
            { id: b.name, label: b.tag, data: toPoints(sb.map((p) => p.r), now), value: sb[sb.length - 1].r, color: hex.b },
          ],
    [now, sa, sb, hex.a, hex.b, a.name, b.name, a.tag, b.tag],
  );
  const gapAt = ds.matches.findIndex((m) => m.split === "valid");
  const dates = sa.map((p) => p.date);
  const gapIdx = dates.indexOf(ds.matches[gapAt].date);

  return (
    <div className="min-h-[268px] rounded-card bg-surface p-3 shadow-hairline">
      <div className="flex items-center gap-4">
        {(
          [
            ["a", a, sa],
            ["b", b, sb],
          ] as const
        ).map(([side, t, s]) => (
          <div key={side} className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[11.5px] text-ink-2">
              <span className="size-2 rounded-full" style={{ background: sideColor(side) }} />
              <span className="truncate">{t.name}</span>
            </span>
            <span className="num block text-[17px] font-semibold tracking-[-0.01em] text-ink">{Math.round(s[n - 1].r).toLocaleString("en-US")}</span>
            <span className="num text-[11px] text-ink-3">
              peak {Math.round(Math.max(...s.map((p) => p.r))).toLocaleString("en-US")}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 overflow-hidden rounded-control bg-inset shadow-hairline">
        <div className="flex items-center justify-between border-b border-line px-2.5 py-1.5">
          <span className="num text-[11px] text-ink-3">
            {hover !== null ? `${formatDate(dates[hover], { year: false })} · ${teamTag(a.name)} ${Math.round(sa[hover].r)} · ${teamTag(b.name)} ${Math.round(sb[hover].r)}` : "Elo after each match day"}
          </span>
          <span className="rounded-full bg-field px-2 py-0.5 text-[10.5px] font-medium text-ink-2">{hover !== null && hover >= gapIdx ? "Toronto" : hover !== null ? "Bangkok" : `${n} match days`}</span>
        </div>
        <div
          className="insight-chart-stage relative flex h-[176px] flex-col pt-1"
          onPointerDown={(e) => setHover(chartIndexFromPointer(e, n))}
          onPointerMove={(e) => setHover(chartIndexFromPointer(e, n))}
          onPointerLeave={() => setHover(null)}
          onPointerCancel={() => setHover(null)}
        >
          {now !== null && <FormChart key={key} series={series} dark={dark} />}
          {/* where Bangkok ends and Toronto starts */}
          <span className="pointer-events-none absolute top-0 bottom-0 w-px bg-line-strong" style={{ left: pc((gapIdx - 0.5) / (n - 1)) }} aria-hidden />
          {hover !== null && <span className="insight-chart-cursor" style={{ left: pc(hover / (n - 1)) }} />}
        </div>
      </div>
    </div>
  );
}

function MapPoolCard({ ds, a, b, before }: { ds: Dataset; a: TeamMeta; b: TeamMeta; before?: string }) {
  const ra = mapRecords(ds, a.name, before);
  const rb = mapRecords(ds, b.name, before);
  return (
    <div className="min-h-[268px] rounded-card bg-surface p-3 shadow-hairline">
      <div className="flex items-center gap-3 text-[11.5px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <TeamMark tag={a.tag} side="a" size="xs" /> {a.name}
        </span>
        <span className="flex items-center gap-1.5">
          <TeamMark tag={b.tag} side="b" size="xs" /> {b.name}
        </span>
      </div>
      <ul className="mt-3 flex flex-col gap-2.5">
        {ds.maps.map((m, i) => (
          <li key={m} className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-2.5">
            <span className="text-[12px] font-medium text-ink">{m}</span>
            <span className="flex flex-col gap-[3px]">
              {(
                [
                  ["a", ra[i]],
                  ["b", rb[i]],
                ] as const
              ).map(([side, r]) => (
                <span key={side} className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-2">
                  <span className="h-[7px] overflow-hidden rounded-full bg-field">
                    <span
                      className="block h-full rounded-full transition-[width] duration-500 ease-out-strong"
                      style={{ width: r.maps ? pc(r.wins / r.maps) : "0%", background: sideColor(side as Side) }}
                    />
                  </span>
                  <span className="num text-right text-[11px] text-ink-3">{r.maps ? `${r.wins}-${r.maps - r.wins}` : "none"}</span>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-3">Bar length is map win rate; the numbers are wins and losses in the data.</p>
    </div>
  );
}

function UpsetCard({ calls, list, rate, label }: { calls: number; list: Upset[]; rate: number; label: string }) {
  return (
    <div className="min-h-[268px] rounded-card bg-surface p-3 shadow-hairline">
      <span className="text-[12px] font-medium text-ink">Upsets on Toronto</span>
      <span className="mt-1 flex items-baseline gap-2">
        <span className="num text-[26px] font-semibold tracking-[-0.02em] text-ink">{Math.round(rate * 100)}%</span>
        <span className="num text-[12px] text-ink-3">
          {list.length} of {calls} maps went to {label}&apos;s underdog
        </span>
      </span>
      <div className="mt-2 flex h-2.5 overflow-hidden rounded-full" aria-hidden>
        <span className="h-full rounded-l-full bg-ink" style={{ width: `calc(${pc(1 - rate)} - 1px)` }} />
        <span className="h-full w-[2px] shrink-0 bg-surface" />
        <span className="h-full flex-1 rounded-r-full bg-line-strong" />
      </div>
      <p className="num mt-1 flex justify-between text-[11px] text-ink-3">
        <span>favorite won</span>
        <span>underdog won</span>
      </p>
      <p className="mt-3 text-[11.5px] font-medium text-ink-3">Biggest</p>
      <ul className="mt-1 flex flex-col">
        {list.slice(0, 4).map((u) => (
          <li key={u.m.id} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 border-b border-[var(--grid-line)] py-1.5 text-[12px] last:border-b-0">
            <span className="num text-ink-3">{formatDate(u.m.date, { year: false })}</span>
            <span className="min-w-0 truncate text-ink-2">
              <span className="text-ink">{teamTag(u.underdog)}</span> over {teamTag(u.favorite)} · {u.m.map}
            </span>
            <span className="num text-ink-3">{pct(u.conf)} fav</span>
          </li>
        ))}
        {list.length === 0 && <li className="py-2 text-[12px] text-ink-3">No upsets: every favorite won.</li>}
      </ul>
    </div>
  );
}

export type InsightActions = {
  onShowTeam: (team: string) => void;
  onMap: (map: string) => void;
  onRewind: (u: Upset) => void;
};

export function InsightDeck({
  ds,
  fit,
  a,
  b,
  model,
  calib,
  before,
  actions,
}: {
  ds: Dataset;
  fit: Fit;
  a: TeamMeta;
  b: TeamMeta;
  model: ModelId;
  calib: Calib;
  before?: string;
  actions: InsightActions;
}) {
  const [page, setPage] = useState(0);
  const sa = ratingSeries(ds, fit.elo, a.name, fit.knobs.halfLife);
  const sb = ratingSeries(ds, fit.elo, b.name, fit.knobs.halfLife);
  const peakA = sa.reduce((m, p) => (p.r > m.r ? p : m), sa[0]);
  const ra = mapRecords(ds, a.name, before);
  const bestMap = [...ra].sort((x, y) => (y.maps ? y.wins / y.maps : 0) - (x.maps ? x.wins / x.maps : 0) || y.maps - x.maps)[0];
  const up = findUpsets(ds, fit, model, calib);
  const top = up.upsets[0];
  const delta = Math.round(sa[sa.length - 1].r - sb[sb.length - 1].r);

  const pages: { key: string; prose: ReactNode; card: ReactNode; pill: string; act: () => void }[] = [
    {
      key: "form",
      prose: (
        <>
          {a.name} peaked at <span className="num font-medium text-ink">{Math.round(peakA.r).toLocaleString("en-US")}</span> on {formatDate(peakA.date, { year: false })}. At the end of the dataset it sits{" "}
          <span className="num font-medium text-ink">{Math.abs(delta)}</span> points {delta >= 0 ? "above" : "below"} {b.name}.
        </>
      ),
      card: <FormCard ds={ds} fit={fit} a={a} b={b} />,
      pill: `Show ${a.name}'s maps`,
      act: () => actions.onShowTeam(a.name),
    },
    {
      key: "maps",
      prose: bestMap.maps ? (
        <>
          {a.name}&apos;s best map is <span className="font-medium text-ink">{bestMap.map}</span> at{" "}
          <span className="num font-medium text-ink">
            {bestMap.wins}-{bestMap.maps - bestMap.wins}
          </span>
          . Small samples: one series moves these a lot.
        </>
      ) : (
        <>{a.name} has no maps in the data before this day.</>
      ),
      card: <MapPoolCard ds={ds} a={a} b={b} before={before} />,
      pill: `Predict ${a.tag} vs ${b.tag} on ${bestMap.map}`,
      act: () => actions.onMap(bestMap.map),
    },
    {
      key: "upsets",
      prose: top ? (
        <>
          The biggest held-out upset: <span className="font-medium text-ink">{top.underdog}</span> took {top.m.map} off {top.favorite}, who {MODEL_LABEL[model]} gave{" "}
          <span className="num font-medium text-ink">{pct(top.conf)}</span>.
        </>
      ) : (
        <>No held-out favorite lost a map.</>
      ),
      card: <UpsetCard calls={up.calls} list={up.upsets} rate={up.rate} label={MODEL_LABEL[model]} />,
      pill: top ? `Rewind to ${teamTag(top.m.a)} vs ${teamTag(top.m.b)}` : "Rewind",
      act: () => top && actions.onRewind(top),
    },
  ];
  const cur = pages[page];

  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        <span className="flex items-baseline gap-1.5">
          <span className="text-[13px] font-semibold text-ink">Insights</span>
          <span className="num text-[13px] text-ink-3">{pages.length}</span>
        </span>
        <span className="flex items-center gap-0.5">
          {(["M15 18l-6-6 6-6", "M9 6l6 6-6 6"] as const).map((d, i) => (
            <button
              key={i}
              type="button"
              aria-label={i === 0 ? "Previous insight" : "Next insight"}
              onClick={() => setPage((p) => (p + (i === 0 ? -1 : 1) + pages.length) % pages.length)}
              className="flex size-6 items-center justify-center rounded-[6px] text-ink-3 transition-[background-color,color,transform] duration-100 hover:bg-hover hover:text-ink active:scale-[0.96]"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={d} />
              </svg>
            </button>
          ))}
        </span>
      </div>
      <div key={cur.key} style={{ animation: "fade-in 220ms ease-out both" }}>
        <p className="mt-1.5 min-h-[40px] text-[12.5px] leading-relaxed text-pretty text-ink-2">{cur.prose}</p>
        <div className="mt-2">{cur.card}</div>
        <button
          type="button"
          onClick={cur.act}
          className="press mt-2 rounded-full bg-surface px-3 py-1.5 text-left text-[12px] text-ink shadow-btn transition-colors duration-100 hover:bg-hover"
        >
          {cur.pill}
        </button>
      </div>
      <div className="mt-2 flex justify-center gap-1" aria-hidden>
        {pages.map((p, i) => (
          <span key={p.key} className="h-1 rounded-full transition-[width,background-color] duration-300" style={{ width: i === page ? 14 : 4, background: i === page ? "var(--ink-2)" : "var(--line-strong)" }} />
        ))}
      </div>
    </div>
  );
}
