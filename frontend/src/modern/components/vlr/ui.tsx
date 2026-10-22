"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { cn } from "@/modern/lib/cn";
import type { Side } from "@/modern/lib/vlr/types";

/* Small shared pieces for the VLR UI. */

/* ── numbers ─────────────────────────────────────────────── */

/** whole percent; the ends read ">99%" / "<1%" so a tiny sample never looks certain */
export function pct(p: number): string {
  if (p > 0.995) return ">99%";
  if (p < 0.005) return "<1%";
  return `${Math.round(p * 100)}%`;
}

/** an observed rate (k of n): exact, so 11 of 11 reads 100% */
export function rate(x: number): string {
  return `${Math.round(x * 100)}%`;
}

/** whole percent as a number, clamped to 1..99 for odometers */
export function pctNum(p: number): number {
  return Math.min(99, Math.max(1, Math.round(p * 100)));
}

/** percentage points with a sign: "+6.1%" / "−2.0%" */
export function signedPts(v: number, digits = 1): string {
  const x = Math.abs(v * 100);
  const s = x.toFixed(digits);
  if (Number(s) === 0) return `${(0).toFixed(digits)}%`;
  return `${v >= 0 ? "+" : "−"}${s}%`;
}

export function fixed(v: number, digits = 3): string {
  return v.toFixed(digits);
}

/** rounded number for styles and SVG, so server and browser math agree to the last digit (no hydration mismatch) */
export const r2 = (v: number) => Math.round(v * 100) / 100;

/** a 0..1 share as a CSS percentage, rounded */
export const pc = (share: number) => `${r2(share * 100)}%`;

/* ── confidence ──────────────────────────────────────────── */

export type Confidence = { level: 0 | 1 | 2 | 3; label: string; short: string };

/** the original's bands: High over 70%, Medium 60 to 70%, Low under 60% */
export function confidenceOf(p: number): Confidence {
  const c = Math.max(p, 1 - p);
  if (c === 0.5) return { level: 0, label: "No call", short: "None" };
  if (c >= 0.7) return { level: 3, label: "High confidence", short: "High" };
  if (c >= 0.6) return { level: 2, label: "Medium confidence", short: "Medium" };
  return { level: 1, label: "Low confidence", short: "Low" };
}

export function Meter({ level, className }: { level: 0 | 1 | 2 | 3; className?: string }) {
  return (
    <span className={cn("flex items-end gap-0.5", className)} aria-hidden>
      {[0, 1, 2].map((bar) => (
        <span
          key={bar}
          className="w-1 rounded-full transition-colors duration-300"
          style={{ height: 10, background: bar < level ? "var(--ink)" : "var(--line-strong)" }}
        />
      ))}
    </span>
  );
}

/* ── teams ───────────────────────────────────────────────── */

export const sideColor = (side: Side) => (side === "a" ? "var(--team-a)" : "var(--team-b)");

/** a team's lettered mark, filled with its side's color */
export function TeamMark({
  tag,
  side,
  size = "sm",
  className,
  neutral,
}: {
  tag: string;
  side: Side;
  size?: "xs" | "sm" | "md";
  className?: string;
  /** ink instead of the side color, where "listed first" means nothing */
  neutral?: boolean;
}) {
  const box = size === "md" ? "h-6 min-w-6 px-1 text-[10.5px] rounded-[6px]" : size === "sm" ? "h-[18px] min-w-[18px] px-[3px] text-[9px] rounded-[5px]" : "h-[14px] min-w-[14px] px-[2px] text-[8px] rounded-[4px]";
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center font-semibold tracking-[0.02em]", neutral ? "bg-ink text-canvas" : "text-white", box, className)}
      style={neutral ? undefined : { background: sideColor(side) }}
      aria-hidden
    >
      {tag}
    </span>
  );
}

export function SideDot({ side, className }: { side: Side; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: sideColor(side) }} aria-hidden />;
}

/* ── layout ──────────────────────────────────────────────── */

export function SectionLabel({ children, count, right, id }: { children: ReactNode; count?: number | string; right?: ReactNode; id?: string }) {
  return (
    <div className="mb-2 flex min-h-7 items-center justify-between gap-3">
      <h2 id={id} className="flex items-baseline gap-1.5 text-[13px] font-semibold text-ink">
        {children}
        {count !== undefined && <span className="num text-[13px] font-normal text-ink-3">{count}</span>}
      </h2>
      {right}
    </div>
  );
}

/** a gray track with a raised thumb, as in the Fine-tune Card */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = "sm",
}: {
  options: readonly { key: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
  size?: "xs" | "sm";
}) {
  const i = Math.max(0, options.findIndex((o) => o.key === value));
  return (
    <div role="radiogroup" aria-label={label} className={cn("relative grid rounded-control bg-field p-0.5", className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      <span
        aria-hidden
        className="absolute inset-y-0.5 rounded-[6px] bg-surface shadow-btn transition-transform duration-300"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          left: 2,
          transform: `translateX(${i * 100}%)`,
          transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      />
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={o.key === value}
          title={o.title}
          onClick={() => onChange(o.key)}
          className={cn(
            "relative z-10 flex items-center justify-center gap-1 px-2 font-medium whitespace-nowrap transition-colors duration-200",
            size === "xs" ? "h-5.5 text-[11.5px]" : "h-6 text-[12px]",
            o.key === value ? "text-ink" : "text-ink-3 hover:text-ink-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── hooks ───────────────────────────────────────────────── */

/** closes a popover on outside pointer-down or Escape */
export function useDismiss(open: boolean, onClose: () => void, ref: RefObject<HTMLElement | null>) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref]);
}

/**
 * An element's content-box width, kept current with a ResizeObserver.
 * `measured` stays false until the first observation, so charts can skip
 * drawing at the fallback width (no slide after hydration).
 */
export function useWidth<T extends HTMLElement>(fallback: number): [RefObject<T | null>, number, boolean] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width ?? fallback, width !== null];
}

function subscribeTheme(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => mo.disconnect();
}

/** true when the lab is in dark mode (the .dark class on <html>) */
export function useIsDark(): boolean {
  return useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
}

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useReducedMotionPref(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/** hex team colors for canvas charts, which can't read CSS variables */
export function teamHex(dark: boolean): Record<Side, string> {
  return dark ? { a: "#f0555b", b: "#3987e5" } : { a: "#e63745", b: "#2a78d6" };
}

/* ── tiny icons kept in-line so they inherit currentColor ── */

export function CheckGlyph({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export function CrossGlyph({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

/** "Hit" in green with a check; "Miss" in ink with a cross; never red */
export function Verdict({ score, className, compact }: { score: number; className?: string; compact?: boolean }) {
  if (score === 0.5)
    return (
      <span className={cn("inline-flex items-center gap-1 text-[12px] font-medium text-ink-3", className)}>
        <span className="inline-block h-[1.5px] w-2.5 rounded-full bg-current" aria-hidden />
        {compact ? "Even" : "No call"}
      </span>
    );
  return score === 1 ? (
    <span className={cn("inline-flex items-center gap-1 text-[12px] font-medium text-green", className)}>
      <CheckGlyph size={11} />
      Hit
    </span>
  ) : (
    <span className={cn("inline-flex items-center gap-1 text-[12px] font-medium text-ink-2", className)}>
      <CrossGlyph size={10} className="text-ink-3" />
      Miss
    </span>
  );
}
