import { teamTag } from "./dataset";
import { FEATURE_KEYS, type FeatureKey, type TeamHistory } from "./features";
import { ELO_TO_LOGIT } from "./models/elo";
import type { Calib, MatchupCore, ModelId } from "./pipeline";
import { shapleyLogistic } from "./shapley";

/* ─────────────────────────────────────────────────────────
 * EXPLAIN — "why" for one prediction, as signed shares of the
 * move away from 50/50 (in probability points, toward team A).
 *
 *   Logistic  Shapley value of each feature's logit
 *   Elo       Shapley split of the team gap and the map gap
 *   Blend     half of each, since the blend is their average
 *
 * After Platt scaling the shares are stretched by the same factor
 * as the probability, so they still add up to p − 50%.
 * ───────────────────────────────────────────────────────── */

export type Driver = {
  key: string;
  model: "elo" | "lr";
  label: string;
  detail: string;
  /** probability points toward team A (negative = toward B) */
  value: number;
};

export type Explanation = { model: ModelId; calib: Calib; p: number; pRaw: number; drivers: Driver[] };

const rec = (h: TeamHistory) => `${h.wins}-${h.maps - h.wins}`;
const mapRec = (h: TeamHistory) => `${h.mapWins}-${h.mapMaps - h.mapWins}`;
const recent = (h: TeamHistory) => {
  const w = h.recent.reduce((s, x) => s + x, 0);
  return `${w}-${h.recent.length - w}`;
};

export function featureLabel(key: FeatureKey, map: string): string {
  switch (key) {
    case "form":
      return "Overall form";
    case "map":
      return `Map edge on ${map}`;
    case "h2h":
      return "Head-to-head";
    case "recent":
      return "Last 5 maps";
    case "exp":
      return "Experience";
    case "streak":
      return "Win streak";
  }
}

export const FEATURE_HELP: Record<FeatureKey, string> = {
  form: "Map win rate before this day, recent results weighted more, pulled toward 50% by 2 imaginary maps",
  map: "The same, on this map only",
  h2h: "Earlier maps between these two teams, shrunk by n / (n + 7) as in the original",
  recent: "Win rate over each team's last 5 maps",
  exp: "log(1 + recent maps played, each weighted by age): who has been playing lately",
  streak: "Maps won in a row, capped at 5",
};

function featureDetail(key: FeatureKey, core: MatchupCore): string {
  const { a, b, h2h } = core.row;
  const ta = teamTag(core.q.a);
  const tb = teamTag(core.q.b);
  const none = (h: TeamHistory) => h.maps === 0;
  switch (key) {
    case "form":
      return `${ta} ${none(a) ? "no maps yet" : rec(a)} · ${tb} ${none(b) ? "no maps yet" : rec(b)}`;
    case "map":
      return `${ta} ${mapRec(a)} · ${tb} ${mapRec(b)} on ${core.q.map}`;
    case "h2h":
      if (!h2h.maps) return "First meeting in the data";
      if (h2h.aWins * 2 === h2h.maps) return `Even at ${h2h.aWins}-${h2h.maps - h2h.aWins}`;
      return h2h.aWins * 2 > h2h.maps ? `${ta} leads ${h2h.aWins}-${h2h.maps - h2h.aWins}` : `${tb} leads ${h2h.maps - h2h.aWins}-${h2h.aWins}`;
    case "recent":
      return `${ta} ${recent(a)} · ${tb} ${recent(b)}`;
    case "exp":
      return `Recent maps, weighted: ${ta} ${a.wMaps.toFixed(1)} · ${tb} ${b.wMaps.toFixed(1)}`;
    case "streak":
      return `${ta} ${a.streak} straight · ${tb} ${b.streak}`;
  }
}

const sign = (v: number) => (Math.round(v) === 0 ? "0" : `${v > 0 ? "+" : "−"}${Math.abs(Math.round(v))}`);

function eloDrivers(core: MatchupCore): Driver[] {
  const e = core.elo;
  const [team, map] = shapleyLogistic([(e.ra - e.rb) * ELO_TO_LOGIT, (e.ma - e.mb) * ELO_TO_LOGIT]);
  return [
    {
      key: "elo-team",
      model: "elo",
      label: "Team rating",
      detail: `${teamTag(core.q.a)} ${Math.round(e.ra)} · ${teamTag(core.q.b)} ${Math.round(e.rb)}`,
      value: team,
    },
    {
      key: "elo-map",
      model: "elo",
      label: `Rating on ${core.q.map}`,
      detail: `${teamTag(core.q.a)} ${sign(e.ma)} · ${teamTag(core.q.b)} ${sign(e.mb)}`,
      value: map,
    },
  ];
}

function lrDrivers(core: MatchupCore): Driver[] {
  const shares = shapleyLogistic(core.lrLogits);
  return FEATURE_KEYS.map((k, i) => ({
    key: `lr-${k}`,
    model: "lr" as const,
    label: featureLabel(k, core.q.map),
    detail: featureDetail(k, core),
    value: shares[i],
  }));
}

export function explain(core: MatchupCore, model: ModelId, calib: Calib = "platt", plattA = 1): Explanation {
  const pRaw = core.raw[model];
  const p = calib === "platt" ? core.cal[model] : pRaw;
  let drivers: Driver[];
  if (model === "elo") drivers = eloDrivers(core);
  else if (model === "lr") drivers = lrDrivers(core);
  else drivers = [...eloDrivers(core), ...lrDrivers(core)].map((d) => ({ ...d, value: d.value / 2 }));

  // Platt stretches p − 0.5 by this factor; stretch the shares with it
  const stretch = calib === "platt" ? (Math.abs(pRaw - 0.5) > 1e-9 ? (p - 0.5) / (pRaw - 0.5) : plattA) : 1;
  drivers = drivers.map((d) => ({ ...d, value: d.value * stretch })).sort((x, y) => Math.abs(y.value) - Math.abs(x.value));
  return { model, calib, p, pRaw, drivers };
}
