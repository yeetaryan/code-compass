import { AlertTriangle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function EmptyState({ icon, title, children, action, className }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center", className)}>
      {icon && <div className="mb-4 grid size-12 place-items-center rounded-full bg-subtle text-ink-3 [&_svg]:size-5">{icon}</div>}
      <h3 className="text-h3">{title}</h3>
      {children && <div className="mt-2 max-w-sm text-[0.92rem] text-ink-3">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <EmptyState icon={<AlertTriangle />} title="We couldn't load this" action={onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}>
      {msg}
    </EmptyState>
  );
}

export function PageSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="grid min-h-[40vh] place-items-center" role="status" aria-live="polite">
      <div className="flex items-center gap-2.5 text-[0.9rem] text-ink-3">
        <Loader2 className="size-4 animate-spin" /> {label}…
      </div>
    </div>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div className={cn("skeleton h-4", className)} aria-hidden />;
