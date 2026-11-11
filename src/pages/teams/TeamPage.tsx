import { ArrowLeft, ArrowUpRight, CalendarClock, Check, Lock, MessageCircle, Pencil, Trash2, Trophy, UserMinus, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import type { TeamDetail } from "@shared/api-types";
import { roleLabel } from "@shared/constants";
import { metaLine } from "@/components/app/PersonCard";
import { TeamStatusTag } from "@/components/app/TeamCard";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { EmptyState, ErrorState, PageSpinner } from "@/components/ui/states";
import { Tag } from "@/components/ui/tag";
import { ApiRequestError } from "@/lib/api";
import { useDecide, useDeleteTeam, useLeave, useMe, useRemoveMember, useRequestJoin, useTeam, useWithdraw } from "@/lib/queries";
import { LIMITS } from "@shared/constants";
import { timeAgo } from "@/lib/utils";

const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");

function JoinPanel({ t }: { t: TeamDetail }) {
  const join = useRequestJoin(t.id);
  const withdraw = useWithdraw(t.id);
  const leave = useLeave(t.id);
  const navigate = useNavigate();
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const spots = t.maxMembers - t.memberCount;

  if (t.viewerState === "owner") return null;
  if (t.viewerState === "member")
    return (
      <Card className="p-5">
        <p className="flex items-center gap-2 font-medium"><Check className="size-4 text-moss" /> You're on this team</p>
        {t.contactLink && (
          <a href={t.contactLink} target="_blank" rel="noopener noreferrer nofollow" className={buttonVariants({ className: "mt-4 w-full" })}>
            <MessageCircle /> Open group chat <ArrowUpRight />
          </a>
        )}
        <Dialog>
          <DialogTrigger asChild><Button variant="ghost" size="sm" className="mt-3 w-full">Leave team</Button></DialogTrigger>
          <DialogContent title="Leave this team?" description="You can ask to join again later if there's space.">
            <div className="flex justify-end gap-2">
              <DialogClose asChild><Button variant="ghost">Stay</Button></DialogClose>
              <Button variant="danger" loading={leave.isPending} onClick={() => leave.mutateAsync(undefined).then(() => { toast("You left the team"); navigate("/teams"); }, fail)}>Leave team</Button>
            </div>
          </DialogContent>
        </Dialog>
      </Card>
    );
  if (t.viewerState === "pending")
    return (
      <Card className="p-5">
        <p className="font-medium">Request sent</p>
        <p className="mt-1 text-[0.88rem] text-ink-3">{t.owner.name} will see it on their team page. Sent {t.viewerRequest ? timeAgo(t.viewerRequest.createdAt) : "recently"}.</p>
        <Button variant="secondary" size="sm" className="mt-4 w-full" loading={withdraw.isPending} onClick={() => withdraw.mutateAsync(undefined).then(() => toast("Request withdrawn"), fail)}>Withdraw request</Button>
      </Card>
    );
  if (t.status !== "recruiting" || spots <= 0)
    return <Card className="p-5"><p className="font-medium">Not taking requests</p><p className="mt-1 text-[0.88rem] text-ink-3">{t.status === "closed" ? "This team is closed." : "This team is full right now."}</p></Card>;
  return (
    <Card className="p-5">
      <p className="font-medium">{spots === 1 ? "1 spot open" : `${spots} spots open`}</p>
      <p className="mt-1 text-[0.88rem] text-ink-3">Tell {t.owner.name.split(" ")[0]} what you'd bring. They'll see your profile with your request.</p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button className="mt-4 w-full">Ask to join</Button></DialogTrigger>
        <DialogContent title={`Ask to join ${t.name}`} description="A short note goes a long way.">
          <form onSubmit={(e) => { e.preventDefault(); join.mutateAsync(msg.trim()).then(() => { setOpen(false); toast.success("Request sent"); }, fail); }} className="space-y-4">
            <Field label="Message" optional hint={`${msg.length}/${LIMITS.joinMessage}`}>
              {(a) => <Textarea {...a} value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={LIMITS.joinMessage} placeholder="Hi! I've built two Flutter apps and would love to take the mobile side…" />}
            </Field>
            <Button type="submit" className="w-full" loading={join.isPending}>Send request</Button>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function OwnerPanel({ t }: { t: TeamDetail }) {
  const decide = useDecide(t.id);
  const del = useDeleteTeam(t.id);
  const navigate = useNavigate();
  if (t.viewerState !== "owner") return null;
  const reqs = t.pendingRequests ?? [];
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex gap-2">
          <Link to={`/teams/${t.id}/edit`} className={buttonVariants({ variant: "secondary", size: "sm", className: "flex-1" })}><Pencil /> Edit team</Link>
          <Dialog>
            <DialogTrigger asChild><Button variant="ghost" size="sm" aria-label="Delete team"><Trash2 /></Button></DialogTrigger>
            <DialogContent title="Delete this team?" description="Members lose access to the team page and group link. This can't be undone.">
              <div className="flex justify-end gap-2">
                <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                <Button variant="danger" loading={del.isPending} onClick={() => del.mutateAsync(undefined).then(() => { toast("Team deleted"); navigate("/teams?tab=mine"); }, fail)}>Delete team</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        {t.contactLink ? (
          <a href={t.contactLink} target="_blank" rel="noopener noreferrer nofollow" className="mt-4 flex items-center gap-2 text-[0.86rem] text-ink-3 hover:text-ink"><Lock className="size-3.5" /> Group link shared with members only <ArrowUpRight className="size-3.5" /></a>
        ) : (
          <p className="mt-4 text-[0.86rem] text-ink-3">Add a group chat link so new members know where to go.</p>
        )}
      </Card>
      <Card className="p-5">
        <h2 className="font-display font-semibold">Requests {reqs.length > 0 && <span className="ml-1 rounded-full bg-needle px-2 py-0.5 text-[0.72rem] text-white">{reqs.length}</span>}</h2>
        {reqs.length === 0 ? (
          <p className="mt-2 text-[0.88rem] text-ink-3">No pending requests. Share the team page with people you'd like to invite.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {reqs.map((r) => (
              <li key={r.id} className="rounded-xl border border-line p-3.5">
                <Link to={`/people/${r.person.id}`} className="flex items-center gap-3 hover:underline">
                  <Avatar name={r.person.name} src={r.person.avatarUrl} size={36} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.person.name}</span>
                    <span className="block truncate text-[0.78rem] text-ink-3">{r.person.roles.map(roleLabel).join(" · ") || metaLine(r.person)}</span>
                  </span>
                </Link>
                {r.message && <p className="mt-2.5 text-[0.86rem] leading-relaxed whitespace-pre-line text-ink-2">“{r.message}”</p>}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" className="flex-1" loading={decide.isPending && decide.variables?.requestId === r.id && decide.variables.decision === "accept"} onClick={() => decide.mutateAsync({ requestId: r.id, decision: "accept" }).then(() => toast.success(`${r.person.name} joined the team`), fail)}><Check /> Accept</Button>
                  <Button size="sm" variant="secondary" className="flex-1" onClick={() => decide.mutateAsync({ requestId: r.id, decision: "decline" }).then(() => toast("Request declined"), fail)}><X /> Decline</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function TeamPage() {
  const { id = "" } = useParams();
  const { data: me } = useMe();
  const { data: t, isPending, error, refetch } = useTeam(id);
  const remove = useRemoveMember(id);

  if (isPending) return <PageSpinner />;
  if (error)
    return (
      <div className="container-page py-16">
        {error instanceof ApiRequestError && error.status === 404 ? (
          <EmptyState title="Team not found" action={<Link to="/teams" className={buttonVariants({ variant: "secondary" })}>All teams</Link>}>It may have been deleted by its owner.</EmptyState>
        ) : (
          <ErrorState error={error} onRetry={() => refetch()} />
        )}
      </div>
    );

  return (
    <div className="container-page py-8 sm:py-12">
      <Link to="/teams" className="mb-6 inline-flex items-center gap-1.5 text-[0.88rem] text-ink-3 hover:text-ink"><ArrowLeft className="size-4" /> All teams</Link>
      {/* DOM order = mobile order (idea → actions → members); on desktop the actions sit in a sticky side column */}
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
          <Card className="p-5 sm:p-8 lg:col-start-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-h1">{t.name}</h1>
              <TeamStatusTag status={t.status} />
            </div>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.9rem] text-ink-3">
              {t.hackathonName && <span className="inline-flex items-center gap-1.5"><Trophy className="size-4" />{t.hackathonName}</span>}
              {t.timeline && <span className="inline-flex items-center gap-1.5"><CalendarClock className="size-4" />{t.timeline}</span>}
              <span>Posted {timeAgo(t.createdAt)}</span>
            </p>
            <p className="mt-6 text-[1rem] leading-relaxed whitespace-pre-line text-ink-2">{t.description}</p>
            {(t.neededRoles.length > 0 || t.neededSkills.length > 0) && (
              <div className="mt-7 border-t border-line pt-6">
                <h2 className="mb-3 text-[0.78rem] font-medium tracking-wide text-ink-4 uppercase">Looking for</h2>
                <ul className="flex flex-wrap gap-1.5">
                  {t.neededRoles.map((r) => <li key={r}><Tag tone="accent">{roleLabel(r)}</Tag></li>)}
                  {t.neededSkills.map((s) => <li key={s}><Tag>{s}</Tag></li>)}
                </ul>
              </div>
            )}
          </Card>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <JoinPanel t={t} />
          <OwnerPanel t={t} />
        </aside>

          <Card className="p-5 sm:p-8 lg:col-start-1">
            <h2 className="text-h3">Members <span className="text-ink-4">· {t.memberCount}/{t.maxMembers}</span></h2>
            <ul className="mt-5 divide-y divide-line">
              {t.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
                  <Link to={`/people/${m.id}`} className="flex min-w-0 items-center gap-3 hover:underline">
                    <Avatar name={m.name} src={m.avatarUrl} size={40} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{m.name}{m.id === me?.user.id && " (you)"}</span>
                      <span className="block truncate text-[0.8rem] text-ink-3">{m.role === "owner" ? "Owner" : m.roles.map(roleLabel).join(" · ") || m.skills.slice(0, 3).join(", ")}</span>
                    </span>
                  </Link>
                  {t.viewerState === "owner" && m.role !== "owner" && (
                    <Dialog>
                      <DialogTrigger asChild><Button variant="ghost" size="sm" aria-label={`Remove ${m.name}`}><UserMinus /></Button></DialogTrigger>
                      <DialogContent title={`Remove ${m.name}?`} description="They'll lose access to the group link shown on this page.">
                        <div className="flex justify-end gap-2">
                          <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                          <DialogClose asChild><Button variant="danger" onClick={() => remove.mutateAsync(m.id).then(() => toast(`${m.name} was removed`), fail)}>Remove</Button></DialogClose>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </li>
              ))}
            </ul>
          </Card>
      </div>
    </div>
  );
}
