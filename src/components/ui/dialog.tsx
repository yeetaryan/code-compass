import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ title, description, children, className, side }: { title: string; description?: string; children: ReactNode; className?: string; side?: "right" }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-ink/25 backdrop-blur-[2px] data-[state=open]:animate-[fade-up_.2s_ease-out]" />
      <D.Content
        className={cn(
          "fixed z-50 bg-surface shadow-lg focus:outline-none",
          side === "right"
            ? "inset-y-0 right-0 flex w-[min(22rem,88vw)] flex-col border-l border-line p-5"
            : "top-1/2 left-1/2 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[var(--radius-panel)] border border-line p-6 sm:p-7",
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <D.Title className="font-display text-h3 font-semibold">{title}</D.Title>
            {description ? <D.Description className="mt-1 text-[0.9rem] text-ink-3">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="-mt-1 -mr-1 grid size-9 place-items-center rounded-full text-ink-3 hover:bg-subtle hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}
