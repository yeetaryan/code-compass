/**
 * Pure normalisation helpers shared by the API, the legacy migration and the web app.
 * Every function returns `null` for empty input and throws `NormalizeError` for invalid input,
 * so callers can distinguish "cleared" from "bad value".
 */
import { LIMITS } from "./constants.js";

export class NormalizeError extends Error {
  constructor(public field: string, message: string) {
    super(message);
  }
}

const blank = (v: string | null | undefined) => v == null || v.trim() === "";

function parseLooseUrl(input: string): URL | null {
  const raw = input.trim();
  const withProto = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withProto);
  } catch {
    return null;
  }
}

/** LinkedIn personal profile → `https://www.linkedin.com/in/<slug>` */
export function normalizeLinkedIn(input: string | null | undefined): string | null {
  if (blank(input)) return null;
  const url = parseLooseUrl(input!);
  const host = url?.hostname.toLowerCase() ?? "";
  if (!url || !(host === "linkedin.com" || host.endsWith(".linkedin.com")) || !/^https?:$/.test(url.protocol)) {
    throw new NormalizeError("linkedinUrl", "Enter a LinkedIn profile URL, like linkedin.com/in/your-name");
  }
  const m = url.pathname.match(/^\/in\/([^/]+)\/?$/);
  if (!m) throw new NormalizeError("linkedinUrl", "Use your personal profile URL (linkedin.com/in/…), not a company or post link");
  let slug: string;
  try {
    slug = decodeURIComponent(m[1]);
  } catch {
    throw new NormalizeError("linkedinUrl", "That LinkedIn URL looks malformed");
  }
  if (!/^[\p{L}\p{N}_-]{3,100}$/u.test(slug)) {
    throw new NormalizeError("linkedinUrl", "That LinkedIn profile name doesn't look right");
  }
  return `https://www.linkedin.com/in/${encodeURIComponent(slug)}`;
}

/** X / Twitter → bare handle without "@" */
export function normalizeXHandle(input: string | null | undefined): string | null {
  if (blank(input)) return null;
  let v = input!.trim();
  if (/(^|\.)(x|twitter)\.com\//i.test(v) || /^https?:/i.test(v)) {
    const url = parseLooseUrl(v);
    const host = url?.hostname.toLowerCase().replace(/^(www|mobile)\./, "");
    if (!url || (host !== "x.com" && host !== "twitter.com")) {
      throw new NormalizeError("xHandle", "Enter your X handle or an x.com link");
    }
    v = url.pathname.split("/").filter(Boolean)[0] ?? "";
  }
  v = v.replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(v)) throw new NormalizeError("xHandle", "X handles are 1–15 letters, numbers or underscores");
  return v;
}

/** GitHub → username */
export function normalizeGithub(input: string | null | undefined): string | null {
  if (blank(input)) return null;
  let v = input!.trim();
  if (/github\.com/i.test(v) || /^https?:/i.test(v)) {
    const url = parseLooseUrl(v);
    const host = url?.hostname.toLowerCase().replace(/^www\./, "");
    if (!url || host !== "github.com") throw new NormalizeError("githubUsername", "Enter your GitHub username or profile link");
    v = url.pathname.split("/").filter(Boolean)[0] ?? "";
  }
  v = v.replace(/^@/, "");
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(v)) {
    throw new NormalizeError("githubUsername", "That isn't a valid GitHub username");
  }
  return v;
}

/**
 * WhatsApp → "+<country><number>" (E.164).
 * A bare 10-digit number starting 6–9 is treated as an Indian mobile and gets +91; Code Compass
 * started at MUJ and the original app stored numbers that way. Anything else must include a country code.
 */
export function normalizeWhatsapp(input: string | null | undefined): string | null {
  if (blank(input)) return null;
  const raw = input!.trim();
  const hasPlus = raw.startsWith("+") || raw.startsWith("00");
  const digits = raw.replace(/\D/g, "").replace(/^00/, "");
  if (!hasPlus && /^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (!hasPlus && /^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  if (hasPlus && /^[1-9]\d{7,14}$/.test(digits)) return `+${digits}`;
  throw new NormalizeError("whatsapp", "Include your country code, e.g. +91 98765 43210");
}

/** Generic http(s) link (portfolio, project, website). */
export function normalizeWebUrl(input: string | null | undefined, field = "url"): string | null {
  if (blank(input)) return null;
  const url = parseLooseUrl(input!);
  if (!url || !/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) {
    throw new NormalizeError(field, "Enter a valid web address starting with https://");
  }
  if (url.username || url.password) throw new NormalizeError(field, "Links can't contain credentials");
  const out = url.toString();
  if (out.length > LIMITS.url) throw new NormalizeError(field, "That link is too long");
  return out;
}

/** Team chat link — must be https. */
export function normalizeTeamLink(input: string | null | undefined): string | null {
  const v = normalizeWebUrl(input, "contactLink");
  if (v && !v.startsWith("https://")) throw new NormalizeError("contactLink", "Group links must start with https://");
  return v;
}

export const whatsappLink = (e164: string) => `https://wa.me/${e164.replace(/\D/g, "")}`;
export const xLink = (handle: string) => `https://x.com/${handle}`;
export const githubLink = (u: string) => `https://github.com/${u}`;

/** Collapse whitespace, strip control characters. */
export function cleanText(input: string | null | undefined, max: number): string | null {
  if (input == null) return null;
  // eslint-disable-next-line no-control-regex
  const v = input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[ \t]+/g, " ").trim();
  if (v === "") return null;
  return v.slice(0, max);
}
