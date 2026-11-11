import { ArrowLeft, ArrowUpRight, Lock, Sparkles, UserPen } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CONTACT_LABELS, roleLabel } from "@shared/constants";
import { AvailabilityBadge } from "@/components/app/Availability";
import { ContactLinks } from "@/components/app/Contacts";
import { metaLine } from "@/components/app/PersonCard";
import { TeamCard } from "@/components/app/TeamCard";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, PageSpinner } from "@/components/ui/states";
import { Tag } from "@/components/ui/tag";
import { ApiRequestError } from "@/lib/api";
import { usePerson } from "@/lib/queries";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-[0.78rem] font-medium tracking-wide text-ink-4 uppercase">{title}</h2>
      {children}
    </section>
  );
}

export default function Person() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: p, isPending, error, refetch } = usePerson(id);

  if (isPending) return <PageSpinner />;
  if (error)
    return (
      <div className="container-page py-16">
        {error instanceof ApiRequestError && error.status === 404 ? (
          <EmptyState icon={<Lock />} title="Profile not available" action={<Link to="/discover" className={buttonVariants({ variant: "secondary" })}>Back to discover</Link>}>
            This profile doesn't exist or its owner has hidden it.
          </EmptyState>
        ) : (
          <ErrorState error={error} onRetry={() => refetch()} />
        )}
      </div>
    );

  const m = p.match;
  return (
    <div className="container-page max-w-4xl py-8 sm:py-12">
      <button onClick={() => (history.length > 1 ? navigate(-1) : navigate("/discover"))} className="mb-6 inline-flex items-center gap-1.5 text-[0.88rem] text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> Back
      </button>

      {p.isSelf && (
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-line bg-subtle px-5 py-4 text-[0.9rem] text-ink-2 sm:flex-row sm:items-center sm:justify-between">
          <span>This is how other members see your profile. Hidden contact details aren't shown here either.</span>
          <Link to="/profile" className={buttonVariants({ variant: "secondary", size: "sm" })}><UserPen /> Edit profile</Link>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="h-24 bg-gradient-to-br from-subtle via-sunken to-needle-soft sm:h-28" aria-hidden />
        <div className="px-5 pb-7 sm:px-8">
          <div className="-mt-10 flex flex-col gap-4 sm:-mt-12 sm:flex-row sm:items-end sm:justify-between">
            <Avatar name={p.name} src={p.avatarUrl} size={96} className="ring-4 ring-surface" />
            <AvailabilityBadge value={p.availability} className="rounded-full border border-line bg-surface px-3 py-1.5" />
          </div>
          <h1 className="mt-4 text-h1">{p.name}</h1>
          <p className="mt-1.5 text-ink-3">{[metaLine(p), p.degree].filter(Boolean).join(" · ") || "Student"}</p>
          {p.roles.length > 0 && <p className="mt-3 font-medium text-ink-2">{p.roles.map(roleLabel).join(" · ")}</p>}
          {p.bio && <p className="mt-5 max-w-2xl text-[1rem] leading-relaxed whitespace-pre-line text-ink-2">{p.bio}</p>}

          {m && (m.sharedInterests.length > 0 || m.complementaryRoles.length > 0 || m.sharedSkills.length > 0) && (
            <div className="mt-6 rounded-xl border border-needle/20 bg-needle-soft/50 p-4 text-[0.9rem] text-ink-2">
              <p className="mb-1.5 flex items-center gap-1.5 font-medium text-needle-ink"><Sparkles className="size-4" /> Why you might work well together</p>
              <ul className="space-y-1">
                {m.sharedInterests.length > 0 && <li>You're both into {m.sharedInterests.join(", ")}.</li>}
                {m.complementaryRoles.length > 0 && <li>They cover {m.complementaryRoles.map(roleLabel).join(", ")} — {m.complementaryRoles.length === 1 ? "a role" : "roles"} you haven't listed.</li>}
                {m.sharedSkills.length > 0 && <li>You share {m.sharedSkills.slice(0, 4).join(", ")}, so you'll speak the same language.</li>}
              </ul>
            </div>
          )}

          <div className="mt-7 border-t border-line pt-6">
            <h2 className="mb-3 text-[0.78rem] font-medium tracking-wide text-ink-4 uppercase">Get in touch</h2>
            {p.contacts.length ? (
              <>
                <ContactLinks contacts={p.contacts} preferred={p.preferredContact} />
                {p.preferredContact && <p className="mt-3 text-[0.82rem] text-ink-3">Prefers {CONTACT_LABELS[p.preferredContact]}.</p>}
              </>
            ) : (
              <p className="text-[0.9rem] text-ink-3">{p.isSelf ? "You haven't made any contact details visible yet." : "No contact details are public. If they're on a team, you can request to join it."}</p>
            )}
          </div>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 md:grid-cols-[1.2fr_1fr]">
        <Card className="space-y-7 p-5 sm:p-7">
          <Section title="Skills">
            {p.skills.length ? <ul className="flex flex-wrap gap-1.5">{p.skills.map((s) => <li key={s}><Tag>{s}</Tag></li>)}</ul> : <p className="text-[0.9rem] text-ink-4">No skills listed.</p>}
          </Section>
          {p.interests.length > 0 && (
            <Section title="Interests">
              <ul className="flex flex-wrap gap-1.5">{p.interests.map((s) => <li key={s}><Tag tone="outline">{s}</Tag></li>)}</ul>
            </Section>
          )}
          {p.hackathonInterests.length > 0 && (
            <Section title="Hackathons they'd like to do">
              <ul className="flex flex-wrap gap-1.5">{p.hackathonInterests.map((s) => <li key={s}><Tag tone="accent">{s}</Tag></li>)}</ul>
            </Section>
          )}
        </Card>
        <Card className="p-5 sm:p-7">
          <Section title="Projects">
            {p.projects.length ? (
              <ul className="space-y-4">
                {p.projects.map((pr) => (
                  <li key={pr.title}>
                    {pr.url ? (
                      <a href={pr.url} target="_blank" rel="noopener noreferrer nofollow" className="group inline-flex items-center gap-1 font-medium hover:underline">
                        {pr.title} <ArrowUpRight className="size-3.5 text-ink-4 group-hover:text-ink" />
                      </a>
                    ) : (
                      <p className="font-medium">{pr.title}</p>
                    )}
                    {pr.description && <p className="mt-1 text-[0.88rem] leading-relaxed text-ink-3">{pr.description}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[0.9rem] text-ink-4">No projects added yet.</p>
            )}
          </Section>
        </Card>
      </div>

      {p.teams.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-h3">Teams {p.isSelf ? "you're running" : "they're running"}</h2>
          <div className="grid gap-4 sm:grid-cols-2">{p.teams.map((t) => <TeamCard key={t.id} team={t} />)}</div>
        </section>
      )}
    </div>
  );
}
