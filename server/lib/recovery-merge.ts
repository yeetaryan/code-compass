/**
 * Pure merge rules for restoring a v1 profile snapshot into a live profile. No I/O — shared by the
 * import script and the API so both apply exactly the same rules.
 *
 * Rules:
 *  - A snapshot only fills fields that are EMPTY in the live profile. Anything the user has typed in v2 wins.
 *  - A contact's visibility travels with its value (restoring WhatsApp also restores whether it was hidden).
 *  - "Start fresh" only clears fields that still hold exactly the restored value.
 */
import type { SnapshotData } from "../db/schema.js";

export type RecoverableField = "name" | "yearOfStudy" | "skills" | "interests" | "whatsapp" | "xHandle";

export type LiveProfile = {
  name: string;
  yearOfStudy: string | null;
  skills: string[];
  skillsKey: string[];
  interests: string[];
  interestsKey: string[];
  roles: string[];
  whatsapp: string | null;
  whatsappVisible: boolean;
  xHandle: string | null;
  xVisible: boolean;
  onboardedAt: Date | null;
};

export const PLACEHOLDER_NAME = "New member";

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Fields of a snapshot that carry real information (used to tell "has a profile" from "empty"). */
export function meaningfulFields(d: SnapshotData | null): RecoverableField[] {
  if (!d) return [];
  const out: RecoverableField[] = [];
  if (d.yearOfStudy) out.push("yearOfStudy");
  if (d.skills.length) out.push("skills");
  if (d.interests.length) out.push("interests");
  if (d.whatsapp) out.push("whatsapp");
  if (d.xHandle) out.push("xHandle");
  return out;
}

/** Same rule v1 used to show someone in Browse, extended with v2 roles. */
export const isDiscoverable = (p: { name: string; skills: string[]; interests: string[]; roles: string[] }) =>
  p.name.trim().length >= 2 && (p.skills.length > 0 || p.interests.length > 0 || p.roles.length > 0);

export function mergeSnapshot(live: LiveProfile, d: SnapshotData, now: Date) {
  const patch: Partial<LiveProfile> = {};
  const fields: RecoverableField[] = [];
  if (d.name && (!live.name.trim() || live.name === PLACEHOLDER_NAME)) {
    patch.name = d.name;
    fields.push("name");
  }
  if (d.yearOfStudy && !live.yearOfStudy) {
    patch.yearOfStudy = d.yearOfStudy;
    fields.push("yearOfStudy");
  }
  if (d.skills.length && !live.skills.length) {
    patch.skills = d.skills;
    patch.skillsKey = d.skillsKey;
    fields.push("skills");
  }
  if (d.interests.length && !live.interests.length) {
    patch.interests = d.interests;
    patch.interestsKey = d.interestsKey;
    fields.push("interests");
  }
  if (d.whatsapp && !live.whatsapp) {
    patch.whatsapp = d.whatsapp;
    patch.whatsappVisible = d.whatsappVisible;
    fields.push("whatsapp");
  }
  if (d.xHandle && !live.xHandle) {
    patch.xHandle = d.xHandle;
    patch.xVisible = d.xVisible;
    fields.push("xHandle");
  }
  const after = { ...live, ...patch };
  if (!live.onboardedAt && isDiscoverable(after)) patch.onboardedAt = now;
  return { patch, fields };
}

/** Undo a restore: clear restored fields the user hasn't changed since. */
export function undoSnapshot(live: LiveProfile, d: SnapshotData, restored: string[]) {
  const patch: Partial<LiveProfile> = {};
  const has = (f: RecoverableField) => restored.includes(f);
  if (has("yearOfStudy") && live.yearOfStudy === d.yearOfStudy) patch.yearOfStudy = null;
  if (has("skills") && sameList(live.skills, d.skills)) {
    patch.skills = [];
    patch.skillsKey = [];
  }
  if (has("interests") && sameList(live.interests, d.interests)) {
    patch.interests = [];
    patch.interestsKey = [];
  }
  if (has("whatsapp") && live.whatsapp === d.whatsapp) {
    patch.whatsapp = null;
    patch.whatsappVisible = false;
  }
  if (has("xHandle") && live.xHandle === d.xHandle) {
    patch.xHandle = null;
    patch.xVisible = true;
  }
  // The name stays: the account needs one, and onboarding lets the user change it.
  const after = { ...live, ...patch };
  if (!isDiscoverable(after)) patch.onboardedAt = null;
  return patch;
}
