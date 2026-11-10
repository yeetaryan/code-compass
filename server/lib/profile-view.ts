import { sql } from "drizzle-orm";
import type { Contact, MyProfile, PersonCard, Project } from "../../shared/api-types.js";
import type { Availability, ContactChannel, RoleId } from "../../shared/constants.js";
import { githubLink, whatsappLink, xLink } from "../../shared/normalize.js";
import type { profiles } from "../db/schema.js";

/**
 * Columns safe to show another signed-in member. Contact fields are resolved IN SQL:
 * a hidden value never leaves the database, so no client code can leak it.
 */
export const PUBLIC_PROFILE_COLUMNS = sql.raw(`
  p.user_id AS id, p.name, p.college, p.degree, p.graduation_year, p.year_of_study, p.bio,
  p.skills, p.skills_key, p.interests, p.interests_key, p.roles, p.hackathon_interests, p.projects,
  p.availability, p.avatar_version, p.created_at,
  CASE WHEN p.email_visible    THEN u.email           END AS email,
  CASE WHEN p.whatsapp_visible THEN p.whatsapp        END AS whatsapp,
  CASE WHEN p.linkedin_visible THEN p.linkedin_url    END AS linkedin_url,
  CASE WHEN p.x_visible        THEN p.x_handle        END AS x_handle,
  CASE WHEN p.github_visible   THEN p.github_username END AS github_username,
  CASE WHEN p.website_visible  THEN p.website_url     END AS website_url,
  CASE p.preferred_contact
    WHEN 'email'    THEN CASE WHEN p.email_visible    THEN 'email'    END
    WHEN 'whatsapp' THEN CASE WHEN p.whatsapp_visible THEN 'whatsapp' END
    WHEN 'linkedin' THEN CASE WHEN p.linkedin_visible THEN 'linkedin' END
    WHEN 'x'        THEN CASE WHEN p.x_visible        THEN 'x'        END
    WHEN 'github'   THEN CASE WHEN p.github_visible   THEN 'github'   END
    WHEN 'website'  THEN CASE WHEN p.website_visible  THEN 'website'  END
  END AS preferred_contact
`);

export type PublicRow = {
  id: string;
  name: string;
  college: string | null;
  degree: string | null;
  graduation_year: number | null;
  year_of_study: string | null;
  bio: string | null;
  skills: string[];
  skills_key: string[];
  interests: string[];
  interests_key: string[];
  roles: string[];
  hackathon_interests: string[];
  projects: Project[];
  availability: Availability;
  avatar_version: number;
  created_at: string | Date;
  email: string | null;
  whatsapp: string | null;
  linkedin_url: string | null;
  x_handle: string | null;
  github_username: string | null;
  website_url: string | null;
  preferred_contact: ContactChannel | null;
};

export const avatarUrl = (userId: string, version: number) => (version > 0 ? `/api/avatars/${userId}?v=${version}` : null);

export function contactsFrom(r: Pick<PublicRow, "email" | "whatsapp" | "linkedin_url" | "x_handle" | "github_username" | "website_url">): Contact[] {
  const out: Contact[] = [];
  if (r.linkedin_url) out.push({ channel: "linkedin", value: r.linkedin_url.replace("https://www.", ""), href: r.linkedin_url });
  if (r.x_handle) out.push({ channel: "x", value: `@${r.x_handle}`, href: xLink(r.x_handle) });
  if (r.github_username) out.push({ channel: "github", value: r.github_username, href: githubLink(r.github_username) });
  if (r.whatsapp) out.push({ channel: "whatsapp", value: r.whatsapp, href: whatsappLink(r.whatsapp) });
  if (r.email) out.push({ channel: "email", value: r.email, href: `mailto:${r.email}` });
  if (r.website_url) out.push({ channel: "website", value: r.website_url.replace(/^https?:\/\//, "").replace(/\/$/, ""), href: r.website_url });
  return out;
}

export type Viewer = { skills_key: string[]; interests_key: string[]; roles: string[]; skills: string[]; interests: string[] } | null;

export function matchFor(r: PublicRow, viewer: Viewer, score?: number | null): PersonCard["match"] {
  if (!viewer) return null;
  const mineI = new Set(viewer.interests_key);
  const mineS = new Set(viewer.skills_key);
  const mineR = new Set(viewer.roles);
  return {
    score: Number(score ?? 0),
    sharedInterests: r.interests.filter((_, i) => mineI.has(r.interests_key[i])),
    sharedSkills: r.skills.filter((_, i) => mineS.has(r.skills_key[i])),
    complementaryRoles: r.roles.filter((x) => !mineR.has(x)) as RoleId[],
  };
}

export function toCard(r: PublicRow, viewer: Viewer, score?: number | null): PersonCard {
  return {
    id: r.id,
    name: r.name,
    avatarUrl: avatarUrl(r.id, r.avatar_version),
    college: r.college,
    graduationYear: r.graduation_year,
    yearOfStudy: r.graduation_year ? null : r.year_of_study,
    bio: r.bio,
    skills: r.skills,
    interests: r.interests,
    roles: r.roles as RoleId[],
    availability: r.availability,
    contacts: contactsFrom(r),
    preferredContact: r.preferred_contact,
    match: matchFor(r, viewer, score),
    joinedAt: new Date(r.created_at).toISOString(),
  };
}

type ProfileRow = typeof profiles.$inferSelect;

export function completeness(p: ProfileRow): number {
  const checks = [
    p.name,
    p.bio,
    p.college,
    p.graduationYear,
    p.skills.length >= 3,
    p.interests.length > 0,
    p.roles.length > 0,
    p.avatarVersion > 0,
    p.linkedinUrl || p.githubUsername || p.xHandle || p.whatsapp || p.emailVisible,
    p.projects.length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function toMyProfile(p: ProfileRow): MyProfile {
  return {
    name: p.name,
    bio: p.bio,
    college: p.college,
    degree: p.degree,
    graduationYear: p.graduationYear,
    yearOfStudy: p.yearOfStudy,
    skills: p.skills,
    interests: p.interests,
    roles: p.roles as RoleId[],
    hackathonInterests: p.hackathonInterests,
    availability: p.availability,
    projects: p.projects,
    preferredContact: p.preferredContact,
    whatsapp: p.whatsapp,
    linkedinUrl: p.linkedinUrl,
    xHandle: p.xHandle,
    githubUsername: p.githubUsername,
    websiteUrl: p.websiteUrl,
    visibility: {
      email: p.emailVisible,
      whatsapp: p.whatsappVisible,
      linkedin: p.linkedinVisible,
      x: p.xVisible,
      github: p.githubVisible,
      website: p.websiteVisible,
    },
    discoverable: p.discoverable,
    onboarded: Boolean(p.onboardedAt),
    avatarUrl: avatarUrl(p.userId, p.avatarVersion),
    completeness: completeness(p),
  };
}

/** Minimum for appearing in discovery. */
export const meetsOnboarding = (p: { name: string; skills: string[]; roles: string[] }) =>
  p.name.trim().length >= 2 && (p.skills.length > 0 || p.roles.length > 0);

/** Escape LIKE wildcards in user search input. */
export const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
