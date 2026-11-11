import { History, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { RecoveredField, RecoveryState } from "@shared/api-types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useAcknowledgeRecovery, useReapply, useStartFresh } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const FIELD_NAMES: Record<RecoveredField, string> = {
  name: "name",
  yearOfStudy: "year",
  skills: "skills",
  interests: "interests",
  whatsapp: "WhatsApp",
  xHandle: "X handle",
};

const list = (fields: RecoveredField[]) => {
  const names = fields.map((f) => FIELD_NAMES[f]);
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
};

const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");

/** One-time summary after a v1 profile was restored into this account. */
export function WelcomeBackBanner({ recovery, className }: { recovery: RecoveryState; className?: string }) {
  const ack = useAcknowledgeRecovery();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  if (recovery.state !== "restored" || recovery.acknowledged) return null;
  const moved = recovery.via === "manual";

  return (
    <section className={cn("rounded-2xl border border-needle/20 bg-needle-soft/50 p-5 sm:p-6", className)} aria-labelledby="welcome-back-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-surface text-needle-ink"><History className="size-4" /></span>
          <div>
            <h2 id="welcome-back-title" className="font-display text-[1.1rem] font-semibold tracking-tight">Welcome back to Code Compass.</h2>
            <p className="mt-1 text-[0.92rem] leading-relaxed text-ink-2">
              {moved ? "We moved your previous profile into this account" : "Looks like you've been here before — we restored your previous profile"}
              {recovery.fields.length ? <>: your {list(recovery.fields)}.</> : "."} Check it over and add anything new.
              {moved && recovery.fields.some((f) => f === "whatsapp" || f === "xHandle") ? " Your restored contact details are hidden until you switch them on." : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <Link to="/profile" onClick={() => ack.mutate(undefined)} className={buttonVariants({ size: "sm" })}>Review my profile</Link>
          <Button size="sm" variant="secondary" loading={ack.isPending} onClick={() => ack.mutateAsync(undefined).catch(fail)}>Looks good</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>Start fresh</Button>
        </div>
      </div>
      <StartFreshDialog open={confirm} onOpenChange={setConfirm} onDone={() => navigate("/onboarding", { replace: true })} />
    </section>
  );
}

export type ContactConfirm = { label: string; value: string; visible: boolean; onChange: (v: boolean) => void };

/** Confirm dialog shared by the banner and onboarding. */
function StartFreshDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const fresh = useStartFresh();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Start fresh?" description="We'll remove the details we restored from your old profile. Anything you've changed since stays. You can restore them again later.">
        <div className="flex justify-end gap-2">
          <DialogClose asChild><Button variant="ghost">Keep my profile</Button></DialogClose>
          <Button
            variant="danger"
            loading={fresh.isPending}
            onClick={() => fresh.mutateAsync(undefined).then(() => { onOpenChange(false); toast("Restored details removed"); onDone(); }, fail)}
          >
            Start fresh
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Shown on onboarding for returning users. */
export function RecoveryNotice({ recovery, emailEnabled, contacts = [] }: { recovery: RecoveryState; emailEnabled: boolean; contacts?: ContactConfirm[] }) {
  const reapply = useReapply();
  const [confirm, setConfirm] = useState(false);
  if (recovery.state === "restored" && recovery.via !== "manual")
    return (
      <section className="mb-8 rounded-2xl border border-needle/20 bg-needle-soft/50 p-5 sm:p-6" aria-labelledby="welcome-back-title">
        <div className="flex gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-surface text-needle-ink"><History className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="welcome-back-title" className="font-display text-[1.1rem] font-semibold tracking-tight">Welcome back to Code Compass.</h2>
            <p className="mt-1 text-[0.92rem] leading-relaxed text-ink-2">
              Looks like you've been here before. We brought back your {list(recovery.fields)} from your previous profile. Check the details
              below and finish setting up — your profile only appears in Discover after you finish.
            </p>
            {contacts.length > 0 && (
              <div className="mt-4 space-y-2.5 rounded-xl border border-line bg-surface p-3.5">
                <p className="text-[0.82rem] font-medium text-ink-3">Who can see your restored contact details?</p>
                {contacts.map((c) => (
                  <label key={c.label} className="flex items-center justify-between gap-3 text-[0.9rem]">
                    <span className="min-w-0">
                      <span className="font-medium">{c.label}</span> <span className="text-ink-3">{c.value}</span>
                      <span className="block text-[0.8rem] text-ink-4">{c.visible ? "Visible to signed-in members" : "Hidden — only you can see it"}</span>
                    </span>
                    <Switch checked={c.visible} onCheckedChange={c.onChange} aria-label={`Show my ${c.label} to signed-in members`} />
                  </label>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setConfirm(true)} className="mt-3 text-[0.86rem] text-ink-3 underline-offset-4 hover:text-ink hover:underline">
              Start fresh instead
            </button>
          </div>
        </div>
        <StartFreshDialog open={confirm} onOpenChange={setConfirm} onDone={() => undefined} />
      </section>
    );
  if (recovery.state === "restored") return <WelcomeBackBanner recovery={recovery} className="mb-8" />;
  if (recovery.state === "empty")
    return (
      <div className="mb-8 rounded-2xl border border-line bg-surface p-5 text-[0.92rem] leading-relaxed text-ink-2">
        <p className="font-display text-[1.05rem] font-semibold tracking-tight text-ink">Welcome back to Code Compass.</p>
        <p className="mt-1">We found your account from the previous version, but it didn't have any saved profile details to bring back. Let's set it up — it takes about two minutes.</p>
      </div>
    );
  if (recovery.state === "dismissed")
    return (
      <div className="mb-8 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 text-[0.92rem] text-ink-2 sm:flex-row sm:items-center sm:justify-between">
        <span>Changed your mind? Your previous profile is still available.</span>
        <Button size="sm" variant="secondary" loading={reapply.isPending} onClick={() => reapply.mutateAsync(undefined).then(() => toast.success("Previous profile restored — check it below"), fail)}>
          Restore my previous profile
        </Button>
      </div>
    );
  if (!emailEnabled) return null;
  return (
    <Link to="/recover" className="mb-8 flex items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface/60 p-4 text-[0.92rem] text-ink-2 transition-colors hover:border-ink-4 hover:text-ink">
      <Sparkles className="size-4 shrink-0 text-needle" aria-hidden />
      <span><b className="font-medium text-ink">Already used Code Compass?</b> Recover your previous profile.</span>
    </Link>
  );
}
