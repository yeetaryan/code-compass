import { AtSign, BriefcaseBusiness, Camera, FolderGit2, Globe, Mail, MessageCircle, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { MyProfile, Project } from "@shared/api-types";
import { AVAILABILITY, CONTACT_LABELS, INTEREST_SUGGESTIONS, LIMITS, ROLES, SKILL_SUGGESTIONS, type ContactChannel, type RoleId } from "@shared/constants";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { ToggleChip } from "@/components/ui/tag";
import { TagInput } from "@/components/ui/tag-input";
import { ApiRequestError } from "@/lib/api";
import { useAvatar, useMe, useSaveProfile } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { GRAD_YEARS } from "./Onboarding";

type Form = Omit<MyProfile, "onboarded" | "avatarUrl" | "completeness" | "yearOfStudy">;

const toForm = (p: MyProfile): Form => {
  const { onboarded: _o, avatarUrl: _a, completeness: _c, yearOfStudy: _y, ...rest } = p;
  return rest;
};

/** Center-crop and downscale to a ≤512px square, preferring WebP, staying under the 300 KB API limit. */
async function prepareAvatar(file: File): Promise<Blob> {
  if (!/^image\/(png|jpe?g|webp|gif|heic|heif)$/i.test(file.type)) throw new Error("Choose a JPEG, PNG or WebP image");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("That image couldn't be read"));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const size = Math.min(512, side);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    const toBlob = (type: string, q: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
    for (const [type, q] of [["image/webp", 0.85], ["image/jpeg", 0.85], ["image/jpeg", 0.7]] as const) {
      const b = await toBlob(type, q);
      if (b && b.type === type && b.size <= LIMITS.avatarBytes) return b;
    }
    throw new Error("That image is too large even after compressing");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ContactRow({ icon, label, visible, onVisible, children, disabled }: { icon: ReactNode; label: string; visible: boolean; onVisible: (v: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <div className="grid gap-3 border-b border-line py-4 last:border-0 sm:grid-cols-[10rem_1fr_auto] sm:items-center">
      <span className="flex items-center gap-2 text-[0.9rem] font-medium [&_svg]:size-4 [&_svg]:text-ink-3">{icon}{label}</span>
      <div className="min-w-0">{children}</div>
      <label className={cn("flex items-center gap-2.5 text-[0.84rem] text-ink-3", disabled && "opacity-50")}>
        <Switch checked={visible && !disabled} onCheckedChange={onVisible} disabled={disabled} aria-label={`Show ${label} to members`} />
        <span className="w-12">{visible && !disabled ? "Shown" : "Hidden"}</span>
      </label>
    </div>
  );
}

export default function EditProfile() {
  const { data: me } = useMe();
  const save = useSaveProfile();
  const avatar = useAvatar();
  const fileRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState<Form>(() => toForm(me!.profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const initial = useMemo(() => JSON.stringify(toForm(me!.profile)), [me]);
  const dirty = JSON.stringify(f) !== initial;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((cur) => ({ ...cur, [k]: v }));
  const setVis = (k: ContactChannel, v: boolean) => setF((cur) => ({ ...cur, visibility: { ...cur.visibility, [k]: v } }));

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const filled: Record<ContactChannel, boolean> = { email: true, whatsapp: !!f.whatsapp, linkedin: !!f.linkedinUrl, x: !!f.xHandle, github: !!f.githubUsername, website: !!f.websiteUrl };
  const preferredOptions = (Object.keys(CONTACT_LABELS) as ContactChannel[]).filter((c) => filled[c] && f.visibility[c]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    const payload = { ...f, preferredContact: f.preferredContact && preferredOptions.includes(f.preferredContact) ? f.preferredContact : null };
    try {
      const res = await save.mutateAsync(payload);
      setF(toForm(res.profile));
      toast.success(res.profile.onboarded ? "Profile saved" : "Saved — add a skill or role to appear in discovery");
    } catch (err) {
      if (err instanceof ApiRequestError && err.fields) {
        setErrors(err.fields);
        const first = Object.keys(err.fields)[0];
        document.querySelector(`[data-field="${first.split(".")[0]}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    }
  }

  async function onFile(file?: File) {
    if (!file) return;
    try {
      const blob = await prepareAvatar(file);
      await avatar.mutateAsync(blob);
      toast.success("Photo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const updateProject = (i: number, patch: Partial<Project>) => set("projects", f.projects.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <form onSubmit={submit} className="container-page max-w-3xl py-8 pb-32 sm:py-12" noValidate>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-h1">Your <span className="em">profile.</span></h1>
          <p className="mt-2 text-ink-3">{me!.profile.completeness}% complete · Only signed-in members can see it.</p>
        </div>
        <Link to={`/people/${me!.user.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Preview as others see it</Link>
      </div>

      <div className="mt-8 space-y-5">
        <SectionCard title="Photo" description="A clear photo of your face helps people recognise you at events.">
          <div className="flex items-center gap-5">
            <Avatar name={f.name || "?"} src={me!.profile.avatarUrl} size={80} />
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" id="avatar-file" onChange={(e) => onFile(e.target.files?.[0])} />
              <Button type="button" variant="secondary" size="sm" loading={avatar.isPending} onClick={() => fileRef.current?.click()}><Camera /> {me!.profile.avatarUrl ? "Change photo" : "Upload photo"}</Button>
              {me!.profile.avatarUrl && <Button type="button" variant="ghost" size="sm" onClick={() => avatar.mutate(null)}><Trash2 /> Remove</Button>}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="About you">
          <div className="grid gap-5 sm:grid-cols-2">
            <div data-field="name" className="sm:col-span-2"><Field label="Full name" error={errors.name}>{(a) => <Input {...a} value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={LIMITS.name} />}</Field></div>
            <div data-field="bio" className="sm:col-span-2">
              <Field label="Short bio" optional error={errors.bio} hint={`${(f.bio ?? "").length}/${LIMITS.bio} · What do you like building? What are you looking for?`}>
                {(a) => <Textarea {...a} value={f.bio ?? ""} onChange={(e) => set("bio", e.target.value)} maxLength={LIMITS.bio} placeholder="e.g. Backend-leaning full-stack dev. Looking for a designer and an ML person for HackMUJ." />}
              </Field>
            </div>
            <Field label="College or university" optional error={errors.college}>{(a) => <Input {...a} value={f.college ?? ""} onChange={(e) => set("college", e.target.value)} maxLength={LIMITS.college} />}</Field>
            <Field label="Degree / course" optional error={errors.degree}>{(a) => <Input {...a} value={f.degree ?? ""} onChange={(e) => set("degree", e.target.value)} placeholder="e.g. B.Tech IT" maxLength={LIMITS.degree} />}</Field>
            <Field label="Graduation year" optional error={errors.graduationYear} hint={me!.profile.yearOfStudy && !f.graduationYear ? `Previously: "${me!.profile.yearOfStudy}"` : undefined}>
              {(a) => (
                <Select {...a} value={f.graduationYear ?? ""} onChange={(e) => set("graduationYear", e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Select a year</option>
                  {GRAD_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Availability">
              {(a) => (
                <Select {...a} value={f.availability} onChange={(e) => set("availability", e.target.value as Form["availability"])}>
                  {AVAILABILITY.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </Select>
              )}
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Skills and interests" description="Used for search, filters and best-match ranking.">
          <div className="space-y-6">
            <div data-field="skills"><Field label="Skills" error={errors.skills}>{(a) => <TagInput {...a} value={f.skills} onChange={(v) => set("skills", v)} suggestions={SKILL_SUGGESTIONS} max={LIMITS.skills} placeholder="React, Python, Figma…" />}</Field></div>
            <fieldset data-field="roles">
              <legend className="text-[0.86rem] font-medium">Roles you enjoy <span className="font-normal text-ink-4">· up to {LIMITS.roles}</span></legend>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {ROLES.map((r) => (
                  <ToggleChip key={r.id} pressed={f.roles.includes(r.id)} onPressedChange={(on) => set("roles", on ? (f.roles.length < LIMITS.roles ? [...f.roles, r.id] : f.roles) : f.roles.filter((x: RoleId) => x !== r.id))}>
                    {r.label}
                  </ToggleChip>
                ))}
              </div>
              {errors.roles && <p className="mt-2 text-[0.8rem] text-danger">{errors.roles}</p>}
            </fieldset>
            <div data-field="interests"><Field label="Interests" optional error={errors.interests}>{(a) => <TagInput {...a} value={f.interests} onChange={(v) => set("interests", v)} suggestions={INTEREST_SUGGESTIONS} max={LIMITS.interests} placeholder="AI/ML, FinTech, Robotics…" />}</Field></div>
            <div data-field="hackathonInterests"><Field label="Hackathons you'd like to do" optional error={errors.hackathonInterests}>{(a) => <TagInput {...a} value={f.hackathonInterests} onChange={(v) => set("hackathonInterests", v)} max={LIMITS.hackathons} placeholder="Smart India Hackathon, HackMUJ…" />}</Field></div>
          </div>
        </SectionCard>

        <SectionCard
          title="Projects"
          description="Things you've built or are building."
          action={f.projects.length < LIMITS.projects && <Button type="button" variant="secondary" size="sm" onClick={() => set("projects", [...f.projects, { title: "", url: null, description: null }])}><Plus /> Add</Button>}
        >
          {f.projects.length === 0 ? (
            <p className="text-[0.9rem] text-ink-3">No projects yet. Add one to show what you can do.</p>
          ) : (
            <ul className="space-y-4" data-field="projects">
              {f.projects.map((p, i) => (
                <li key={i} className="space-y-3 rounded-xl border border-line bg-canvas p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Title" error={errors[`projects.${i}.title`]}>{(a) => <Input {...a} value={p.title} onChange={(e) => updateProject(i, { title: e.target.value })} maxLength={LIMITS.projectTitle} />}</Field>
                    <Field label="Link" optional error={errors[`projects.${i}.url`]}>{(a) => <Input {...a} type="url" inputMode="url" value={p.url ?? ""} onChange={(e) => updateProject(i, { url: e.target.value || null })} placeholder="https://github.com/…" />}</Field>
                  </div>
                  <Field label="One-line description" optional>{(a) => <Input {...a} value={p.description ?? ""} onChange={(e) => updateProject(i, { description: e.target.value || null })} maxLength={LIMITS.projectDescription} />}</Field>
                  <Button type="button" variant="ghost" size="sm" onClick={() => set("projects", f.projects.filter((_, j) => j !== i))}><Trash2 /> Remove project</Button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Links and contact" description="Each one is optional and has its own switch. Hidden details are never sent to other members.">
          <div>
            <div data-field="linkedinUrl">
              <ContactRow icon={<BriefcaseBusiness />} label="LinkedIn" visible={f.visibility.linkedin} onVisible={(v) => setVis("linkedin", v)} disabled={!f.linkedinUrl}>
                <Field label={<span className="sr-only">LinkedIn URL</span>} error={errors.linkedinUrl}>{(a) => <Input {...a} type="url" inputMode="url" value={f.linkedinUrl ?? ""} onChange={(e) => set("linkedinUrl", e.target.value || null)} placeholder="linkedin.com/in/your-name" />}</Field>
              </ContactRow>
            </div>
            <div data-field="xHandle">
              <ContactRow icon={<AtSign />} label="X" visible={f.visibility.x} onVisible={(v) => setVis("x", v)} disabled={!f.xHandle}>
                <Field label={<span className="sr-only">X handle</span>} error={errors.xHandle}>{(a) => <Input {...a} value={f.xHandle ?? ""} onChange={(e) => set("xHandle", e.target.value || null)} placeholder="@handle" />}</Field>
              </ContactRow>
            </div>
            <div data-field="githubUsername">
              <ContactRow icon={<FolderGit2 />} label="GitHub" visible={f.visibility.github} onVisible={(v) => setVis("github", v)} disabled={!f.githubUsername}>
                <Field label={<span className="sr-only">GitHub username</span>} error={errors.githubUsername}>{(a) => <Input {...a} value={f.githubUsername ?? ""} onChange={(e) => set("githubUsername", e.target.value || null)} placeholder="username" />}</Field>
              </ContactRow>
            </div>
            <div data-field="websiteUrl">
              <ContactRow icon={<Globe />} label="Website" visible={f.visibility.website} onVisible={(v) => setVis("website", v)} disabled={!f.websiteUrl}>
                <Field label={<span className="sr-only">Website URL</span>} error={errors.websiteUrl}>{(a) => <Input {...a} type="url" inputMode="url" value={f.websiteUrl ?? ""} onChange={(e) => set("websiteUrl", e.target.value || null)} placeholder="https://your-portfolio.dev" />}</Field>
              </ContactRow>
            </div>
            <div data-field="whatsapp">
              <ContactRow icon={<MessageCircle />} label="WhatsApp" visible={f.visibility.whatsapp} onVisible={(v) => setVis("whatsapp", v)} disabled={!f.whatsapp}>
                <Field label={<span className="sr-only">WhatsApp number</span>} error={errors.whatsapp}>{(a) => <Input {...a} type="tel" inputMode="tel" value={f.whatsapp ?? ""} onChange={(e) => set("whatsapp", e.target.value || null)} placeholder="+91 98765 43210" />}</Field>
              </ContactRow>
            </div>
            <ContactRow icon={<Mail />} label="Email" visible={f.visibility.email} onVisible={(v) => setVis("email", v)}>
              <p className="truncate text-[0.9rem] text-ink-3">{me!.user.email}</p>
            </ContactRow>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2" data-field="preferredContact">
            <Field label="Preferred way to reach you" optional error={errors.preferredContact} hint="Only methods that are filled in and shown can be preferred.">
              {(a) => (
                <Select {...a} value={f.preferredContact && preferredOptions.includes(f.preferredContact) ? f.preferredContact : ""} onChange={(e) => set("preferredContact", (e.target.value || null) as ContactChannel | null)}>
                  <option value="">No preference</option>
                  {preferredOptions.map((c) => <option key={c} value={c}>{CONTACT_LABELS[c]}</option>)}
                </Select>
              )}
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Discoverability">
          <label className="flex items-start justify-between gap-6">
            <span>
              <span className="block font-medium">Show my profile in Discover</span>
              <span className="mt-1 block text-[0.88rem] text-ink-3">Turn this off to take a break. Teammates and people you've sent requests to can still see you.</span>
            </span>
            <Switch checked={f.discoverable} onCheckedChange={(v) => set("discoverable", v)} />
          </label>
        </SectionCard>
      </div>

      <div className={cn("fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur transition-transform duration-200", dirty ? "translate-y-0" : "invisible translate-y-full")} inert={!dirty}>
        <div className="container-page flex max-w-3xl items-center justify-between gap-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <span className="text-[0.88rem] text-ink-3">You have unsaved changes</span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => { setF(toForm(me!.profile)); setErrors({}); }}>Discard</Button>
            <Button type="submit" loading={save.isPending}>Save changes</Button>
          </div>
        </div>
      </div>
    </form>
  );
}
