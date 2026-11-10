import { CalendarClock, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import type { TeamSummary } from "@shared/api-types";
import { roleLabel, TEAM_STATUS } from "@shared/constants";
import { AvatarStack } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";
import { Tag } from "@/components/ui/tag";
import { cn, timeAgo } from "@/lib/utils";

export function TeamStatusTag({ status }: { status: TeamSummary["status"] }) {
  const label = TEAM_STATUS.find((s) => s.id === status)!.label;
  return <Tag tone={status === "recruiting" ? "moss" : status === "full" ? "amber" : "outline"}>{label}</Tag>;
}

const viewerLabel = { owner: "You own this", member: "You're a member", pending: "Request pending", none: null } as const;

export function TeamCard({ team: t }: { team: TeamSummary }) {
  const spots = Math.max(0, t.maxMembers - t.memberCount);
  return (
    <Card className="group relative flex h-full flex-col gap-4 p-5 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-[1.1rem] leading-snug font-semibold tracking-tight">
            <Link to={`/teams/${t.id}`} className="after:absolute after:inset-0 after:rounded-[var(--radius-card)] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-needle">
              {t.name}
            </Link>
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.82rem] text-ink-3">
            {t.hackathonName && <span className="inline-flex items-center gap-1"><Trophy className="size-3.5" aria-hidden />{t.hackathonName}</span>}
            {t.timeline && <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" aria-hidden />{t.timeline}</span>}
          </p>
        </div>
        <TeamStatusTag status={t.status} />
      </div>
      <p className="line-clamp-3 text-[0.9rem] leading-relaxed text-ink-2">{t.description}</p>
      {(t.neededRoles.length > 0 || t.neededSkills.length > 0) && (
        <div>
          <p className="mb-2 text-[0.76rem] font-medium tracking-wide text-ink-4 uppercase">Looking for</p>
          <ul className="flex flex-wrap gap-1.5">
            {t.neededRoles.map((r) => <li key={r}><Tag tone="accent">{roleLabel(r)}</Tag></li>)}
            {t.neededSkills.slice(0, 5).map((s) => <li key={s}><Tag>{s}</Tag></li>)}
          </ul>
        </div>
      )}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4">
        <div className="flex items-center gap-2.5">
          <AvatarStack people={t.members} />
          <span className="text-[0.82rem] text-ink-3">
            {t.memberCount}/{t.maxMembers}
            {t.status === "recruiting" && spots > 0 && ` · ${spots} open`}
          </span>
        </div>
        <span className={cn("text-[0.8rem]", viewerLabel[t.viewerState] ? "font-medium text-ink-2" : "text-ink-4")}>
          {viewerLabel[t.viewerState] ?? timeAgo(t.createdAt)}
        </span>
      </div>
    </Card>
  );
}

export function TeamCardSkeleton() {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <div className="flex gap-1.5"><Skeleton className="h-7 w-20 rounded-full" /><Skeleton className="h-7 w-16 rounded-full" /></div>
    </Card>
  );
}
