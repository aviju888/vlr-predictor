"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowsLeftRight, CaretDown, ClockCounterClockwise, MagnifyingGlass, MapTrifold, Stack, X } from "@phosphor-icons/react";
import GlideMenu from "@/modern/components/atoms/GlideMenu";
import { cn } from "@/modern/lib/cn";
import { playSfx } from "@/modern/lib/sfx";
import { formatDate } from "@/modern/lib/vlr/dataset";
import type { Suggestion } from "@/modern/lib/vlr/views";
import type { Side, TeamMeta } from "@/modern/lib/vlr/types";
import { pc, pct, TeamMark, useDismiss } from "./ui";

/* ─────────────────────────────────────────────────────────
 * MATCH PICKER — Prompt Bar as a three-slot composer:
 * team A ⇄ team B on a map (or a best-of-3). The map menu
 * previews this matchup's odds on every map, so the map pool
 * edge is visible before you pick. Real matchups from the data
 * sit underneath; picking one rewinds the models to the day of
 * that match so you see what they said before it was played.
 * ───────────────────────────────────────────────────────── */

export const SERIES = "series";

function TeamMenu({
  teams,
  side,
  current,
  other,
  onPick,
  onClose,
}: {
  teams: TeamMeta[];
  side: Side;
  current: string;
  other: string;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return teams.filter((t) => !s || t.name.toLowerCase().includes(s) || t.tag.toLowerCase().includes(s) || (t.region ?? "").toLowerCase().includes(s));
  }, [teams, q]);
  const choose = (t: TeamMeta | undefined) => {
    if (!t) return;
    onPick(t.name);
    onClose();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(list.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(list[active]);
    }
  };
  return (
    <div
      className="absolute top-full left-0 z-40 mt-1.5 w-[min(300px,calc(100vw-40px))] rounded-[12px] bg-surface p-1 shadow-overlay"
      style={{ animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "top left" }}
    >
      <label className="flex h-8 items-center gap-2 rounded-[8px] bg-field px-2.5 shadow-inset-field">
        <MagnifyingGlass size={13} weight="bold" className="shrink-0 text-ink-3" />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
          placeholder="Team, tag or region"
          aria-label="Search teams"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
        />
      </label>
      <GlideMenu className="mt-1 flex max-h-[296px] flex-col gap-px overflow-y-auto" highlightClassName="inset-x-0 rounded-[8px] bg-hover">
        {list.length === 0 && <p className="px-2.5 py-3 text-[12.5px] text-ink-3">No team matches “{q}”.</p>}
        {list.map((t, i) => {
          const taken = t.name === other;
          return (
            <button
              key={t.name}
              type="button"
              data-menu-row
              onClick={() => choose(t)}
              onPointerMove={() => setActive(i)}
              aria-current={t.name === current}
              className={cn("relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2 text-left", i === active && "bg-hover")}
            >
              <TeamMark tag={t.tag} side={side} />
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{t.name}</span>
              {taken ? (
                <span className="text-[11px] text-ink-3">swaps</span>
              ) : (
                <span className="num shrink-0 text-[11px] text-ink-3">
                  {t.region ? `${t.region} · ` : ""}
                  {t.wins}-{t.maps - t.wins}
                </span>
              )}
            </button>
          );
        })}
      </GlideMenu>
    </div>
  );
}

function TeamSlot({
  side,
  team,
  teams,
  other,
  onPick,
}: {
  side: Side;
  team: TeamMeta;
  teams: TeamMeta[];
  other: string;
  onPick: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          playSfx(open ? "close" : "open", 0.5);
        }}
        className={cn("flex h-11 w-full min-w-0 items-center gap-2 rounded-[8px] pr-2 pl-2 text-left transition-colors duration-100 hover:bg-hover", open && "bg-hover")}
      >
        <TeamMark tag={team.tag} side={side} size="md" />
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[13.5px] font-medium text-ink">{team.name}</span>
          <span className="num truncate text-[11px] text-ink-3">
            {team.region ?? "Team"} · {team.wins}-{team.maps - team.wins} maps
          </span>
        </span>
        <CaretDown size={12} weight="bold" className="shrink-0 text-ink-3" />
      </button>
      {open && <TeamMenu teams={teams} side={side} current={team.name} other={other} onPick={onPick} onClose={() => setOpen(false)} />}
    </div>
  );
}

function MapSlot({
  map,
  maps,
  odds,
  aTag,
  onPick,
  seriesBo,
}: {
  map: string;
  maps: string[];
  odds: Record<string, number>;
  aTag: string;
  onPick: (m: string) => void;
  seriesBo: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  const isSeries = map === SERIES;
  return (
    <div ref={ref} className="relative w-full sm:w-[176px] sm:shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          playSfx(open ? "close" : "open", 0.5);
        }}
        className={cn("flex h-11 w-full items-center gap-2 rounded-[8px] pr-2 pl-2.5 text-left transition-colors duration-100 hover:bg-hover", open && "bg-hover")}
      >
        {isSeries ? <Stack size={16} weight="bold" className="shrink-0 text-ink-2" /> : <MapTrifold size={16} weight="bold" className="shrink-0 text-ink-2" />}
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[13.5px] font-medium text-ink">{isSeries ? `Best of ${seriesBo}` : map}</span>
          <span className="truncate text-[11px] text-ink-3">{isSeries ? "Simulated veto" : "Map"}</span>
        </span>
        <CaretDown size={12} weight="bold" className="shrink-0 text-ink-3" />
      </button>
      {open && (
        <div
          className="absolute top-full right-0 z-40 mt-1.5 w-[min(260px,calc(100vw-40px))] rounded-[12px] bg-surface p-1 shadow-overlay"
          style={{ animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "top right" }}
          role="listbox"
        >
          <p className="px-2 pt-1 pb-1.5 text-[11px] font-medium text-ink-3">{aTag} odds on each map</p>
          <GlideMenu className="flex flex-col gap-px" highlightClassName="inset-x-0 rounded-[8px] bg-hover">
            {[...maps, SERIES].map((m) => {
              const p = odds[m];
              return (
                <button
                  key={m}
                  type="button"
                  role="option"
                  aria-selected={m === map}
                  data-menu-row
                  onClick={() => {
                    onPick(m);
                    setOpen(false);
                    playSfx("tap", 0.6);
                  }}
                  className={cn("relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2 text-left", m === SERIES && "mt-1")}
                >
                  <span className="w-[72px] shrink-0 truncate text-[13px] text-ink">{m === SERIES ? `Best of ${seriesBo}` : m}</span>
                  <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: "var(--team-b)" }} aria-hidden>
                    <span className="absolute inset-y-0 left-0 rounded-l-full border-r-2 border-surface" style={{ width: pc(p ?? 0.5), background: "var(--team-a)" }} />
                  </span>
                  <span className="num w-9 shrink-0 text-right text-[12px] text-ink-2">{p === undefined ? "" : pct(p)}</span>
                </button>
              );
            })}
          </GlideMenu>
        </div>
      )}
    </div>
  );
}

export function MatchPicker({
  teams,
  a,
  b,
  map,
  maps,
  odds,
  onTeams,
  onMap,
  suggestions,
  onSuggestion,
  asOf,
  onClearAsOf,
  seriesBo = 3,
}: {
  seriesBo?: number;
  teams: TeamMeta[];
  a: string;
  b: string;
  map: string;
  maps: string[];
  odds: Record<string, number>;
  onTeams: (a: string, b: string) => void;
  onMap: (m: string) => void;
  suggestions: Suggestion[];
  onSuggestion: (s: Suggestion) => void;
  asOf: Suggestion | null;
  onClearAsOf: () => void;
}) {
  const byName = useMemo(() => new Map(teams.map((t) => [t.name, t])), [teams]);
  const ta = byName.get(a)!;
  const tb = byName.get(b)!;
  const setSide = (side: Side, name: string) => {
    if (side === "a") onTeams(name, name === b ? a : b);
    else onTeams(name === a ? b : a, name);
    playSfx("tap", 0.6);
  };

  return (
    <div className="w-full">
      <div className="flex flex-col gap-1 rounded-[14px] bg-surface p-1.5 shadow-card sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <TeamSlot side="a" team={ta} teams={teams} other={b} onPick={(n) => setSide("a", n)} />
          <button
            type="button"
            aria-label="Swap teams"
            title="Swap teams"
            onClick={() => {
              onTeams(b, a);
              playSfx("toggle", 0.6);
            }}
            className="press flex size-8 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink"
          >
            <ArrowsLeftRight size={14} weight="bold" />
          </button>
          <TeamSlot side="b" team={tb} teams={teams} other={a} onPick={(n) => setSide("b", n)} />
        </div>
        <span className="mx-1 hidden h-7 w-px bg-line sm:block" aria-hidden />
        <MapSlot map={map} maps={maps} odds={odds} aTag={ta.tag} onPick={onMap} seriesBo={seriesBo} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
        {asOf ? (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-accent-tint pr-1 pl-2.5 text-[12px] font-medium text-accent-ink" style={{ animation: "pop-in 220ms cubic-bezier(0.23,1,0.32,1) both" }}>
            <ClockCounterClockwise size={13} weight="bold" />
            Before {asOf.label}{asOf.note === "final" ? ` in the ${asOf.event} final` : ""} · {formatDate(asOf.date)}
            <button
              type="button"
              aria-label="Back to the end of the data"
              onClick={onClearAsOf}
              className="ml-0.5 flex size-5 items-center justify-center rounded-full hover:bg-surface/60"
            >
              <X size={11} weight="bold" />
            </button>
          </span>
        ) : (
          <span className="mr-0.5">Replay a Toronto match:</span>
        )}
        {!asOf &&
          suggestions.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                onSuggestion(s);
                playSfx("tap", 0.6);
              }}
              className="press inline-flex h-7 items-center gap-1.5 rounded-full bg-surface px-2.5 text-[12px] font-medium text-ink-2 shadow-btn hover:bg-hover hover:text-ink"
            >
              <span className="text-ink">{s.label}</span>
              <span className="text-ink-3">{s.note}</span>
            </button>
          ))}
      </div>
    </div>
  );
}
