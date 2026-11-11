/**
 * Compares two Supabase dumps (e.g. the original backup and a fresh export) WITHOUT printing personal data:
 * only counts, ids (truncated) and dates.
 *
 *   npx tsx scripts/compare-dumps.ts --old <old.backup.gz> --new <fresh.backup.gz>
 */
import { copyRows, readDump } from "./legacy/parse-dump.js";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const [oldPath, newPath] = [arg("old"), arg("new")];
if (!oldPath || !newPath) throw new Error("--old and --new are required");

const load = (p: string) => {
  const d = readDump(p);
  return {
    users: copyRows(d, "auth.users").rows,
    identities: copyRows(d, "auth.identities").rows,
    profiles: copyRows(d, "public.profiles").rows,
    teams: copyRows(d, "public.teams").rows,
  };
};
const a = load(oldPath);
const b = load(newPath);
const short = (id: string | null) => (id ?? "").slice(0, 8);
const byId = <T extends Record<string, string | null>>(rows: T[]) => new Map(rows.map((r) => [r.id!, r]));

const report: Record<string, unknown> = {
  counts: Object.fromEntries((["users", "identities", "profiles", "teams"] as const).map((k) => [k, { old: a[k].length, new: b[k].length }])),
};
for (const k of ["users", "profiles", "teams"] as const) {
  const A = byId(a[k]);
  const B = byId(b[k]);
  const added = [...B.keys()].filter((id) => !A.has(id));
  const removed = [...A.keys()].filter((id) => !B.has(id));
  const changed = [...B.keys()].filter((id) => A.has(id) && (A.get(id)!.updated_at ?? "") !== (B.get(id)!.updated_at ?? ""));
  report[k] = {
    added: added.length,
    removed: removed.length,
    changedSinceOld: changed.length,
    addedSample: added.slice(0, 20).map((id) => `${short(id)}… created ${(B.get(id)!.created_at ?? "").slice(0, 10)}`),
    removedIds: removed.map(short),
  };
}
const hashes = b.users.filter((u) => u.encrypted_password).map((u) => u.encrypted_password!.slice(0, 7));
report.hashPrefixesInNew = Object.fromEntries([...new Set(hashes)].map((p) => [p, hashes.filter((h) => h === p).length]));
report.newestUserInNew = b.users.map((u) => u.created_at ?? "").sort().at(-1)?.slice(0, 19);
report.newestUserInOld = a.users.map((u) => u.created_at ?? "").sort().at(-1)?.slice(0, 19);
console.log(JSON.stringify(report, null, 2));
