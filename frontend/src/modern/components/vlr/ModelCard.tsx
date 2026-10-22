"use client";

import { Warning } from "@phosphor-icons/react";
import { RollingNumber } from "@/modern/components/craft/RollingNumber";
import { ScrollFade } from "@/modern/components/craft/ScrollFade";
import { cn } from "@/modern/lib/cn";
import { formatDate } from "@/modern/lib/vlr/dataset";
import { MODEL_IDS, MODEL_LABEL, type Calib, type Fit, type ModelId } from "@/modern/lib/vlr/pipeline";
import type { Dataset } from "@/modern/lib/vlr/types";
import { Segmented } from "./ui";

/* ─────────────────────────────────────────────────────────
 * MODEL CARD — the split, n, and every held-out number, for
 * all three models side by side, with the coin flip as a floor.
 * Accuracy rolls when a knob refits the models.
 * ───────────────────────────────────────────────────────── */

const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;

function Stat({ value, best }: { value: string; best?: boolean }) {
  return <span className={cn("num text-[12.5px]", best ? "font-semibold text-ink" : "text-ink-2")}>{value}</span>;
}

export function ModelCard({
  ds,
  fit,
  model,
  calib,
  onCalib,
  onModel,
}: {
  ds: Dataset;
  fit: Fit;
  model: ModelId;
  calib: Calib;
  onCalib: (c: Calib) => void;
  onModel: (m: ModelId) => void;
}) {
  const [train, valid] = ds.events;
  const rows = MODEL_IDS.map((id) => ({ id, m: fit.valid[id][calib], s: fit.valid[id].series[calib] }));
  const best = {
    acc: Math.max(...rows.map((r) => r.m.accuracy)),
    ll: Math.min(...rows.map((r) => r.m.logLoss)),
    brier: Math.min(...rows.map((r) => r.m.brier)),
    ece: Math.min(...rows.map((r) => r.m.ece)),
  };
  const coin = fit.baselines.coin;
  const accs = rows.map((r) => r.m.accuracy).sort((x, y) => x - y);
  const cols = "grid-cols-[minmax(92px,1.2fr)_minmax(108px,1.3fr)_repeat(3,minmax(52px,0.7fr))_minmax(44px,0.6fr)]";

  return (
    <div className="w-full overflow-hidden rounded-card bg-surface shadow-card">
      <div className="primitive-card-bar flex items-center justify-between gap-3 border-b border-line">
        <span className="text-[13px] font-medium text-ink">Model card</span>
        <Segmented
          label="Calibration"
          size="xs"
          value={calib}
          onChange={onCalib}
          options={[
            { key: "platt", label: "Platt" },
            { key: "raw", label: "Raw" },
          ]}
          className="w-[112px]"
        />
      </div>

      <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-b border-line px-3 py-2.5 text-[12.5px]">
        <dt className="text-ink-3">Train</dt>
        <dd className="min-w-0 text-ink-2">
          <span className="text-ink">{train.name}</span> · {formatDate(train.from, { year: false })} to {formatDate(train.to, { year: false })} ·{" "}
          <span className="num">
            {train.maps} maps, {train.series} series
          </span>
        </dd>
        <dt className="text-ink-3">Held out</dt>
        <dd className="min-w-0 text-ink-2">
          <span className="text-ink">{valid.name}</span> · {formatDate(valid.from, { year: false })} to {formatDate(valid.to, { year: false })} ·{" "}
          <span className="num">
            {valid.maps} maps, {valid.series} series
          </span>
        </dd>
        <dt className="text-ink-3">Method</dt>
        <dd className="min-w-0 text-pretty text-ink-2">Fit on Bangkok, Platt fit on Bangkok, scored once on Toronto. Every map is predicted from earlier days only.</dd>
      </dl>

      <ScrollFade axis="x" style={{ scrollbarWidth: "none" }}>
        <div className="min-w-[468px]">
          <div className={cn("grid border-b border-[var(--grid-line)] px-3 py-1.5 text-[11.5px] font-medium text-ink-3", cols)}>
            <span>Toronto, n {valid.maps}</span>
            <span>Accuracy · 95% CI</span>
            <span className="text-right" title="Lower is better. A coin flip scores 0.693">
              Log loss
            </span>
            <span className="text-right" title="Lower is better. A coin flip scores 0.250">
              Brier
            </span>
            <span className="text-right" title="Expected calibration error over the favorite bins. Lower is better">
              ECE
            </span>
            <span className="text-right" title="Series called right, from the average of each series' map odds">
              Series
            </span>
          </div>
          {rows.map(({ id, m, s }) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === model}
              onClick={() => onModel(id)}
              className={cn("grid w-full items-center px-3 py-2 text-left transition-colors duration-100 hover:bg-hover", cols, id === model && "bg-inset")}
            >
              <span className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
                <span className={cn("size-1.5 rounded-full", id === model ? "bg-ink" : "bg-transparent")} aria-hidden />
                {MODEL_LABEL[id]}
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className={cn("text-[13px]", m.accuracy === best.acc ? "font-semibold text-ink" : "text-ink-2")}>
                  <RollingNumber value={m.accuracy * 100} decimals={1} suffix="%" />
                </span>
                <span className="num text-[11px] text-ink-3">
                  {Math.round(m.ci[0] * 100)} to {Math.round(m.ci[1] * 100)}
                </span>
              </span>
              <span className="text-right">
                <Stat value={m.logLoss.toFixed(3)} best={m.logLoss === best.ll} />
              </span>
              <span className="text-right">
                <Stat value={m.brier.toFixed(3)} best={m.brier === best.brier} />
              </span>
              <span className="text-right">
                <Stat value={m.ece.toFixed(3)} best={m.ece === best.ece} />
              </span>
              <span className="text-right">
                <Stat value={`${s.right % 1 ? s.right.toFixed(1) : s.right}/${s.n}`} />
              </span>
            </button>
          ))}
          <div className={cn("grid items-center border-t border-[var(--grid-line)] px-3 py-2 text-ink-3", cols)}>
            <span className="pl-3.5 text-[12.5px]">Coin flip</span>
            <span className="num text-[12.5px]">{pct1(coin.accuracy)}</span>
            <span className="num text-right text-[12.5px]">{coin.logLoss.toFixed(3)}</span>
            <span className="num text-right text-[12.5px]">{coin.brier.toFixed(3)}</span>
            <span className="num text-right text-[12.5px]">{coin.ece.toFixed(3)}</span>
            <span className="num text-right text-[12.5px]">
              {valid.series / 2}/{valid.series}
            </span>
          </div>
        </div>
      </ScrollFade>

      <div className="flex flex-col gap-2 border-t border-line px-3 py-2.5 text-[12px] leading-relaxed text-pretty text-ink-2">
        <p>
          <span className="font-medium text-ink">Re-measured: </span>
          <span className="num">
            {pct1(accs[0])} to {pct1(accs[accs.length - 1])}
          </span>{" "}
          on Toronto. The original&apos;s README claims 55 to 64%; its own Masters run logged 100% (Brier 0.011) with in-match ACS and K/D among its
          features, a leakage tell. With {valid.maps} maps from {valid.series} series, intervals are wide: treat a few points either way as noise.
        </p>
        <p className="flex items-start gap-1.5 text-ink-2">
          <Warning size={14} weight="bold" className="mt-[2px] shrink-0 text-orange" />
          <span>
            <span className="font-medium text-orange">Side bias in the file: </span>
            always picking the team listed first would score <span className="num">{pct1(fit.baselines.firstListed)}</span>. Every model here gives the same odds with the
            teams swapped, so none of that is in these numbers.
          </span>
        </p>
      </div>
    </div>
  );
}
