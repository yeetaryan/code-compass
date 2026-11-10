import { History, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { RecoveredField, RecoveryState } from "@shared/api-types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
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
  const fresh = useStartFresh();
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
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <Link to="/profile" onClick={() => ack.mutate(undefined)} className={buttonVariants({ size: "sm" })}>Review my profile</Link>
          <Button size="sm" variant="secondary" loading={ack.isPending} onClick={() => ack.mutateAsync(undefined).catch(fail)}>Looks good</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>Start fresh</Button>
        </div>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent title="Start fresh?" description="We'll remove the details we restored from your old profile. Anything you've changed since stays. You can restore them again later.">
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost">Keep my profile</Button></DialogClose>
            <Button
              variant="danger"
              loading={fresh.isPending}
              onClick={() =>
                fresh.mutateAsync(undefined).then(() => {
                  setConfirm(false);
                  toast("Restored details removed");
                  navigate("/onboarding", { replace: true });
                }, fail)
              }
            >
              Start fresh
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** Shown on onboarding for returning users. */
export function RecoveryNotice({ recovery, emailEnabled }: { recovery: RecoveryState; emailEnabled: boolean }) {
  const reapply = useReapply();
  const navigate = useNavigate();
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
        <Button size="sm" variant="secondary" loading={reapply.isPending} onClick={() => reapply.mutateAsync(undefined).then(() => { toast.success("Previous profile restored"); navigate("/discover"); }, fail)}>
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
