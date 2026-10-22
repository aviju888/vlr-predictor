"use client";

import { useState } from "react";
import { CheckCircle, FileCsv, Info, Warning } from "@phosphor-icons/react";
import { cn } from "@/modern/lib/cn";
import { formatDate } from "@/modern/lib/vlr/dataset";
import type { AuditReport, AuditSeverity, FileAudit } from "@/modern/lib/vlr/types";

/* ─────────────────────────────────────────────────────────
 * DATA NOTES — what's in the original's data folder, which
 * files the models use, and why the rest were left out. Every
 * line is computed from the files at load time.
 * Warnings are orange with an icon; red is only the accent.
 * ───────────────────────────────────────────────────────── */

const ICON: Record<AuditSeverity, { el: typeof CheckCircle; cls: string; word: string }> = {
  ok: { el: CheckCircle, cls: "text-green", word: "Pass" },
  warn: { el: Warning, cls: "text-orange", word: "Watch" },
  info: { el: Info, cls: "text-ink-3", word: "Note" },
};

const STATUS: Record<FileAudit["status"], string> = {
  used: "bg-green-tint text-green",
  redundant: "bg-field text-ink-2",
  excluded: "bg-orange-tint text-orange",
};

function FileRow({ f }: { f: FileAudit }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-[var(--grid-line)] last:border-b-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors duration-100 hover:bg-hover">
        <FileCsv size={14} weight="bold" className="mt-[2px] shrink-0 text-ink-3" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-mono text-[11.5px] text-ink">{f.file}</span>
          </span>
          <span className="num block text-[11.5px] text-ink-3">
            {f.rows} rows · {formatDate(f.from, { year: false })} to {formatDate(f.to)} · {f.reason}
          </span>
        </span>
        <span className={cn("mt-px inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium capitalize", STATUS[f.status])}>{f.status}</span>
      </button>
      <div
        className="grid transition-[grid-template-rows,opacity] duration-300"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" }}
        inert={!open}
      >
        <div className="overflow-hidden">
          <ul className="flex flex-col gap-1 px-3 pb-2.5 pl-[34px] text-[12px] text-ink-2">
            {f.findings.map((x) => (
              <li key={x} className="list-disc text-pretty marker:text-ink-3">
                {x}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}

export function DataAudit({ audit }: { audit: AuditReport }) {
  return (
    <div className="w-full overflow-hidden rounded-card bg-surface shadow-card">
      <div className="primitive-card-bar flex items-center justify-between gap-3 border-b border-line">
        <span className="text-[13px] font-medium text-ink">Data checks</span>
        <span className="num text-[11.5px] text-ink-3">{audit.files.length} files read</span>
      </div>
      <ul className="flex flex-col gap-0.5 px-1.5 py-1.5">
        {audit.checks.map((c) => {
          const I = ICON[c.severity];
          return (
            <li key={c.id} className="flex items-start gap-2 rounded-[6px] px-1.5 py-1.5">
              <I.el size={14} weight="bold" className={cn("mt-[2px] shrink-0", I.cls)} aria-hidden />
              <span className="min-w-0">
                <span className="flex items-baseline gap-1.5">
                  <span className="text-[12.5px] font-medium text-ink">{c.title}</span>
                  <span className={cn("text-[10.5px] font-medium", I.cls)}>{I.word}</span>
                </span>
                <span className="block text-[12px] leading-relaxed text-pretty text-ink-2">{c.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-line">
        <p className="px-3 pt-2.5 pb-1 text-[11.5px] font-medium text-ink-3">Files in the original&apos;s data folder</p>
        <ul>
          {audit.files.map((f) => (
            <FileRow key={f.file} f={f} />
          ))}
        </ul>
      </div>
    </div>
  );
}
