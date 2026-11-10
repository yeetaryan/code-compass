import { ArrowRight, BriefcaseBusiness, Check, Eye, EyeOff, Lock, MessageCircle, Search, Sparkles, UsersRound } from "lucide-react";
import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Logo } from "@/components/app/Logo";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { useMe } from "@/lib/queries";
import { cn } from "@/lib/utils";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: 0.08 * i, ease: [0.2, 0.7, 0.2, 1] } }),
};

function Reveal({ children, className, i = 0 }: { children: ReactNode; className?: string; i?: number }) {
  return (
    <motion.div className={className} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} custom={i}>
      {children}
    </motion.div>
  );
}

/* ───────────── Illustrative product mockups (fictional people, clearly labelled) ───────────── */

const SAMPLE = [
  { name: "Aarav Mehta", meta: "Class of 2027", roles: "Backend · DevOps", skills: ["Go", "PostgreSQL", "Docker"], match: "Covers Backend, DevOps", status: "Looking" },
  { name: "Sara Iqbal", meta: "Class of 2026", roles: "Design (UI/UX)", skills: ["Figma", "Prototyping", "Motion"], match: "Shares AI/ML · Covers Design", status: "Looking" },
  { name: "Kabir Rao", meta: "Class of 2028", roles: "AI / ML", skills: ["PyTorch", "OpenCV", "Python"], match: "Shares Computer Vision", status: "Open" },
];

function MiniPerson({ p, className }: { p: (typeof SAMPLE)[number]; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-line bg-surface p-4 shadow-sm", className)}>
      <div className="flex items-center gap-3">
        <Avatar name={p.name} size={38} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[0.95rem] font-semibold tracking-tight">{p.name}</p>
          <p className="truncate text-[0.76rem] text-ink-3">{p.meta}</p>
        </div>
      </div>
      <p className="mt-3 flex items-center justify-between gap-2 text-[0.8rem] text-ink-2">
        <span className="truncate">{p.roles}</span>
        <span className={cn("inline-flex shrink-0 items-center gap-1 text-[0.72rem]", p.status === "Looking" ? "text-moss" : "text-amber")}>
          <span className={cn("size-1.5 rounded-full", p.status === "Looking" ? "bg-moss" : "bg-amber")} />
          {p.status}
        </span>
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1">
        {p.skills.map((s) => (
          <span key={s} className="rounded-full border border-line bg-subtle px-2 py-0.5 text-[0.72rem] text-ink-2">{s}</span>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[0.74rem] text-needle-ink"><Sparkles className="size-3" />{p.match}</p>
    </div>
  );
}

function HeroPreview() {
  return (
    <div className="relative pb-6 sm:pb-12" aria-label="Illustrative preview of the discovery screen" role="img">
      <p className="mb-3 text-right text-[0.72rem] text-ink-4">Illustrative preview · people shown are fictional</p>
      <div className="absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-b from-subtle to-transparent" />
      <div className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-canvas shadow-lg">
        <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-3">
          <span className="size-2.5 rounded-full bg-line-strong" /><span className="size-2.5 rounded-full bg-line-strong" /><span className="size-2.5 rounded-full bg-line-strong" />
          <span className="ml-3 text-[0.72rem] text-ink-4">codecompass · discover</span>
        </div>
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-[0.82rem] text-ink-4">
            <Search className="size-4" /> Search by name or skill…
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["Best match", "Design", "Backend", "Looking for a team"].map((c, i) => (
              <span key={c} className={cn("rounded-full border px-3 py-1 text-[0.74rem] font-medium", i === 0 ? "border-ink bg-ink text-canvas" : "border-line-strong bg-surface text-ink-2")}>{c}</span>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.6 }}>
              <MiniPerson p={SAMPLE[0]} />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.6 }}>
              <MiniPerson p={SAMPLE[1]} />
            </motion.div>
          </div>
        </div>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.75, duration: 0.6 }}
        className="absolute -bottom-2 -left-4 hidden w-64 rounded-2xl border border-line bg-surface p-4 shadow-lg sm:block lg:-left-10"
      >
        <p className="text-[0.7rem] font-medium tracking-wide text-ink-4 uppercase">Team forming</p>
        <p className="mt-1 font-display font-semibold tracking-tight">Campus Commute</p>
        <p className="mt-1 text-[0.76rem] text-ink-3">Needs a designer and an ML engineer</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="flex -space-x-2">
            {["N P", "J T", "M K"].map((n) => <Avatar key={n} name={n} size={26} className="ring-2 ring-surface" />)}
          </span>
          <span className="rounded-full bg-moss-soft px-2.5 py-1 text-[0.7rem] font-medium text-moss">2 spots open</span>
        </div>
      </motion.div>
    </div>
  );
}

/* ───────────── Sections ───────────── */

function PublicHeader() {
  const { data: me } = useMe();
  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-canvas/80 backdrop-blur-md supports-[backdrop-filter]:bg-canvas/70">
      <div className="container-page flex h-16 items-center justify-between">
        <Logo />
        <nav className="hidden items-center gap-1 text-[0.9rem] text-ink-3 md:flex" aria-label="Sections">
          <a href="#how" className="rounded-full px-3.5 py-2 hover:text-ink">How it works</a>
          <a href="#product" className="rounded-full px-3.5 py-2 hover:text-ink">Product</a>
          <a href="#privacy" className="rounded-full px-3.5 py-2 hover:text-ink">Privacy</a>
          <a href="#faq" className="rounded-full px-3.5 py-2 hover:text-ink">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          {me ? (
            <Link to="/discover" className={buttonVariants({ size: "sm" })}>Open Code Compass</Link>
          ) : (
            <>
              <Link to="/sign-in" className={buttonVariants({ variant: "ghost", size: "sm" })}>Sign in</Link>
              <Link to="/sign-up" className={buttonVariants({ size: "sm" })}>Get started</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="grain pointer-events-none absolute inset-x-0 top-0 h-[520px] [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden />
      <div className="container-page relative grid items-center gap-14 pt-14 pb-24 sm:pt-20 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:pt-24 lg:pb-32">
        <div>
          <motion.p variants={fadeUp} initial="hidden" animate="show" className="eyebrow">
            <span className="size-1.5 rounded-full bg-needle" aria-hidden /> For students who build
          </motion.p>
          <motion.h1 variants={fadeUp} initial="hidden" animate="show" custom={1} className="mt-5 text-display">
            Find your <span className="em">people.</span>
            <br className="hidden sm:block" /> Build something extraordinary.
          </motion.h1>
          <motion.p variants={fadeUp} initial="hidden" animate="show" custom={2} className="mt-6 max-w-xl text-[1.1rem] leading-relaxed text-ink-2 sm:text-[1.15rem]">
            Discover ambitious students, find teammates with complementary skills, and turn your next idea into something real.
          </motion.p>
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={3} className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link to="/sign-up" className={buttonVariants({ size: "lg" })}>
              Find your team <ArrowRight />
            </Link>
            <a href="#how" className={buttonVariants({ size: "lg", variant: "secondary" })}>
              Explore how it works
            </a>
          </motion.div>
          <motion.ul variants={fadeUp} initial="hidden" animate="show" custom={4} className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[0.86rem] text-ink-3">
            {["Free for students", "Your contact details stay private", "Two-minute setup"].map((t) => (
              <li key={t} className="flex items-center gap-1.5"><Check className="size-4 text-moss" aria-hidden />{t}</li>
            ))}
          </motion.ul>
        </div>
        <HeroPreview />
      </div>
    </section>
  );
}

function UseCases() {
  return (
    <section className="border-y border-line bg-surface">
      <div className="container-page flex flex-col items-center gap-4 py-7 sm:flex-row sm:justify-between">
        <p className="text-[0.86rem] text-ink-3">Made for the moments you need more than yourself</p>
        <ul className="flex flex-wrap justify-center gap-2">
          {["Hackathons", "Side projects", "Research", "Open source", "Startup ideas", "Competitions"].map((t) => (
            <li key={t}><Tag tone="outline">{t}</Tag></li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const STEPS = [
  { n: "01", title: "Build your profile", body: "Add your skills, the roles you enjoy and what you want to work on. It takes about two minutes — you can add projects and links later." },
  { n: "02", title: "Discover compatible collaborators", body: "Browse students ranked by how well they complement you: shared interests for common ground, different strengths so the team covers more." },
  { n: "03", title: "Connect and start building", body: "Reach out on the channel they prefer, or post a team with the roles you need and review requests to join." },
];

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 py-24 sm:py-32">
      <div className="container-page">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-4 text-h1">From “I have an idea” to <span className="em">“let’s build.”</span></h2>
        </Reveal>
        <ol className="mt-14 grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} i={i}>
              <li className="h-full rounded-[var(--radius-card)] border border-line bg-surface p-7">
                <span className="em text-[2.6rem] leading-none text-needle">{s.n}</span>
                <h3 className="mt-6 text-h3">{s.title}</h3>
                <p className="mt-2.5 text-[0.95rem] leading-relaxed text-ink-3">{s.body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Feature({ eyebrow, title, body, points, visual, flip }: { eyebrow: string; title: ReactNode; body: string; points: string[]; visual: ReactNode; flip?: boolean }) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <Reveal className={cn(flip && "lg:order-2")}>
        <p className="eyebrow">{eyebrow}</p>
        <h3 className="mt-4 text-h2">{title}</h3>
        <p className="mt-4 max-w-lg text-[1.02rem] leading-relaxed text-ink-3">{body}</p>
        <ul className="mt-6 space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-[0.95rem] text-ink-2"><Check className="mt-0.5 size-4 shrink-0 text-moss" aria-hidden />{p}</li>
          ))}
        </ul>
      </Reveal>
      <Reveal i={1} className={cn(flip && "lg:order-1")}>
        <div className="rounded-[var(--radius-panel)] border border-line bg-subtle p-5 sm:p-8">{visual}</div>
      </Reveal>
    </div>
  );
}

function ProfileVisual() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-md sm:p-6" role="img" aria-label="Illustrative student profile">
      <div className="flex items-center gap-4">
        <Avatar name="Sara Iqbal" size={56} />
        <div>
          <p className="font-display text-[1.15rem] font-semibold tracking-tight">Sara Iqbal</p>
          <p className="text-[0.82rem] text-ink-3">B.Des · Class of 2026</p>
        </div>
      </div>
      <p className="mt-4 text-[0.9rem] leading-relaxed text-ink-2">Product designer who likes turning messy hackathon ideas into something people can actually use.</p>
      <div className="mt-4 flex flex-wrap gap-1.5">{["Figma", "Design systems", "Prototyping", "React"].map((s) => <Tag key={s}>{s}</Tag>)}</div>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-3 text-[0.78rem] font-medium text-canvas"><BriefcaseBusiness className="size-3.5" />LinkedIn</span>
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong px-3 text-[0.78rem] font-medium text-ink-2"><MessageCircle className="size-3.5" />WhatsApp</span>
      </div>
    </div>
  );
}

function MatchVisual() {
  return (
    <div className="space-y-3" role="img" aria-label="Illustrative discovery results">
      <MiniPerson p={SAMPLE[1]} className="shadow-md" />
      <MiniPerson p={SAMPLE[2]} className="opacity-90" />
    </div>
  );
}

function TeamVisual() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-md sm:p-6" role="img" aria-label="Illustrative team page">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-[1.1rem] font-semibold tracking-tight">Campus Commute</p>
          <p className="text-[0.8rem] text-ink-3">Weekend hackathon · 48 hours</p>
        </div>
        <Tag tone="moss">Recruiting</Tag>
      </div>
      <p className="mt-3 text-[0.88rem] leading-relaxed text-ink-2">A shared ride planner for students living off campus. Backend is underway — we need help with the app and the route model.</p>
      <div className="mt-4 flex flex-wrap gap-1.5"><Tag tone="accent">Design (UI/UX)</Tag><Tag tone="accent">AI / ML</Tag><Tag>Flutter</Tag></div>
      <div className="mt-5 space-y-2 border-t border-line pt-4">
        {[["Kabir Rao", "wants to join · AI / ML"], ["Sara Iqbal", "wants to join · Design"]].map(([n, d]) => (
          <div key={n} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2.5 text-[0.84rem]"><Avatar name={n} size={28} /><span><b className="font-medium">{n}</b> <span className="text-ink-3">{d}</span></span></span>
            <span className="rounded-full bg-ink px-3 py-1 text-[0.72rem] font-medium text-canvas">Accept</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Product() {
  return (
    <section id="product" className="scroll-mt-20 border-t border-line bg-surface py-24 sm:py-32">
      <div className="container-page space-y-24 sm:space-y-32">
        <Feature
          eyebrow="Profiles"
          title={<>Show what you can <span className="em">build</span>, not just where you study.</>}
          body="Skills, preferred roles, projects and availability in one place — plus LinkedIn, X, GitHub or WhatsApp, each shown only if you switch it on."
          points={["Skill and interest tags that are easy to search", "LinkedIn as a first-class link for your professional story", "Projects and hackathon interests, when you're ready"]}
          visual={<ProfileVisual />}
        />
        <Feature
          flip
          eyebrow="Discovery"
          title={<>Matched on what makes teams <span className="em">work.</span></>}
          body="Best-match ranking looks for common ground and complementary strengths, and tells you why someone showed up — so you're not scrolling a directory."
          points={["Filter by skills, roles, interests and graduation year", "See who's actively looking for a team", "Search across names, skills and interests"]}
          visual={<MatchVisual />}
        />
        <Feature
          eyebrow="Teams"
          title={<>Post the idea. <span className="em">Fill the gaps.</span></>}
          body="Create a team for a hackathon or project, list the roles you need, and review requests. Your group chat link is only shared with people you accept."
          points={["Open roles and needed skills at a glance", "Request-to-join with a short note", "Owners manage members; full teams close automatically"]}
          visual={<TeamVisual />}
        />
      </div>
    </section>
  );
}

const WHY = [
  { title: "Complementary skills", body: "A great hackathon team isn't four people with the same stack. Find the designer, the ML person or the backend engineer you're missing." },
  { title: "Motivated collaborators", body: "Everyone here signed up because they want to build. Availability tells you who's looking right now." },
  { title: "Beyond your friend group", body: "Meet people from other branches, years and colleges you'd never cross paths with in class." },
  { title: "Projects that ship", body: "Teams with clear roles and a shared plan are the ones that make it to the demo." },
];

function Why() {
  return (
    <section className="py-24 sm:py-32">
      <div className="container-page">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">Why Code Compass</p>
          <h2 className="mt-4 text-h1">Great ideas deserve <span className="em">great teams.</span></h2>
        </Reveal>
        <div className="mt-14 grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2">
          {WHY.map((w, i) => (
            <Reveal key={w.title} i={i} className="bg-surface p-7 sm:p-9">
              <h3 className="text-h3">{w.title}</h3>
              <p className="mt-2.5 text-[0.95rem] leading-relaxed text-ink-3">{w.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Privacy() {
  const rows: [string, boolean][] = [["LinkedIn", true], ["GitHub", true], ["WhatsApp", false], ["Email", false]];
  return (
    <section id="privacy" className="scroll-mt-20 border-y border-line bg-subtle py-24 sm:py-28">
      <div className="container-page grid items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <p className="eyebrow"><Lock className="size-3.5" aria-hidden /> Privacy</p>
          <h2 className="mt-4 text-h2">You decide who sees <span className="em">what.</span></h2>
          <p className="mt-4 max-w-lg text-[1.02rem] leading-relaxed text-ink-3">
            Profiles are visible only to signed-in members. Each contact method has its own switch, and hidden details never leave our servers — they aren't just hidden on screen.
          </p>
        </Reveal>
        <Reveal i={1}>
          <div className="rounded-2xl border border-line bg-surface p-2 shadow-sm" role="img" aria-label="Illustrative contact visibility settings">
            {rows.map(([label, on]) => (
              <div key={label} className="flex items-center justify-between rounded-xl px-4 py-3.5">
                <span className="flex items-center gap-2.5 text-[0.92rem] font-medium">{on ? <Eye className="size-4 text-ink-3" /> : <EyeOff className="size-4 text-ink-4" />}{label}</span>
                <span className={cn("relative h-6 w-10 rounded-full", on ? "bg-ink" : "bg-line-strong")}>
                  <span className={cn("absolute top-0.5 size-5 rounded-full bg-surface shadow-sm", on ? "left-[18px]" : "left-0.5")} />
                </span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const FAQ = [
  ["Who is Code Compass for?", "Students who want to build — hackathon teams, side projects, research collaborations or early startup ideas. It started at Manipal University Jaipur and is open to students anywhere."],
  ["Is it free?", "Yes. Code Compass is a student-built project and free to use."],
  ["Who can see my profile?", "Only signed-in members. You can hide your profile from discovery at any time, and every contact method has its own visibility switch."],
  ["Do I need to connect my LinkedIn account?", "No. You just paste your LinkedIn profile URL if you want it shown. We don't connect to, import from or scrape LinkedIn."],
  ["I used Code Compass before. Is my account still there?", "Yes — existing accounts and profiles were carried over. Sign in with your usual email and password."],
];

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 py-24 sm:py-32">
      <div className="container-page grid gap-10 lg:grid-cols-[1fr_1.6fr]">
        <Reveal>
          <p className="eyebrow">FAQ</p>
          <h2 className="mt-4 text-h2">Questions, <span className="em">answered.</span></h2>
        </Reveal>
        <div className="divide-y divide-line border-y border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-md font-display text-[1.05rem] font-semibold tracking-tight">
                {q}
                <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line-strong text-ink-3 transition-transform group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed text-ink-3">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="pb-24 sm:pb-32">
      <div className="container-page">
        <Reveal>
          <div className="relative overflow-hidden rounded-[28px] bg-ink px-6 py-16 text-center text-canvas sm:px-12 sm:py-20">
            <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px]" aria-hidden />
            <UsersRound className="mx-auto size-7 text-needle" aria-hidden />
            <h2 className="relative mx-auto mt-5 max-w-2xl text-h1 !text-canvas">Stop building <span className="em">alone.</span></h2>
            <p className="relative mx-auto mt-4 max-w-lg text-[1.05rem] text-canvas/70">Your next great project starts with the right people. Set up your profile and see who's out there.</p>
            <div className="relative mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/sign-up" className={cn(buttonVariants({ size: "lg" }), "bg-canvas text-ink hover:bg-white")}>Create your profile <ArrowRight /></Link>
              <Link to="/sign-in" className={cn(buttonVariants({ size: "lg", variant: "ghost" }), "text-canvas/85 hover:bg-white/10 hover:text-canvas")}>I already have an account</Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="container-page flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Logo />
          <p className="mt-3 text-[0.85rem] text-ink-3">Find your people. Build something extraordinary.</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[0.86rem] text-ink-3" aria-label="Footer">
          <a href="#how" className="hover:text-ink">How it works</a>
          <a href="#privacy" className="hover:text-ink">Privacy</a>
          <a href="#faq" className="hover:text-ink">FAQ</a>
          <Link to="/sign-in" className="hover:text-ink">Sign in</Link>
        </nav>
      </div>
      <div className="container-page border-t border-line py-5 text-[0.8rem] text-ink-4">© {new Date().getFullYear()} Code Compass · Built by students, for students.</div>
    </footer>
  );
}

export default function Landing() {
  return (
    <div className="min-h-dvh">
      <PublicHeader />
      <main>
        <Hero />
        <UseCases />
        <HowItWorks />
        <Product />
        <Why />
        <Privacy />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
