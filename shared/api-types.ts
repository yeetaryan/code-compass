/** Response shapes returned by the API. The server builds these explicitly — never from raw rows. */
import type { Availability, ContactChannel, RoleId, TeamStatus } from "./constants.js";

export type ApiError = { error: { code: string; message: string; fields?: Record<string, string>; requestId?: string } };

export type Contact = { channel: ContactChannel; value: string; href: string };

export type Project = { title: string; url: string | null; description: string | null };

export type PersonCard = {
  id: string;
  name: string;
  avatarUrl: string | null;
  college: string | null;
  graduationYear: number | null;
  yearOfStudy: string | null;
  bio: string | null;
  skills: string[];
  interests: string[];
  roles: RoleId[];
  availability: Availability;
  /** Only channels the owner made visible. Hidden values are never sent. */
  contacts: Contact[];
  preferredContact: ContactChannel | null;
  match: { score: number; sharedInterests: string[]; complementaryRoles: RoleId[]; sharedSkills: string[] } | null;
  joinedAt: string;
};

export type PersonDetail = PersonCard & {
  degree: string | null;
  hackathonInterests: string[];
  projects: Project[];
  teams: TeamSummary[];
  isSelf: boolean;
};

export type Page<T> = { items: T[]; page: number; pageSize: number; total: number; hasMore: boolean };

export type Visibility = Record<ContactChannel, boolean>;

export type MyProfile = {
  name: string;
  bio: string | null;
  college: string | null;
  degree: string | null;
  graduationYear: number | null;
  yearOfStudy: string | null;
  skills: string[];
  interests: string[];
  roles: RoleId[];
  hackathonInterests: string[];
  availability: Availability;
  projects: Project[];
  preferredContact: ContactChannel | null;
  whatsapp: string | null;
  linkedinUrl: string | null;
  xHandle: string | null;
  githubUsername: string | null;
  websiteUrl: string | null;
  visibility: Visibility;
  discoverable: boolean;
  onboarded: boolean;
  avatarUrl: string | null;
  completeness: number;
};

export type Me = {
  user: { id: string; email: string; name: string; emailVerified: boolean; createdAt: string };
  profile: MyProfile;
  pendingRequestsToReview: number;
};

export type MemberSummary = { id: string; name: string; avatarUrl: string | null; role: "owner" | "member"; roles: RoleId[]; skills: string[] };

export type ViewerTeamState = "owner" | "member" | "pending" | "none";

export type TeamSummary = {
  id: string;
  name: string;
  hackathonName: string | null;
  description: string;
  neededSkills: string[];
  neededRoles: RoleId[];
  timeline: string | null;
  status: TeamStatus;
  maxMembers: number;
  memberCount: number;
  owner: { id: string; name: string; avatarUrl: string | null };
  members: Pick<MemberSummary, "id" | "name" | "avatarUrl">[];
  viewerState: ViewerTeamState;
  createdAt: string;
  updatedAt: string;
};

export type JoinRequest = {
  id: string;
  message: string | null;
  createdAt: string;
  person: Pick<PersonCard, "id" | "name" | "avatarUrl" | "skills" | "roles" | "college" | "graduationYear" | "yearOfStudy">;
};

export type TeamDetail = Omit<TeamSummary, "members"> & {
  members: MemberSummary[];
  /** Present only for members and the owner. */
  contactLink: string | null;
  /** Present only for the owner. */
  pendingRequests: JoinRequest[] | null;
  viewerRequest: { id: string; status: "pending"; createdAt: string } | null;
};

export type PopularTags = { skills: { label: string; count: number }[]; interests: { label: string; count: number }[] };
