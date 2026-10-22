/* ─────────────────────────────────────────────────────────
 * METRICS — accuracy, log loss, Brier, calibration.
 *
 * p is P(team A takes the map), y is 1 if A did.
 * A 50/50 call counts as half right: picking the team the file
 * lists first would turn coin flips into wins on this data.
 * Calibration bins look at the favorite: "when the model gave
 * the favorite 60–70%, how often did the favorite win?"
 * ───────────────────────────────────────────────────────── */

export type Scored = { id: string; p: number; y: 0 | 1 };

export type ReliabilityBin = {
  lo: number;
  hi: number;
  n: number;
  /** mean probability the model gave the favorite */
  conf: number;
  /** how often the favorite won (50/50 calls count half) */
  hit: number;
  ids: string[];
};

export type Metrics = {
  n: number;
  /** right calls, 50/50 calls counted as half */
  correct: number;
  ties: number;
  accuracy: number;
  /** 95% Wilson interval for accuracy */
  ci: [number, number];
  logLoss: number;
  brier: number;
  /** expected calibration error over the favorite bins */
  ece: number;
  bins: ReliabilityBin[];
};

export const BIN_EDGES = [0.5, 0.6, 0.7, 0.8, 0.9, 1] as const;

const EPS = 1e-6;

/** probability given to the favorite, and whether the favorite won */
export function favorite(p: number, y: 0 | 1): { conf: number; won: number } {
  if (p > 0.5) return { conf: p, won: y };
  if (p < 0.5) return { conf: 1 - p, won: 1 - y };
  return { conf: 0.5, won: 0.5 };
}

/** 1 right, 0 wrong, 0.5 for a 50/50 call */
export function callScore(p: number, y: 0 | 1): number {
  if (p === 0.5) return 0.5;
  return (p > 0.5) === (y === 1) ? 1 : 0;
}

export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const ph = k / n;
  const den = 1 + (z * z) / n;
  const mid = (ph + (z * z) / (2 * n)) / den;
  const half = (z * Math.sqrt((ph * (1 - ph)) / n + (z * z) / (4 * n * n))) / den;
  return [Math.max(0, mid - half), Math.min(1, mid + half)];
}

export function logLossOf(p: number, y: 0 | 1): number {
  const q = Math.min(1 - EPS, Math.max(EPS, p));
  return -(y ? Math.log(q) : Math.log(1 - q));
}

export function reliability(rows: readonly Scored[], edges: readonly number[] = BIN_EDGES): ReliabilityBin[] {
  const bins: ReliabilityBin[] = edges.slice(0, -1).map((lo, i) => ({ lo, hi: edges[i + 1], n: 0, conf: 0, hit: 0, ids: [] }));
  for (const r of rows) {
    const f = favorite(r.p, r.y);
    let i = bins.findIndex((b) => f.conf >= b.lo && f.conf < b.hi);
    if (i < 0) i = bins.length - 1;
    const b = bins[i];
    b.n += 1;
    b.conf += f.conf;
    b.hit += f.won;
    b.ids.push(r.id);
  }
  return bins.map((b) => (b.n ? { ...b, conf: b.conf / b.n, hit: b.hit / b.n } : { ...b, conf: (b.lo + b.hi) / 2, hit: 0 }));
}

export function evaluate(rows: readonly Scored[]): Metrics {
  const n = rows.length;
  if (!n) return { n: 0, correct: 0, ties: 0, accuracy: 0, ci: [0, 1], logLoss: 0, brier: 0, ece: 0, bins: reliability([]) };
  let correct = 0;
  let ties = 0;
  let ll = 0;
  let brier = 0;
  for (const r of rows) {
    const c = callScore(r.p, r.y);
    correct += c;
    if (r.p === 0.5) ties += 1;
    ll += logLossOf(r.p, r.y);
    brier += (r.p - r.y) ** 2;
  }
  const bins = reliability(rows);
  const ece = bins.reduce((s, b) => s + (b.n / n) * Math.abs(b.hit - b.conf), 0);
  return {
    n,
    correct,
    ties,
    accuracy: correct / n,
    ci: wilson(correct, n),
    logLoss: ll / n,
    brier: brier / n,
    ece,
    bins,
  };
}
