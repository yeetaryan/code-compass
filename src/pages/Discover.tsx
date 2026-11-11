import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AVAILABILITY, INTEREST_SUGGESTIONS, LIMITS, ROLES, SKILL_SUGGESTIONS, roleLabel } from "@shared/constants";
import { PersonCard, PersonCardSkeleton } from "@/components/app/PersonCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Tag, ToggleChip } from "@/components/ui/tag";
import { TagInput } from "@/components/ui/tag-input";
import { useMe, usePeople, usePopularTags, type PeopleFilters } from "@/lib/queries";
import { cn, plural } from "@/lib/utils";
import { GRAD_YEARS } from "./Onboarding";

const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters: PeopleFilters = useMemo(
    () => ({
      q: params.get("q") ?? undefined,
      skills: list(params.get("skills")),
      interests: list(params.get("interests")),
      roles: list(params.get("roles")),
      availability: params.get("availability") ?? undefined,
      graduationYear: params.get("graduationYear") ?? undefined,
      sort: (params.get("sort") as "match" | "recent") ?? "match",
      page: Number(params.get("page") ?? 1),
    }),
    [params],
  );
  const update = (patch: Partial<PeopleFilters>, keepPage = false) => {
    const next = { ...filters, ...patch, page: keepPage ? (patch.page ?? filters.page) : 1 };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
      if ((k === "page" && v === 1) || (k === "sort" && v === "match")) continue;
      p.set(k, Array.isArray(v) ? v.join(",") : String(v));
    }
    setParams(p, { replace: !keepPage });
  };
  return [filters, update] as const;
}

function FilterFields({ filters, update }: { filters: PeopleFilters; update: (p: Partial<PeopleFilters>) => void }) {
  const { data: popular } = usePopularTags();
  const skillSuggestions = useMemo(() => [...new Set([...(popular?.skills.map((s) => s.label) ?? []), ...SKILL_SUGGESTIONS])], [popular]);
  const interestSuggestions = useMemo(() => [...new Set([...(popular?.interests.map((s) => s.label) ?? []), ...INTEREST_SUGGESTIONS])], [popular]);
  return (
    <div className="space-y-5">
      <Field label="Must have skills" hint="Shows people who have all of these.">
        {(a) => <TagInput {...a} value={filters.skills ?? []} onChange={(skills) => update({ skills })} suggestions={skillSuggestions} max={10} placeholder="e.g. React" />}
      </Field>
      <Field label="Interested in" hint="Any of these.">
        {(a) => <TagInput {...a} value={filters.interests ?? []} onChange={(interests) => update({ interests })} suggestions={interestSuggestions} max={10} placeholder="e.g. AI/ML" />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Availability">
          {(a) => (
            <Select {...a} value={filters.availability ?? ""} onChange={(e) => update({ availability: e.target.value || undefined })}>
              <option value="">Anyone</option>
              {AVAILABILITY.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Graduation year">
          {(a) => (
            <Select {...a} value={filters.graduationYear ?? ""} onChange={(e) => update({ graduationYear: e.target.value || undefined })}>
              <option value="">Any year</option>
              {GRAD_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          )}
        </Field>
      </div>
    </div>
  );
}

export default function Discover() {
  const { data: me } = useMe();
  const [filters, update] = useFilters();
  const [q, setQ] = useState(filters.q ?? "");
  const { data, isPending, isFetching, error, refetch } = usePeople(filters);

  useEffect(() => {
    const t = setTimeout(() => {
      if ((filters.q ?? "") !== q.trim()) update({ q: q.trim() || undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const activeCount = (filters.skills?.length ?? 0) + (filters.interests?.length ?? 0) + (filters.availability ? 1 : 0) + (filters.graduationYear ? 1 : 0);
  const anyFilter = activeCount > 0 || !!filters.q || !!filters.roles?.length;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const clearAll = () => {
    setQ("");
    update({ q: undefined, skills: [], interests: [], roles: [], availability: undefined, graduationYear: undefined });
  };

  return (
    <div className="container-page py-8 sm:py-12">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-h1">Discover <span className="em">collaborators.</span></h1>
          <p className="mt-2 text-ink-3">{filters.sort === "match" ? "Ranked by shared interests and the skills and roles you don't have yet." : "Newest members first."}</p>
        </div>
        {me && me.profile.completeness < 70 && (
          <Link to="/profile" className="text-[0.86rem] text-ink-3 underline-offset-4 hover:text-ink hover:underline">
            Your profile is {me.profile.completeness}% complete — add more to get better matches →
          </Link>
        )}
      </div>

      <div className="sticky top-16 z-30 -mx-4 mt-7 border-b border-line bg-canvas/90 px-4 py-3 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:border sm:px-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-4" aria-hidden />
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, skill, interest or college" className="pl-10" aria-label="Search people" maxLength={80} />
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full border border-line-strong bg-surface p-1" role="radiogroup" aria-label="Sort">
              {(["match", "recent"] as const).map((s) => (
                <button key={s} role="radio" aria-checked={filters.sort === s} onClick={() => update({ sort: s })} className={cn("h-8 rounded-full px-3.5 text-[0.84rem] font-medium transition-colors", filters.sort === s ? "bg-ink text-canvas" : "text-ink-3 hover:text-ink")}>
                  {s === "match" ? "Best match" : "Newest"}
                </button>
              ))}
            </div>
            <Dialog>
              <DialogTrigger className={buttonVariants({ variant: "secondary", size: "md" })}>
                <SlidersHorizontal /> Filters{activeCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-ink text-[0.7rem] text-canvas">{activeCount}</span>}
              </DialogTrigger>
              <DialogContent title="Filters" description="Narrow down who you see.">
                <FilterFields filters={filters} update={update} />
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by role">
          {ROLES.map((r) => (
            <ToggleChip key={r.id} className="h-8 shrink-0 text-[0.8rem]" pressed={!!filters.roles?.includes(r.id)} onPressedChange={(on) => update({ roles: on ? [...(filters.roles ?? []), r.id] : filters.roles?.filter((x) => x !== r.id) })}>
              {r.label}
            </ToggleChip>
          ))}
        </div>
      </div>

      {anyFilter && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {filters.q && <Tag tone="outline" onRemove={() => { setQ(""); update({ q: undefined }); }}>“{filters.q}”</Tag>}
          {filters.roles?.map((r) => <Tag key={r} tone="outline" onRemove={() => update({ roles: filters.roles!.filter((x) => x !== r) })}>{roleLabel(r)}</Tag>)}
          {filters.skills?.map((s) => <Tag key={s} tone="outline" onRemove={() => update({ skills: filters.skills!.filter((x) => x !== s) })}>Skill: {s}</Tag>)}
          {filters.interests?.map((s) => <Tag key={s} tone="outline" onRemove={() => update({ interests: filters.interests!.filter((x) => x !== s) })}>Interest: {s}</Tag>)}
          {filters.availability && <Tag tone="outline" onRemove={() => update({ availability: undefined })}>{AVAILABILITY.find((a) => a.id === filters.availability)?.label}</Tag>}
          {filters.graduationYear && <Tag tone="outline" onRemove={() => update({ graduationYear: undefined })}>Class of {filters.graduationYear}</Tag>}
          <button onClick={clearAll} className="ml-1 inline-flex items-center gap-1 text-[0.82rem] text-ink-3 hover:text-ink"><X className="size-3.5" /> Clear all</button>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between text-[0.86rem] text-ink-3" aria-live="polite">
        <span>{data ? plural(data.total, "person", "people") : isPending ? "Loading…" : ""}</span>
        {isFetching && !isPending && <span>Updating…</span>}
      </div>

      <section className="mt-4" aria-busy={isPending}>
        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <PersonCardSkeleton key={i} />)}</div>
        ) : data.items.length === 0 ? (
          anyFilter ? (
            <EmptyState icon={<Search />} title="No one matches those filters" action={<Button variant="secondary" onClick={clearAll}>Clear filters</Button>}>
              Try fewer skills, a different role, or a broader search.
            </EmptyState>
          ) : (
            <EmptyState icon={<UsersRound />} title="You're early" action={<Link to="/teams/new" className={buttonVariants()}>Start a team</Link>}>
              No other profiles are discoverable yet. Post a team so people can find you as they join.
            </EmptyState>
          )
        ) : (
          <div className={cn("grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3", isFetching && "opacity-70")}>
            {data.items.map((p) => <PersonCard key={p.id} person={p} />)}
          </div>
        )}
      </section>

      {data && totalPages > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-3" aria-label="Pagination">
          <Button variant="secondary" size="sm" disabled={data.page <= 1} onClick={() => update({ page: data.page - 1 }, true)}><ChevronLeft /> Previous</Button>
          <span className="text-[0.86rem] text-ink-3">Page {data.page} of {totalPages}</span>
          <Button variant="secondary" size="sm" disabled={!data.hasMore} onClick={() => update({ page: data.page + 1 }, true)}>Next <ChevronRight /></Button>
        </nav>
      )}
      <p className="sr-only">Showing at most {LIMITS.pageSize} people per page.</p>
    </div>
  );
}
