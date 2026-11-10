/**
 * Seeds a LOCAL database with fictional demo people and teams for development and screenshots.
 * Refuses to run against non-local hosts. All demo accounts use the password "demo-password".
 *
 *   DATABASE_URL=postgres://postgres@localhost:5432/cc_demo npx tsx scripts/seed-demo.ts
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
  console.error("seed-demo only runs against a local database.");
  process.exit(2);
}
Object.assign(process.env, { BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "demo-secret-demo-secret-demo-secret-000", APP_URL: process.env.APP_URL ?? "http://localhost:5173" });
const { auth } = await import("../server/auth.js");
const { pool } = await import("../server/db/client.js");
const { normalizeTags } = await import("../shared/tags.js");

type P = { name: string; college: string; year: number; degree: string; bio: string; skills: string[]; interests: string[]; roles: string[]; availability: "looking" | "open" | "busy"; linkedin?: string; github?: string; x?: string };

const PEOPLE: P[] = [
  { name: "Aarav Mehta", college: "Manipal University Jaipur", year: 2027, degree: "B.Tech CSE", bio: "Backend-leaning engineer. I like databases, queues and making things fast. Looking for a designer for the next hackathon.", skills: ["Go", "PostgreSQL", "Docker", "Redis", "TypeScript"], interests: ["Developer Tools", "Open Source", "Cloud"], roles: ["backend", "devops"], availability: "looking", linkedin: "aarav-mehta-demo", github: "aarav-demo" },
  { name: "Sara Iqbal", college: "Manipal University Jaipur", year: 2026, degree: "B.Des Interaction Design", bio: "Product designer turning messy ideas into flows people understand. Figma, prototyping and a bit of React.", skills: ["Figma", "Prototyping", "React", "Design Systems"], interests: ["UI/UX", "AI/ML", "EdTech"], roles: ["design", "frontend"], availability: "looking", linkedin: "sara-iqbal-demo" },
  { name: "Kabir Rao", college: "IIIT Delhi", year: 2028, degree: "B.Tech ECE", bio: "Computer vision and edge ML. Currently building a posture-tracking side project.", skills: ["Python", "PyTorch", "OpenCV", "C++"], interests: ["AI/ML", "Computer Vision", "Robotics"], roles: ["ai-ml"], availability: "open", github: "kabir-demo" },
  { name: "Nia Patel", college: "Manipal University Jaipur", year: 2027, degree: "B.Tech IT", bio: "Full-stack dev, hackathon regular. I enjoy owning the demo.", skills: ["Next.js", "Node.js", "PostgreSQL", "Tailwind CSS"], interests: ["Web Development", "FinTech", "Startups"], roles: ["fullstack", "pitching"], availability: "looking", linkedin: "nia-patel-demo", x: "niabuilds" },
  { name: "Ishaan Verma", college: "BITS Pilani", year: 2026, degree: "B.E. Electrical", bio: "Hardware + firmware. Give me a sensor and a deadline.", skills: ["Arduino", "C", "Embedded C", "PCB Design"], interests: ["IoT", "Embedded Systems", "Climate Tech"], roles: ["hardware"], availability: "open" },
  { name: "Meera Krishnan", college: "VIT Vellore", year: 2027, degree: "B.Tech CSE", bio: "Data person — pipelines, dashboards and the occasional model.", skills: ["Python", "Pandas", "SQL", "Power BI"], interests: ["Data Science", "HealthTech"], roles: ["data", "ai-ml"], availability: "looking", linkedin: "meera-k-demo" },
  { name: "Rohan Gupta", college: "Manipal University Jaipur", year: 2028, degree: "B.Tech CSE", bio: "Flutter dev shipping small apps for campus clubs.", skills: ["Flutter", "Firebase", "Kotlin"], interests: ["App Development", "EdTech"], roles: ["mobile"], availability: "open", github: "rohan-demo" },
  { name: "Tara Singh", college: "NSUT Delhi", year: 2026, degree: "B.Tech IT", bio: "Security CTF player. Happy to break your app before the judges do.", skills: ["Python", "Linux", "Burp Suite", "Rust"], interests: ["Cybersecurity", "Open Source"], roles: ["security", "backend"], availability: "busy" },
  { name: "Dev Malhotra", college: "Manipal University Jaipur", year: 2027, degree: "BBA", bio: "I handle the pitch, the deck and the user interviews.", skills: ["Market Research", "Pitching", "Notion"], interests: ["Startups", "FinTech"], roles: ["product", "pitching"], availability: "looking", linkedin: "dev-malhotra-demo" },
  { name: "Ananya Das", college: "Jadavpur University", year: 2028, degree: "B.E. CSE", bio: "Frontend engineer obsessed with accessibility and motion.", skills: ["React", "TypeScript", "CSS", "Three.js"], interests: ["Web Development", "UI/UX"], roles: ["frontend", "design"], availability: "open", github: "ananya-demo" },
  { name: "Yash Bansal", college: "Manipal University Jaipur", year: 2026, degree: "B.Tech CCE", bio: "Smart contracts and the infra around them.", skills: ["Solidity", "TypeScript", "Node.js"], interests: ["Web3", "FinTech"], roles: ["web3", "backend"], availability: "open" },
  { name: "Zoya Khan", college: "Amity University", year: 2027, degree: "B.Tech AI", bio: "LLM apps, retrieval and evals. Looking for people to build something useful, not another chatbot.", skills: ["Python", "LangChain", "FastAPI", "Docker"], interests: ["AI/ML", "EdTech"], roles: ["ai-ml", "backend"], availability: "looking", linkedin: "zoya-khan-demo" },
];

const TEAMS = [
  { owner: 3, name: "Campus Commute", hackathon: "HackMUJ 2026", timeline: "48 hours", description: "A shared ride planner for students living off campus. Backend is underway — we need help with the mobile app and a route-matching model.", skills: ["Flutter", "Python"], roles: ["mobile", "ai-ml", "design"], max: 4, members: [0] },
  { owner: 1, name: "Studio Notes", hackathon: null, timeline: "Through March", description: "An AI study companion that turns lecture recordings into searchable notes and flashcards. Designs are ready; looking for an ML engineer and a full-stack dev.", skills: ["React", "FastAPI"], roles: ["ai-ml", "fullstack"], max: 3, members: [] },
  { owner: 4, name: "AirSense", hackathon: "Smart India Hackathon 2026", timeline: "6 weeks", description: "Low-cost air-quality sensors for hostels with a live dashboard. Hardware prototype works — we need a data person and a frontend dev for the dashboard.", skills: ["React", "Python"], roles: ["data", "frontend"], max: 5, members: [5] },
];

const p = pool();
const ids: string[] = [];
for (const person of PEOPLE) {
  const email = `${person.name.split(" ")[0].toLowerCase()}@demo.codecompass.dev`;
  const existing = await p.query("SELECT id FROM users WHERE email = $1", [email]);
  let id = existing.rows[0]?.id as string | undefined;
  if (!id) {
    const r = await auth().api.signUpEmail({ body: { name: person.name, email, password: "demo-password" } });
    id = r.user.id;
  }
  ids.push(id);
  const s = normalizeTags(person.skills, 20);
  const i = normalizeTags(person.interests, 12);
  await p.query(
    `UPDATE profiles SET name=$2, college=$3, graduation_year=$4, degree=$5, bio=$6, skills=$7, skills_key=$8, interests=$9, interests_key=$10,
       roles=$11, availability=$12, linkedin_url=$13, github_username=$14, x_handle=$15, onboarded_at=now(), discoverable=true,
       preferred_contact = CASE WHEN $13::text IS NOT NULL THEN 'linkedin'::contact_channel END, updated_at=now()
     WHERE user_id=$1`,
    [id, person.name, person.college, person.year, person.degree, person.bio, s.labels, s.keys, i.labels, i.keys, person.roles, person.availability,
      person.linkedin ? `https://www.linkedin.com/in/${person.linkedin}` : null, person.github ?? null, person.x ?? null],
  );
}
for (const t of TEAMS) {
  const ownerId = ids[t.owner];
  const exists = await p.query("SELECT id FROM teams WHERE name=$1 AND owner_id=$2", [t.name, ownerId]);
  if (exists.rows.length) continue;
  const s = normalizeTags(t.skills, 20);
  const r = await p.query(
    `INSERT INTO teams (owner_id, name, hackathon_name, description, needed_skills, needed_skills_key, needed_roles, timeline, max_members, contact_link)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'https://chat.whatsapp.com/demo-invite') RETURNING id`,
    [ownerId, t.name, t.hackathon, t.description, s.labels, s.keys, t.roles, t.timeline, t.max],
  );
  await p.query("INSERT INTO team_members (team_id, user_id, role) VALUES ($1,$2,'owner')", [r.rows[0].id, ownerId]);
  for (const m of t.members) await p.query("INSERT INTO team_members (team_id, user_id) VALUES ($1,$2)", [r.rows[0].id, ids[m]]);
}
console.log(`Seeded ${PEOPLE.length} demo people and ${TEAMS.length} teams. Sign in as aarav@demo.codecompass.dev / demo-password`);
await p.end();
