import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { AuthLayout, FormError } from "./AuthLayout";
import { PasswordInput } from "./PasswordInput";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const linkError = params.get("error");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(linkError ? authErrorMessage({ code: "INVALID_TOKEN" }) : null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setError("Use at least 8 characters.");
    if (pw !== pw2) return setError("The two passwords don't match.");
    setBusy(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword: pw, token: token! });
    setBusy(false);
    if (error) return setError(authErrorMessage(error));
    setDone(true);
  }

  if (done)
    return (
      <AuthLayout title={<>Password <span className="em">updated.</span></>} subtitle="You've been signed out everywhere else. Sign in with your new password.">
        <Link to="/sign-in" className={buttonVariants({ size: "lg", className: "w-full" })}>Sign in</Link>
      </AuthLayout>
    );

  if (!token || linkError)
    return (
      <AuthLayout title={<>This link has <span className="em">expired.</span></>} subtitle="Reset links work once and expire after an hour.">
        <Link to="/forgot-password" className={buttonVariants({ size: "lg", className: "w-full" })}>Request a new link</Link>
      </AuthLayout>
    );

  return (
    <AuthLayout title={<>Choose a new <span className="em">password.</span></>} subtitle="Use at least 8 characters. A short phrase is easier to remember than a jumble.">
      <form onSubmit={submit} className="space-y-5" noValidate>
        <FormError message={error} />
        <Field label="New password">{(a) => <PasswordInput {...a} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
        <Field label="Confirm new password">{(a) => <PasswordInput {...a} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />}</Field>
        <Button type="submit" size="lg" className="w-full" loading={busy}>Update password</Button>
      </form>
    </AuthLayout>
  );
}
