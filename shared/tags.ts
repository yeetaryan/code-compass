/**
 * Skill / interest tag canonicalisation.
 *
 * `tagKey()` produces the comparison key stored in `*_key` columns (used for filtering and matching).
 * `canonicalTag()` produces the label shown in the UI. Known aliases collapse to one label, so
 * "js", "Javascript" and "JAVASCRIPT" all become "JavaScript".
 */
import { LIMITS } from "./constants.js";

const ALIASES: Record<string, string[]> = {
  JavaScript: ["js", "javascript", "java script", "ecmascript"],
  TypeScript: ["ts", "typescript"],
  React: ["react", "reactjs", "react.js"],
  "Next.js": ["next", "nextjs", "next.js", "next-js"],
  "Node.js": ["node", "nodejs", "node.js", "node js"],
  Express: ["express", "expressjs", "express.js"],
  "Three.js": ["threejs", "three.js"],
  Python: ["python", "python basics", "python3"],
  "C++": ["c++", "cpp"],
  C: ["c", "c language"],
  "C#": ["c#", "csharp"],
  ".NET": [".net", "dotnet"],
  Java: ["java"],
  HTML: ["html", "html5"],
  CSS: ["css", "css3"],
  "Tailwind CSS": ["tailwind", "tailwindcss", "tailwind css"],
  PostgreSQL: ["postgres", "postgresql", "postgress", "postgressql", "postgresssql", "psql"],
  MySQL: ["mysql"],
  MongoDB: ["mongo", "mongodb"],
  Firebase: ["firebase"],
  Supabase: ["supabase"],
  Prisma: ["prisma"],
  Docker: ["docker"],
  AWS: ["aws"],
  GCP: ["gcp", "google cloud"],
  "scikit-learn": ["sklearn", "scikit-learn", "scikit learn", "scikitlearn"],
  TensorFlow: ["tensorflow"],
  PyTorch: ["pytorch", "torch"],
  Keras: ["keras"],
  OpenCV: ["opencv"],
  NumPy: ["numpy"],
  Pandas: ["pandas"],
  Matplotlib: ["matplotlib"],
  CUDA: ["cuda"],
  FastAPI: ["fastapi"],
  Flask: ["flask"],
  Flutter: ["flutter"],
  LangChain: ["langchain"],
  Git: ["git"],
  Figma: ["figma"],
  Postman: ["postman", "postman api"],
  DevOps: ["devops"],
  MATLAB: ["matlab"],
  Verilog: ["verilog"],
  "AI/ML": ["ai/ml", "ai-ml", "ai ml", "aiml", "ai and ml", "ai & ml", "ml/ai", "ai, ml", "artificial intelligence and machine learning"],
  "Machine Learning": ["ml", "machine learning"],
  "Web Development": ["web development", "web dev", "webdev", "web devlopment", "web developement", "web developer", "webdevelopment"],
  "App Development": ["app development", "app dev", "appdev", "mobile app development", "app developement"],
  "Full-stack Development": ["fullstack development", "full stack development", "full-stack development", "fullstack", "full stack"],
  "Backend Development": ["backend development", "backend", "back end", "web dev(backend)", "web dev (backend)"],
  "Frontend Development": ["frontend development", "frontend", "front end"],
  "Data Science": ["data science", "datascience"],
  Cybersecurity: ["cybersecurity", "cyber security"],
  Cloud: ["cloud", "cloud computing"],
  "UI/UX": ["ui/ux", "uiux", "ui ux", "ui-ux"],
  Web3: ["web3", "web 3"],
  IoT: ["iot", "internet of things"],
  Robotics: ["robotics"],
  "Computer Vision": ["computer vision", "cv"],
  Networking: ["networking"],
  Startups: ["startups", "startup", "startup founder"],
};

const keyOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const ALIAS_INDEX = new Map<string, string>();
for (const [label, aliases] of Object.entries(ALIASES)) {
  ALIAS_INDEX.set(keyOf(label), label);
  for (const a of aliases) ALIAS_INDEX.set(keyOf(a), label);
}

export const isKnownTag = (s: string) => ALIAS_INDEX.has(keyOf(s));

export function canonicalTag(input: string): string | null {
  const direct = ALIAS_INDEX.get(keyOf(input));
  if (direct) return direct;
  const v = input.replace(/\s+/g, " ").replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "");
  if (!v) return null;
  const known = ALIAS_INDEX.get(keyOf(v));
  if (known) return known;
  if (v.length > LIMITS.tag) return null;
  if (v === v.toUpperCase() && v.length > 5) return v.charAt(0) + v.slice(1).toLowerCase();
  if (/^[a-z][a-z]/.test(v)) return v.charAt(0).toUpperCase() + v.slice(1);
  return v;
}

/** Comparison key — lowercase, whitespace-collapsed canonical label. */
export const tagKey = (label: string) => keyOf(canonicalTag(label) ?? label);

/** Canonicalise and de-duplicate a list of tags, preserving first-seen order. */
export function normalizeTags(tags: readonly string[], max: number): { labels: string[]; keys: string[] } {
  const labels: string[] = [];
  const keys: string[] = [];
  for (const t of tags) {
    const label = canonicalTag(t);
    if (!label) continue;
    const k = keyOf(label);
    if (keys.includes(k)) continue;
    labels.push(label);
    keys.push(k);
    if (labels.length >= max) break;
  }
  return { labels, keys };
}

/**
 * Split legacy free text ("Js , react , node.js , express.js", "Python (FastAPI)",
 * "Data Science [Pandas, Numpy]", "Web dev and AI/ML") into individual tags.
 * Returns the pieces that could not be kept (too long) so the migration can report them.
 */
export function splitLegacyTags(text: string | null | undefined): { tags: string[]; dropped: string[] } {
  if (!text || !text.trim()) return { tags: [], dropped: [] };
  const whole = text.trim();
  if (isKnownTag(whole)) return { tags: [whole], dropped: [] };

  const pieces: string[] = [];
  // pull bracketed groups out first: "Data Science [Pandas, Numpy]" -> "Data Science" + "Pandas", "Numpy"
  const outer = whole.replace(/[([{]([^)\]}]*)[)\]}]/g, (_m, inner: string) => {
    const words = inner.trim().split(/\s+/).length;
    // short lists of tools are tags; long parentheticals are commentary ("currently working on")
    if (inner.includes(",") || words <= 2) pieces.push(...inner.split(/[,;|]/));
    return " ";
  });
  pieces.unshift(...outer.split(/[,;|\n]/));

  const tags: string[] = [];
  const dropped: string[] = [];
  for (const raw of pieces) {
    const p = raw.trim();
    if (!p) continue;
    if (isKnownTag(p)) {
      tags.push(p);
      continue;
    }
    // "Web dev and AI/ML" / "app dev and <something>" -> split when at least one half is a known tag
    const parts = p.split(/\s+(?:and|&)\s+/i);
    if (parts.length > 1 && parts.some(isKnownTag)) {
      for (const part of parts) (part.length > LIMITS.tag ? dropped : tags).push(part);
      continue;
    }
    // "Html Css" -> two tags when every word is a known tag
    const words = p.split(/\s+/);
    if (words.length > 1 && words.every(isKnownTag)) {
      tags.push(...words);
      continue;
    }
    if (p.length > LIMITS.tag) dropped.push(p);
    else tags.push(p);
  }
  return { tags, dropped };
}
