import { ArrowLeft } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import type { TeamDetail } from "@shared/api-types";
import { LIMITS, ROLES, SKILL_SUGGESTIONS, TEAM_STATUS, type RoleId, type TeamStatus } from "@shared/constants";
import type { TeamInput } from "@shared/schemas";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState, PageSpinner } from "@/components/ui/states";
import { ToggleChip } from "@/components/ui/tag";
import { TagInput } from "@/components/ui/tag-input";
import { ApiRequestError } from "@/lib/api";
import { useCreateTeam, useTeam, useUpdateTeam } from "@/lib/queries";

type Form = { name: string; hackathonName: string; description: string; neededSkills: string[]; neededRoles: RoleId[]; timeline: string; maxMembers: number; contactLink: string; status: TeamStatus };

const fromTeam = (t?: TeamDetail): Form => ({
  name: t?.name ?? "",
  hackathonName: t?.hackathonName ?? "",
  description: t?.description ?? "",
  neededSkills: t?.neededSkills ?? [],
  neededRoles: t?.neededRoles ?? [],
  timeline: t?.timeline ?? "",
  maxMembers: t?.maxMembers ?? 4,
  contactLink: t?.contactLink ?? "",
  status: t?.status ?? "recruiting",
});

function Editor({ team }: { team?: TeamDetail }) {
  const navigate = useNavigate();
  const create = useCreateTeam();
  const update = useUpdateTeam(team?.id ?? "");
  const [f, setF] = useState<Form>(() => fromTeam(team));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((c) => ({ ...c, [k]: v }));
  const busy = create.isPending || update.isPending;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (f.name.trim().length < 2) errs.name = "Give your team a name";
    if (f.description.trim().length < 20) errs.description = "Describe the idea in at least 20 characters";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const input: TeamInput = { ...f, hackathonName: f.hackathonName || null, timeline: f.timeline || null, contactLink: f.contactLink || null };
    try {
      const res = team ? await update.mutateAsync(input) : await create.mutateAsync(input);
      if ("id" in res) {
        toast.success(team ? "Team updated" : "Team created — share it with people you'd like to join");
        navigate(`/teams/${res.id}`, { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiRequestError && err.fields) setErrors(err.fields);
      toast.error(err instanceof Error ? err.message : "Couldn't save the team");
    }
  }

  return (
    <form onSubmit={submit} className="container-page max-w-3xl py-8 sm:py-12" noValidate>
      <Link to={team ? `/teams/${team.id}` : "/teams"} className="mb-6 inline-flex items-center gap-1.5 text-[0.88rem] text-ink-3 hover:text-ink"><ArrowLeft className="size-4" /> {team ? "Back to team" : "All teams"}</Link>
      <h1 className="text-h1">{team ? <>Edit <span className="em">team.</span></> : <>Start a <span className="em">team.</span></>}</h1>
      <p className="mt-2 text-ink-3">Clear roles and a specific idea get the best responses.</p>
      <div className="mt-8 space-y-5">
        <SectionCard title="The idea">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Team name" error={errors.name} className="sm:col-span-2">{(a) => <Input {...a} value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={LIMITS.teamName} placeholder="e.g. Campus Commute" />}</Field>
            <Field label="Hackathon or event" optional error={errors.hackathonName}>{(a) => <Input {...a} value={f.hackathonName} onChange={(e) => set("hackathonName", e.target.value)} maxLength={120} placeholder="e.g. Smart India Hackathon 2026" />}</Field>
            <Field label="Timeline" optional error={errors.timeline}>{(a) => <Input {...a} value={f.timeline} onChange={(e) => set("timeline", e.target.value)} maxLength={80} placeholder="e.g. 48 hours, through March" />}</Field>
            <Field label="Description" error={errors.description} className="sm:col-span-2" hint={`${f.description.length}/${LIMITS.teamDescription} · What are you building, what's done, and what kind of teammate are you looking for?`}>
              {(a) => <Textarea {...a} value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={LIMITS.teamDescription} className="min-h-36" />}
            </Field>
          </div>
        </SectionCard>
        <SectionCard title="Who you need">
          <div className="space-y-6">
            <fieldset>
              <legend className="text-[0.86rem] font-medium">Open roles <span className="font-normal text-ink-4">· up to {LIMITS.roles}</span></legend>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {ROLES.map((r) => (
                  <ToggleChip key={r.id} pressed={f.neededRoles.includes(r.id)} onPressedChange={(on) => set("neededRoles", on ? (f.neededRoles.length < LIMITS.roles ? [...f.neededRoles, r.id] : f.neededRoles) : f.neededRoles.filter((x) => x !== r.id))}>
                    {r.label}
                  </ToggleChip>
                ))}
              </div>
            </fieldset>
            <Field label="Skills that would help" optional error={errors.neededSkills}>{(a) => <TagInput {...a} value={f.neededSkills} onChange={(v) => set("neededSkills", v)} suggestions={SKILL_SUGGESTIONS} max={LIMITS.skills} placeholder="Figma, Flutter…" />}</Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Team size (including you)" error={errors.maxMembers}>
                {(a) => (
                  <Select {...a} value={f.maxMembers} onChange={(e) => set("maxMembers", Number(e.target.value))}>
                    {Array.from({ length: LIMITS.teamMaxMembers - 1 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n} people</option>)}
                  </Select>
                )}
              </Field>
              {team && (
                <Field label="Status">
                  {(a) => (
                    <Select {...a} value={f.status} onChange={(e) => set("status", e.target.value as TeamStatus)}>
                      {TEAM_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </Select>
                  )}
                </Field>
              )}
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Group chat" description="Only shared with people you accept onto the team.">
          <Field label="Group link" optional error={errors.contactLink} hint="WhatsApp, Discord, Telegram or Slack invite — must start with https://">
            {(a) => <Input {...a} type="url" inputMode="url" value={f.contactLink} onChange={(e) => set("contactLink", e.target.value)} placeholder="https://chat.whatsapp.com/…" />}
          </Field>
        </SectionCard>
      </div>
      <div className="mt-8 flex justify-end gap-3">
        <Link to={team ? `/teams/${team.id}` : "/teams"} className="inline-flex h-12 items-center px-4 text-[0.9rem] text-ink-3 hover:text-ink">Cancel</Link>
        <Button type="submit" size="lg" loading={busy}>{team ? "Save changes" : "Create team"}</Button>
      </div>
    </form>
  );
}

export default function TeamEditor() {
  const { id } = useParams();
  const { data, isPending, error } = useTeam(id ?? "");
  if (!id) return <Editor />;
  if (isPending) return <PageSpinner />;
  if (error || data.viewerState !== "owner")
    return <div className="container-page py-16"><EmptyState title="You can't edit this team">Only the team owner can make changes.</EmptyState></div>;
  return <Editor team={data} />;
}
