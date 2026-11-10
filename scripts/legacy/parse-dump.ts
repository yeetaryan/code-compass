/**
 * Minimal reader for the plain-text pg_dump / pg_dumpall format Supabase produces.
 * Extracts the rows of selected `COPY <table> (...) FROM stdin;` blocks without restoring anything.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

export type Row = Record<string, string | null>;

export function readDump(path: string): string {
  const buf = readFileSync(path);
  const isGzip = buf[0] === 0x1f && buf[1] === 0x8b;
  const text = (isGzip ? gunzipSync(buf) : buf).toString("utf8");
  if (!/^--\s*\n--\s*PostgreSQL database (cluster )?dump/m.test(text.slice(0, 2000))) {
    throw new Error("This doesn't look like a plain-text pg_dump/pg_dumpall file");
  }
  return text;
}

/** Decode one field of COPY text format. */
function decodeField(raw: string): string | null {
  if (raw === "\\N") return null;
  if (!raw.includes("\\")) return raw;
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = raw[++i];
    switch (n) {
      case "b": out += "\b"; break;
      case "f": out += "\f"; break;
      case "n": out += "\n"; break;
      case "r": out += "\r"; break;
      case "t": out += "\t"; break;
      case "v": out += "\v"; break;
      case "x": {
        const hex = raw.slice(i + 1).match(/^[0-9a-fA-F]{1,2}/)![0];
        out += String.fromCharCode(parseInt(hex, 16));
        i += hex.length;
        break;
      }
      default:
        if (n >= "0" && n <= "7") {
          const oct = raw.slice(i).match(/^[0-7]{1,3}/)![0];
          out += String.fromCharCode(parseInt(oct, 8));
          i += oct.length - 1;
        } else out += n; // "\\" and any other escaped char
    }
  }
  return out;
}

export function copyRows(dump: string, table: string): { columns: string[]; rows: Row[] } {
  const header = new RegExp(`^COPY ${table.replace(".", "\\.")} \\(([^)]*)\\) FROM stdin;$`, "m");
  const m = header.exec(dump);
  if (!m) throw new Error(`COPY block for ${table} not found in dump`);
  const columns = m[1].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const start = m.index + m[0].length + 1;
  const end = dump.indexOf("\n\\.\n", start - 1);
  const body = end === start - 1 ? "" : dump.slice(start, end);
  const rows: Row[] = [];
  if (body.trim() === "" || body === "\\.") return { columns, rows };
  for (const line of body.split("\n")) {
    if (line === "\\.") break;
    const fields = line.split("\t");
    if (fields.length !== columns.length) {
      throw new Error(`${table}: expected ${columns.length} fields, got ${fields.length}`);
    }
    const row: Row = {};
    columns.forEach((c, i) => (row[c] = decodeField(fields[i])));
    rows.push(row);
  }
  return { columns, rows };
}
