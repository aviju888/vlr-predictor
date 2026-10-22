/* ─────────────────────────────────────────────────────────
 * CSV — a small RFC 4180 reader. Quoted fields may hold commas,
 * newlines and doubled quotes (""), which the original's player
 * columns use. Returns one record per row keyed by the header.
 * ───────────────────────────────────────────────────────── */

export type CsvRow = Record<string, string>;

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // drop blank lines
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

export function parseCsv(text: string): CsvRow[] {
  const [header, ...body] = parseCsvRows(text);
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((cells) => {
    const rec: CsvRow = {};
    keys.forEach((k, i) => {
      rec[k] = (cells[i] ?? "").trim();
    });
    return rec;
  });
}
