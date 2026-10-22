import { logit, sigmoid } from "./models/logistic";

/* ─────────────────────────────────────────────────────────
 * PLATT SCALING — p' = σ(a · logit(p)).
 *
 * The usual Platt fit has a second term, σ(a·s + b). Here b is
 * pinned to 0: a b ≠ 0 would make "team listed first" worth
 * something, which is exactly the side bias this data rewards.
 * (Fitting both orientations of every match gives b = 0 anyway.)
 *
 * Targets use Platt's own smoothing, (N+1)/(N+2) and 1/(N+2),
 * so a small, perfectly separable train set can't push a → ∞.
 * ───────────────────────────────────────────────────────── */

export type Platt = { a: number; n: number };

export const IDENTITY_PLATT: Platt = { a: 1, n: 0 };

export function fitPlatt(probs: readonly number[], y: readonly number[], opts: { min?: number; max?: number } = {}): Platt {
  const lo = opts.min ?? 0.05;
  const hi = opts.max ?? 20;
  const s: number[] = [];
  const yy: number[] = [];
  probs.forEach((p, i) => {
    const z = logit(p);
    if (Math.abs(z) > 1e-12) {
      s.push(z);
      yy.push(y[i]);
    }
  });
  const n = s.length;
  if (!n) return { a: 1, n: 0 };
  // both orientations of every match: n positives and n negatives
  const tPos = (n + 1) / (n + 2);
  const t = yy.map((v) => (v ? tPos : 1 - tPos));

  let a = 1;
  for (let it = 0; it < 100; it += 1) {
    let g = 0;
    let h = 0;
    for (let i = 0; i < n; i += 1) {
      const q = sigmoid(a * s[i]);
      g += (q - t[i]) * s[i];
      h += q * (1 - q) * s[i] * s[i];
    }
    if (h < 1e-12) break;
    const next = Math.min(hi, Math.max(lo, a - g / h));
    const done = Math.abs(next - a) < 1e-10;
    a = next;
    if (done) break;
  }
  return { a, n };
}

export function applyPlatt(p: number, platt: Platt): number {
  if (p === 0.5) return 0.5;
  return sigmoid(platt.a * logit(p));
}
