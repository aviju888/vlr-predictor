"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, Trophy, Warning } from "@phosphor-icons/react";
import { Button } from "@/modern/components/atoms/Button";
import GlideMenu from "@/modern/components/atoms/GlideMenu";
import { cn } from "@/modern/lib/cn";
import { playSfx } from "@/modern/lib/sfx";
import { formatDate, teamTag, winnerName } from "@/modern/lib/vlr/dataset";
import { MODEL_LABEL, type Calib, type Fit, type ModelId } from "@/modern/lib/vlr/pipeline";
import type { Dataset, Side } from "@/modern/lib/vlr/types";
import { pickemDeck, probOf, type PickemRound } from "@/modern/lib/vlr/views";
import { CheckGlyph, confidenceOf, CrossGlyph, Meter, pct, TeamMark } from "./ui";

/* ─────────────────────────────────────────────────────────
 * PICK'EM — beat the model on held-out Toronto maps.
 * Approval Card flow: one question at a time, single choice,
 * a rolling step counter, quiet Skip and an accent Next. After
 * you pick, the model's call and the real result land in the
 * card. 1 / 2 to pick, Enter for next.
 *
 * The two teams are shown in alphabetical order: the source
 * file lists the winner first 13 times in 14, so "always take
 * the top one" would otherwise win.
 * ───────────────────────────────────────────────────────── */

type Totals = { games: number; rounds: number; you: number; model: number };
const ZERO: Totals = { games: 0, rounds: 0, you: 0, model: 0 };
const KEY = "vlr-modern:pickem:v1";
const listeners = new Set<() => void>();
let cache: { raw: string | null; val: Totals } | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function snapshot(): Totals {
  const raw = readRaw();
  if (cache && cache.raw === raw) return cache.val;
  let val = ZERO;
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<Totals>) : null;
    if (parsed && typeof parsed.games === "number") val = { ...ZERO, ...parsed };
  } catch {
    val = ZERO;
  }
  cache = { raw, val };
  return val;
}

function saveTotals(t: Totals) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    // private mode or blocked storage: the game still works, it just won't remember
  }
  cache = { raw: JSON.stringify(t), val: t };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

type Option = { side: Side; name: string };

/** alphabetical, so the order says nothing about the winner */
function optionsFor(r: PickemRound): [Option, Option] {
  const xs: Option[] = [
    { side: "a", name: r.m.a },
    { side: "b", name: r.m.b },
  ];
  xs.sort((x, y) => x.name.localeCompare(y.name));
  return [xs[0], xs[1]];
}

function Rolling({ value }: { value: string }) {
  return (
    <span key={value} className="inline-block" style={{ animation: "fade-up 260ms cubic-bezier(0.23,1,0.32,1) both" }}>
      {value}
    </span>
  );
}

export function Pickem({ ds, fit, model, calib }: { ds: Dataset; fit: Fit; model: ModelId; calib: Calib }) {
  const totals = useSyncExternalStore(subscribe, snapshot, () => ZERO);
  const [deck, setDeck] = useState<PickemRound[] | null>(null);
  const [i, setI] = useState(0);
  const [picks, setPicks] = useState<Record<number, Side>>({});
  const [done, setDone] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const round = deck?.[i];
  const picked = picks[i];
  const opts = round ? optionsFor(round) : null;

  const scoreOf = (k: number) => {
    const r = deck![k];
    const p = probOf(fit, r.id, model, calib);
    const modelSide: Side | null = p === 0.5 ? null : p > 0.5 ? "a" : "b";
    return { you: picks[k] === r.m.winner ? 1 : 0, model: modelSide === null ? 0.5 : modelSide === r.m.winner ? 1 : 0, p };
  };
  const answered = deck ? Object.keys(picks).map(Number) : [];
  const youScore = answered.reduce((s, k) => s + scoreOf(k).you, 0);
  const modelScore = answered.reduce((s, k) => s + scoreOf(k).model, 0);

  const start = () => {
    setDeck(pickemDeck(ds, Math.random));
    setI(0);
    setPicks({});
    setDone(false);
    playSfx("open", 0.6);
  };

  const finish = () => {
    if (!deck) return;
    const ks = Object.keys(picks).map(Number);
    const you = ks.reduce((s, k) => s + scoreOf(k).you, 0);
    const mod = ks.reduce((s, k) => s + scoreOf(k).model, 0);
    saveTotals({ games: totals.games + 1, rounds: totals.rounds + ks.length, you: totals.you + you, model: totals.model + mod });
    setDone(true);
    playSfx(you > mod ? "success" : you < mod ? "close" : "toggle", 0.8);
  };

  const pick = (side: Side) => {
    if (!round || picked) return;
    setPicks((cur) => ({ ...cur, [i]: side }));
    const won = side === round.m.winner;
    playSfx(won ? "tap" : "tick", 0.7);
  };

  const next = () => {
    if (!deck) return;
    if (i >= deck.length - 1) finish();
    else setI((v) => v + 1);
  };

  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    if (!deck || done) return;
    const el = document.activeElement as HTMLElement | null;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return; // only while the card is on screen
    if ((e.key === "1" || e.key === "2") && opts && !picked) {
      e.preventDefault();
      pick(opts[e.key === "1" ? 0 : 1].side);
    } else if (e.key === "Enter" && picked) {
      e.preventDefault();
      next();
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const last = deck ? i === deck.length - 1 : false;

  return (
    <div ref={cardRef} className="w-full">
      <div className="relative overflow-hidden rounded-card bg-surface shadow-card">
        {!deck || done ? (
          <div className="primitive-card-pad flex min-h-[248px] flex-col">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-[8px] bg-accent-tint text-accent-ink">
                <Trophy size={15} weight="bold" />
              </span>
              <span className="text-[14px] font-medium text-ink">{done ? "Final score" : "Beat the model"}</span>
            </div>
            {done && deck ? (
              <div className="mt-4 flex-1" style={{ animation: "pop-in 260ms cubic-bezier(0.23,1,0.32,1) both" }}>
                <div className="flex items-end gap-6">
                  {(
                    [
                      ["You", youScore],
                      [MODEL_LABEL[model], modelScore],
                    ] as const
                  ).map(([label, v]) => (
                    <div key={label}>
                      <p className="text-[12px] text-ink-3">{label}</p>
                      <p className="num text-[34px] leading-none font-semibold tracking-[-0.03em] text-ink">
                        {v % 1 ? v.toFixed(1) : v}
                        <span className="text-[16px] font-medium text-ink-3">/{answered.length}</span>
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[13px] text-pretty text-ink-2">
                  {youScore > modelScore ? "You beat the model." : youScore < modelScore ? "The model takes this one." : "Dead even."}{" "}
                  {totals.games > 1 && (
                    <span className="num text-ink-3">
                      All time: you {totals.you} · model {totals.model % 1 ? totals.model.toFixed(1) : totals.model} over {totals.rounds} maps.
                    </span>
                  )}
                </p>
                <ul className="mt-3 flex flex-col gap-1">
                  {deck.map((r, k) => {
                    const s = scoreOf(k);
                    return (
                      <li key={r.id} className="num flex items-center justify-between gap-2 text-[12px] text-ink-2">
                        <span className="min-w-0 truncate">
                          {teamTag(r.m.a)} vs {teamTag(r.m.b)} · {r.m.map} · {teamTag(winnerName(r.m))} won
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className={cn("inline-flex items-center gap-0.5", s.you ? "text-green" : "text-ink-3")}>
                            {s.you ? <CheckGlyph size={10} /> : <CrossGlyph size={9} />} you
                          </span>
                          <span className={cn("inline-flex items-center gap-0.5", s.model === 1 ? "text-green" : "text-ink-3")}>
                            {s.model === 1 ? <CheckGlyph size={10} /> : <CrossGlyph size={9} />} model
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <div className="mt-3 flex-1">
                <p className="text-[13px] leading-relaxed text-pretty text-ink-2">
                  Five Toronto maps the models never trained on. You see what the model saw: each team&apos;s record before that day. Then the model&apos;s call, then
                  what happened.
                </p>
                <ul className="mt-3 flex flex-col gap-1.5 text-[12.5px] text-ink-3">
                  <li className="flex items-center gap-2">
                    <kbd className="num inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] bg-field px-1 text-[11px] font-medium text-ink-2 shadow-hairline">1</kbd>
                    <kbd className="num inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] bg-field px-1 text-[11px] font-medium text-ink-2 shadow-hairline">2</kbd>
                    pick a team
                  </li>
                  <li className="flex items-center gap-2">
                    <kbd className="inline-flex h-5 items-center justify-center rounded-[5px] bg-field px-1.5 text-[11px] font-medium text-ink-2 shadow-hairline">Enter</kbd>
                    next map
                  </li>
                </ul>
                {totals.games > 0 && (
                  <p className="num mt-3 text-[12px] text-ink-3">
                    So far: you {totals.you} · model {totals.model % 1 ? totals.model.toFixed(1) : totals.model} over {totals.rounds} maps
                  </p>
                )}
              </div>
            )}
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-[11.5px] text-ink-3">Playing against {MODEL_LABEL[model]}</span>
              <Button variant="accent" size="sm" onClick={start}>
                {done ? "Play again" : "Start"}
                <ArrowRight size={12} weight="bold" />
              </Button>
            </div>
          </div>
        ) : (
          round &&
          opts && (
            <>
              <div className="primitive-card-pad min-h-[270px]">
                <div key={round.id} style={{ animation: "fade-up 320ms cubic-bezier(0.23,1,0.32,1) both" }}>
                  <p className="num text-[11.5px] text-ink-3">
                    {round.m.eventShort} · {formatDate(round.m.date, { year: false })} · map {round.m.order}
                  </p>
                  <p className="mt-0.5 text-[14px] font-medium text-ink">Who takes {round.m.map}?</p>
                  <GlideMenu className="mt-2.5 flex flex-col gap-1" highlightClassName="inset-x-0 rounded-control bg-hover">
                    {opts.map((o, k) => {
                      const c = round.context[o.side];
                      const on = picked === o.side;
                      const isWinner = picked && round.m.winner === o.side;
                      return (
                        <button
                          key={o.name}
                          type="button"
                          data-menu-row
                          aria-pressed={on}
                          disabled={Boolean(picked)}
                          onClick={() => pick(o.side)}
                          className="relative z-10 flex items-center gap-2.5 rounded-control py-1.5 pr-2 pl-1 text-left transition-colors duration-100 disabled:cursor-default"
                        >
                          <span
                            className={cn(
                              "flex size-4 shrink-0 items-center justify-center rounded-full transition-colors duration-200",
                              on ? "bg-ink text-canvas" : "shadow-[inset_0_0_0_1.5px_var(--line-strong)]",
                            )}
                          >
                            <span className="size-1.5 rounded-full bg-canvas transition-transform duration-200" style={{ transform: on ? "scale(1)" : "scale(0)" }} />
                          </span>
                          <TeamMark tag={teamTag(o.name)} side={k === 0 ? "a" : "b"} />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className={cn("truncate text-[13px] leading-tight", on ? "text-ink" : "text-ink-2")}>{o.name}</span>
                            <span className="num truncate text-[11.5px] text-ink-3">
                              {c.maps ? `${c.wins}-${c.maps - c.wins} before this match` : "no maps in the data yet"}
                              {c.streak > 1 ? ` · won ${c.streak} straight` : ""}
                              {c.maps ? ` · ${round.m.map} ${c.onMap}` : ""}
                            </span>
                          </span>
                          {isWinner ? (
                            <span className="flex items-center gap-1 text-[11.5px] font-medium text-green" style={{ animation: "pop-in 220ms cubic-bezier(0.23,1,0.32,1) 420ms both" }}>
                              <CheckGlyph size={11} />
                              took it
                            </span>
                          ) : (
                            <kbd className="num inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] bg-field px-1 text-[11px] font-medium text-ink-3">{k + 1}</kbd>
                          )}
                        </button>
                      );
                    })}
                  </GlideMenu>

                  {picked &&
                    (() => {
                      const s = scoreOf(i);
                      const modelSide: Side | null = s.p === 0.5 ? null : s.p > 0.5 ? "a" : "b";
                      const mt = modelSide ? (modelSide === "a" ? round.m.a : round.m.b) : null;
                      const conf = confidenceOf(s.p);
                      return (
                        <div className="mt-3 flex flex-col gap-1.5 rounded-control bg-inset px-2.5 py-2 text-[12.5px] shadow-hairline" style={{ animation: "fade-up 300ms cubic-bezier(0.23,1,0.32,1) 120ms both" }}>
                          <span className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 text-ink-2">
                              <Meter level={conf.level} />
                              {MODEL_LABEL[model]} said {mt ? `${mt} ${pct(Math.max(s.p, 1 - s.p))}` : "no call"}
                            </span>
                            <span className={cn("flex items-center gap-1 font-medium", s.model === 1 ? "text-green" : "text-ink-3")}>
                              {s.model === 1 ? <CheckGlyph size={11} /> : <CrossGlyph size={10} />}
                              model
                            </span>
                          </span>
                          <span className="flex items-center justify-between gap-2" style={{ animation: "fade-in 240ms ease-out 420ms both" }}>
                            <span className="text-ink-2">
                              {winnerName(round.m)} took {round.m.map}
                              {round.m.conflict && (
                                <span className="mt-0.5 flex items-start gap-1 text-[11.5px] text-orange">
                                  <Warning size={11} weight="bold" className="mt-[2px] shrink-0" />
                                  The file scores this series {round.m.score} but gives every map to {winnerName(round.m)}, so this map may have gone the other way.
                                </span>
                              )}
                            </span>
                            <span className={cn("flex items-center gap-1 font-medium", s.you ? "text-green" : "text-ink-3")}>
                              {s.you ? <CheckGlyph size={11} /> : <CrossGlyph size={10} />}
                              you
                            </span>
                          </span>
                        </div>
                      );
                    })()}
                </div>
              </div>
              <div className="primitive-card-footer flex items-center justify-between gap-3 border-t border-line">
                <span className="num flex items-center gap-3 text-[12px] font-medium text-ink-3">
                  <span className="text-ink-2">
                    <Rolling value={`${i + 1} / ${deck.length}`} />
                  </span>
                  <span>
                    You <span className="text-ink">{youScore}</span> · Model <span className="text-ink">{modelScore % 1 ? modelScore.toFixed(1) : modelScore}</span>
                  </span>
                </span>
                <span className="-mr-0.5 flex items-center gap-1.5">
                  {!picked && (
                    <Button variant="ghost" size="sm" onClick={() => (last ? finish() : setI((v) => v + 1))}>
                      Skip
                    </Button>
                  )}
                  <Button variant="accent" size="sm" disabled={!picked} onClick={next}>
                    {last ? "Finish" : "Next"}
                    <kbd className="ml-0.5 text-[10.5px] opacity-80">⏎</kbd>
                  </Button>
                </span>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}
