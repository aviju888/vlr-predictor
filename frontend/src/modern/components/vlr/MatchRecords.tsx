"use client";

import { useMemo, useRef, useState } from "react";
import { CaretDown, Check, Warning } from "@phosphor-icons/react";
import GlideMenu from "@/modern/components/atoms/GlideMenu";
import { ScrollFade } from "@/modern/components/craft/ScrollFade";
import { cn } from "@/modern/lib/cn";
import { teamTag } from "@/modern/lib/vlr/dataset";
import { MODEL_LABEL, type Calib, type Fit, type ModelId } from "@/modern/lib/vlr/pipeline";
import type { Dataset, TeamMeta } from "@/modern/lib/vlr/types";
import { recordRows, type RecordRow } from "@/modern/lib/vlr/views";
import { pct, TeamMark, useDismiss, Verdict } from "./ui";

/* ─────────────────────────────────────────────────────────
 * MATCH RECORDS — Filter Table over every map in the data:
 * what the model said before the map, what happened, hit or
 * miss. Chips filter by result; menus by event and team.
 * Toronto rows are held out. Bangkok rows are out-of-sample
 * too (Elo walks forward, Logistic leaves the series out).
 * ───────────────────────────────────────────────────────── */

type Filter = "all" | "hit" | "miss";
export type EventFilter = "all" | "Bangkok" | "Toronto";

const FILTERS: { key: Filter; label: string; dot?: string }[] = [
  { key: "all", label: "All" },
  { key: "hit", label: "Hits", dot: "var(--green)" },
  { key: "miss", label: "Misses", dot: "var(--ink-3)" },
];

const COLS = "grid-cols-[56px_minmax(0,1fr)_68px] sm:grid-cols-[64px_minmax(0,1.5fr)_70px_minmax(0,1fr)_76px]";

function Menu<T extends string>({ value, options, onChange, label }: { value: T; options: { key: T; label: string; count?: number }[]; onChange: (v: T) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  const cur = options.find((o) => o.key === value);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 items-center gap-1.5 rounded-control bg-surface pr-1.5 pl-2.5 text-[12px] font-medium text-ink-2 shadow-btn transition-colors duration-100 hover:bg-hover hover:text-ink"
      >
        {cur?.label}
        <CaretDown size={11} weight="bold" className="text-ink-3" />
      </button>
      {open && (
        <div
          className="absolute top-full right-0 z-30 mt-1.5 w-52 rounded-[10px] bg-surface p-1 shadow-raised"
          style={{ animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "top right" }}
          role="listbox"
        >
          <ScrollFade className="max-h-[260px]">
            <GlideMenu className="flex flex-col gap-px" highlightClassName="inset-x-0 rounded-[6px] bg-hover">
              {options.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  role="option"
                  aria-selected={o.key === value}
                  data-menu-row
                  onClick={() => {
                    onChange(o.key);
                    setOpen(false);
                  }}
                  className="relative z-10 flex h-7.5 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[12.5px] text-ink"
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.count !== undefined && <span className="num text-[11px] text-ink-3">{o.count}</span>}
                  <Check size={12} weight="bold" className={cn("shrink-0", o.key !== value && "invisible")} />
                </button>
              ))}
            </GlideMenu>
          </ScrollFade>
        </div>
      )}
    </div>
  );
}

function Row({ r }: { r: RecordRow }) {
  const pickName = r.pick === "a" ? r.a : r.pick === "b" ? r.b : null;
  const won = r.winner === "a" ? r.a : r.b;
  return (
    <div className={cn("grid border-b border-[var(--grid-line)] text-[12.5px] transition-colors duration-100 hover:bg-hover", COLS)}>
      <span className="num flex items-center border-r border-[var(--grid-line)] px-2 py-2 whitespace-nowrap text-ink-2 sm:px-2.5">{r.dateLabel}</span>
      <span className="flex min-w-0 items-center gap-1.5 border-r border-[var(--grid-line)] px-2.5 py-2">
        <span className="truncate text-ink">
          {teamTag(r.a)} <span className="text-ink-3">vs</span> {teamTag(r.b)}
        </span>
        <span className="truncate text-ink-3 sm:hidden">· {r.map}</span>
        {r.conflict && (
          <span title="This series' map winners disagree with its recorded score" className="shrink-0 text-orange">
            <Warning size={11} weight="bold" />
          </span>
        )}
      </span>
      <span className="hidden items-center border-r border-[var(--grid-line)] px-2.5 py-2 text-ink-2 sm:flex">{r.map}</span>
      <span className="hidden min-w-0 items-center gap-1.5 border-r border-[var(--grid-line)] px-2.5 py-2 sm:flex">
        {pickName && r.pick ? (
          <>
            <TeamMark tag={teamTag(pickName)} side={r.pick} size="xs" neutral />
            <span className="num text-ink-2">{pct(Math.max(r.p, 1 - r.p))}</span>
            <span className="truncate text-[11.5px] text-ink-3">· {teamTag(won)} won</span>
          </>
        ) : (
          <span className="text-ink-3">50/50</span>
        )}
      </span>
      <span className="flex items-center px-2.5 py-2">
        <Verdict score={r.score} compact />
      </span>
    </div>
  );
}

export function MatchRecords({
  ds,
  fit,
  model,
  calib,
  team,
  onTeam,
  event,
  onEvent,
}: {
  ds: Dataset;
  fit: Fit;
  model: ModelId;
  calib: Calib;
  team: string;
  onTeam: (t: string) => void;
  event: EventFilter;
  onEvent: (e: EventFilter) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const rows = useMemo(() => recordRows(ds, fit, model, calib), [ds, fit, model, calib]);
  const scoped = rows.filter((r) => (event === "all" || r.event === event) && (team === "all" || r.a === team || r.b === team));
  const shown = scoped.filter((r) => filter === "all" || (filter === "hit" ? r.score === 1 : r.score === 0));
  const count = (f: Filter) => (f === "all" ? scoped.length : scoped.filter((r) => (f === "hit" ? r.score === 1 : r.score === 0)).length);
  const hits = scoped.reduce((s, r) => s + r.score, 0);
  const teams: TeamMeta[] = ds.teams;

  return (
    <div className="w-full">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 py-1" style={{ scrollbarWidth: "none" }}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "flex h-6.5 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition-[background-color,box-shadow,color] duration-200",
                  active ? "bg-surface text-ink shadow-btn" : "text-ink-2 hover:bg-hover",
                )}
              >
                {f.dot && <span className="size-1.5 rounded-full" style={{ background: f.dot }} />}
                {f.label}
                <span className={cn("num rounded-[4px] px-1 text-[10.5px]", active ? "bg-field text-ink-2" : "text-ink-3")}>{count(f.key)}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          <Menu
            label="Event"
            value={event}
            onChange={onEvent}
            options={[
              { key: "Toronto", label: "Toronto (held out)", count: rows.filter((r) => r.event === "Toronto").length },
              { key: "Bangkok", label: "Bangkok (train)", count: rows.filter((r) => r.event === "Bangkok").length },
              { key: "all", label: "Both events", count: rows.length },
            ]}
          />
          <Menu
            label="Team"
            value={team}
            onChange={onTeam}
            options={[{ key: "all", label: "All teams", count: rows.length }, ...teams.map((t) => ({ key: t.name, label: t.name, count: t.maps }))]}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-card bg-surface shadow-card" role="region" aria-label="Match records">
        <div className={cn("grid border-b border-[var(--grid-line)] text-[12px] font-medium text-ink-2", COLS)}>
          <span className="border-r border-[var(--grid-line)] px-2.5 py-2">Date</span>
          <span className="border-r border-[var(--grid-line)] px-2.5 py-2">Match</span>
          <span className="hidden border-r border-[var(--grid-line)] px-2.5 py-2 sm:block">Map</span>
          <span className="hidden border-r border-[var(--grid-line)] px-2.5 py-2 sm:block">{MODEL_LABEL[model]} said</span>
          <span className="px-2.5 py-2">Result</span>
        </div>
        <ScrollFade className="max-h-[420px]" style={{ scrollbarWidth: "thin" }}>
          {shown.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12.5px] text-ink-3">No maps match these filters.</div>
          ) : (
            shown.map((r) => <Row key={r.id} r={r} />)
          )}
        </ScrollFade>
        <div className="records-footer flex-wrap border-t border-[var(--grid-line)] py-2">
          <span>
            <strong className="num">{hits % 1 ? hits.toFixed(1) : hits}</strong> of <strong className="num">{scoped.length}</strong> right ·{" "}
            {event === "Bangkok" ? "out-of-sample on the training event" : event === "Toronto" ? "held out" : "both events"}
          </span>
          <span className="flex items-center gap-1">
            <Warning size={11} weight="bold" className="text-orange" />
            series score disagrees with its map winners
          </span>
        </div>
      </div>
    </div>
  );
}
