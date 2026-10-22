import { recencyWeight } from "../features";
import type { Match } from "../types";

/* ─────────────────────────────────────────────────────────
 * ELO — the original's strength-of-schedule idea (a per-map
 * Elo, "sos_mapelo_diff") as a model of its own: one rating per
 * team plus a smaller rating per team on each map.
 *
 *   p(A takes the map) = 1 / (1 + 10^(-(gap)/400))
 *   gap = (team A − team B) + (A on this map − B on this map)
 *
 * Ratings drift back toward the middle between events
 * (half-life in days), as the original's decay did. Updates are
 * applied a day at a time: every map on a day is predicted from
 * the ratings at the start of that day.
 * ───────────────────────────────────────────────────────── */

export const ELO_BASE = 1500;

export type EloParams = {
  /** points moved per unit of surprise */
  k: number;
  /** share of K that goes to the per-map rating (0..1) */
  mapShare: number;
  /** days for a rating's distance from the middle to halve */
  halfLife: number;
};

type Rating = { r: number; day: number };

export type EloState = {
  teams: Record<string, Rating>;
  /** keyed `${team}|${map}`, centered on 0 */
  maps: Record<string, Rating>;
};

export type EloView = {
  /** team ratings on the day, after drift */
  ra: number;
  rb: number;
  /** per-map ratings on the day */
  ma: number;
  mb: number;
  /** rating gap in Elo points (team gap + map gap) */
  gap: number;
  p: number;
};

export type EloPoint = { day: number; date: string; r: number };

export type EloRun = {
  /** the view each map was predicted from */
  pre: Record<string, EloView>;
  state: EloState;
  /** each team's rating after every day it played */
  trajectory: Record<string, EloPoint[]>;
};

export const emptyElo = (): EloState => ({ teams: {}, maps: {} });

const mapKey = (team: string, map: string) => `${team}|${map}`;

function drifted(rt: Rating | undefined, day: number, halfLife: number, center: number): number {
  if (!rt) return center;
  return center + (rt.r - center) * recencyWeight(Math.max(0, day - rt.day), halfLife);
}

export function eloProbability(gap: number): number {
  return 1 / (1 + Math.pow(10, -gap / 400));
}

/** Elo gap in points → logit (natural log odds) */
export const ELO_TO_LOGIT = Math.LN10 / 400;

export function eloView(state: EloState, a: string, b: string, map: string, day: number, p: EloParams): EloView {
  const ra = drifted(state.teams[a], day, p.halfLife, ELO_BASE);
  const rb = drifted(state.teams[b], day, p.halfLife, ELO_BASE);
  const ma = drifted(state.maps[mapKey(a, map)], day, p.halfLife, 0);
  const mb = drifted(state.maps[mapKey(b, map)], day, p.halfLife, 0);
  const gap = ra - rb + (ma - mb);
  return { ra, rb, ma, mb, gap, p: eloProbability(gap) };
}

/** runs the ratings forward over `matches` (sorted by date) */
export function runElo(matches: readonly Match[], p: EloParams, start: EloState = emptyElo()): EloRun {
  const state: EloState = { teams: { ...start.teams }, maps: { ...start.maps } };
  const pre: Record<string, EloView> = {};
  const trajectory: Record<string, EloPoint[]> = {};

  let i = 0;
  while (i < matches.length) {
    const date = matches[i].date;
    const day = matches[i].day;
    let j = i;
    while (j < matches.length && matches[j].date === date) j += 1;
    const today = matches.slice(i, j);

    const dTeam = new Map<string, number>();
    const dMap = new Map<string, number>();
    const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

    for (const m of today) {
      const v = eloView(state, m.a, m.b, m.map, day, p);
      pre[m.id] = v;
      const surprise = (m.winner === "a" ? 1 : 0) - v.p;
      add(dTeam, m.a, p.k * surprise);
      add(dTeam, m.b, -p.k * surprise);
      add(dMap, mapKey(m.a, m.map), p.k * p.mapShare * surprise);
      add(dMap, mapKey(m.b, m.map), -p.k * p.mapShare * surprise);
    }
    for (const [team, d] of dTeam) {
      const r = drifted(state.teams[team], day, p.halfLife, ELO_BASE) + d;
      state.teams[team] = { r, day };
      (trajectory[team] ??= []).push({ day, date, r });
    }
    for (const [key, d] of dMap) {
      state.maps[key] = { r: drifted(state.maps[key], day, p.halfLife, 0) + d, day };
    }
    i = j;
  }
  return { pre, state, trajectory };
}
