import { sigmoid } from "./models/logistic";

/* ─────────────────────────────────────────────────────────
 * SHAPLEY — exact feature contributions for a logistic output.
 *
 * The model's probability is σ(z₁ + z₂ + …). Each feature's
 * share of (p − 50%) is its Shapley value with every feature
 * at 0 as the baseline (a matchup with no history). The shares
 * add up to p − 0.5 exactly and don't depend on order, which is
 * what the original reached for with SHAP.
 * ───────────────────────────────────────────────────────── */

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800, 39916800, 479001600];

export function shapleyLogistic(z: readonly number[], link: (s: number) => number = sigmoid): number[] {
  const n = z.length;
  if (n === 0) return [];
  if (n > 12) throw new Error("shapleyLogistic supports up to 12 features");
  const full = 1 << n;
  const value = new Float64Array(full);
  for (let mask = 0; mask < full; mask += 1) {
    let s = 0;
    for (let i = 0; i < n; i += 1) if (mask & (1 << i)) s += z[i];
    value[mask] = link(s);
  }
  const size = (mask: number) => {
    let c = 0;
    for (let m = mask; m; m &= m - 1) c += 1;
    return c;
  };
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    const bit = 1 << i;
    for (let mask = 0; mask < full; mask += 1) {
      if (mask & bit) continue;
      const k = size(mask);
      const weight = (FACT[k] * FACT[n - k - 1]) / FACT[n];
      out[i] += weight * (value[mask | bit] - value[mask]);
    }
  }
  return out;
}
