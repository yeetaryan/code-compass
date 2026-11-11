/**
 * Request schemas shared by the API (authoritative validation) and the web forms (instant feedback).
 * Normalisation of links happens on the server after these shape checks.
 */
import { z } from "zod";
import { AVAILABILITY_IDS, CONTACT_CHANNELS, LIMITS, ROLE_IDS, TEAM_STATUS_IDS } from "./constants.js";

const optionalText = (max: number) =>
  z
    .string()
    .max(max, `Keep this under ${max} characters`)
    .nullish()
    .transform((v) => (v == null || v.trim() === "" ? null : v.trim()));

const tag = z.string().trim().min(1).max(LIMITS.tag, `Tags must be under ${LIMITS.tag} characters`);
const tagList = (max: number) => z.array(tag).max(max, `Add at most ${max}`);

const thisYear = new Date().getFullYear();

export const projectSchema = z.object({
  title: z.string().trim().min(1, "Give the project a name").max(LIMITS.projectTitle),
  url: z.string().max(LIMITS.url).nullish(),
  description: optionalText(LIMITS.projectDescription),
});

export const visibilitySchema = z.object({
  email: z.boolean(),
  whatsapp: z.boolean(),
  linkedin: z.boolean(),
  x: z.boolean(),
  github: z.boolean(),
  website: z.boolean(),
});

export const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name").max(LIMITS.name),
    bio: optionalText(LIMITS.bio),
    college: optionalText(LIMITS.college),
    degree: optionalText(LIMITS.degree),
    graduationYear: z
      .number()
      .int()
      .min(thisYear - 10, "That graduation year looks too far back")
      .max(thisYear + 8, "That graduation year looks too far ahead")
      .nullish()
      .transform((v) => v ?? null),
    skills: tagList(LIMITS.skills),
    interests: tagList(LIMITS.interests),
    roles: z.array(z.enum(ROLE_IDS)).max(LIMITS.roles, `Pick up to ${LIMITS.roles} roles`),
    hackathonInterests: tagList(LIMITS.hackathons),
    availability: z.enum(AVAILABILITY_IDS),
    projects: z.array(projectSchema).max(LIMITS.projects),
    preferredContact: z.enum(CONTACT_CHANNELS).nullish().transform((v) => v ?? null),
    whatsapp: z.string().max(40).nullish(),
    linkedinUrl: z.string().max(LIMITS.url).nullish(),
    xHandle: z.string().max(LIMITS.url).nullish(),
    githubUsername: z.string().max(LIMITS.url).nullish(),
    websiteUrl: z.string().max(LIMITS.url).nullish(),
    visibility: visibilitySchema,
    discoverable: z.boolean(),
  })
  .strict();
export type ProfileUpdateInput = z.input<typeof profileUpdateSchema>;

/** Onboarding = the minimum needed to appear in discovery. Everything else is optional later. */
export const onboardingSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name").max(LIMITS.name),
    college: optionalText(LIMITS.college),
    graduationYear: profileUpdateSchema.shape.graduationYear,
    skills: tagList(LIMITS.skills).min(1, "Add at least one skill"),
    roles: z.array(z.enum(ROLE_IDS)).min(1, "Pick at least one role").max(LIMITS.roles),
    availability: z.enum(AVAILABILITY_IDS),
    // Returning v1 users confirm who may see the contact details restored from their old profile.
    whatsappVisible: z.boolean().optional(),
    xVisible: z.boolean().optional(),
  })
  .strict();
export type OnboardingInput = z.input<typeof onboardingSchema>;

const csv = z
  .string()
  .max(400)
  .optional()
  .transform((v) =>
    v
      ? v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 10)
      : [],
  );

export const peopleQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  skills: csv,
  interests: csv,
  roles: csv.pipe(z.array(z.enum(ROLE_IDS))),
  availability: z.enum(AVAILABILITY_IDS).optional(),
  graduationYear: z.coerce.number().int().min(1990).max(2100).optional(),
  college: z.string().trim().max(LIMITS.college).optional(),
  sort: z.enum(["match", "recent"]).default("match"),
  page: z.coerce.number().int().min(1).max(500).default(1),
});
export type PeopleQuery = z.input<typeof peopleQuerySchema>;

export const teamInputSchema = z
  .object({
    name: z.string().trim().min(2, "Give your team a name").max(LIMITS.teamName),
    hackathonName: optionalText(120),
    description: z.string().trim().min(20, "Describe the idea in at least 20 characters").max(LIMITS.teamDescription),
    neededSkills: tagList(LIMITS.skills),
    neededRoles: z.array(z.enum(ROLE_IDS)).max(LIMITS.roles),
    timeline: optionalText(80),
    maxMembers: z.number().int().min(2).max(LIMITS.teamMaxMembers),
    contactLink: z.string().max(LIMITS.url).nullish(),
    status: z.enum(TEAM_STATUS_IDS).default("recruiting"),
  })
  .strict();
export type TeamInput = z.input<typeof teamInputSchema>;

export const teamsQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  skills: csv,
  status: z.enum(TEAM_STATUS_IDS).optional(),
  mine: z.enum(["1"]).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

export const joinRequestSchema = z.object({ message: optionalText(LIMITS.joinMessage) }).strict();
export const decideRequestSchema = z.object({ decision: z.enum(["accept", "decline"]) }).strict();
