"use client";

import "./vlr.css";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { MotionConfig } from "motion/react";
import { ArrowCounterClockwise, Database } from "@phosphor-icons/react";
import { playSfx } from "@/modern/lib/sfx";
import { formatDate, teamTag, winnerName } from "@/modern/lib/vlr/dataset";
import { explain } from "@/modern/lib/vlr/explain";
import { callScore } from "@/modern/lib/vlr/metrics";
import { DEFAULT_KNOBS, fitAll, MODEL_IDS, MODEL_LABEL, predictCore, type Calib, type Knobs, type ModelId } from "@/modern/lib/vlr/pipeline";
import { simulateSeries, simulateVeto, type BestOf } from "@/modern/lib/vlr/series";
import type { Match, VlrData } from "@/modern/lib/vlr/types";
import { suggestions as buildSuggestions, type Suggestion } from "@/modern/lib/vlr/views";
import { CalibrationPlot } from "./CalibrationPlot";
import { DataAudit } from "./DataAudit";
import { FineTune } from "./FineTune";
import { InsightDeck } from "./InsightDeck";
import { MatchPicker, SERIES } from "./MatchPicker";
import { MatchRecords, type EventFilter } from "./MatchRecords";
import { ModelCard } from "./ModelCard";
import { ModelDuel } from "./ModelDuel";
import { Pickem } from "./Pickem";
import { PickCard, type PickResult } from "./PickCard";
import { SeriesSimulator } from "./SeriesSimulator";
import { pct, SectionLabel, Segmented } from "./ui";
import { driversToRows, WhyTrace, type WhyRow } from "./WhyTrace";

/* ─────────────────────────────────────────────────────────
 * VLR PREDICTOR — who takes the map, and how sure the model is.
 * Everything runs in the browser from the bundled data: the
 * three models refit on every knob change (a few milliseconds),
 * and every number on the page comes from that one fit.
 * ───────────────────────────────────────────────────────── */

function suggestionFor(m: Match): Suggestion {
  return { key: m.series, label: `${teamTag(m.a)} vs ${teamTag(m.b)}`, note: formatDate(m.date, { year: false }), a: m.a, b: m.b, map: m.map, date: m.date, event: m.eventShort };
}

export function VlrApp({ data }: { data: VlrData }) {
  const ds = data.dataset;
  const [a, setA] = useState("T1");
  const [b, setB] = useState("Fnatic");
  const [map, setMap] = useState("Ascent");
  const [asOf, setAsOf] = useState<Suggestion | null>(null);
  const [model, setModel] = useState<ModelId>("blend");
  const [calib, setCalib] = useState<Calib>("platt");
  const [knobs, setKnobs] = useState<Knobs>(DEFAULT_KNOBS);
  const [bestOf, setBestOf] = useState<BestOf>(3);
  const [recTeam, setRecTeam] = useState("all");
  const [recEvent, setRecEvent] = useState<EventFilter>("Toronto");
  const topRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<HTMLDivElement>(null);
  const recordsRef = useRef<HTMLDivElement>(null);

  const liveKnobs = useDeferredValue(knobs);
  const fit = useMemo(() => fitAll(ds, liveKnobs), [ds, liveKnobs]);
  const baseFit = useMemo(() => fitAll(ds, DEFAULT_KNOBS), [ds]);
  const teams = ds.teams;
  const ta = teams.find((t) => t.name === a)!;
  const tb = teams.find((t) => t.name === b)!;
  const suggestions = useMemo(() => buildSuggestions(ds), [ds]);
  const date = asOf?.date;
  const seriesMode = map === SERIES;
  const edited = (Object.keys(DEFAULT_KNOBS) as (keyof Knobs)[]).some((k) => knobs[k] !== DEFAULT_KNOBS[k]);

  // every map's odds for this matchup, all three models
  const cores = useMemo(() => Object.fromEntries(ds.maps.map((m) => [m, predictCore(ds, fit, { a, b, map: m, date })])), [ds, fit, a, b, date]);
  const oddsFor = (id: ModelId) => Object.fromEntries(ds.maps.map((m) => [m, calib === "platt" ? cores[m].cal[id] : cores[m].raw[id]]));
  const odds = oddsFor(model);
  // a rewound series keeps its real format: both finals were best-of-5
  const rewoundSeries = asOf ? ds.series.find((s) => s.id === asOf.key) : undefined;
  const seriesBo: BestOf = rewoundSeries && Math.max(...rewoundSeries.score.split("-").map(Number)) === 3 ? 5 : 3;
  const seriesFor = (id: ModelId) => {
    const o = oddsFor(id);
    const veto = simulateVeto(ds.maps, o, seriesBo);
    return simulateSeries(
      veto.order.map((m) => o[m]),
      seriesBo,
    ).pA;
  };

  const focusMap = seriesMode ? null : map;
  const options = MODEL_IDS.map((id) => ({ model: id, p: focusMap ? (calib === "platt" ? cores[focusMap].cal[id] : cores[focusMap].raw[id]) : seriesFor(id) }));
  const current = Object.fromEntries(options.map((o) => [o.model, o.p])) as Record<ModelId, number>;
  const p = current[model];
  const bins = fit.valid[model][calib].bins;
  const conf = Math.max(p, 1 - p);
  const bin = bins.find((x) => conf >= x.lo && conf < x.hi) ?? bins[bins.length - 1];

  // the real result, when rewound to a match that was played
  let result: PickResult = null;
  const series = rewoundSeries;
  if (series) {
    if (seriesMode) {
      const won = series.winner === "a" ? series.a : series.b;
      result = { winner: won === a ? "a" : "b", score: callScore(p, won === a ? 1 : 0), label: `${won} won the series ${series.score}` };
    } else {
      const played = ds.matches.find((m) => m.series === series.id && m.map === map);
      if (played) {
        const won = winnerName(played);
        result = {
          winner: won === a ? "a" : "b",
          score: callScore(p, won === a ? 1 : 0),
          label: `${won} took ${map}`,
          caveat: played.conflict ? `The file scores this series ${played.score} but gives every map to ${won}, so this map may have gone the other way.` : undefined,
        };
      } else {
        result = { winner: "a", score: -1, label: `${map} wasn't played in this series` };
      }
    }
  }

  const core = focusMap ? cores[focusMap] : null;
  const why: WhyRow[] = core
    ? driversToRows(explain(core, model, calib, fit.platt[model].a).drivers, model)
    : (() => {
        const veto = simulateVeto(ds.maps, odds, seriesBo);
        return veto.order.map((m, i) => {
          const step = veto.steps.find((s) => s.map === m);
          return {
            key: m,
            label: `Map ${i + 1}: ${m}`,
            detail: `${step?.kind === "decider" ? "Decider" : `${(step?.by === "a" ? ta : tb).tag} pick`} · ${ta.tag} ${pct(odds[m])}`,
            value: odds[m] - 0.5,
          };
        });
      })();

  const pickTeams = (na: string, nb: string) => {
    setA(na);
    setB(nb);
    setAsOf(null);
  };
  const rewind = (s: Suggestion) => {
    setA(s.a);
    setB(s.b);
    setMap(s.map);
    setAsOf(s);
    const played = ds.series.find((x) => x.id === s.key);
    setBestOf(played && Math.max(...played.score.split("-").map(Number)) === 3 ? 5 : 3);
  };
  const toTop = () => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const subject = seriesMode ? `a best-of-${seriesBo}` : map;

  return (
    <MotionConfig reducedMotion="user">
      <div className="vlr-root mx-auto w-full max-w-[1240px] px-4 pb-28 sm:px-6">
        <header className="max-w-[720px] pt-10 sm:pt-14">
          <h1 className="mt-2 text-[28px] leading-[1.1] font-semibold tracking-[-0.03em] text-balance text-ink sm:text-[36px]">Who takes the map, and how sure the model is.</h1>
          <p className="mt-3 max-w-[600px] text-[14px] leading-relaxed text-pretty text-ink-2">
            Explore historical VCT 2025 matchups with three models trained on Masters Bangkok and scored on held-out Masters Toronto maps. Pick two teams and a map to compare their odds.
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
            <Database size={13} weight="bold" className="text-ink-3" />
            <span>
              VCT 2025 Masters, {formatDate(ds.from, { year: false })} through {formatDate(ds.to)}
            </span>
            <span aria-hidden>·</span>
            <span className="num">{ds.matches.length} maps</span>
            <span aria-hidden>·</span>
            <span className="num">{ds.teams.length} teams</span>
            <span aria-hidden>·</span>
            <span>bundled data, no live calls</span>
          </p>
        </header>

        <div ref={topRef} className="mt-6 flex scroll-mt-16 flex-col gap-3">
          <MatchPicker
            teams={teams}
            a={a}
            b={b}
            map={map}
            maps={ds.maps}
            odds={{ ...odds, [SERIES]: seriesFor(model) }}
            seriesBo={seriesBo}
            onTeams={pickTeams}
            onMap={setMap}
            suggestions={suggestions}
            onSuggestion={rewind}
            asOf={asOf}
            onClearAsOf={() => setAsOf(null)}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-ink-3">
            <span className="flex items-center gap-2">
              Model
              <Segmented label="Model" value={model} onChange={(v) => setModel(v)} options={MODEL_IDS.map((id) => ({ key: id, label: MODEL_LABEL[id] }))} className="w-[228px]" />
            </span>
            <span className="flex items-center gap-2">
              Odds
              <Segmented
                label="Odds"
                value={calib}
                onChange={(v) => setCalib(v)}
                options={[
                  { key: "platt", label: "Platt", title: "Platt scaling fit on Bangkok" },
                  { key: "raw", label: "Raw", title: "The model's own probabilities" },
                ]}
                className="w-[132px]"
              />
            </span>
            {edited && (
              <button
                type="button"
                onClick={() => {
                  setKnobs(DEFAULT_KNOBS);
                  playSfx("toggle");
                }}
                className="press inline-flex h-7 items-center gap-1.5 rounded-full bg-accent-tint px-2.5 font-medium text-accent-ink"
              >
                <ArrowCounterClockwise size={12} weight="bold" />
                Knobs edited, reset
              </button>
            )}
          </div>
        </div>

        <section className="mt-6 grid items-start gap-5 lg:grid-cols-12" aria-label="The pick">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
            <PickCard
              a={ta}
              b={tb}
              subject={seriesMode ? `the best-of-${seriesBo}` : map}
              options={options}
              model={model}
              calib={calib}
              bin={seriesMode ? null : bin}
              result={result}
              onModel={setModel}
              seriesMode={seriesMode}
              bestOf={seriesBo}
              onSimulate={() => {
                setBestOf(seriesBo);
                seriesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                playSfx("open", 0.5);
              }}
            />
            <WhyTrace
              key={`${a}|${b}|${map}|${model}|${calib}|${date ?? ""}`}
              rows={why}
              a={ta}
              b={tb}
              p={p}
              model={model}
              heading={seriesMode ? "Map by map" : undefined}
              additive={!seriesMode}
              footnote={
                seriesMode
                  ? `Each row is one map's edge over 50/50 for ${ta.tag}, in the simulated veto's order. The series odds combine them; they don't add up.`
                  : model === "elo"
                    ? "Rating gaps on the day, split into the team part and the map part."
                    : "Each signal's share of the move away from 50/50 (Shapley values)."
              }
            />
          </div>
          <div ref={seriesRef} className="min-w-0 scroll-mt-16 lg:col-span-7">
            <SeriesSimulator a={ta} b={tb} odds={odds} pool={ds.maps} bestOf={bestOf} onBestOf={setBestOf} modelLabel={`${MODEL_LABEL[model]}, ${calib === "platt" ? "Platt" : "raw"}`} />
          </div>
        </section>

        <section className="mt-14" aria-labelledby="vlr-trust">
          <SectionLabel id="vlr-trust">How good is it</SectionLabel>
          <div className="grid items-start gap-5 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-5">
              <ModelCard ds={ds} fit={fit} model={model} calib={calib} onCalib={setCalib} onModel={setModel} />
            </div>
            <div className="min-w-0 lg:col-span-7">
              <CalibrationPlot ds={ds} fit={fit} model={model} calib={calib} onModel={setModel} onCalib={setCalib} />
            </div>
          </div>
        </section>

        <section className="mt-14 grid items-start gap-x-5 gap-y-10 lg:grid-cols-12" aria-label="Models">
          <div className="min-w-0 lg:col-span-7">
            <SectionLabel>Model vs model</SectionLabel>
            <ModelDuel ds={ds} fit={fit} calib={calib} a={ta} b={tb} current={current} subject={subject} />
          </div>
          <div className="min-w-0 lg:col-span-5">
            <SectionLabel>Fine-tune</SectionLabel>
            <FineTune knobs={knobs} onKnobs={setKnobs} model={model} onModel={setModel} calib={calib} fit={fit} baseFit={baseFit} />
          </div>
        </section>

        <section className="mt-14 grid items-start gap-x-5 gap-y-10 lg:grid-cols-12" aria-label="Play">
          <div className="min-w-0 lg:col-span-5">
            <SectionLabel>Beat the model</SectionLabel>
            <Pickem ds={ds} fit={fit} model={model} calib={calib} />
          </div>
          <div className="min-w-0 lg:col-span-7">
            <InsightDeck
              ds={ds}
              fit={fit}
              a={ta}
              b={tb}
              model={model}
              calib={calib}
              before={date}
              actions={{
                onShowTeam: (t) => {
                  setRecTeam(t);
                  setRecEvent("all");
                  recordsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                },
                onMap: (m) => {
                  setMap(m);
                  toTop();
                },
                onRewind: (u) => {
                  rewind(suggestionFor(u.m));
                  toTop();
                },
              }}
            />
          </div>
        </section>

        <section className="mt-14 grid items-start gap-x-5 gap-y-10 lg:grid-cols-12" aria-label="The data">
          <div ref={recordsRef} className="min-w-0 scroll-mt-16 lg:col-span-8">
            <SectionLabel count={ds.matches.length}>Every map</SectionLabel>
            <MatchRecords ds={ds} fit={fit} model={model} calib={calib} team={recTeam} onTeam={setRecTeam} event={recEvent} onEvent={setRecEvent} />
          </div>
          <div className="min-w-0 lg:col-span-4">
            <SectionLabel>Data notes</SectionLabel>
            <DataAudit audit={data.audit} />
          </div>
        </section>
      </div>
    </MotionConfig>
  );
}
