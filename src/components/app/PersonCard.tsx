import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import type { PersonCard as P } from "@shared/api-types";
import { roleLabel } from "@shared/constants";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";
import { Tag } from "@/components/ui/tag";
import { AvailabilityBadge } from "./Availability";
import { ContactLinks } from "./Contacts";

export function metaLine(p: Pick<P, "college" | "graduationYear" | "yearOfStudy">) {
  return [p.college, p.graduationYear ? `Class of ${p.graduationYear}` : p.yearOfStudy].filter(Boolean).join(" · ");
}

function MatchLine({ match }: { match: P["match"] }) {
  if (!match) return null;
  const parts: string[] = [];
  if (match.sharedInterests.length) parts.push(`Shares ${match.sharedInterests.slice(0, 2).join(", ")}`);
  if (match.complementaryRoles.length) parts.push(`Covers ${match.complementaryRoles.slice(0, 2).map(roleLabel).join(", ")}`);
  if (!parts.length) return null;
  return (
    <p className="flex items-start gap-1.5 text-[0.8rem] leading-snug text-needle-ink">
      <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{parts.join(" · ")}</span>
    </p>
  );
}

export function PersonCard({ person: p }: { person: P }) {
  const extra = p.skills.length - 6;
  return (
    <Card className="group relative flex h-full flex-col gap-4 p-5 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md">
      <div className="flex items-start gap-3.5">
        <Avatar name={p.name} src={p.avatarUrl} size={48} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[1.05rem] font-semibold tracking-tight">
            <Link to={`/people/${p.id}`} className="after:absolute after:inset-0 after:rounded-[var(--radius-card)] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-needle">
              {p.name}
            </Link>
          </h3>
          {metaLine(p) && <p className="truncate text-[0.84rem] text-ink-3">{metaLine(p)}</p>}
          <AvailabilityBadge value={p.availability} short className="mt-1" />
        </div>
      </div>

      {p.roles.length > 0 && (
        <p className="text-[0.86rem] text-ink-2">
          {p.roles.map(roleLabel).join(" · ")}
        </p>
      )}

      {p.skills.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Skills">
          {p.skills.slice(0, 6).map((s) => (
            <li key={s}><Tag>{s}</Tag></li>
          ))}
          {extra > 0 && <li><Tag tone="outline">+{extra}</Tag></li>}
        </ul>
      )}

      <div className="mt-auto flex flex-col gap-3 pt-1">
        <MatchLine match={p.match} />
        {p.contacts.length > 0 && (
          <div className="relative z-10 border-t border-line pt-3">
            <ContactLinks contacts={p.contacts.filter((c) => ["linkedin", "x", "github"].includes(c.channel)).slice(0, 3)} preferred={p.preferredContact} compact />
          </div>
        )}
      </div>
    </Card>
  );
}

export function PersonCardSkeleton() {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-3.5">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-3 w-3/4" />
      <div className="flex gap-1.5">
        <Skeleton className="h-7 w-16 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-7 w-14 rounded-full" />
      </div>
    </Card>
  );
}
