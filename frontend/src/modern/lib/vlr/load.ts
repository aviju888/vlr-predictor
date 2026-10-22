import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auditFiles, FILES, type FileKey, type RawFiles } from "./audit";
import { parseCsv } from "./csv";
import { buildDataset } from "./dataset";
import type { VlrData } from "./types";

/* ─────────────────────────────────────────────────────────
 * LOAD (server only) — reads the bundled copies of the
 * original's data files from lib/vlr/data. No network.
 * ───────────────────────────────────────────────────────── */

export const DATA_DIR = join(process.cwd(), "src", "modern", "lib", "vlr", "data");

export function readRawFiles(dir = DATA_DIR): RawFiles {
  const out = {} as RawFiles;
  for (const [key, file] of Object.entries(FILES) as [FileKey, string][]) {
    out[key] = parseCsv(readFileSync(join(dir, file), "utf8"));
  }
  return out;
}

export function readTeamMapping(dir = DATA_DIR): Record<string, { region?: string }> {
  try {
    return JSON.parse(readFileSync(join(dir, "vct_team_mapping.json"), "utf8"));
  } catch {
    return {};
  }
}

let cache: VlrData | null = null;

export function loadVlrData(): VlrData {
  if (cache) return cache;
  const raw = readRawFiles();
  const dataset = buildDataset(raw.train, raw.valid, readTeamMapping());
  cache = { dataset, audit: auditFiles(raw, dataset) };
  return cache;
}
