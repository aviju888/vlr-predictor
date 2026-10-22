import { describe, expect, it } from "vitest";
import { ApiError, metricsHandler, predictHandler, seriesHandler } from "@/modern/lib/vlr/api";
import { loadVlrData } from "@/modern/lib/vlr/load";
import { fitAll } from "@/modern/lib/vlr/pipeline";
import { duel, mapRecords, pickemDeck, recordRows, suggestions, upsets } from "@/modern/lib/vlr/views";

const data = loadVlrData();
const ds = data.dataset;
const fit = fitAll(ds);

/** a seeded 0..1 source so the deck is reproducible in tests */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("views", () => {
  it("suggests real held-out matchups, the final first", () => {
    const s = suggestions(ds);
    expect(s[0]).toMatchObject({ a: "Paper Rex", b: "Fnatic", note: "final", event: "Toronto", date: "2025-06-22" });
    expect(s).toHaveLength(4);
    for (const x of s) {
      const series = ds.series.find((y) => y.id === x.key);
      expect(series?.split).toBe("valid");
      expect(series?.maps.includes(x.map)).toBe(true);
    }
  });

  it("records every map with a pick and a verdict", () => {
    const rows = recordRows(ds, fit, "blend", "platt");
    expect(rows).toHaveLength(71);
    const held = rows.filter((r) => r.split === "valid");
    expect(held.reduce((s, r) => s + r.score, 0) / held.length).toBeCloseTo(fit.valid.blend.platt.accuracy, 12);
  });

  it("keeps the duel's books straight", () => {
    const d = duel(ds, fit, "elo", "lr", "platt");
    expect(d.cells).toHaveLength(38);
    expect(d.acc1).toBeCloseTo(fit.valid.elo.platt.accuracy, 12);
    expect(d.acc2).toBeCloseTo(fit.valid.lr.platt.accuracy, 12);
    // when two models disagree on a decided map, exactly one of them is right
    expect(d.right1 + d.right2).toBe(d.disagreements);
    expect(duel(ds, fit, "lr", "lr", "platt").disagreements).toBe(0);
  });

  it("counts upsets against the favorite", () => {
    const u = upsets(ds, fit, "blend", "platt");
    expect(u.calls).toBe(38);
    expect(u.rate).toBeCloseTo(1 - fit.valid.blend.platt.accuracy, 12);
    for (let i = 1; i < u.upsets.length; i += 1) expect(u.upsets[i - 1].conf).toBeGreaterThanOrEqual(u.upsets[i].conf);
  });

  it("builds map records only from the past when asked", () => {
    const all = mapRecords(ds, "Paper Rex");
    const before = mapRecords(ds, "Paper Rex", "2025-06-22");
    expect(all.reduce((s, r) => s + r.maps, 0)).toBe(26);
    expect(before.reduce((s, r) => s + r.maps, 0)).toBe(22);
  });

  it("deals 5 held-out maps from 5 different series, with pre-match context only", () => {
    for (const seed of [1, 7, 42, 99]) {
      const deck = pickemDeck(ds, lcg(seed));
      expect(deck).toHaveLength(5);
      expect(new Set(deck.map((r) => r.m.series)).size).toBe(5);
      for (const r of deck) {
        expect(r.m.split).toBe("valid");
        const earlier = ds.matches.filter((m) => m.date < r.m.date && (m.a === r.m.a || m.b === r.m.a));
        expect(r.context.a.maps).toBe(earlier.length);
      }
    }
  });
});

describe("api", () => {
  const q = (s: string) => new URLSearchParams(s);

  it("predicts a map, by name or tag, any case", () => {
    const r = predictHandler(data, q("teamA=prx&teamB=Fnatic&map=ascent"));
    expect(r).toMatchObject({ teamA: "Paper Rex", teamB: "Fnatic", map_name: "Ascent", model: "blend", calibration: "platt", as_of: "2025-06-23" });
    expect(r.prob_teamA + r.prob_teamB).toBeCloseTo(1, 3);
    const total = r.drivers.reduce((s, d) => s + d.toward_teamA, 0);
    expect(total).toBeCloseTo(r.prob_teamA - 0.5, 2);
  });

  it("rewinds to a date and stays leak-free", () => {
    const r = predictHandler(data, q("teamA=PRX&teamB=FNC&map=Ascent&date=2025-06-22"));
    const m = ds.matches.find((x) => x.date === "2025-06-22" && x.map === "Ascent")!;
    expect(r.prob_teamA).toBeCloseTo(fit.preds[m.id].cal.blend, 3);
  });

  it("simulates a series with a veto and scorelines that sum to 1", () => {
    const r = seriesHandler(data, q("teamA=T1&teamB=G2&bestOf=5"));
    expect(r.format).toBe("BO5");
    expect(r.maps).toHaveLength(5);
    expect(r.scorelines.reduce((s, x) => s + x.prob, 0)).toBeCloseTo(1, 3);
  });

  it("answers bad requests in plain words", () => {
    expect(() => predictHandler(data, q("teamA=Nobody&teamB=FNC&map=Ascent"))).toThrow(ApiError);
    expect(() => predictHandler(data, q("teamA=T1&teamB=T1&map=Ascent"))).toThrow("Pick two different teams.");
    expect(() => predictHandler(data, q("teamA=T1&teamB=FNC&map=Lotus"))).toThrow(/data covers/);
    expect(() => seriesHandler(data, q("teamA=T1&teamB=FNC&bestOf=7"))).toThrow("bestOf is 3 or 5.");
    // inside the training event, the weights already saw the match
    expect(() => predictHandler(data, q("teamA=T1&teamB=G2&map=Ascent&date=2025-03-02"))).toThrow(/after 2025-03-02/);
  });

  it("serves the model card", () => {
    const m = metricsHandler(data);
    expect(m.split.map((s) => [s.event, s.maps])).toEqual([
      ["Masters Bangkok 2025", 33],
      ["Masters Toronto 2025", 38],
    ]);
    expect(m.held_out.blend.platt.n).toBe(38);
    expect(m.baselines.coin_flip.accuracy).toBe(0.5);
  });
});
