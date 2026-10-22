import { describe, expect, it } from "vitest";
import { callScore, evaluate, favorite, logLossOf, reliability, wilson } from "@/modern/lib/vlr/metrics";

describe("metrics", () => {
  it("scores calls, counting a 50/50 as half right", () => {
    expect(callScore(0.7, 1)).toBe(1);
    expect(callScore(0.7, 0)).toBe(0);
    expect(callScore(0.3, 0)).toBe(1);
    expect(callScore(0.5, 1)).toBe(0.5);
    const m = evaluate([
      { id: "a", p: 0.8, y: 1 },
      { id: "b", p: 0.6, y: 0 },
      { id: "c", p: 0.5, y: 1 },
      { id: "d", p: 0.1, y: 0 },
    ]);
    expect(m.correct).toBe(2.5);
    expect(m.accuracy).toBeCloseTo(0.625, 12);
    expect(m.ties).toBe(1);
  });

  it("computes log loss and Brier", () => {
    const rows = [
      { id: "a", p: 0.8, y: 1 as const },
      { id: "b", p: 0.6, y: 0 as const },
    ];
    const m = evaluate(rows);
    expect(m.logLoss).toBeCloseTo(-(Math.log(0.8) + Math.log(0.4)) / 2, 12);
    expect(m.brier).toBeCloseTo((0.04 + 0.36) / 2, 12);
    expect(logLossOf(0.5, 1)).toBeCloseTo(Math.LN2, 12);
    // a confident miss is clipped, not infinite
    expect(Number.isFinite(logLossOf(1, 0))).toBe(true);
  });

  it("gives the coin flip its textbook numbers", () => {
    const m = evaluate(Array.from({ length: 10 }, (_, i) => ({ id: String(i), p: 0.5, y: (i % 2) as 0 | 1 })));
    expect(m.accuracy).toBe(0.5);
    expect(m.logLoss).toBeCloseTo(Math.LN2, 12);
    expect(m.brier).toBeCloseTo(0.25, 12);
    expect(m.ece).toBeCloseTo(0, 12);
  });

  it("bins by the favorite's probability", () => {
    expect(favorite(0.3, 0)).toEqual({ conf: 0.7, won: 1 });
    expect(favorite(0.5, 1)).toEqual({ conf: 0.5, won: 0.5 });
    const bins = reliability([
      { id: "a", p: 0.65, y: 1 },
      { id: "b", p: 0.35, y: 1 },
      { id: "c", p: 0.95, y: 1 },
      { id: "d", p: 1, y: 1 },
    ]);
    expect(bins.map((b) => b.n)).toEqual([0, 2, 0, 0, 2]);
    expect(bins[1].hit).toBeCloseTo(0.5, 12);
    expect(bins[1].conf).toBeCloseTo(0.65, 12);
    expect(bins[1].ids).toEqual(["a", "b"]);
    const m = evaluate([
      { id: "a", p: 0.65, y: 1 },
      { id: "b", p: 0.35, y: 1 },
    ]);
    expect(m.ece).toBeCloseTo(0.15, 12);
  });

  it("puts a Wilson interval around accuracy", () => {
    const [lo, hi] = wilson(8, 10);
    expect(lo).toBeCloseTo(0.4902, 3);
    expect(hi).toBeCloseTo(0.9433, 3);
    expect(wilson(0, 0)).toEqual([0, 1]);
  });
});
