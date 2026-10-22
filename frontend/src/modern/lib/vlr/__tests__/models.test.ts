import { describe, expect, it } from "vitest";
import { applyPlatt, fitPlatt } from "@/modern/lib/vlr/calibrate";
import { dayNumber } from "@/modern/lib/vlr/dataset";
import { ELO_BASE, eloProbability, eloView, emptyElo, runElo, type EloParams } from "@/modern/lib/vlr/models/elo";
import { fitLogistic, logit, predictLogistic, rmsScale, sigmoid, solve } from "@/modern/lib/vlr/models/logistic";
import { shapleyLogistic } from "@/modern/lib/vlr/shapley";
import type { Match } from "@/modern/lib/vlr/types";

function m(date: string, a: string, b: string, winner: "a" | "b", map = "Ascent", order = 1): Match {
  return {
    id: `${date}-${a}-${b}-${map}-${order}`,
    date,
    day: dayNumber(date),
    event: "Fixture",
    eventShort: "Fixture",
    split: "train",
    a,
    b,
    map,
    winner,
    series: `${date}:${[a, b].sort().join(" vs ")}`,
    score: "",
    order,
    conflict: false,
  };
}

const P: EloParams = { k: 32, mapShare: 0.5, halfLife: 60 };

describe("elo", () => {
  it("uses the standard curve", () => {
    expect(eloProbability(0)).toBe(0.5);
    expect(eloProbability(400)).toBeCloseTo(10 / 11, 12);
    expect(eloProbability(-400)).toBeCloseTo(1 / 11, 12);
  });

  it("learns from a tiny fixture and stays zero-sum", () => {
    const ms = [m("2025-01-01", "A", "B", "a"), m("2025-01-02", "A", "B", "a"), m("2025-01-03", "B", "A", "b")];
    const run = runElo(ms, P);
    expect(run.pre[ms[0].id].p).toBe(0.5);
    // each win makes the next prediction more confident
    expect(run.pre[ms[1].id].p).toBeGreaterThan(0.5);
    expect(1 - run.pre[ms[2].id].p).toBeGreaterThan(run.pre[ms[1].id].p);
    const sum = Object.values(run.state.teams).reduce((s, t) => s + t.r, 0);
    // two teams, last updated the same day, so drift doesn't matter
    expect(sum).toBeCloseTo(2 * ELO_BASE, 9);
    const view = eloView(run.state, "A", "B", "Ascent", dayNumber("2025-01-04"), P);
    const swap = eloView(run.state, "B", "A", "Ascent", dayNumber("2025-01-04"), P);
    expect(view.p + swap.p).toBeCloseTo(1, 12);
  });

  it("predicts every map on a day from the ratings at the start of that day", () => {
    const ms = [m("2025-01-01", "A", "B", "a", "Bind", 1), m("2025-01-01", "A", "B", "a", "Haven", 2), m("2025-01-01", "A", "B", "a", "Split", 3)];
    const run = runElo(ms, P);
    for (const x of ms) expect(run.pre[x.id].p).toBe(0.5);
  });

  it("drifts ratings back toward 1500 between events", () => {
    const run = runElo([m("2025-01-01", "A", "B", "a")], { ...P, halfLife: 30 });
    const now = eloView(run.state, "A", "B", "Ascent", dayNumber("2025-01-01"), { ...P, halfLife: 30 });
    const later = eloView(run.state, "A", "B", "Ascent", dayNumber("2025-01-31"), { ...P, halfLife: 30 });
    expect(later.ra - ELO_BASE).toBeCloseTo((now.ra - ELO_BASE) / 2, 9);
  });

  it("gives each map its own smaller rating", () => {
    const ms = [m("2025-01-01", "A", "B", "a", "Bind"), m("2025-01-02", "A", "B", "a", "Bind")];
    const run = runElo(ms, P);
    const bind = eloView(run.state, "A", "B", "Bind", dayNumber("2025-01-03"), P);
    const lotus = eloView(run.state, "A", "B", "Lotus", dayNumber("2025-01-03"), P);
    expect(bind.p).toBeGreaterThan(lotus.p);
    expect(lotus.p).toBeGreaterThan(0.5);
    expect(runElo([], P).state).toEqual(emptyElo());
  });
});

describe("logistic regression", () => {
  it("solves small linear systems", () => {
    const x = solve(
      [
        [2, 1],
        [1, 3],
      ],
      [3, 5],
    );
    expect(x[0]).toBeCloseTo(0.8, 12);
    expect(x[1]).toBeCloseTo(1.4, 12);
  });

  it("fits a tiny fixture: the sign follows the data, and p(x) + p(−x) = 1", () => {
    const X = [[1], [2], [-1], [0.5], [-2], [-0.5]];
    const y = [1, 1, 0, 1, 0, 1];
    const fit = fitLogistic(X, y, 1);
    expect(fit.converged).toBe(true);
    expect(fit.w[0]).toBeGreaterThan(0);
    expect(predictLogistic(fit.w, [1.3]) + predictLogistic(fit.w, [-1.3])).toBeCloseTo(1, 12);
    // gradient of the penalized loss is ~0 at the optimum
    const g = X.reduce((s, x, i) => s + (sigmoid(fit.w[0] * x[0]) - y[i]) * x[0], 0) + 1 * fit.w[0];
    expect(Math.abs(g)).toBeLessThan(1e-8);
  });

  it("shrinks weights as L2 grows and stays finite on separable data", () => {
    const X = [[1], [2], [-1], [-2]];
    const y = [1, 1, 0, 0];
    const loose = fitLogistic(X, y, 0.01);
    const tight = fitLogistic(X, y, 10);
    expect(Math.abs(tight.w[0])).toBeLessThan(Math.abs(loose.w[0]));
    expect(Number.isFinite(loose.w[0])).toBe(true);
  });

  it("scales by root-mean-square without centering", () => {
    expect(rmsScale([[3], [-4]])).toEqual([Math.sqrt(12.5)]);
    expect(rmsScale([[0], [0]])).toEqual([1]);
    expect(logit(sigmoid(1.7))).toBeCloseTo(1.7, 9);
  });
});

describe("platt", () => {
  const synth = (n: number, stretch: number) => {
    // true probabilities spread over (0.05, 0.95); the "model" reports them squashed or stretched
    const probs: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const t = 0.05 + (0.9 * (i + 0.5)) / n;
      // deterministic outcomes with the right frequency per decile
      const won = (i * 7919) % 100 < t * 100 ? 1 : 0;
      probs.push(sigmoid(logit(t) / stretch));
      y.push(won);
    }
    return { probs, y };
  };

  it("stretches an underconfident model and squeezes an overconfident one", () => {
    const under = synth(400, 2);
    const over = synth(400, 0.5);
    expect(fitPlatt(under.probs, under.y).a).toBeGreaterThan(1.4);
    expect(fitPlatt(over.probs, over.y).a).toBeLessThan(0.7);
  });

  it("is side-symmetric and leaves 50/50 alone", () => {
    const pl = { a: 2.3, n: 10 };
    expect(applyPlatt(0.5, pl)).toBe(0.5);
    expect(applyPlatt(0.8, pl) + applyPlatt(0.2, pl)).toBeCloseTo(1, 12);
  });

  it("stays finite when every training call was right", () => {
    const fit = fitPlatt([0.6, 0.7, 0.4, 0.3], [1, 1, 0, 0]);
    expect(fit.a).toBeLessThan(20);
    expect(fit.a).toBeGreaterThan(1);
    // Platt's smoothed target caps it: with 4 maps the target is 5/6
    expect(applyPlatt(0.7, fit)).toBeLessThan(0.95);
  });

  it("ignores 50/50 calls, which carry no information", () => {
    expect(fitPlatt([0.5, 0.5], [1, 0])).toEqual({ a: 1, n: 0 });
  });
});

describe("shapley", () => {
  it("adds up to p − 50%", () => {
    const z = [0.8, -0.3, 1.1, 0, 0.25, -0.6];
    const phi = shapleyLogistic(z);
    expect(phi.reduce((s, v) => s + v, 0)).toBeCloseTo(sigmoid(z.reduce((s, v) => s + v, 0)) - 0.5, 12);
    expect(phi[3]).toBeCloseTo(0, 12);
  });

  it("treats equal features equally and matches the one-feature case", () => {
    const phi = shapleyLogistic([0.4, 0.4]);
    expect(phi[0]).toBeCloseTo(phi[1], 12);
    expect(shapleyLogistic([1.2])[0]).toBeCloseTo(sigmoid(1.2) - 0.5, 12);
    expect(shapleyLogistic([])).toEqual([]);
  });
});
