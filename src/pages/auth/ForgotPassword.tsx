import { MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { useConfig } from "@/lib/queries";
import { AuthLayout, FormError } from "./AuthLayout";

export default function ForgotPassword() {
  const { data: config } = useConfig();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    // Same response whether or not the account exists.
    if (error && error.status === 429) return setError(authErrorMessage(error));
    setSent(true);
  }

  if (config && !config.emailEnabled)
    return (
      <AuthLayout
        title={<>Password reset is <span className="em">coming soon.</span></>}
        subtitle="We haven't switched on email yet, so we can't send reset links. Your account and profile are safe."
        footer={<Link to="/sign-in" className="font-medium text-ink underline-offset-4 hover:underline">Back to sign in</Link>}
      >
        <div className="rounded-xl border border-line bg-surface p-4 text-[0.9rem] leading-relaxed text-ink-2">
          If you used Code Compass before, your old password still works. If you can't remember it,{" "}
          {config.supportUrl ? (
            <a href={config.supportUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline underline-offset-4">contact the Code Compass team</a>
          ) : (
            "contact the Code Compass team"
          )}{" "}
          and we'll help you get back in.
        </div>
      </AuthLayout>
    );

  return (
    <AuthLayout
      title={sent ? <>Check your <span className="em">inbox.</span></> : <>Reset your <span className="em">password.</span></>}
      subtitle={sent ? <>If an account exists for <b className="text-ink">{email}</b>, a reset link is on its way. It expires in one hour.</> : "Enter the email you signed up with and we'll send you a link to choose a new password."}
      footer={<Link to="/sign-in" className="font-medium text-ink underline-offset-4 hover:underline">Back to sign in</Link>}
    >
      {sent ? (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 text-[0.9rem] text-ink-3"><MailCheck className="size-5 text-moss" /> Didn't get it? Check spam, or try again in a few minutes.</div>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          <FormError message={error} />
          <Field label="Email">{(a) => <Input {...a} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@university.edu" />}</Field>
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!email.includes("@")}>Send reset link</Button>
        </form>
      )}
    </AuthLayout>
  );
}
