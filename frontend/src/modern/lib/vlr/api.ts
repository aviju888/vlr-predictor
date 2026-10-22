import { z } from "zod";
import { explain } from "./explain";
import { DEFAULT_KNOBS, fitAll, MODEL_IDS, nextDay, predictCore, type Calib, type Fit, type ModelId } from "./pipeline";
import { mapSetRange, simulateSeries, simulateVeto, type BestOf } from "./series";
import type { Dataset, VlrData } from "./types";

/* ─────────────────────────────────────────────────────────
 * API — the original's endpoints, on the bundled data:
 *   GET /api/vlr/predict?teamA=&teamB=&map=     map-predict
 *   GET /api/vlr/series?teamA=&teamB=&bestOf=   series-predict
 *   GET /api/vlr/metrics                        model info + audit
 * Pure functions over a dataset, so the routes stay thin and
 * the same answers come back in tests.
 * ───────────────────────────────────────────────────────── */

let cached: { ds: Dataset; fit: Fit } | null = null;

export function defaultFit(ds: Dataset): Fit {
  if (cached && cached.ds === ds) return cached.fit;
  const fit = fitAll(ds, DEFAULT_KNOBS);
  cached = { ds, fit };
  return fit;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const Common = z.object({
  teamA: z.string().trim().min(1, "Add teamA."),
  teamB: z.string().trim().min(1, "Add teamB."),
  model: z.enum(["elo", "lr", "blend"]).default("blend"),
  calib: z.enum(["platt", "raw"]).default("platt"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date is YYYY-MM-DD")
    .optional(),
});

function parse<T extends z.ZodTypeAny>(schema: T, params: URLSearchParams): z.infer<T> {
  const raw = Object.fromEntries([...params.entries()].filter(([, v]) => v !== ""));
  const r = schema.safeParse(raw);
  if (!r.success) throw new ApiError(r.error.issues[0]?.message ?? "Invalid query.");
  return r.data;
}

/** case-insensitive team lookup, by name or tag */
function resolveTeam(ds: Dataset, q: string): string {
  const s = q.trim().toLowerCase();
  const t = ds.teams.find((x) => x.name.toLowerCase() === s || x.tag.toLowerCase() === s);
  if (!t) throw new ApiError(`Unknown team "${q}". Teams: ${ds.teams.map((x) => x.name).join(", ")}.`, 404);
  return t.name;
}

function resolveMap(ds: Dataset, q: string): string {
  const m = ds.maps.find((x) => x.toLowerCase() === q.trim().toLowerCase());
  if (!m) throw new ApiError(`Unknown map "${q}". The data covers ${ds.maps.join(", ")}.`);
  return m;
}

/** a date inside or before the training event would be scored by weights fit on it */
function checkDate(ds: Dataset, date: string | undefined) {
  if (!date) return;
  const trainEnd = ds.events.find((e) => e.split === "train")?.to;
  if (trainEnd && date <= trainEnd) {
    throw new ApiError(`Pick a date after ${trainEnd}. The models were fit on everything up to then, so earlier dates would be scored by weights that saw them.`);
  }
}

function pair(ds: Dataset, a: string, b: string) {
  const ta = resolveTeam(ds, a);
  const tb = resolveTeam(ds, b);
  if (ta === tb) throw new ApiError("Pick two different teams.");
  return [ta, tb] as const;
}

const round = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

export function predictHandler(data: VlrData, params: URLSearchParams) {
  const ds = data.dataset;
  const q = parse(Common.extend({ map: z.string().trim().min(1, "Add map.") }), params);
  const [a, b] = pair(ds, q.teamA, q.teamB);
  const map = resolveMap(ds, q.map);
  checkDate(ds, q.date);
  const fit = defaultFit(ds);
  const core = predictCore(ds, fit, { a, b, map, date: q.date });
  const models = Object.fromEntries(
    MODEL_IDS.map((id) => {
      const p = q.calib === "platt" ? core.cal[id] : core.raw[id];
      return [id, { prob_teamA: round(p), prob_teamB: round(1 - p), raw_teamA: round(core.raw[id]) }];
    }),
  );
  const why = explain(core, q.model as ModelId, q.calib as Calib, fit.platt[q.model as ModelId].a);
  const p = why.p;
  return {
    teamA: a,
    teamB: b,
    map_name: map,
    as_of: core.q.date,
    model: q.model,
    calibration: q.calib,
    prob_teamA: round(p),
    prob_teamB: round(1 - p),
    winner: p === 0.5 ? null : p > 0.5 ? a : b,
    models,
    drivers: why.drivers.map((d) => ({ label: d.label, detail: d.detail, toward_teamA: round(d.value) })),
    note: "Probabilities use only results from days before as_of. Driver values are shares of the move from 50%, in probability points toward teamA.",
  };
}

export function seriesHandler(data: VlrData, params: URLSearchParams) {
  const ds = data.dataset;
  const q = parse(
    Common.extend({
      bestOf: z.coerce
        .number()
        .refine((n) => n === 3 || n === 5, "bestOf is 3 or 5.")
        .default(3),
    }),
    params,
  );
  const [a, b] = pair(ds, q.teamA, q.teamB);
  checkDate(ds, q.date);
  const fit = defaultFit(ds);
  const bo = q.bestOf as BestOf;
  const odds: Record<string, number> = {};
  for (const map of ds.maps) {
    const c = predictCore(ds, fit, { a, b, map, date: q.date });
    odds[map] = q.calib === "platt" ? c.cal[q.model as ModelId] : c.raw[q.model as ModelId];
  }
  const veto = simulateVeto(ds.maps, odds, bo);
  const sim = simulateSeries(
    veto.order.map((m) => odds[m]),
    bo,
  );
  const range = mapSetRange(ds.maps, odds, bo);
  return {
    teamA: a,
    teamB: b,
    format: `BO${bo}`,
    as_of: q.date ?? nextDay(ds).date,
    model: q.model,
    calibration: q.calib,
    veto: veto.steps.map((s) => ({ action: s.kind, by: s.by === "a" ? a : s.by === "b" ? b : null, map: s.map })),
    maps: veto.order.map((m) => ({ map: m, prob_teamA: round(odds[m]) })),
    prob_teamA: round(sim.pA),
    prob_teamB: round(1 - sim.pA),
    scorelines: sim.scorelines.map((s) => ({ winner: s.winner === "a" ? a : b, score: s.winner === "a" ? `${s.a}-${s.b}` : `${s.b}-${s.a}`, prob: round(s.p) })),
    expected_maps: round(sim.expectedMaps, 3),
    map_sets: { count: range.sets, min: { maps: range.min.maps, prob_teamA: round(range.min.pA) }, max: { maps: range.max.maps, prob_teamA: round(range.max.pA) } },
    note: "Maps are treated as independent, as in the original, so map order changes the scorelines but not the series odds.",
  };
}

export function metricsHandler(data: VlrData) {
  const ds = data.dataset;
  const fit = defaultFit(ds);
  const m = (x: Fit["valid"]["elo"]["raw"]) => ({
    n: x.n,
    accuracy: round(x.accuracy),
    accuracy_ci95: [round(x.ci[0]), round(x.ci[1])],
    log_loss: round(x.logLoss),
    brier: round(x.brier),
    ece: round(x.ece),
    bins: x.bins.map((b) => ({ range: [b.lo, Math.min(1, b.hi)], n: b.n, mean_confidence: round(b.conf), favorite_won: round(b.hit) })),
  });
  return {
    split: ds.events.map((e) => ({ role: e.split === "train" ? "train" : "held_out", event: e.name, from: e.from, to: e.to, maps: e.maps, series: e.series, teams: e.teams })),
    knobs: fit.knobs,
    platt_slope: Object.fromEntries(MODEL_IDS.map((id) => [id, round(fit.platt[id].a)])),
    held_out: Object.fromEntries(
      MODEL_IDS.map((id) => [id, { raw: m(fit.valid[id].raw), platt: m(fit.valid[id].platt), series_calls: fit.valid[id].series }]),
    ),
    baselines: { coin_flip: m(fit.baselines.coin), always_first_listed_accuracy: round(fit.baselines.firstListed) },
    original_claims: {
      readme_accuracy: "55-64%",
      masters_model_info: { accuracy: 1.0, brier: 0.0113, features: ["winrate_diff", "h2h_shrunk", "sos_mapelo_diff", "acs_diff", "kd_diff"] },
    },
    audit: data.audit,
    data_coverage: { from: ds.from, to: ds.to, maps: ds.matches.length, teams: ds.teams.length, map_pool: ds.maps },
  };
}

/** wraps a handler in a JSON response with friendly errors */
export function respond(fn: () => unknown): Response {
  try {
    return Response.json(fn(), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof ApiError) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: "Something went wrong computing that." }, { status: 500 });
  }
}
