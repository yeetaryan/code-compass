import { ChevronLeft, ChevronRight, Plus, Search, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { TeamCard, TeamCardSkeleton } from "@/components/app/TeamCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useMe, useTeams } from "@/lib/queries";
import { cn, plural } from "@/lib/utils";

export default function Teams() {
  const { data: me } = useMe();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "mine" ? "mine" : "open";
  const page = Number(params.get("page") ?? 1);
  const urlQ = params.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  const { data, isPending, error, refetch, isFetching } = useTeams({ q: urlQ || undefined, mine: tab === "mine" ? "1" : undefined, page });

  const setParam = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!("page" in patch)) p.delete("page");
    setParams(p, { replace: true });
  };
  useEffect(() => {
    const t = setTimeout(() => q.trim() !== urlQ && setParam({ q: q.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const pending = me?.pendingRequestsToReview ?? 0;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="container-page py-8 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-h1">Teams <span className="em">forming.</span></h1>
          <p className="mt-2 text-ink-3">Join a team that needs what you do — or start one and recruit the roles you're missing.</p>
        </div>
        <Link to="/teams/new" className={buttonVariants()}><Plus /> Start a team</Link>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex self-start rounded-full border border-line-strong bg-surface p-1" role="tablist" aria-label="Team lists">
          {(["open", "mine"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setParam({ tab: t === "mine" ? "mine" : null })} className={cn("h-8 rounded-full px-4 text-[0.85rem] font-medium transition-colors", tab === t ? "bg-ink text-canvas" : "text-ink-3 hover:text-ink")}>
              {t === "open" ? "Open teams" : "My teams"}
              {t === "mine" && pending > 0 && <span className="ml-1.5 rounded-full bg-needle px-1.5 text-[0.7rem] text-white">{pending}</span>}
            </button>
          ))}
        </div>
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-4" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teams or hackathons" className="pl-10" aria-label="Search teams" maxLength={80} />
        </div>
      </div>

      {pending > 0 && tab === "mine" && (
        <p className="mt-4 rounded-xl border border-needle/20 bg-needle-soft/60 px-4 py-3 text-[0.9rem] text-needle-ink">
          {plural(pending, "person is", "people are")} waiting for your answer. Open your team to review requests.
        </p>
      )}

      <div className="mt-6 text-[0.86rem] text-ink-3" aria-live="polite">{data ? plural(data.total, "team") : ""}</div>
      <section className="mt-4">
        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <TeamCardSkeleton key={i} />)}</div>
        ) : data.items.length === 0 ? (
          urlQ ? (
            <EmptyState icon={<Search />} title="No teams match that search" action={<Button variant="secondary" onClick={() => { setQ(""); setParam({ q: null }); }}>Clear search</Button>} />
          ) : (
            <EmptyState icon={<UsersRound />} title={tab === "mine" ? "You're not on a team yet" : "No teams are recruiting right now"} action={<Link to="/teams/new" className={buttonVariants()}><Plus /> Start the first one</Link>}>
              {tab === "mine" ? "Start a team for your next hackathon or project, or request to join an open one." : "Be the one who gets things going — post your idea and the roles you need."}
            </EmptyState>
          )
        ) : (
          <div className={cn("grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3", isFetching && "opacity-70")}>{data.items.map((t) => <TeamCard key={t.id} team={t} />)}</div>
        )}
      </section>
      {data && totalPages > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-3" aria-label="Pagination">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}><ChevronLeft /> Previous</Button>
          <span className="text-[0.86rem] text-ink-3">Page {page} of {totalPages}</span>
          <Button variant="secondary" size="sm" disabled={!data.hasMore} onClick={() => setParam({ page: String(page + 1) })}>Next <ChevronRight /></Button>
        </nav>
      )}
    </div>
  );
}
