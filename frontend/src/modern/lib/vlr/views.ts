import { formatDate, teamTag, winnerName } from "./dataset";
import { buildFeatures, featureParams, queryFor } from "./features";
import { callScore, favorite, wilson } from "./metrics";
import type { Calib, Fit, ModelId } from "./pipeline";
import type { Dataset, Match, SeriesInfo, Side } from "./types";

/* ─────────────────────────────────────────────────────────
 * VIEWS — what the UI shows, derived from a fit. Pure, so the
 * numbers on screen are the numbers in the tests.
 * ───────────────────────────────────────────────────────── */

export const probOf = (fit: Fit, id: string, model: ModelId, calib: Calib) => (calib === "platt" ? fit.preds[id].cal[model] : fit.preds[id].raw[model]);

export const yOf = (m: Match): 0 | 1 => (m.winner === "a" ? 1 : 0);

/* ── suggestions ─────────────────────────────────────────── */

export type Suggestion = { key: string; label: string; note: string; a: string; b: string; map: string; date: string; event: string };

/**
 * Real matchups to rewind to. Held-out (Toronto) series only: rewinding into
 * Bangkok would score a match with weights that were fit on it.
 */
export function suggestions(ds: Dataset): Suggestion[] {
  const out: Suggestion[] = [];
  const held = ds.series.filter((s) => s.split === "valid");
  const add = (s: SeriesInfo | undefined, note?: string) => {
    if (!s || out.some((o) => o.key === s.id)) return;
    out.push({ key: s.id, label: `${teamTag(s.a)} vs ${teamTag(s.b)}`, note: note ?? formatDate(s.date, { year: false }), a: s.a, b: s.b, map: s.maps[0], date: s.date, event: s.eventShort });
  };
  // the last series of an event is its final
  add(held.at(-1), "final");
  const has = (s: SeriesInfo, x: string, y: string) => [s.a, s.b].includes(x) && [s.a, s.b].includes(y);
  add(held.find((s) => has(s, "Paper Rex", "T1")));
  add(held.find((s) => has(s, "Sentinels", "DRX")));
  add(held[0]);
  return out;
}

/* ── records ─────────────────────────────────────────────── */

export type RecordRow = {
  id: string;
  date: string;
  dateLabel: string;
  event: string;
  split: Match["split"];
  a: string;
  b: string;
  map: string;
  /** P(A) from the chosen model */
  p: number;
  pick: Side | null;
  winner: Side;
  score: number;
  conflict: boolean;
  seriesScore: string;
};

export function recordRows(ds: Dataset, fit: Fit, model: ModelId, calib: Calib): RecordRow[] {
  return ds.matches.map((m) => {
    const p = probOf(fit, m.id, model, calib);
    return {
      id: m.id,
      date: m.date,
      dateLabel: formatDate(m.date, { year: false }),
      event: m.eventShort,
      split: m.split,
      a: m.a,
      b: m.b,
      map: m.map,
      p,
      pick: p === 0.5 ? null : p > 0.5 ? "a" : "b",
      winner: m.winner,
      score: callScore(p, yOf(m)),
      conflict: m.conflict,
      seriesScore: m.score,
    };
  });
}

/* ── duel ────────────────────────────────────────────────── */

export type DuelCell = { id: string; m: Match; p1: number; p2: number; s1: number; s2: number; disagree: boolean };

export type Duel = {
  cells: DuelCell[];
  acc1: number;
  acc2: number;
  disagreements: number;
  /** of the disagreements, how many each model got right */
  right1: number;
  right2: number;
};

export function duel(ds: Dataset, fit: Fit, m1: ModelId, m2: ModelId, calib: Calib): Duel {
  const cells = ds.matches
    .filter((m) => m.split === "valid")
    .map((m) => {
      const p1 = probOf(fit, m.id, m1, calib);
      const p2 = probOf(fit, m.id, m2, calib);
      const side = (p: number) => (p === 0.5 ? 0 : p > 0.5 ? 1 : -1);
      return { id: m.id, m, p1, p2, s1: callScore(p1, yOf(m)), s2: callScore(p2, yOf(m)), disagree: side(p1) !== side(p2) };
    });
  const dis = cells.filter((c) => c.disagree);
  const n = Math.max(1, cells.length);
  return {
    cells,
    acc1: cells.reduce((s, c) => s + c.s1, 0) / n,
    acc2: cells.reduce((s, c) => s + c.s2, 0) / n,
    disagreements: dis.length,
    right1: dis.reduce((s, c) => s + c.s1, 0),
    right2: dis.reduce((s, c) => s + c.s2, 0),
  };
}

/* ── upsets ──────────────────────────────────────────────── */

export type Upset = { m: Match; conf: number; underdog: string; favorite: string };

export function upsets(ds: Dataset, fit: Fit, model: ModelId, calib: Calib, split: Match["split"] = "valid") {
  const ms = ds.matches.filter((m) => m.split === split);
  const list: Upset[] = [];
  let calls = 0;
  for (const m of ms) {
    const p = probOf(fit, m.id, model, calib);
    if (p === 0.5) continue;
    calls += 1;
    const f = favorite(p, yOf(m));
    if (f.won === 0) {
      const favSide: Side = p > 0.5 ? "a" : "b";
      list.push({ m, conf: f.conf, favorite: favSide === "a" ? m.a : m.b, underdog: winnerName(m) });
    }
  }
  list.sort((x, y) => y.conf - x.conf);
  return { calls, upsets: list, rate: list.length / Math.max(1, calls) };
}

/* ── map records ─────────────────────────────────────────── */

export type MapRecord = { map: string; wins: number; maps: number };

export function mapRecords(ds: Dataset, team: string, before?: string): MapRecord[] {
  return ds.maps.map((map) => {
    const ms = ds.matches.filter((m) => m.map === map && (m.a === team || m.b === team) && (!before || m.date < before));
    return { map, maps: ms.length, wins: ms.filter((m) => winnerName(m) === team).length };
  });
}

/* ── pick'em ─────────────────────────────────────────────── */

export type PickemRound = {
  id: string;
  m: Match;
  /** what each team had done before the match, so the viewer sees what the model saw */
  context: Record<Side, { maps: number; wins: number; streak: number; onMap: string }>;
};

/** 5 held-out maps from 5 different series. `rand` is a 0..1 source (Math.random in the browser) */
export function pickemDeck(ds: Dataset, rand: () => number, size = 5): PickemRound[] {
  const series = ds.series.filter((s) => s.split === "valid");
  const order = series.map((s) => ({ s, k: rand() })).sort((x, y) => x.k - y.k);
  const fp = featureParams(60);
  return order.slice(0, size).map(({ s }) => {
    const id = s.matchIds[Math.floor(rand() * s.matchIds.length)];
    const m = ds.matches.find((x) => x.id === id)!;
    const f = buildFeatures(ds.matches, queryFor(m), fp);
    const ctx = (h: typeof f.a) => ({ maps: h.maps, wins: h.wins, streak: h.streak, onMap: `${h.mapWins}-${h.mapMaps - h.mapWins}` });
    return { id: m.id, m, context: { a: ctx(f.a), b: ctx(f.b) } };
  });
}

/* ── calibration helpers ─────────────────────────────────── */

export function binInterval(hit: number, n: number): [number, number] {
  return wilson(hit * n, n);
}
