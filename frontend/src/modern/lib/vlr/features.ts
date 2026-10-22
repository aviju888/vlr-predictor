import type { Match } from "./types";

/* ─────────────────────────────────────────────────────────
 * FEATURES — the original's historical features, rebuilt so
 * a map's features only ever see earlier days.
 *
 * The guard is the first line of the loop: a match on the same
 * day or later is skipped after reading its date and nothing
 * else. Same-day maps (earlier maps of the same series) are
 * skipped too; in this data every map of a series goes to the
 * series winner, so map 1 would give map 2 away.
 *
 * Every feature is A minus B, so swapping the teams flips the
 * sign of every feature (and, with no intercept, the odds).
 * ───────────────────────────────────────────────────────── */

export type FeatureKey = "form" | "map" | "h2h" | "recent" | "exp" | "streak";

export const FEATURE_KEYS: readonly FeatureKey[] = ["form", "map", "h2h", "recent", "exp", "streak"];

export type FeatureParams = {
  /** days for a result's weight to halve */
  halfLife: number;
  /** imaginary maps at 50% that every win rate starts from */
  prior: number;
  /** head-to-head shrink: n / (n + h2hShrink), as in the original */
  h2hShrink: number;
  /** "recent form" window, in maps */
  recentN: number;
};

export const FEATURE_DEFAULTS: Omit<FeatureParams, "halfLife"> = { prior: 2, h2hShrink: 7, recentN: 5 };

export type Query = { a: string; b: string; map: string; date: string; day: number };

export type TeamHistory = {
  maps: number;
  wins: number;
  /** recency-weighted maps and wins */
  wMaps: number;
  wWins: number;
  /** on the query map */
  mapMaps: number;
  mapWins: number;
  wMapMaps: number;
  wMapWins: number;
  /** last N results, oldest first (1 = win) */
  recent: number[];
  /** maps won in a row, most recent last */
  streak: number;
  lastDay: number | null;
};

export type HeadToHead = { maps: number; aWins: number; weighted: number };

export type FeatureRow = {
  x: Record<FeatureKey, number>;
  a: TeamHistory;
  b: TeamHistory;
  h2h: HeadToHead;
};

const emptyTeam = (): TeamHistory => ({
  maps: 0,
  wins: 0,
  wMaps: 0,
  wWins: 0,
  mapMaps: 0,
  mapWins: 0,
  wMapMaps: 0,
  wMapWins: 0,
  recent: [],
  streak: 0,
  lastDay: null,
});

/** recency weight of a result `ageDays` old */
export function recencyWeight(ageDays: number, halfLife: number): number {
  return Math.pow(0.5, ageDays / Math.max(1e-6, halfLife));
}

/** win rate pulled toward 50% by `prior` imaginary maps */
export function shrunkRate(wins: number, maps: number, prior: number): number {
  return (wins + prior / 2) / (maps + prior);
}

/**
 * Reads `history` (sorted by date, then map order) and returns
 * what each team had done before `q.date`. Only the `date` of a
 * same-day-or-later match is ever read.
 */
export function teamHistories(
  history: readonly Match[],
  q: Query,
  p: Pick<FeatureParams, "halfLife" | "recentN">,
): { a: TeamHistory; b: TeamHistory; h2h: HeadToHead } {
  const a = emptyTeam();
  const b = emptyTeam();
  const h2h: HeadToHead = { maps: 0, aWins: 0, weighted: 0 };
  let h2hWeight = 0;

  for (const m of history) {
    if (!(m.date < q.date)) continue; // leak guard: earlier days only

    const ma = m.a;
    const mb = m.b;
    const involvesA = ma === q.a || mb === q.a;
    const involvesB = ma === q.b || mb === q.b;
    if (!involvesA && !involvesB) continue;

    const winner = m.winner === "a" ? ma : mb;
    const w = recencyWeight(q.day - m.day, p.halfLife);
    const onMap = m.map === q.map;

    for (const [team, h] of [
      [q.a, a],
      [q.b, b],
    ] as const) {
      if (ma !== team && mb !== team) continue;
      const won = winner === team ? 1 : 0;
      h.maps += 1;
      h.wins += won;
      h.wMaps += w;
      h.wWins += w * won;
      if (onMap) {
        h.mapMaps += 1;
        h.mapWins += won;
        h.wMapMaps += w;
        h.wMapWins += w * won;
      }
      h.recent.push(won);
      if (h.recent.length > p.recentN) h.recent.shift();
      h.streak = won ? h.streak + 1 : 0;
      h.lastDay = m.day;
    }

    if (involvesA && involvesB) {
      const s = winner === q.a ? 1 : -1;
      h2h.maps += 1;
      h2h.aWins += s > 0 ? 1 : 0;
      h2h.weighted += w * s;
      h2hWeight += w;
    }
  }

  if (h2hWeight > 0) h2h.weighted /= h2hWeight;
  return { a, b, h2h };
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function featuresFrom(
  a: TeamHistory,
  b: TeamHistory,
  h2h: HeadToHead,
  p: Pick<FeatureParams, "prior" | "h2hShrink">,
): Record<FeatureKey, number> {
  const rate = (w: number, n: number) => shrunkRate(w, n, p.prior);
  return {
    form: rate(a.wWins, a.wMaps) - rate(b.wWins, b.wMaps),
    map: rate(a.wMapWins, a.wMapMaps) - rate(b.wMapWins, b.wMapMaps),
    h2h: h2h.maps ? h2h.weighted * (h2h.maps / (h2h.maps + p.h2hShrink)) : 0,
    recent: rate(sum(a.recent), a.recent.length) - rate(sum(b.recent), b.recent.length),
    exp: Math.log1p(a.wMaps) - Math.log1p(b.wMaps),
    streak: clamp((a.streak - b.streak) / 5, -1, 1),
  };
}

export function buildFeatures(history: readonly Match[], q: Query, params: FeatureParams): FeatureRow {
  const { a, b, h2h } = teamHistories(history, q, params);
  return { x: featuresFrom(a, b, h2h, params), a, b, h2h };
}

export function featureParams(halfLife: number): FeatureParams {
  return { halfLife, ...FEATURE_DEFAULTS };
}

export function queryFor(m: Pick<Match, "a" | "b" | "map" | "date" | "day">): Query {
  return { a: m.a, b: m.b, map: m.map, date: m.date, day: m.day };
}

export function toVector(x: Record<FeatureKey, number>): number[] {
  return FEATURE_KEYS.map((k) => x[k]);
}
