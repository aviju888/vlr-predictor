import { applyPlatt, fitPlatt, type Platt } from "./calibrate";
import { dateFromDay } from "./dataset";
import { buildFeatures, featureParams, queryFor, toVector, type FeatureRow, type Query } from "./features";
import { evaluate, callScore, type Metrics, type Scored } from "./metrics";
import { emptyElo, eloView, runElo, type EloParams, type EloRun, type EloView } from "./models/elo";
import { applyScale, dot, fitLogistic, rmsScale, sigmoid } from "./models/logistic";
import type { Dataset, Match } from "./types";

/* ─────────────────────────────────────────────────────────
 * PIPELINE — fit the three models on Bangkok, score Toronto.
 *
 *   elo    walks forward through every map, rating teams as it goes
 *   lr     logistic regression on the six history features;
 *          weights fit on Bangkok only, then frozen for Toronto
 *   blend  the average of the two, the original's "ensemble"
 *
 * Every prediction is made from earlier days only. On Bangkok
 * (train) the LR weights for a day are fit on the days before it,
 * so train numbers are out-of-sample too. Platt scaling is fit on
 * those Bangkok predictions and judged on Toronto.
 * ───────────────────────────────────────────────────────── */

export type Knobs = {
  /** Elo K-factor */
  k: number;
  /** days for an old result to count half */
  halfLife: number;
  /** L2 strength for the logistic model (1 / C) */
  l2: number;
  /** share of K that goes to per-map ratings (0..1) */
  mapShare: number;
};

/** fixed before looking at Toronto: K 32 (chess default), the original's 60-day half-life, scikit-learn's C = 1 */
export const DEFAULT_KNOBS: Knobs = { k: 32, halfLife: 60, l2: 1, mapShare: 0.5 };

export type ModelId = "elo" | "lr" | "blend";
export const MODEL_IDS: readonly ModelId[] = ["elo", "lr", "blend"];
export const MODEL_LABEL: Record<ModelId, string> = { elo: "Elo", lr: "Logistic", blend: "Blend" };
export const MODEL_BLURB: Record<ModelId, string> = {
  elo: "Ratings that move after every map, plus a smaller rating per map",
  lr: "Logistic regression on six win-loss history features",
  blend: "The average of the two, like the original's ensemble",
};

export type Calib = "raw" | "platt";

export type MatchPrediction = { id: string; raw: Record<ModelId, number>; cal: Record<ModelId, number> };

export type SeriesCalls = { right: number; n: number };

export type ModelEval = { raw: Metrics; platt: Metrics; series: Record<Calib, SeriesCalls> };

export type Fit = {
  knobs: Knobs;
  lr: { w: number[]; scale: number[]; converged: boolean };
  platt: Record<ModelId, Platt>;
  preds: Record<string, MatchPrediction>;
  valid: Record<ModelId, ModelEval>;
  train: Record<ModelId, ModelEval>;
  baselines: { coin: Metrics; firstListed: number };
  elo: EloRun;
  features: Record<string, FeatureRow>;
};

export const eloParams = (k: Knobs): EloParams => ({ k: k.k, mapShare: k.mapShare, halfLife: k.halfLife });

const yOf = (m: Match): 0 | 1 => (m.winner === "a" ? 1 : 0);

function seriesCalls(ds: Dataset, split: Match["split"], p: (id: string) => number): SeriesCalls {
  let right = 0;
  let n = 0;
  for (const s of ds.series) {
    if (s.split !== split) continue;
    const mean = s.matchIds.reduce((acc, id) => acc + p(id), 0) / s.matchIds.length;
    right += callScore(mean, s.winner === "a" ? 1 : 0);
    n += 1;
  }
  return { right, n };
}

export function fitAll(ds: Dataset, knobs: Knobs = DEFAULT_KNOBS): Fit {
  const all = ds.matches;
  const fp = featureParams(knobs.halfLife);
  const elo = runElo(all, eloParams(knobs));

  const features: Record<string, FeatureRow> = {};
  const X: number[][] = [];
  for (const m of all) {
    const row = buildFeatures(all, queryFor(m), fp);
    features[m.id] = row;
    X.push(toVector(row.x));
  }
  const y = all.map(yOf);
  const trainIdx = all.flatMap((m, i) => (m.split === "train" ? [i] : []));

  const fitOn = (idx: number[]) => {
    const scale = rmsScale(idx.map((i) => X[i]));
    const res = fitLogistic(
      idx.map((i) => applyScale(X[i], scale)),
      idx.map((i) => y[i]),
      Math.max(1e-4, knobs.l2),
    );
    return { w: res.w, scale, converged: res.converged };
  };
  const lrP = (model: { w: number[]; scale: number[] }, i: number) => sigmoid(dot(model.w, applyScale(X[i], model.scale)));

  // LR weights for Toronto: all of Bangkok
  const full = fitOn(trainIdx);

  // LR on Bangkok: leave one series out, so no Bangkok map is scored by weights that saw it
  const lrRaw = new Array<number>(all.length).fill(0.5);
  const trainSeries = [...new Set(trainIdx.map((i) => all[i].series))];
  for (const s of trainSeries) {
    const rest = trainIdx.filter((i) => all[i].series !== s);
    const model = fitOn(rest);
    for (const i of trainIdx) if (all[i].series === s) lrRaw[i] = lrP(model, i);
  }
  all.forEach((m, i) => {
    if (m.split === "valid") lrRaw[i] = lrP(full, i);
  });

  const raw: Record<ModelId, number[]> = {
    elo: all.map((m) => elo.pre[m.id].p),
    lr: lrRaw,
    blend: all.map((m, i) => (elo.pre[m.id].p + lrRaw[i]) / 2),
  };

  const platt = {} as Record<ModelId, Platt>;
  for (const id of MODEL_IDS) {
    platt[id] = fitPlatt(
      trainIdx.map((i) => raw[id][i]),
      trainIdx.map((i) => y[i]),
    );
  }

  const preds: Record<string, MatchPrediction> = {};
  all.forEach((m, i) => {
    const r = { elo: raw.elo[i], lr: raw.lr[i], blend: raw.blend[i] };
    preds[m.id] = {
      id: m.id,
      raw: r,
      cal: { elo: applyPlatt(r.elo, platt.elo), lr: applyPlatt(r.lr, platt.lr), blend: applyPlatt(r.blend, platt.blend) },
    };
  });

  const scored = (split: Match["split"], model: ModelId, c: Calib): Scored[] =>
    all.filter((m) => m.split === split).map((m) => ({ id: m.id, p: preds[m.id][c === "raw" ? "raw" : "cal"][model], y: yOf(m) }));

  const evalFor = (split: Match["split"]) =>
    Object.fromEntries(
      MODEL_IDS.map((id) => [
        id,
        {
          raw: evaluate(scored(split, id, "raw")),
          platt: evaluate(scored(split, id, "platt")),
          series: {
            raw: seriesCalls(ds, split, (mid) => preds[mid].raw[id]),
            platt: seriesCalls(ds, split, (mid) => preds[mid].cal[id]),
          },
        },
      ]),
    ) as Record<ModelId, ModelEval>;

  const validMatches = all.filter((m) => m.split === "valid");
  return {
    knobs,
    lr: full,
    platt,
    preds,
    valid: evalFor("valid"),
    train: evalFor("train"),
    baselines: {
      coin: evaluate(validMatches.map((m) => ({ id: m.id, p: 0.5, y: yOf(m) }))),
      firstListed: validMatches.filter((m) => m.winner === "a").length / Math.max(1, validMatches.length),
    },
    elo,
    features,
  };
}

/* ── one matchup, any date ───────────────────────────────── */

export type MatchupInput = { a: string; b: string; map: string; date?: string };

export type MatchupCore = {
  q: Query;
  row: FeatureRow;
  elo: EloView;
  /** per-feature logits for LR, in FEATURE_KEYS order */
  lrLogits: number[];
  raw: Record<ModelId, number>;
  cal: Record<ModelId, number>;
};

/** the day after the data ends: what the models think "now" */
export function nextDay(ds: Dataset): { date: string; day: number } {
  const last = ds.matches[ds.matches.length - 1];
  return { date: dateFromDay(last.day + 1), day: last.day + 1 };
}

export function predictCore(ds: Dataset, fit: Fit, input: MatchupInput): MatchupCore {
  const when = input.date ? { date: input.date, day: Math.round(Date.parse(`${input.date}T00:00:00Z`) / 86_400_000) } : nextDay(ds);
  const q: Query = { a: input.a, b: input.b, map: input.map, date: when.date, day: when.day };
  const row = buildFeatures(ds.matches, q, featureParams(fit.knobs.halfLife));
  const params = eloParams(fit.knobs);
  // ratings as they stood on that day: replay only the earlier days
  const earlier = ds.matches.filter((m) => m.date < q.date);
  const state = earlier.length === ds.matches.length ? fit.elo.state : runElo(earlier, params, emptyElo()).state;
  const elo = eloView(state, q.a, q.b, q.map, q.day, params);
  const xs = applyScale(toVector(row.x), fit.lr.scale);
  const lrLogits = xs.map((v, j) => v * fit.lr.w[j]);
  const lr = sigmoid(lrLogits.reduce((s, z) => s + z, 0));
  const raw = { elo: elo.p, lr, blend: (elo.p + lr) / 2 };
  const cal = {
    elo: applyPlatt(raw.elo, fit.platt.elo),
    lr: applyPlatt(raw.lr, fit.platt.lr),
    blend: applyPlatt(raw.blend, fit.platt.blend),
  };
  return { q, row, elo, lrLogits, raw, cal };
}

/** P(A takes each map in `maps`), for the series simulator */
export function mapOdds(ds: Dataset, fit: Fit, a: string, b: string, maps: readonly string[], model: ModelId, calib: Calib = "platt", date?: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const map of maps) {
    const c = predictCore(ds, fit, { a, b, map, date });
    out[map] = calib === "platt" ? c.cal[model] : c.raw[model];
  }
  return out;
}
