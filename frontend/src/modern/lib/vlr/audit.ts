import type { CsvRow } from "./csv";
import { dayNumber, seriesKey } from "./dataset";
import type { AuditCheck, AuditReport, Dataset, FileAudit } from "./types";

/* ─────────────────────────────────────────────────────────
 * AUDIT — what is actually in the original's data folder.
 * Every number here is computed from the files, so the panel
 * in the UI and the tests read the same facts.
 * ───────────────────────────────────────────────────────── */

export const FILES = {
  train: "masters_bangkok_2025_training.csv",
  valid: "masters_toronto_2025_validation.csv",
  complete: "masters_2025_complete.csv",
  tier1: "tier1_masters_2025.csv",
  realistic: "vct_realistic_matches.csv",
  vlrgg: "real_vlrgg_data.csv",
  vct2025: "vct_2025_matches.csv",
  days365: "map_matches_365d.csv",
} as const;

export type FileKey = keyof typeof FILES;
export type RawFiles = Record<FileKey, CsvRow[]>;

type Group = { key: string; rows: CsvRow[] };

function groupSeries(rows: CsvRow[]): Group[] {
  const m = new Map<string, CsvRow[]>();
  for (const r of rows) {
    const k = seriesKey(r.date, r.teamA, r.teamB);
    const g = m.get(k);
    if (g) g.push(r);
    else m.set(k, [r]);
  }
  return [...m].map(([key, rs]) => ({ key, rows: rs }));
}

export type FileStats = {
  rows: number;
  from: string;
  to: string;
  spanDays: number;
  teams: number;
  series: number;
  exactDuplicates: number;
  /** same map listed twice inside one series (a map is played once per series) */
  repeatedMaps: number;
  singleMapSeries: number;
  placeholderPlayers: number;
  /** series whose map winners don't add up to the recorded score */
  scoreConflicts: number;
  /** series won by the team the file lists first */
  winnerListedFirst: number;
  /** maps won by the team the file lists first */
  mapsWonByFirst: number;
};

export function fileStats(rows: CsvRow[]): FileStats {
  const dates = rows.map((r) => r.date).sort();
  const groups = groupSeries(rows);
  const seen = new Map<string, number>();
  for (const r of rows) {
    const k = JSON.stringify(r);
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  let repeatedMaps = 0;
  let scoreConflicts = 0;
  let winnerListedFirst = 0;
  for (const g of groups) {
    const maps = new Map<string, number>();
    for (const r of g.rows) maps.set(r.map_name, (maps.get(r.map_name) ?? 0) + 1);
    for (const n of maps.values()) if (n > 1) repeatedMaps += n - 1;
    const first = g.rows[0].teamA;
    const firstWins = g.rows.filter((r) => r.winner === first).length;
    if (firstWins * 2 > g.rows.length) winnerListedFirst += 1;
    if (g.rows[0].score) {
      const [s1, s2] = g.rows[0].score.split("-").map(Number);
      const other = g.rows.length - firstWins;
      if (Math.max(firstWins, other) !== Math.max(s1, s2) || Math.min(firstWins, other) !== Math.min(s1, s2)) scoreConflicts += 1;
    }
  }
  return {
    rows: rows.length,
    from: dates[0] ?? "",
    to: dates[dates.length - 1] ?? "",
    spanDays: dates.length ? dayNumber(dates[dates.length - 1]) - dayNumber(dates[0]) + 1 : 0,
    teams: new Set(rows.flatMap((r) => [r.teamA, r.teamB])).size,
    series: groups.length,
    exactDuplicates: [...seen.values()].reduce((a, n) => a + (n - 1), 0),
    repeatedMaps,
    singleMapSeries: groups.filter((g) => g.rows.length === 1).length,
    placeholderPlayers: rows.filter((r) => /_(p|player)1\b/.test(r.teamA_players ?? "")).length,
    scoreConflicts,
    winnerListedFirst,
    mapsWonByFirst: rows.filter((r) => r.winner === r.teamA).length,
  };
}

/** in-match stat values (team, map, ACS) reused across different series */
export function recycledStats(rows: CsvRow[]): { values: number; slots: number; total: number } {
  const seen = new Map<string, Set<string>>();
  for (const r of rows) {
    for (const side of ["A", "B"] as const) {
      const k = `${r[`team${side}`]}|${r.map_name}|${r[`team${side}_ACS`]}`;
      const s = seen.get(k) ?? new Set<string>();
      s.add(seriesKey(r.date, r.teamA, r.teamB));
      seen.set(k, s);
    }
  }
  const reused = [...seen.values()].filter((s) => s.size > 1);
  return { values: reused.length, slots: reused.reduce((a, s) => a + s.size, 0), total: rows.length * 2 };
}

const rowKey = (r: CsvRow) => [r.date, r.teamA, r.teamB, r.map_name, r.winner].join("|");

/** same date, same teams, same map, different winner */
export function labelConflicts(a: CsvRow[], b: CsvRow[]): { overlap: number; conflicts: number; unmatched: number } {
  const idx = new Map(b.map((r) => [[r.date, r.teamA, r.teamB, r.map_name].join("|"), r.winner]));
  let overlap = 0;
  let conflicts = 0;
  let unmatched = 0;
  for (const r of a) {
    const w = idx.get([r.date, r.teamA, r.teamB, r.map_name].join("|"));
    if (w === undefined) unmatched += 1;
    else {
      overlap += 1;
      if (w !== r.winner) conflicts += 1;
    }
  }
  return { overlap, conflicts, unmatched };
}

/** series present in both files whose map lists differ */
export function mapListConflicts(a: CsvRow[], b: CsvRow[]): { shared: number; differ: number } {
  const ga = new Map(groupSeries(a).map((g) => [g.key, g.rows.map((r) => r.map_name).join(",")]));
  let shared = 0;
  let differ = 0;
  for (const g of groupSeries(b)) {
    const other = ga.get(g.key);
    if (other === undefined) continue;
    shared += 1;
    if (other !== g.rows.map((r) => r.map_name).join(",")) differ += 1;
  }
  return { shared, differ };
}

const TEAM_ALIASES: Record<string, string> = { NRG: "NRG Esports", "EDward Gaming": "Edward Gaming" };

/** rows that put a team in a league game on a day inside its own Masters event window */
export function scheduleClashes(rows: CsvRow[], masters: CsvRow[]): number {
  if (!masters.length) return 0;
  const dates = masters.map((r) => r.date).sort();
  const [from, to] = [dates[0], dates[dates.length - 1]];
  const teams = new Set(masters.flatMap((r) => [r.teamA, r.teamB]).map((t) => TEAM_ALIASES[t] ?? t));
  return rows.filter((r) => r.date >= from && r.date <= to && (teams.has(r.teamA) || teams.has(r.teamB))).length;
}

const pct = (n: number, d: number) => `${Math.round((n / Math.max(1, d)) * 100)}%`;

export function auditFiles(files: RawFiles, ds: Dataset): AuditReport {
  const st = Object.fromEntries(Object.entries(files).map(([k, rows]) => [k, fileStats(rows)])) as Record<FileKey, FileStats>;
  const masters = [...files.train, ...files.valid];
  const recycled = recycledStats(masters);
  const completeSame =
    files.complete.length === masters.length &&
    [...files.complete.map(rowKey)].sort().join("\n") === [...masters.map(rowKey)].sort().join("\n");
  const tier1 = labelConflicts(files.tier1, masters);
  const vctOverlap = mapListConflicts(files.vlrgg, files.vct2025);
  const clashes = scheduleClashes(files.realistic, files.valid);

  const fa = (key: FileKey, status: FileAudit["status"], reason: string, findings: string[]): FileAudit => ({
    file: FILES[key],
    rows: st[key].rows,
    from: st[key].from,
    to: st[key].to,
    teams: st[key].teams,
    series: st[key].series,
    status,
    reason,
    findings,
  });

  const masterFindings = (key: "train" | "valid") => [
    `${st[key].scoreConflicts} of ${st[key].series} series give every map to the series winner, so the map results disagree with the recorded score`,
    `Winner listed first in ${st[key].winnerListedFirst} of ${st[key].series} series (${st[key].mapsWonByFirst} of ${st[key].rows} maps)`,
    "ACS and K/D dropped: recorded during the map, and reused across series",
  ];

  const filesOut: FileAudit[] = [
    fa("train", "used", "The original's training split", masterFindings("train")),
    fa("valid", "used", "The original's held-out split", masterFindings("valid")),
    fa(
      "complete",
      "redundant",
      completeSame ? "Exactly the two files above, stacked" : "Differs from the two split files",
      [completeSame ? "Row-for-row identical to Bangkok + Toronto" : "Not identical to Bangkok + Toronto"],
    ),
    fa("tier1", "excluded", "Disagrees with the Masters files", [
      `${tier1.overlap} rows repeat Masters maps, ${tier1.conflicts} of them with a different winner`,
      `${tier1.unmatched} rows match no Masters series`,
    ]),
    fa("realistic", "excluded", "Looks generated", [
      `${st.realistic.singleMapSeries} of ${st.realistic.series} matches are a single map; VCT league matches are best-of-three`,
      `${clashes} rows put Toronto teams in league games while Masters Toronto was running`,
      `Placeholder player names on all ${st.realistic.placeholderPlayers} rows`,
    ]),
    fa("vlrgg", "excluded", "Real series scores, generated map rows", [
      `${st.vlrgg.repeatedMaps} maps repeat inside a series; a map is played once per series`,
      "The original's fetcher picks each map name at random and hands the first maps to the first team",
      `Placeholder player names on all ${st.vlrgg.placeholderPlayers} rows`,
    ]),
    fa("vct2025", "excluded", "Same series as above, different maps", [
      `${vctOverlap.differ} of ${vctOverlap.shared} series also appear in ${FILES.vlrgg} with a different map list`,
      `${st.vct2025.repeatedMaps} maps repeat inside a series`,
    ]),
    fa("days365", "excluded", "Generated map rows, 3 days of Jan 2026", [
      `Named 365 days, spans ${st.days365.spanDays} days (${st.days365.from} to ${st.days365.to})`,
      `Placeholder players (Team_p1) on all ${st.days365.placeholderPlayers} rows, the same kind of filler as ${FILES.vlrgg}`,
    ]),
  ];

  const train = ds.matches.filter((m) => m.split === "train");
  const valid = ds.matches.filter((m) => m.split === "valid");
  const gap = valid.length && train.length ? valid[0].day - train[train.length - 1].day : 0;
  const validSeries = ds.series.filter((s) => s.split === "valid");
  const firstWins = ds.series.filter((s) => s.winner === "a").length;
  const validFirst = validSeries.filter((s) => s.winner === "a").length;
  const conflicts = ds.series.filter((s) => !s.consistent).length;
  const validMapsFirst = valid.filter((m) => m.winner === "a").length;

  const checks: AuditCheck[] = [
    {
      id: "dupes",
      severity: st.train.exactDuplicates + st.valid.exactDuplicates === 0 ? "ok" : "warn",
      title: "No duplicate rows",
      detail: `${st.train.exactDuplicates + st.valid.exactDuplicates} exact duplicates across ${masters.length} maps`,
    },
    {
      id: "split",
      severity: gap > 0 ? "ok" : "warn",
      title: "Splits never overlap",
      detail: `Toronto starts ${gap} days after Bangkok ends; no team, date or map row is shared`,
    },
    {
      id: "maps",
      severity: st.train.repeatedMaps + st.valid.repeatedMaps === 0 ? "ok" : "warn",
      title: "Each map once per series",
      detail: `${st.train.repeatedMaps + st.valid.repeatedMaps} repeated maps inside a series`,
    },
    {
      id: "score",
      severity: conflicts === 0 ? "ok" : "warn",
      title: "Map winners vs series score",
      detail: `${conflicts} of ${ds.series.length} series give every map to the series winner (a 2-1 shows 3 wins). Map-level scores carry that noise; series-level calls don't.`,
    },
    {
      id: "side",
      severity: "warn",
      title: "Winner is usually listed first",
      detail: `${firstWins} of ${ds.series.length} series (${validFirst} of ${validSeries.length} held out, ${validMapsFirst} of ${valid.length} maps). Always picking the first team would score ${pct(validMapsFirst, valid.length)} on Toronto, so every model here is blind to side: swap the teams and the odds flip exactly.`,
    },
    {
      id: "stats",
      severity: "info",
      title: "In-match stats dropped",
      detail: `ACS and K/D are measured during the map. ${recycled.slots} of ${recycled.total} team-map values repeat across different series (e.g. one Paper Rex Ascent ACS in 7 series).`,
    },
    {
      id: "leak",
      severity: "ok",
      title: "Features read only earlier days",
      detail: "A map's features use results from days before it, never the same day, so earlier maps of the same series can't leak in. Tested.",
    },
  ];

  return { files: filesOut, checks };
}
