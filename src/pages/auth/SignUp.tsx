import { useQueryClient } from "@tanstack/react-query";
import { MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { keys } from "@/lib/queries";
import { AuthLayout, FormError } from "./AuthLayout";
import { PasswordInput } from "./PasswordInput";

export default function SignUp() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = "Enter your name";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = "Enter a valid email address";
    if (password.length < 8) errs.password = "Use at least 8 characters";
    setFieldErr(errs);
    if (Object.keys(errs).length) return;
    setError(null);
    setBusy(true);
    const { data, error } = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: "/onboarding" });
    setBusy(false);
    if (error) return setError(authErrorMessage(error));
    if (!data?.token) return setCheckEmail(true); // verification required before first sign-in
    await qc.invalidateQueries({ queryKey: keys.me });
    navigate("/onboarding", { replace: true });
  }

  if (checkEmail)
    return (
      <AuthLayout title={<>Check your <span className="em">inbox.</span></>} subtitle={<>We sent a confirmation link to <b className="text-ink">{email}</b>. Open it to finish creating your account.</>}>
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 text-[0.9rem] text-ink-3"><MailCheck className="size-5 text-moss" /> The link expires in 24 hours. Check spam if it doesn't arrive.</div>
        <Link to="/sign-in" className="mt-6 inline-block text-[0.9rem] font-medium underline-offset-4 hover:underline">Back to sign in</Link>
      </AuthLayout>
    );

  return (
    <AuthLayout
      title={<>Join <span className="em">Code Compass.</span></>}
      subtitle="Create an account, then tell people what you like to build."
      footer={<>Already have an account? <Link to="/sign-in" className="font-medium text-ink underline-offset-4 hover:underline">Sign in</Link></>}
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        <FormError message={error} />
        <Field label="Full name" error={fieldErr.name}>{(a) => <Input {...a} autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={80} />}</Field>
        <Field label="Email" error={fieldErr.email} hint="Your college email works best, but any email is fine.">
          {(a) => <Input {...a} type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@university.edu" />}
        </Field>
        <Field label="Password" error={fieldErr.password} hint="At least 8 characters.">
          {(a) => <PasswordInput {...a} autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={busy}>Create account</Button>
        <p className="text-center text-[0.8rem] leading-relaxed text-ink-4">Your email is never shown to other members unless you choose to show it.</p>
      </form>
    </AuthLayout>
  );
}
