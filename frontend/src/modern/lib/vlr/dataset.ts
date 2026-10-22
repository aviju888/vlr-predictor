import type { CsvRow } from "./csv";
import type { Dataset, EventInfo, Match, SeriesInfo, Side, Split, TeamMeta } from "./types";

/* ─────────────────────────────────────────────────────────
 * DATASET — the two Masters files the original trained and
 * validated on, turned into one sorted list of maps.
 *
 *   train  Masters Bangkok 2025  (the original's training file)
 *   valid  Masters Toronto 2025  (the original's validation file)
 *
 * Kept: date, teams, map, map winner, series score, map order.
 * Dropped: ACS and K/D. They are measured during the map, so a
 * model that reads them is reading the result.
 * ───────────────────────────────────────────────────────── */

const DAY_MS = 86_400_000;

export function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function dateFromDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function seriesKey(date: string, a: string, b: string): string {
  return `${date}:${[a, b].sort().join(" vs ")}`;
}

/** short, stable, lowercase id piece */
export function slug(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

const TAGS: Record<string, string> = {
  "Paper Rex": "PRX",
  Fnatic: "FNC",
  T1: "T1",
  "G2 Esports": "G2",
  Sentinels: "SEN",
  "Team Liquid": "TL",
  "Team Heretics": "TH",
  GIANTX: "GX",
  "Dragon Ranger Gaming": "DRG",
  NRG: "NRG",
  "EDward Gaming": "EDG",
  DRX: "DRX",
  "Team Vitality": "VIT",
  "Wolves Esports": "WOL",
};

/** names in the Masters files that the original's team mapping spells differently */
const MAPPING_ALIASES: Record<string, string> = {
  "EDward Gaming": "Edward Gaming",
  NRG: "NRG Esports",
  GIANTX: "Giants Gaming",
};

export function teamTag(name: string): string {
  if (TAGS[name]) return TAGS[name];
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 1) return name.slice(0, 3).toUpperCase();
  return words
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

const REGION_LABEL: Record<string, string> = { americas: "Americas", emea: "EMEA", pacific: "Pacific", china: "China" };

export function regionOf(name: string, mapping: Record<string, { region?: string }>): string | null {
  const entry = mapping[name] ?? mapping[MAPPING_ALIASES[name] ?? ""];
  const r = entry?.region;
  return r ? (REGION_LABEL[r] ?? r) : null;
}

export class DataError extends Error {}

/** one Masters CSV → maps for a split */
export function rowsToMatches(rows: CsvRow[], split: Split): Match[] {
  const out: Match[] = [];
  for (const r of rows) {
    const a = r.teamA;
    const b = r.teamB;
    if (!a || !b || a === b) throw new DataError(`Bad teams in row ${JSON.stringify(r)}`);
    if (r.winner !== a && r.winner !== b) throw new DataError(`Winner ${r.winner} is not ${a} or ${b}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) throw new DataError(`Bad date ${r.date}`);
    const event = r.tournament || "Unknown event";
    const order = Number(r.map_order) || 1;
    out.push({
      id: `${split}-${r.date}-${slug(a)}-${slug(b)}-${order}`,
      date: r.date,
      day: dayNumber(r.date),
      event,
      eventShort: event.replace(/^Masters\s+/i, "").replace(/\s+\d{4}$/, ""),
      split,
      a,
      b,
      map: r.map_name,
      winner: (r.winner === a ? "a" : "b") as Side,
      series: seriesKey(r.date, a, b),
      score: r.score ?? "",
      order,
      conflict: false,
    });
  }
  return out;
}

export function sortMatches(ms: Match[]): Match[] {
  return [...ms].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.series < y.series ? -1 : x.series > y.series ? 1 : x.order - y.order));
}

/** groups maps into series and checks each against its own recorded score */
export function buildSeries(matches: Match[]): SeriesInfo[] {
  const groups = new Map<string, Match[]>();
  for (const m of matches) {
    const g = groups.get(m.series);
    if (g) g.push(m);
    else groups.set(m.series, [m]);
  }
  const out: SeriesInfo[] = [];
  for (const [id, ms] of groups) {
    const first = ms[0];
    const [s1, s2] = (first.score || "").split("-").map(Number);
    const aWins = ms.filter((m) => (m.winner === "a" ? m.a : m.b) === first.a).length;
    const bWins = ms.length - aWins;
    const hasScore = Number.isFinite(s1) && Number.isFinite(s2);
    // the score is written winner-first; the series winner is whoever took more maps
    const winner: Side = aWins >= bWins ? "a" : "b";
    const consistent = hasScore ? Math.max(aWins, bWins) === Math.max(s1, s2) && Math.min(aWins, bWins) === Math.min(s1, s2) : true;
    out.push({
      id,
      date: first.date,
      day: first.day,
      event: first.event,
      eventShort: first.eventShort,
      split: first.split,
      a: first.a,
      b: first.b,
      maps: ms.map((m) => m.map),
      matchIds: ms.map((m) => m.id),
      winner,
      score: first.score,
      consistent,
    });
  }
  return out.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.id < y.id ? -1 : 1));
}

export function buildDataset(
  train: CsvRow[],
  valid: CsvRow[],
  mapping: Record<string, { region?: string }> = {},
): Dataset {
  const raw = sortMatches([...rowsToMatches(train, "train"), ...rowsToMatches(valid, "valid")]);
  const series = buildSeries(raw);
  const inconsistent = new Set(series.filter((s) => !s.consistent).map((s) => s.id));
  const matches = raw.map((m) => (inconsistent.has(m.series) ? { ...m, conflict: true } : m));

  const teamNames = [...new Set(matches.flatMap((m) => [m.a, m.b]))].sort((x, y) => x.localeCompare(y));
  const teams: TeamMeta[] = teamNames.map((name) => {
    const mine = matches.filter((m) => m.a === name || m.b === name);
    const wins = mine.filter((m) => (m.winner === "a" ? m.a : m.b) === name).length;
    const ser = series.filter((s) => s.a === name || s.b === name);
    const sWins = ser.filter((s) => (s.winner === "a" ? s.a : s.b) === name).length;
    return {
      name,
      tag: teamTag(name),
      region: regionOf(name, mapping),
      maps: mine.length,
      wins,
      series: ser.length,
      seriesWins: sWins,
      events: [...new Set(mine.map((m) => m.eventShort))],
    };
  });

  const maps = [...new Set(matches.map((m) => m.map))].sort();
  const events: EventInfo[] = [];
  for (const split of ["train", "valid"] as Split[]) {
    const ms = matches.filter((m) => m.split === split);
    if (!ms.length) continue;
    events.push({
      name: ms[0].event,
      short: ms[0].eventShort,
      split,
      from: ms[0].date,
      to: ms[ms.length - 1].date,
      maps: ms.length,
      series: new Set(ms.map((m) => m.series)).size,
      teams: new Set(ms.flatMap((m) => [m.a, m.b])).size,
    });
  }

  return {
    matches,
    series,
    teams,
    maps,
    events,
    from: matches[0]?.date ?? "",
    to: matches[matches.length - 1]?.date ?? "",
  };
}

/** "Jun 22, 2025" */
export function formatDate(date: string, opts: { year?: boolean } = {}): string {
  const [y, m, d] = date.split("-").map(Number);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return opts.year === false ? `${month} ${d}` : `${month} ${d}, ${y}`;
}

export function winnerName(m: { a: string; b: string; winner: Side }): string {
  return m.winner === "a" ? m.a : m.b;
}
