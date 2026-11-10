import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { keys } from "@/lib/queries";
import { AuthLayout, FormError } from "./AuthLayout";
import { PasswordInput } from "./PasswordInput";

export const safeNext = (next: string | null) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/discover");

export default function SignIn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await authClient.signIn.email({ email: email.trim(), password, rememberMe: true });
    if (error) {
      setBusy(false);
      setError(authErrorMessage(error));
      return;
    }
    await qc.invalidateQueries({ queryKey: keys.me });
    navigate(safeNext(params.get("next")), { replace: true });
  }

  return (
    <AuthLayout
      title={<>Welcome <span className="em">back.</span></>}
      subtitle="Sign in to find teammates and manage your teams."
      footer={<>New to Code Compass? <Link to="/sign-up" className="font-medium text-ink underline-offset-4 hover:underline">Create an account</Link></>}
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        <FormError message={error} />
        <Field label="Email">{(a) => <Input {...a} type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@university.edu" />}</Field>
        <div className="relative">
          <Field label="Password">
            {(a) => <PasswordInput {...a} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          <Link to="/forgot-password" className="absolute top-0 right-0 text-[0.84rem] text-ink-3 hover:text-ink">Forgot password?</Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!email || !password}>Sign in</Button>
        <p className="text-center text-[0.82rem] text-ink-4">Used Code Compass before? Your existing email and password still work.</p>
      </form>
    </AuthLayout>
  );
}
