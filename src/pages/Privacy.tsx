import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Logo } from "@/components/app/Logo";
import { useConfig } from "@/lib/queries";

const UPDATED = "11 November 2026";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-8">
      <h2 className="text-h3">{title}</h2>
      <div className="mt-3 space-y-3 text-[0.98rem] leading-relaxed text-ink-2 [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5">{children}</div>
    </section>
  );
}

export default function Privacy() {
  const { data: config } = useConfig();
  return (
    <div className="min-h-dvh">
      <header className="container-page flex h-16 items-center justify-between">
        <Logo to="/" />
        <Link to="/" className="flex items-center gap-1.5 text-[0.86rem] text-ink-3 hover:text-ink"><ArrowLeft className="size-4" aria-hidden /> Home</Link>
      </header>
      <main className="container-page py-10 sm:py-16">
        <article className="mx-auto max-w-2xl space-y-8">
          <div>
            <p className="eyebrow">Privacy</p>
            <h1 className="mt-4 text-h1">Privacy <span className="em">policy</span></h1>
            <p className="mt-4 text-ink-3">
              Code Compass is a free, student-run side project for finding teammates. This page explains, in plain language, what we store,
              who can see it and how to remove it. Last updated {UPDATED}.
            </p>
          </div>

          <Section title="What we store">
            <ul>
              <li><b className="font-medium text-ink">Your account:</b> name, email address, and your password as a one-way hash (nobody, including us, can read your password).</li>
              <li><b className="font-medium text-ink">What you add to your profile:</b> college, graduation year, bio, skills, interests, roles, availability, projects, a profile photo, and any contact details you choose to add (WhatsApp, LinkedIn URL, X handle, GitHub, website).</li>
              <li><b className="font-medium text-ink">Teams:</b> teams you create, the members, join requests and the short notes sent with them, and a team's group-chat link.</li>
              <li><b className="font-medium text-ink">Sign-in records:</b> when you sign in, your session stores your IP address and browser type so it can be secured and you can sign out other devices. Short-lived counters (by IP address or account) limit repeated requests to stop abuse.</li>
            </ul>
            <p>We don't use advertising, analytics or tracking cookies, and we never sell or share your data with advertisers. The only cookies are the ones that keep you signed in.</p>
          </Section>

          <Section title="Who can see what">
            <ul>
              <li>Profiles, teams and photos are only visible to <b className="font-medium text-ink">signed-in members</b>. Nothing is public on the open web.</li>
              <li>Your profile appears in Discover once you've finished setting it up, unless you turn off “Show my profile in Discover”.</li>
              <li>Each contact detail has its own switch. A hidden detail is never sent to anyone else's browser — it isn't just hidden on screen. Your email is hidden unless you choose to show it.</li>
              <li>A team's group-chat link is shown only to its members. Join requests and their notes are shown only to the team owner.</li>
            </ul>
          </Section>

          <Section title="Emails we send">
            <p>
              Only emails about your account and your teams: confirming your address, resetting your password, profile-recovery codes, and
              team updates (someone asked to join your team, or you were accepted). Team updates go only to confirmed email addresses. No
              newsletters or marketing.
            </p>
          </Section>

          <Section title="Where your data lives">
            <p>
              The app runs on Vercel and the database is a Neon PostgreSQL database; both are hosted in Singapore. Emails are delivered
              through our email provider. These services process data only to run Code Compass.
            </p>
          </Section>

          <Section title="If you used the previous version">
            <p>
              Accounts from the earlier version of Code Compass were moved over with the same email and password. Your old profile details
              are filled back in when you next sign in, and you choose who can see your contact details before your profile appears in
              Discover. You can also choose “Start fresh” to remove them. A copy of the previous version's database is kept for a limited time
              as a safety backup.
            </p>
          </Section>

          <Section title="Your choices">
            <ul>
              <li>Edit or remove anything on your profile, hide contact details, or hide your whole profile from Discover at any time.</li>
              <li>
                Delete your account in <Link to="/settings" className="font-medium text-ink underline underline-offset-4">Settings</Link>. This immediately removes your account,
                profile, photo, the teams you own and your memberships. Encrypted database backups may still hold a copy for up to 30 days, after which it's gone.
              </li>
            </ul>
          </Section>

          <Section title="Contact">
            <p>
              Questions or requests about your data: reply to any email from Code Compass
              {config?.supportUrl ? (
                <>
                  {" "}or <a href={config.supportUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline underline-offset-4">contact the Code Compass team</a>
                </>
              ) : null}
              . If this policy changes in a way that matters, we'll update the date at the top.
            </p>
          </Section>
        </article>
      </main>
    </div>
  );
}
