import { describe, expect, it } from "vitest";
import { bo3Formula, mapSetRange, seriesWinProb, simulateSeries, simulateVeto } from "@/modern/lib/vlr/series";

const permutations = <T,>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));

describe("series odds", () => {
  it("best-of-3 scorelines sum to 1 and match the original's formula", () => {
    const ps = [0.64, 0.48, 0.57];
    const s = simulateSeries(ps, 3);
    expect(s.scorelines.reduce((a, x) => a + x.p, 0)).toBeCloseTo(1, 12);
    expect(s.pA).toBeCloseTo(bo3Formula(0.64, 0.48, 0.57), 12);
    const byScore = Object.fromEntries(s.scorelines.map((x) => [`${x.a}-${x.b}`, x.p]));
    expect(byScore["2-0"]).toBeCloseTo(0.64 * 0.48, 12);
    expect(byScore["0-2"]).toBeCloseTo(0.36 * 0.52, 12);
    expect(byScore["2-1"]).toBeCloseTo(0.64 * 0.52 * 0.57 + 0.36 * 0.48 * 0.57, 12);
    expect(byScore["1-2"]).toBeCloseTo(0.64 * 0.52 * 0.43 + 0.36 * 0.48 * 0.43, 12);
    expect(s.scorelines).toHaveLength(4);
  });

  it("best-of-5 matches the closed form and has six scorelines", () => {
    const p = 0.6;
    const q = 1 - p;
    const s = simulateSeries([p, p, p, p, p], 5);
    expect(s.pA).toBeCloseTo(p ** 3 * (1 + 3 * q + 6 * q * q), 12);
    expect(s.scorelines).toHaveLength(6);
    expect(s.scorelines.reduce((a, x) => a + x.p, 0)).toBeCloseTo(1, 12);
  });

  it("is symmetric: even maps make an even series, and swapping sides flips it", () => {
    expect(seriesWinProb([0.5, 0.5, 0.5], 3)).toBeCloseTo(0.5, 12);
    expect(seriesWinProb([0.5, 0.5, 0.5, 0.5, 0.5], 5)).toBeCloseTo(0.5, 12);
    const ps = [0.7, 0.35, 0.55, 0.62, 0.41];
    for (const bo of [3, 5] as const) {
      expect(seriesWinProb(ps, bo) + seriesWinProb(ps.map((p) => 1 - p), bo)).toBeCloseTo(1, 12);
    }
  });

  it("map order changes the scorelines but never the series odds", () => {
    const ps = [0.7, 0.35, 0.55, 0.62, 0.41];
    for (const bo of [3, 5] as const) {
      const base = seriesWinProb(ps.slice(0, bo), bo);
      const twoNil = new Set<string>();
      for (const perm of permutations(ps.slice(0, bo))) {
        const s = simulateSeries(perm, bo);
        expect(s.pA).toBeCloseTo(base, 12);
        twoNil.add(s.scorelines.find((x) => x.a === (bo + 1) / 2 && x.b === 0)!.p.toFixed(9));
      }
      expect(twoNil.size).toBeGreaterThan(1);
    }
  });

  it("reach and flow are consistent across the lattice", () => {
    const s = simulateSeries([0.6, 0.3, 0.8], 3);
    const start = s.nodes.find((n) => n.a === 0 && n.b === 0)!;
    expect(start.reach).toBe(1);
    const oneAll = s.nodes.find((n) => n.a === 1 && n.b === 1)!;
    expect(oneAll.reach).toBeCloseTo(0.6 * 0.7 + 0.4 * 0.3, 12);
    // flow out of every non-terminal node equals its reach
    for (const n of s.nodes.filter((x) => !x.terminal)) {
      const out = s.edges.filter((e) => e.from.a === n.a && e.from.b === n.b).reduce((a, e) => a + e.flow, 0);
      expect(out).toBeCloseTo(n.reach, 12);
    }
    expect(s.expectedMaps).toBeCloseTo(2 + oneAll.reach, 12);
  });

  it("rejects too few maps", () => {
    expect(() => simulateSeries([0.5, 0.5], 3)).toThrow();
  });
});

describe("veto", () => {
  const odds = { Ascent: 0.7, Bind: 0.4, Breeze: 0.55, Haven: 0.62, Split: 0.3 };

  it("best-of-3 from five maps: A bans its worst, B bans A's best, then picks and a decider", () => {
    const v = simulateVeto(Object.keys(odds), odds, 3);
    expect(v.steps).toEqual([
      { kind: "ban", by: "a", map: "Split" },
      { kind: "ban", by: "b", map: "Ascent" },
      { kind: "pick", by: "a", map: "Haven" },
      { kind: "pick", by: "b", map: "Bind" },
      { kind: "decider", by: null, map: "Breeze" },
    ]);
    expect(v.order).toEqual(["Haven", "Bind", "Breeze"]);
  });

  it("best-of-5 from five maps has no bans", () => {
    const v = simulateVeto(Object.keys(odds), odds, 5);
    expect(v.steps.filter((s) => s.kind === "ban")).toHaveLength(0);
    expect(v.order).toEqual(["Ascent", "Split", "Haven", "Bind", "Breeze"]);
  });

  it("follows VCT's best-of-3 format with a seven-map pool", () => {
    const seven = { ...odds, Lotus: 0.5, Icebox: 0.45 };
    const v = simulateVeto(Object.keys(seven), seven, 3);
    expect(v.steps.map((s) => s.kind)).toEqual(["ban", "ban", "pick", "pick", "ban", "ban", "decider"]);
    expect(new Set(v.steps.map((s) => s.map)).size).toBe(7);
  });

  it("ranges over every map set", () => {
    const r = mapSetRange(Object.keys(odds), odds, 3);
    expect(r.sets).toBe(10);
    expect(r.max.pA).toBeGreaterThanOrEqual(r.mean);
    expect(r.min.pA).toBeLessThanOrEqual(r.mean);
    expect(r.max.maps.sort()).toEqual(["Ascent", "Breeze", "Haven"]);
    expect(mapSetRange(Object.keys(odds), odds, 5).sets).toBe(1);
  });
});
