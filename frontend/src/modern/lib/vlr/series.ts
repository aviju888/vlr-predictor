import type { Side } from "./types";

/* ─────────────────────────────────────────────────────────
 * SERIES — map odds → best-of-3 / best-of-5 odds.
 *
 * Same assumption as the original: maps are independent. The
 * original summed every 3-map combination with
 *   p1p2 + p1p3 + p2p3 − 2·p1p2p3;
 * here the series is walked as a score lattice (0-0 → 1-0 /
 * 0-1 → …), so each branch and scoreline has its probability.
 *
 * A consequence worth showing: map ORDER changes the scoreline
 * odds (2-0 vs 2-1) but never who wins the series, because a
 * best-of-N is won by whoever would take most of all N maps.
 * ───────────────────────────────────────────────────────── */

export type BestOf = 3 | 5;

export const winsNeeded = (bo: BestOf) => (bo + 1) / 2;

export type LatticeNode = {
  a: number;
  b: number;
  /** probability the series ever reaches this score */
  reach: number;
  terminal: boolean;
  winner: Side | null;
};

export type LatticeEdge = {
  from: { a: number; b: number };
  to: { a: number; b: number };
  side: Side;
  /** index of the map being played (0-based) */
  map: number;
  /** probability that `side` takes this map */
  p: number;
  /** probability of walking this edge from 0-0 */
  flow: number;
};

export type Scoreline = { a: number; b: number; winner: Side; p: number };

export type SeriesOdds = {
  bestOf: BestOf;
  probs: number[];
  nodes: LatticeNode[];
  edges: LatticeEdge[];
  /** most likely first */
  scorelines: Scoreline[];
  /** P(team A wins the series) */
  pA: number;
  expectedMaps: number;
};

const key = (a: number, b: number) => `${a}-${b}`;

/** `probs[i]` is P(A takes map i), in play order */
export function simulateSeries(probs: readonly number[], bestOf: BestOf): SeriesOdds {
  const need = winsNeeded(bestOf);
  if (probs.length < bestOf) throw new Error(`best-of-${bestOf} needs ${bestOf} map odds, got ${probs.length}`);
  const reach = new Map<string, number>([[key(0, 0), 1]]);
  const nodes: LatticeNode[] = [];
  const edges: LatticeEdge[] = [];

  for (let played = 0; played <= bestOf; played += 1) {
    for (let a = Math.min(played, need); a >= 0; a -= 1) {
      const b = played - a;
      if (b < 0 || b > need) continue;
      if (a === need && b === need) continue;
      const r = reach.get(key(a, b));
      if (r === undefined) continue;
      const terminal = a === need || b === need;
      nodes.push({ a, b, reach: r, terminal, winner: terminal ? (a === need ? "a" : "b") : null });
      if (terminal) continue;
      const p = probs[played];
      for (const [side, q, to] of [
        ["a", p, { a: a + 1, b }],
        ["b", 1 - p, { a, b: b + 1 }],
      ] as const) {
        const flow = r * q;
        edges.push({ from: { a, b }, to, side, map: played, p: q, flow });
        reach.set(key(to.a, to.b), (reach.get(key(to.a, to.b)) ?? 0) + flow);
      }
    }
  }

  const scorelines = nodes
    .filter((n) => n.terminal)
    .map((n) => ({ a: n.a, b: n.b, winner: n.winner as Side, p: n.reach }))
    .sort((x, y) => y.p - x.p || (x.winner === "a" ? -1 : 1));
  const pA = scorelines.filter((s) => s.winner === "a").reduce((s, x) => s + x.p, 0);
  const expectedMaps = scorelines.reduce((s, x) => s + x.p * (x.a + x.b), 0);
  return { bestOf, probs: probs.slice(0, bestOf), nodes, edges, scorelines, pA, expectedMaps };
}

export function seriesWinProb(probs: readonly number[], bestOf: BestOf): number {
  return simulateSeries(probs, bestOf).pA;
}

/** the original's best-of-3 formula, kept as a cross-check */
export function bo3Formula(p1: number, p2: number, p3: number): number {
  return p1 * p2 + p1 * p3 + p2 * p3 - 2 * p1 * p2 * p3;
}

export type VetoStep = { kind: "ban" | "pick" | "decider"; by: Side | null; map: string };

export type Veto = { steps: VetoStep[]; order: string[] };

/**
 * A greedy veto: each team bans the map it's weakest on and picks
 * the map it's strongest on, A first. With a 7-map pool this is
 * VCT's format (ban, ban, pick, pick, ban, ban, decider for a
 * best-of-3); with fewer maps the extra bans drop out.
 */
export function simulateVeto(pool: readonly string[], pA: Record<string, number>, bestOf: BestOf): Veto {
  if (pool.length < bestOf) throw new Error(`A best-of-${bestOf} needs ${bestOf} maps, the pool has ${pool.length}`);
  const left = [...pool].sort();
  const steps: VetoStep[] = [];
  const odds = (m: string) => pA[m] ?? 0.5;
  // A wants high odds, B wants low odds
  const best = (by: Side) => left.reduce((m, x) => ((by === "a" ? odds(x) > odds(m) : odds(x) < odds(m)) ? x : m), left[0]);
  const worst = (by: Side) => best(by === "a" ? "b" : "a");
  const take = (kind: VetoStep["kind"], by: Side | null, map: string) => {
    left.splice(left.indexOf(map), 1);
    steps.push({ kind, by, map });
  };

  const picks = bestOf - 1;
  const bans = pool.length - bestOf;
  const firstBans = bestOf === 3 ? Math.min(2, bans) : bans;
  let turn: Side = "a";
  const flip = () => (turn = turn === "a" ? "b" : "a");
  for (let i = 0; i < firstBans; i += 1, flip()) take("ban", turn, worst(turn));
  turn = "a";
  for (let i = 0; i < picks; i += 1, flip()) take("pick", turn, best(turn));
  turn = "a";
  while (left.length > 1) {
    take("ban", turn, worst(turn));
    flip();
  }
  take("decider", null, left[0]);
  return { steps, order: steps.filter((s) => s.kind !== "ban").map((s) => s.map) };
}

function combinations<T>(xs: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (xs.length < k) return [];
  const [head, ...rest] = xs;
  return [...combinations(rest, k - 1).map((c) => [head, ...c]), ...combinations(rest, k)];
}

export type MapSetRange = {
  sets: number;
  min: { maps: string[]; pA: number };
  max: { maps: string[]; pA: number };
  mean: number;
};

/** series odds over every possible set of maps (order can't matter, see above) */
export function mapSetRange(pool: readonly string[], pA: Record<string, number>, bestOf: BestOf): MapSetRange {
  const sets = combinations([...pool].sort(), bestOf).map((maps) => ({ maps, pA: seriesWinProb(maps.map((m) => pA[m] ?? 0.5), bestOf) }));
  const min = sets.reduce((m, s) => (s.pA < m.pA ? s : m), sets[0]);
  const max = sets.reduce((m, s) => (s.pA > m.pA ? s : m), sets[0]);
  return { sets: sets.length, min, max, mean: sets.reduce((s, x) => s + x.pA, 0) / Math.max(1, sets.length) };
}
