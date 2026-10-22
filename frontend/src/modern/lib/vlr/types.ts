/* ─────────────────────────────────────────────────────────
 * VLR types. One row = one map. Everything a model may read
 * about a match is here; in-match stats (ACS, K/D) are not,
 * on purpose: they are recorded after the map is played.
 * ───────────────────────────────────────────────────────── */

export type Side = "a" | "b";
export type Split = "train" | "valid";

export type Match = {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** whole days since 1970-01-01 (UTC), for recency math */
  day: number;
  event: string;
  /** "Bangkok" | "Toronto" */
  eventShort: string;
  split: Split;
  /** team listed first in the source file */
  a: string;
  b: string;
  map: string;
  winner: Side;
  /** date + both teams */
  series: string;
  /** series score exactly as the file records it, e.g. "2-1" */
  score: string;
  /** map number inside the series (1-based) */
  order: number;
  /** the file's map winner disagrees with its own series score */
  conflict: boolean;
};

export type SeriesInfo = {
  id: string;
  date: string;
  day: number;
  event: string;
  eventShort: string;
  split: Split;
  a: string;
  b: string;
  maps: string[];
  matchIds: string[];
  /** who won the series by the recorded score */
  winner: Side;
  score: string;
  /** map winners add up to the recorded score */
  consistent: boolean;
};

export type TeamMeta = {
  name: string;
  tag: string;
  region: string | null;
  maps: number;
  wins: number;
  series: number;
  seriesWins: number;
  events: string[];
};

export type EventInfo = {
  name: string;
  short: string;
  split: Split;
  from: string;
  to: string;
  maps: number;
  series: number;
  teams: number;
};

export type Dataset = {
  matches: Match[];
  series: SeriesInfo[];
  teams: TeamMeta[];
  maps: string[];
  events: EventInfo[];
  from: string;
  to: string;
};

export type AuditSeverity = "ok" | "warn" | "info";

export type AuditCheck = {
  id: string;
  severity: AuditSeverity;
  title: string;
  detail: string;
};

export type FileAudit = {
  file: string;
  rows: number;
  from: string;
  to: string;
  teams: number;
  series: number;
  status: "used" | "excluded" | "redundant";
  reason: string;
  findings: string[];
};

export type AuditReport = {
  files: FileAudit[];
  checks: AuditCheck[];
};

export type VlrData = {
  dataset: Dataset;
  audit: AuditReport;
};
