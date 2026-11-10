import { ArrowLeft, ArrowRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AVAILABILITY, LIMITS, ROLES, SKILL_SUGGESTIONS, type Availability, type RoleId } from "@shared/constants";
import { Logo } from "@/components/app/Logo";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { TagInput } from "@/components/ui/tag-input";
import { ToggleChip } from "@/components/ui/tag";
import { ApiRequestError } from "@/lib/api";
import { useAcknowledgeRecovery, useConfig, useMe, useOnboard } from "@/lib/queries";
import { RecoveryNotice } from "@/components/app/WelcomeBack";
import { cn } from "@/lib/utils";
import { useSignOut } from "@/components/app/AppShell";

const year = new Date().getFullYear();
export const GRAD_YEARS = Array.from({ length: 10 }, (_, i) => year - 2 + i);

export default function Onboarding() {
  const { data: me } = useMe();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const onboard = useOnboard();
  const ack = useAcknowledgeRecovery();
  const { data: config } = useConfig();
  const signOut = useSignOut();
  const p = me!.profile;
  const [step, setStep] = useState(0);
  const [name, setName] = useState(p.name === "New member" ? "" : p.name);
  const [college, setCollege] = useState(p.college ?? "");
  const [gradYear, setGradYear] = useState<string>(p.graduationYear ? String(p.graduationYear) : "");
  const [skills, setSkills] = useState<string[]>(p.skills);
  const [roles, setRoles] = useState<RoleId[]>(p.roles);
  const [availability, setAvailability] = useState<Availability>(p.availability === "busy" ? "open" : p.availability);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const next = () => {
    if (name.trim().length < 2) return setErrors({ name: "Enter your name" });
    setErrors({});
    setStep(1);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!skills.length) errs.skills = "Add at least one skill";
    if (!roles.length) errs.roles = "Pick at least one role";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      await onboard.mutateAsync({ name: name.trim(), college: college || null, graduationYear: gradYear ? Number(gradYear) : null, skills, roles, availability });
      if (me!.recovery.state === "empty" && !me!.recovery.acknowledged) ack.mutate(undefined);
      toast.success("You're in. Your profile is now discoverable.");
      const n = params.get("next");
      navigate(n && n.startsWith("/") && !n.startsWith("//") && n !== "/onboarding" ? n : "/discover", { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError && err.fields) setErrors(err.fields);
      toast.error(err instanceof Error ? err.message : "Couldn't save your profile");
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container-page flex h-16 items-center justify-between">
        <Logo to="/" />
        <button onClick={signOut} className="text-[0.85rem] text-ink-3 hover:text-ink">Sign out</button>
      </header>
      <main className="container-page flex flex-1 items-start justify-center py-8 sm:py-14">
        <div className="w-full max-w-xl">
          <div className="mb-8 flex items-center gap-3" aria-label={`Step ${step + 1} of 2`}>
            {[0, 1].map((i) => <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i <= step ? "bg-ink" : "bg-line")} />)}
          </div>
          <form onSubmit={submit} noValidate>
            <AnimatePresence mode="wait" initial={false}>
              {step === 0 ? (
                <motion.div key="s0" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }} className="space-y-6">
                  <RecoveryNotice recovery={me!.recovery} emailEnabled={Boolean(config?.emailEnabled)} />
                  <div>
                    <p className="eyebrow">Step 1 of 2</p>
                    <h1 className="mt-3 text-h1">Let's set up your <span className="em">profile.</span></h1>
                    <p className="mt-3 text-ink-3">The basics, so people know who they're talking to. You can add more later.</p>
                  </div>
                  <Field label="Full name" error={errors.name}>{(a) => <Input {...a} autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.name} autoComplete="name" />}</Field>
                  <Field label="College or university" optional>{(a) => <Input {...a} value={college} onChange={(e) => setCollege(e.target.value)} placeholder="e.g. Manipal University Jaipur" maxLength={LIMITS.college} />}</Field>
                  <Field label="Graduation year" optional hint={p.yearOfStudy && !p.graduationYear ? `You previously entered "${p.yearOfStudy}".` : undefined}>
                    {(a) => (
                      <Select {...a} value={gradYear} onChange={(e) => setGradYear(e.target.value)}>
                        <option value="">Select a year</option>
                        {GRAD_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                      </Select>
                    )}
                  </Field>
                  <div className="flex justify-end pt-2">
                    <Button type="button" size="lg" onClick={next}>Continue <ArrowRight /></Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="s1" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }} className="space-y-7">
                  <div>
                    <p className="eyebrow">Step 2 of 2</p>
                    <h1 className="mt-3 text-h1">What do you like to <span className="em">build?</span></h1>
                    <p className="mt-3 text-ink-3">This is how teammates with complementary skills find you.</p>
                  </div>
                  <Field label="Skills" error={errors.skills} hint="Type and press Enter. Languages, frameworks, tools — anything you can contribute.">
                    {(a) => <TagInput {...a} value={skills} onChange={setSkills} suggestions={SKILL_SUGGESTIONS} max={LIMITS.skills} placeholder="React, Python, Figma…" />}
                  </Field>
                  <fieldset>
                    <legend className="text-[0.86rem] font-medium">Roles you enjoy <span className="font-normal text-ink-4">· up to {LIMITS.roles}</span></legend>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {ROLES.map((r) => (
                        <ToggleChip key={r.id} pressed={roles.includes(r.id)} onPressedChange={(on) => setRoles((cur) => (on ? (cur.length < LIMITS.roles ? [...cur, r.id] : cur) : cur.filter((x) => x !== r.id)))}>
                          {r.label}
                        </ToggleChip>
                      ))}
                    </div>
                    {errors.roles && <p className="mt-2 text-[0.8rem] text-danger" role="alert">{errors.roles}</p>}
                  </fieldset>
                  <fieldset>
                    <legend className="text-[0.86rem] font-medium">Availability</legend>
                    <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
                      {AVAILABILITY.map((a) => (
                        <label key={a.id} className={cn("flex cursor-pointer flex-col rounded-xl border p-3.5 text-[0.88rem] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-needle", availability === a.id ? "border-ink bg-surface shadow-sm" : "border-line-strong bg-surface/60 hover:border-ink-4")}>
                          <input type="radio" name="availability" value={a.id} checked={availability === a.id} onChange={() => setAvailability(a.id)} className="sr-only" />
                          <span className="font-medium">{a.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="flex items-center justify-between gap-3 pt-2">
                    <Button type="button" variant="ghost" onClick={() => setStep(0)}><ArrowLeft /> Back</Button>
                    <Button type="submit" size="lg" loading={onboard.isPending}>Finish and explore</Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        </div>
      </main>
    </div>
  );
}
