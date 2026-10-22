import { describe, expect, it } from "vitest";
import { dayNumber } from "@/modern/lib/vlr/dataset";
import { buildFeatures, FEATURE_KEYS, featureParams, queryFor, shrunkRate, recencyWeight, type Query } from "@/modern/lib/vlr/features";
import { loadVlrData } from "@/modern/lib/vlr/load";
import { fitAll, MODEL_IDS } from "@/modern/lib/vlr/pipeline";
import type { Dataset, Match } from "@/modern/lib/vlr/types";

/* The leakage suite. A map's features (and every model's
 * prediction for it) may only depend on matches from EARLIER DAYS. */

const { dataset: ds } = loadVlrData();
const params = featureParams(60);

function m(date: string, a: string, b: string, winner: "a" | "b", map = "Ascent", order = 1): Match {
  return {
    id: `${date}-${a}-${b}-${order}`,
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

/** wraps every match so we can see which fields get read */
function recorded(history: readonly Match[]) {
  const reads = new Map<string, Set<string>>();
  const wrapped = history.map(
    (match) =>
      new Proxy(match, {
        get(target, prop, recv) {
          const set = reads.get(target.id) ?? new Set<string>();
          set.add(String(prop));
          reads.set(target.id, set);
          return Reflect.get(target, prop, recv);
        },
      }),
  );
  return { wrapped, reads };
}

describe("features read only earlier days", () => {
  it("never reads anything but the date of a same-day-or-later match", () => {
    for (const target of ds.matches) {
      const { wrapped, reads } = recorded(ds.matches);
      buildFeatures(wrapped, queryFor(target), params);
      for (const other of ds.matches) {
        if (other.date < target.date) continue;
        const seen = [...(reads.get(other.id) ?? [])];
        expect(seen.filter((p) => p !== "date"), `${target.id} read ${other.id}`).toEqual([]);
      }
    }
  });

  it("gives identical features when later days are removed", () => {
    for (const target of ds.matches) {
      const full = buildFeatures(ds.matches, queryFor(target), params);
      const past = buildFeatures(
        ds.matches.filter((x) => x.date < target.date),
        queryFor(target),
        params,
      );
      expect(full.x).toEqual(past.x);
    }
  });

  it("gives identical features when every result from that day on is flipped", () => {
    for (const target of ds.matches) {
      const corrupted = ds.matches.map((x) => (x.date >= target.date ? { ...x, winner: x.winner === "a" ? ("b" as const) : ("a" as const) } : x));
      expect(buildFeatures(corrupted, queryFor(target), params).x).toEqual(buildFeatures(ds.matches, queryFor(target), params).x);
    }
  });

  it("ignores earlier maps of the same series (same day)", () => {
    const h = [m("2025-01-01", "A", "B", "a", "Bind", 1), m("2025-01-01", "A", "B", "a", "Haven", 2)];
    const q: Query = { a: "A", b: "B", map: "Split", date: "2025-01-01", day: dayNumber("2025-01-01") };
    const f = buildFeatures(h, q, params);
    expect(f.a.maps).toBe(0);
    expect(Object.values(f.x).every((v) => v === 0)).toBe(true);
  });
});

describe("feature values", () => {
  it("are all zero with no history", () => {
    const f = buildFeatures([], { a: "A", b: "B", map: "Ascent", date: "2025-01-10", day: dayNumber("2025-01-10") }, params);
    for (const k of FEATURE_KEYS) expect(f.x[k]).toBe(0);
  });

  it("flip sign when the teams swap", () => {
    for (const target of ds.matches) {
      const q = queryFor(target);
      const ab = buildFeatures(ds.matches, q, params).x;
      const ba = buildFeatures(ds.matches, { ...q, a: q.b, b: q.a }, params).x;
      for (const k of FEATURE_KEYS) expect(ba[k]).toBeCloseTo(-ab[k], 12);
    }
  });

  it("match a hand computation on a tiny fixture", () => {
    // A beat B on Ascent 10 days ago and on Bind 5 days ago; C beat A yesterday
    const h = [
      m("2025-01-01", "A", "B", "a", "Ascent"),
      m("2025-01-06", "B", "A", "b", "Bind"),
      m("2025-01-10", "C", "A", "a", "Split"),
    ];
    const q: Query = { a: "A", b: "B", map: "Ascent", date: "2025-01-11", day: dayNumber("2025-01-11") };
    const f = buildFeatures(h, q, featureParams(10));
    const w10 = recencyWeight(10, 10); // 0.5
    const w5 = recencyWeight(5, 10);
    const w1 = recencyWeight(1, 10);
    expect(w10).toBeCloseTo(0.5, 12);
    // A: won (w10), won (w5), lost (w1)
    const formA = shrunkRate(w10 + w5, w10 + w5 + w1, 2);
    const formB = shrunkRate(0, w10 + w5, 2);
    expect(f.x.form).toBeCloseTo(formA - formB, 12);
    // only the Ascent map counts for the map edge
    expect(f.x.map).toBeCloseTo(shrunkRate(w10, w10, 2) - shrunkRate(0, w10, 2), 12);
    // h2h: A won both, shrunk by n / (n + 7)
    expect(f.x.h2h).toBeCloseTo(1 * (2 / 9), 12);
    // last 5: A 2-1, B 0-2
    expect(f.x.recent).toBeCloseTo(shrunkRate(2, 3, 2) - shrunkRate(0, 2, 2), 12);
    // A's streak ended yesterday; B has none
    expect(f.x.streak).toBe(0);
    expect(f.a.streak).toBe(0);
    expect(f.h2h).toMatchObject({ maps: 2, aWins: 2 });
  });
});

describe("predictions read only earlier days (end to end)", () => {
  it("leaves every held-out prediction unchanged when later results are corrupted", () => {
    const base = fitAll(ds);
    const valid = ds.matches.filter((x) => x.split === "valid");
    // probe a spread of days, first to last
    const probes = [...new Set(valid.map((x) => x.date))];
    for (const date of probes) {
      const corrupted: Dataset = {
        ...ds,
        matches: ds.matches.map((x) => (x.date >= date ? { ...x, winner: x.winner === "a" ? ("b" as const) : ("a" as const) } : x)),
      };
      const fit = fitAll(corrupted);
      for (const target of valid.filter((x) => x.date === date)) {
        for (const id of MODEL_IDS) {
          expect(fit.preds[target.id].raw[id]).toBeCloseTo(base.preds[target.id].raw[id], 12);
          expect(fit.preds[target.id].cal[id]).toBeCloseTo(base.preds[target.id].cal[id], 12);
        }
      }
    }
  });

  it("walks Elo forward on Bangkok too: each Bangkok map is scored from earlier days", () => {
    const base = fitAll(ds);
    for (const date of new Set(ds.matches.filter((x) => x.split === "train").map((x) => x.date))) {
      const corrupted: Dataset = {
        ...ds,
        matches: ds.matches.map((x) => (x.date >= date ? { ...x, winner: x.winner === "a" ? ("b" as const) : ("a" as const) } : x)),
      };
      const fit = fitAll(corrupted);
      for (const target of ds.matches.filter((x) => x.date === date)) {
        expect(fit.preds[target.id].raw.elo).toBeCloseTo(base.preds[target.id].raw.elo, 12);
      }
    }
  });
});
