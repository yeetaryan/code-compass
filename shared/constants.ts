/**
 * Values shared by the API (validation) and the web app (forms, filters, labels).
 * Keep this file dependency-free so both bundles can import it.
 */

export const ROLES = [
  { id: "frontend", label: "Frontend" },
  { id: "backend", label: "Backend" },
  { id: "fullstack", label: "Full-stack" },
  { id: "mobile", label: "Mobile" },
  { id: "ai-ml", label: "AI / ML" },
  { id: "data", label: "Data" },
  { id: "design", label: "Design (UI/UX)" },
  { id: "devops", label: "DevOps / Cloud" },
  { id: "security", label: "Security" },
  { id: "hardware", label: "Hardware / IoT" },
  { id: "web3", label: "Web3" },
  { id: "game-dev", label: "Game dev" },
  { id: "product", label: "Product" },
  { id: "pitching", label: "Pitching / Business" },
] as const;

export type RoleId = (typeof ROLES)[number]["id"];
export const ROLE_IDS = ROLES.map((r) => r.id) as [RoleId, ...RoleId[]];
export const roleLabel = (id: string) => ROLES.find((r) => r.id === id)?.label ?? id;

export const AVAILABILITY = [
  { id: "looking", label: "Looking for a team", short: "Looking" },
  { id: "open", label: "Open to ideas", short: "Open" },
  { id: "busy", label: "Not available right now", short: "Busy" },
] as const;
export type Availability = (typeof AVAILABILITY)[number]["id"];
export const AVAILABILITY_IDS = AVAILABILITY.map((a) => a.id) as [Availability, ...Availability[]];

export const CONTACT_CHANNELS = ["email", "whatsapp", "linkedin", "x", "github", "website"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];
export const CONTACT_LABELS: Record<ContactChannel, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
  x: "X",
  github: "GitHub",
  website: "Website",
};

export const TEAM_STATUS = [
  { id: "recruiting", label: "Recruiting" },
  { id: "full", label: "Team full" },
  { id: "closed", label: "Closed" },
] as const;
export type TeamStatus = (typeof TEAM_STATUS)[number]["id"];
export const TEAM_STATUS_IDS = TEAM_STATUS.map((s) => s.id) as [TeamStatus, ...TeamStatus[]];

export const LIMITS = {
  name: 80,
  bio: 500,
  college: 120,
  degree: 120,
  tag: 40,
  skills: 20,
  interests: 12,
  hackathons: 10,
  roles: 5,
  projects: 5,
  projectTitle: 80,
  projectDescription: 280,
  url: 300,
  teamName: 80,
  teamDescription: 1500,
  teamMaxMembers: 12,
  joinMessage: 500,
  pageSize: 12,
  avatarBytes: 300 * 1024,
} as const;

/** Suggestions shown in the tag inputs. Users can type anything. */
export const SKILL_SUGGESTIONS = [
  "JavaScript", "TypeScript", "React", "Next.js", "Node.js", "Express", "Python", "FastAPI", "Django",
  "Flask", "Java", "C", "C++", "Go", "Rust", "Kotlin", "Swift", "Flutter", "React Native", "HTML", "CSS",
  "Tailwind CSS", "PostgreSQL", "MySQL", "MongoDB", "Firebase", "Supabase", "Docker", "Kubernetes", "AWS",
  "GCP", "Azure", "Git", "Figma", "TensorFlow", "PyTorch", "scikit-learn", "Pandas", "NumPy", "OpenCV",
  "LangChain", "Solidity", "Unity", "Arduino", "Verilog", "MATLAB", "Three.js", "GraphQL",
];

export const INTEREST_SUGGESTIONS = [
  "Web Development", "AI/ML", "App Development", "Data Science", "Cybersecurity", "Cloud", "Web3",
  "Robotics", "IoT", "Game Development", "Open Source", "Startups", "Computer Vision", "Embedded Systems",
  "UI/UX", "DevOps", "FinTech", "HealthTech", "EdTech", "Climate Tech",
];
