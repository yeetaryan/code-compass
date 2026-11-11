import { ArrowLeft, Check, History, MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { RecoveryPreview } from "@shared/api-types";
import { Logo } from "@/components/app/Logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { PageSpinner } from "@/components/ui/states";
import { ApiRequestError } from "@/lib/api";
import { useConfig, useMe, useRecoveryClaim, useRecoveryRequest, useRecoveryVerify } from "@/lib/queries";
import { FormError } from "./auth/AuthLayout";

type Step = "email" | "code" | "review";

export default function Recover() {
  const { data: me } = useMe();
  const { data: config, isPending } = useConfig();
  const navigate = useNavigate();
  const request = useRecoveryRequest();
  const verify = useRecoveryVerify();
  const claim = useRecoveryClaim();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RecoveryPreview | null>(null);

  if (isPending) return <PageSpinner />;
  const back = me?.profile.onboarded ? "/discover" : "/onboarding";
  const msg = (e: unknown) => (e instanceof ApiRequestError ? e.message : "Something went wrong. Please try again.");

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await request.mutateAsync(email.trim());
      setNotice(r.message);
      setStep("code");
    } catch (err) {
      setError(msg(err));
    }
  }

  async function checkCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setPreview(await verify.mutateAsync(code.trim()));
      setStep("review");
    } catch (err) {
      setError(msg(err));
    }
  }

  async function decide(decision: "restore" | "start_fresh") {
    setError(null);
    try {
      const r = await claim.mutateAsync(decision);
      if (decision === "restore") toast.success(r.restoredFields.length ? "Your previous profile is back" : "Nothing new to add — your current details were kept");
      navigate(decision === "restore" ? "/profile" : back, { replace: true });
    } catch (err) {
      setError(msg(err));
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container-page flex h-16 items-center justify-between">
        <Logo to="/" />
        <Link to={back} className="inline-flex items-center gap-1.5 text-[0.86rem] text-ink-3 hover:text-ink"><ArrowLeft className="size-4" /> Back</Link>
      </header>
      <main className="container-page flex flex-1 justify-center py-8 sm:py-14">
        <div className="w-full max-w-lg">
          <span className="grid size-11 place-items-center rounded-full bg-needle-soft text-needle-ink"><History className="size-5" /></span>
          <h1 className="mt-5 text-h1">Welcome back to <span className="em">Code Compass.</span></h1>
          <p className="mt-3 text-[1rem] leading-relaxed text-ink-3">Looks like you've been here before. Recover your previous profile and pick up where you left off.</p>

          {!config?.emailEnabled ? (
            <Card className="mt-8 p-5 text-[0.92rem] leading-relaxed text-ink-2">
              Recovering a profile into a different account needs email, which isn't switched on yet. If you remember your old email and password, simply{" "}
              <Link to="/sign-in" className="font-medium text-ink underline underline-offset-4">sign in with them</Link> — your profile comes back automatically.
            </Card>
          ) : (
            <Card className="mt-8 p-5 sm:p-7">
              <FormError message={error} />
              {step === "email" && (
                <form onSubmit={sendCode} className="space-y-5" noValidate>
                  <p className="text-[0.92rem] text-ink-2">
                    If you still know your old password, it's easier to <Link to="/sign-in" className="font-medium text-ink underline underline-offset-4">sign in with your old account</Link> — your profile is restored automatically. Otherwise, enter the email you used before and we'll send a code to it.
                  </p>
                  <Field label="Email you used on Code Compass before">
                    {(a) => <Input {...a} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@university.edu" required />}
                  </Field>
                  <Button type="submit" size="lg" className="w-full" loading={request.isPending} disabled={!email.includes("@")}>Send me a code</Button>
                </form>
              )}
              {step === "code" && (
                <form onSubmit={checkCode} className="space-y-5" noValidate>
                  <div className="flex items-start gap-3 rounded-xl border border-line bg-subtle p-4 text-[0.9rem] text-ink-2">
                    <MailCheck className="mt-0.5 size-5 shrink-0 text-moss" aria-hidden />
                    <span>{notice} Check spam too. Only the person with access to that inbox can recover the profile.</span>
                  </div>
                  <Field label="6-digit code">
                    {(a) => (
                      <Input
                        {...a}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="\d{6}"
                        maxLength={6}
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                        className="text-center font-display text-[1.4rem] tracking-[0.4em]"
                        autoFocus
                      />
                    )}
                  </Field>
                  <Button type="submit" size="lg" className="w-full" loading={verify.isPending} disabled={code.length !== 6}>Verify code</Button>
                  <button type="button" onClick={() => { setStep("email"); setCode(""); setError(null); }} className="w-full text-center text-[0.86rem] text-ink-3 hover:text-ink">
                    Use a different email or send a new code
                  </button>
                </form>
              )}
              {step === "review" && preview && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-h3">We found your previous profile</h2>
                    <p className="mt-1 text-[0.9rem] text-ink-3">
                      {preview.sourceUpdatedAt ? `Last updated ${new Date(preview.sourceUpdatedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}. ` : ""}
                      Restoring only fills in details you haven't added yet.
                    </p>
                  </div>
                  {preview.fields.length ? (
                    <dl className="divide-y divide-line rounded-xl border border-line">
                      {preview.fields.map((f) => (
                        <div key={f.field} className="grid gap-1 px-4 py-3 sm:grid-cols-[8rem_1fr]">
                          <dt className="text-[0.82rem] font-medium text-ink-3">{f.label}</dt>
                          <dd className="text-[0.92rem] break-words text-ink">{f.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="rounded-xl border border-line bg-subtle p-4 text-[0.9rem] text-ink-2">You've already filled in everything this old profile had, so restoring wouldn't change anything.</p>
                  )}
                  {preview.keptFromCurrent.length > 0 && (
                    <p className="flex items-start gap-2 text-[0.84rem] text-ink-3"><Check className="mt-0.5 size-4 shrink-0 text-moss" /> Your current {preview.keptFromCurrent.join(", ").replace("xHandle", "X handle").replace("yearOfStudy", "year")} will be kept.</p>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button size="lg" className="flex-1" loading={claim.isPending && claim.variables === "restore"} onClick={() => decide("restore")}>Recover my profile</Button>
                    <Button size="lg" variant="secondary" className="flex-1" loading={claim.isPending && claim.variables === "start_fresh"} onClick={() => decide("start_fresh")}>Start fresh</Button>
                  </div>
                </div>
              )}
            </Card>
          )}
          <p className="mt-6 text-center text-[0.82rem] text-ink-4">
            Forgot your password instead? <Link to="/forgot-password" className="underline underline-offset-4 hover:text-ink">Reset it here</Link>.
          </p>
          {step === "email" && <Link to={back} className={buttonVariants({ variant: "link", className: "mt-2 w-full justify-center text-ink-3" })}>Skip — I'll start fresh</Link>}
        </div>
      </main>
    </div>
  );
}
