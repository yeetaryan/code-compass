import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Tag } from "@/components/ui/tag";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { useConfig, useMe } from "@/lib/queries";
import { PasswordInput } from "./auth/PasswordInput";
import { FormError } from "./auth/AuthLayout";

export default function Settings() {
  const { data: me } = useMe();
  const { data: config } = useConfig();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [delPw, setDelPw] = useState("");
  const [delConfirm, setDelConfirm] = useState("");
  const [delError, setDelError] = useState<string | null>(null);

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (next.length < 8) return setPwError("Use at least 8 characters.");
    setBusy(true);
    setPwError(null);
    const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
    setBusy(false);
    if (error) return setPwError(error.code === "INVALID_PASSWORD" ? "Your current password is incorrect." : authErrorMessage(error));
    setCurrent("");
    setNext("");
    toast.success("Password changed. Other devices have been signed out.");
  }

  async function resendVerification() {
    const { error } = await authClient.sendVerificationEmail({ email: me!.user.email, callbackURL: "/discover" });
    if (error) toast.error(authErrorMessage(error));
    else toast.success("Confirmation email sent");
  }

  async function deleteAccount(e: FormEvent) {
    e.preventDefault();
    setDelError(null);
    const { error } = await authClient.deleteUser({ password: delPw });
    if (error) return setDelError(error.code === "INVALID_PASSWORD" ? "Your password is incorrect." : authErrorMessage(error));
    qc.clear();
    navigate("/", { replace: true });
    toast("Your account and profile have been deleted.");
  }

  async function signOutEverywhere() {
    await authClient.revokeOtherSessions();
    toast.success("Signed out of all other devices");
  }

  return (
    <div className="container-page max-w-3xl py-8 sm:py-12">
      <h1 className="text-h1">Settings</h1>
      <div className="mt-8 space-y-5">
        <SectionCard title="Account">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[0.86rem] text-ink-3">Email</p>
              <p className="font-medium">{me!.user.email}</p>
            </div>
            {me!.user.emailVerified ? <Tag tone="moss">Confirmed</Tag> : <div className="flex items-center gap-2"><Tag tone="amber">Not confirmed</Tag>{config?.emailEnabled && <Button size="sm" variant="secondary" onClick={resendVerification}>Send link</Button>}</div>}
          </div>
          <p className="mt-4 text-[0.82rem] text-ink-4">Member since {new Date(me!.user.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
        </SectionCard>

        <SectionCard title="Change password" description="Changing your password signs you out on other devices.">
          <form onSubmit={changePassword} className="grid gap-4 sm:max-w-md" noValidate>
            <FormError message={pwError} />
            <Field label="Current password">{(a) => <PasswordInput {...a} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}</Field>
            <Field label="New password" hint="At least 8 characters.">{(a) => <PasswordInput {...a} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}</Field>
            <div><Button type="submit" loading={busy} disabled={!current || !next}>Update password</Button></div>
          </form>
        </SectionCard>

        <SectionCard title="Sessions">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[0.9rem] text-ink-3">Lost a device or signed in somewhere public?</p>
            <Button variant="secondary" onClick={signOutEverywhere}>Sign out other devices</Button>
          </div>
        </SectionCard>

        <SectionCard title="Your data">
          <p className="text-[0.9rem] text-ink-3">
            What we store, who can see it and how it's removed: <Link to="/privacy" className="font-medium text-ink underline underline-offset-4">privacy policy</Link>.
          </p>
        </SectionCard>

        <SectionCard title="Delete account" description="Permanently removes your account, profile, photo, team memberships and any teams you own. This can't be undone.">
          <Dialog>
            <DialogTrigger asChild><Button variant="danger">Delete my account</Button></DialogTrigger>
            <DialogContent title="Delete your account?" description="Everything tied to your account will be removed immediately.">
              <form onSubmit={deleteAccount} className="space-y-4">
                <FormError message={delError} />
                <Field label="Your password">{(a) => <PasswordInput {...a} autoComplete="current-password" value={delPw} onChange={(e) => setDelPw(e.target.value)} />}</Field>
                <Field label={<>Type <b>delete</b> to confirm</>}>{(a) => <Input {...a} value={delConfirm} onChange={(e) => setDelConfirm(e.target.value)} autoComplete="off" />}</Field>
                <Button type="submit" variant="danger" className="w-full" disabled={delConfirm.trim().toLowerCase() !== "delete" || !delPw}>Permanently delete</Button>
              </form>
            </DialogContent>
          </Dialog>
        </SectionCard>
      </div>
    </div>
  );
}
