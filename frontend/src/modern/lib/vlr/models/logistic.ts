/* ─────────────────────────────────────────────────────────
 * LOGISTIC REGRESSION — L2-regularized, no intercept, fit with
 * Newton's method (a handful of 6×6 solves).
 *
 * No intercept on purpose: the features are all "A minus B", so
 * without an intercept p(A, B) = 1 − p(B, A) exactly. An
 * intercept would learn which side the file lists the winner on.
 *
 * Features are scaled by their root-mean-square instead of
 * standardized, because subtracting a mean would break that
 * symmetry too.
 * ───────────────────────────────────────────────────────── */

export function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

export function logit(p: number): number {
  const q = Math.min(1 - 1e-9, Math.max(1e-9, p));
  return Math.log(q / (1 - q));
}

export function dot(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
  return s;
}

/** per-feature root-mean-square (1 where a feature is all zeros) */
export function rmsScale(X: readonly (readonly number[])[]): number[] {
  const d = X[0]?.length ?? 0;
  const out = new Array<number>(d).fill(0);
  if (!X.length) return out.map(() => 1);
  for (const row of X) for (let j = 0; j < d; j += 1) out[j] += row[j] * row[j];
  return out.map((s) => {
    const r = Math.sqrt(s / X.length);
    return r > 1e-9 ? r : 1;
  });
}

export function applyScale(x: readonly number[], scale: readonly number[]): number[] {
  return x.map((v, j) => v / scale[j]);
}

/** solves A x = b in place (Gaussian elimination, partial pivoting) */
export function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c += 1) {
    let piv = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c];
    if (Math.abs(d) < 1e-14) continue;
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const f = M[r][c] / d;
      if (f === 0) continue;
      for (let k = c; k <= n; k += 1) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) < 1e-14 ? 0 : row[n] / row[i]));
}

export type LogisticFit = { w: number[]; iterations: number; converged: boolean };

/**
 * Minimizes  Σ log-loss(y, σ(w·x)) + (l2 / 2)·|w|²  over w.
 * `l2` plays the role of 1 / C in scikit-learn; the original used C = 1.
 */
export function fitLogistic(X: readonly (readonly number[])[], y: readonly number[], l2: number, maxIter = 60): LogisticFit {
  const d = X[0]?.length ?? 0;
  let w = new Array<number>(d).fill(0);
  const ridge = Math.max(l2, 1e-6);
  for (let it = 1; it <= maxIter; it += 1) {
    const g = w.map((wj) => ridge * wj);
    const H = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => (i === j ? ridge : 0)));
    for (let i = 0; i < X.length; i += 1) {
      const x = X[i];
      const p = sigmoid(dot(w, x));
      const r = p - y[i];
      const s = p * (1 - p);
      for (let j = 0; j < d; j += 1) {
        g[j] += r * x[j];
        if (s === 0) continue;
        for (let k = j; k < d; k += 1) H[j][k] += s * x[j] * x[k];
      }
    }
    for (let j = 0; j < d; j += 1) for (let k = 0; k < j; k += 1) H[j][k] = H[k][j];
    const step = solve(H, g);
    // damp huge steps so near-separable data can't blow up
    const big = Math.max(...step.map(Math.abs), 0);
    const f = big > 5 ? 5 / big : 1;
    w = w.map((wj, j) => wj - f * step[j]);
    if (big * f < 1e-10) return { w, iterations: it, converged: true };
  }
  return { w, iterations: maxIter, converged: false };
}

export function predictLogistic(w: readonly number[], x: readonly number[]): number {
  return sigmoid(dot(w, x));
}
