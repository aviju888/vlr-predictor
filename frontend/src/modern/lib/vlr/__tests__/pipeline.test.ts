import { describe, expect, it } from "vitest";
import { explain } from "@/modern/lib/vlr/explain";
import { loadVlrData } from "@/modern/lib/vlr/load";
import { DEFAULT_KNOBS, fitAll, MODEL_IDS, mapOdds, predictCore } from "@/modern/lib/vlr/pipeline";
import { simulateSeries, simulateVeto } from "@/modern/lib/vlr/series";

const { dataset: ds } = loadVlrData();
const fit = fitAll(ds);

describe("pipeline", () => {
  it("scores the held-out set with the original's split", () => {
    for (const id of MODEL_IDS) {
      const v = fit.valid[id].platt;
      expect(v.n).toBe(38);
      expect(v.accuracy).toBeGreaterThanOrEqual(0);
      expect(v.accuracy).toBeLessThanOrEqual(1);
      expect(v.bins.reduce((s, b) => s + b.n, 0)).toBe(38);
      expect(fit.valid[id].series.platt.n).toBe(14);
      expect(fit.train[id].raw.n).toBe(33);
    }
    expect(fit.baselines.coin.accuracy).toBe(0.5);
    expect(fit.baselines.coin.logLoss).toBeCloseTo(Math.LN2, 12);
    expect(fit.baselines.firstListed).toBeCloseTo(35 / 38, 12);
  });

  it("is deterministic", () => {
    expect(fitAll(ds).valid).toEqual(fit.valid);
  });

  it("is blind to side: swapping the teams flips every model's odds", () => {
    const names = ds.teams.map((t) => t.name);
    for (const a of names) {
      for (const b of names) {
        if (a === b) continue;
        const ab = predictCore(ds, fit, { a, b, map: "Haven" });
        const ba = predictCore(ds, fit, { a: b, b: a, map: "Haven" });
        for (const id of MODEL_IDS) {
          expect(ab.raw[id] + ba.raw[id]).toBeCloseTo(1, 12);
          expect(ab.cal[id] + ba.cal[id]).toBeCloseTo(1, 12);
        }
      }
    }
  });

  it("reproduces a stored held-out prediction from the matchup alone", () => {
    for (const m of ds.matches.filter((x) => x.split === "valid")) {
      const core = predictCore(ds, fit, { a: m.a, b: m.b, map: m.map, date: m.date });
      for (const id of MODEL_IDS) expect(core.cal[id]).toBeCloseTo(fit.preds[m.id].cal[id], 12);
    }
  });

  it("explains every model: the shares add up to p − 50%", () => {
    const core = predictCore(ds, fit, { a: "Paper Rex", b: "Fnatic", map: "Ascent" });
    for (const id of MODEL_IDS) {
      for (const calib of ["raw", "platt"] as const) {
        const e = explain(core, id, calib, fit.platt[id].a);
        const total = e.drivers.reduce((s, d) => s + d.value, 0);
        expect(total).toBeCloseTo(e.p - 0.5, 9);
        expect(e.drivers.length).toBe(id === "elo" ? 2 : id === "lr" ? 6 : 8);
      }
    }
  });

  it("knobs change the fit, and the defaults are the documented ones", () => {
    expect(DEFAULT_KNOBS).toEqual({ k: 32, halfLife: 60, l2: 1, mapShare: 0.5 });
    const loose = fitAll(ds, { ...DEFAULT_KNOBS, k: 80 });
    expect(loose.preds[ds.matches[40].id].raw.elo).not.toBeCloseTo(fit.preds[ds.matches[40].id].raw.elo, 6);
    const tight = fitAll(ds, { ...DEFAULT_KNOBS, l2: 50 });
    const norm = (w: number[]) => Math.hypot(...w);
    expect(norm(tight.lr.w)).toBeLessThan(norm(fit.lr.w));
  });

  it("feeds the series simulator", () => {
    const odds = mapOdds(ds, fit, "Paper Rex", "Fnatic", ds.maps, "blend");
    const veto = simulateVeto(ds.maps, odds, 3);
    const s = simulateSeries(
      veto.order.map((m) => odds[m]),
      3,
    );
    expect(s.pA).toBeGreaterThan(0.5);
    expect(s.scorelines.reduce((a, x) => a + x.p, 0)).toBeCloseTo(1, 12);
  });
});
