import { describe, expect, it } from "vitest";
import { fileStats, labelConflicts, mapListConflicts, recycledStats, scheduleClashes } from "@/modern/lib/vlr/audit";
import { parseCsv, parseCsvRows } from "@/modern/lib/vlr/csv";
import { buildDataset, dayNumber, dateFromDay, formatDate } from "@/modern/lib/vlr/dataset";
import { loadVlrData, readRawFiles } from "@/modern/lib/vlr/load";

describe("csv", () => {
  it("handles quoted commas, doubled quotes, CRLF and a BOM", () => {
    const text = '﻿a,b,c\r\n1,"x, y","say ""hi"""\r\n2,,last\n';
    expect(parseCsvRows(text)).toEqual([
      ["a", "b", "c"],
      ["1", "x, y", 'say "hi"'],
      ["2", "", "last"],
    ]);
    expect(parseCsv(text)[0]).toEqual({ a: "1", b: "x, y", c: 'say "hi"' });
  });

  it("keeps newlines inside quotes and drops blank lines", () => {
    expect(parseCsvRows('a,b\n"line1\nline2",2\n\n')).toEqual([
      ["a", "b"],
      ["line1\nline2", "2"],
    ]);
  });

  it("parses the original's player columns", () => {
    const rows = readRawFiles().vlrgg;
    expect(rows[0].teamA_players.split(",")).toHaveLength(5);
  });
});

describe("dates", () => {
  it("round-trip day numbers", () => {
    expect(dateFromDay(dayNumber("2025-06-22"))).toBe("2025-06-22");
    expect(dayNumber("2025-06-07") - dayNumber("2025-03-02")).toBe(97);
    expect(formatDate("2025-02-20")).toBe("Feb 20, 2025");
  });
});

describe("dataset", () => {
  const { dataset: ds } = loadVlrData();

  it("uses the original's split: Bangkok trains, Toronto is held out", () => {
    expect(ds.events.map((e) => [e.short, e.split, e.maps, e.series, e.from, e.to])).toEqual([
      ["Bangkok", "train", 33, 12, "2025-02-20", "2025-03-02"],
      ["Toronto", "valid", 38, 14, "2025-06-07", "2025-06-22"],
    ]);
    expect(ds.from).toBe("2025-02-20");
    expect(ds.to).toBe("2025-06-22");
  });

  it("is sorted, unique, and every winner is one of the two teams", () => {
    const ids = new Set(ds.matches.map((m) => m.id));
    expect(ids.size).toBe(ds.matches.length);
    for (let i = 1; i < ds.matches.length; i += 1) expect(ds.matches[i - 1].date <= ds.matches[i].date).toBe(true);
    const lastTrain = Math.max(...ds.matches.filter((m) => m.split === "train").map((m) => m.day));
    const firstValid = Math.min(...ds.matches.filter((m) => m.split === "valid").map((m) => m.day));
    expect(firstValid).toBeGreaterThan(lastTrain);
  });

  it("drops in-match stats from what models can see", () => {
    const keys = Object.keys(ds.matches[0]);
    expect(keys.some((k) => /acs|kd/i.test(k))).toBe(false);
  });

  it("flags series whose map winners contradict the recorded score", () => {
    expect(ds.series.filter((s) => !s.consistent)).toHaveLength(16);
    const gf = ds.series.find((s) => s.date === "2025-03-02");
    expect(gf).toMatchObject({ score: "3-2", consistent: false, maps: ["Ascent", "Bind", "Haven", "Split", "Breeze"] });
  });

  it("tags and regions come from the original's team mapping", () => {
    const prx = ds.teams.find((t) => t.name === "Paper Rex");
    expect(prx).toMatchObject({ tag: "PRX", region: "Pacific", maps: 26, wins: 21 });
    expect(ds.teams.find((t) => t.name === "NRG")?.region).toBe("Americas");
    expect(ds.teams).toHaveLength(14);
    expect(ds.maps).toEqual(["Ascent", "Bind", "Breeze", "Haven", "Split"]);
  });

  it("rejects a row whose winner isn't playing", () => {
    expect(() =>
      buildDataset(
        [{ date: "2025-01-01", teamA: "A", teamB: "B", winner: "C", map_name: "Bind", tournament: "X", score: "1-0", map_order: "1" }],
        [],
      ),
    ).toThrow();
  });
});

describe("audit of the original's data folder", () => {
  const raw = readRawFiles();
  const { audit } = loadVlrData();

  it("finds the Masters side bias", () => {
    const v = fileStats(raw.valid);
    expect(v).toMatchObject({ rows: 38, series: 14, winnerListedFirst: 13, mapsWonByFirst: 35, scoreConflicts: 9, exactDuplicates: 0, repeatedMaps: 0 });
    expect(fileStats(raw.train)).toMatchObject({ rows: 33, series: 12, winnerListedFirst: 9, scoreConflicts: 7 });
  });

  it("finds reused in-match stats", () => {
    expect(recycledStats([...raw.train, ...raw.valid])).toEqual({ values: 32, slots: 97, total: 142 });
  });

  it("finds the generated files", () => {
    expect(fileStats(raw.realistic)).toMatchObject({ rows: 202, singleMapSeries: 202, placeholderPlayers: 202 });
    expect(scheduleClashes(raw.realistic, raw.valid)).toBe(18);
    expect(fileStats(raw.vlrgg)).toMatchObject({ rows: 138, repeatedMaps: 10, placeholderPlayers: 138 });
    expect(mapListConflicts(raw.vlrgg, raw.vct2025)).toEqual({ shared: 4, differ: 4 });
    expect(fileStats(raw.days365)).toMatchObject({ rows: 113, spanDays: 3, from: "2026-01-24", to: "2026-01-26" });
  });

  it("finds the conflicting Masters copy", () => {
    expect(labelConflicts(raw.tier1, [...raw.train, ...raw.valid])).toEqual({ overlap: 9, conflicts: 3, unmatched: 2 });
  });

  it("uses exactly the two Masters files", () => {
    expect(audit.files.filter((f) => f.status === "used").map((f) => f.file)).toEqual([
      "masters_bangkok_2025_training.csv",
      "masters_toronto_2025_validation.csv",
    ]);
    expect(audit.files.find((f) => f.file === "masters_2025_complete.csv")?.status).toBe("redundant");
    expect(audit.files).toHaveLength(8);
  });

  it("has no em dashes in user-facing copy", () => {
    const text = JSON.stringify(audit);
    expect(text.includes("—")).toBe(false);
  });
});
