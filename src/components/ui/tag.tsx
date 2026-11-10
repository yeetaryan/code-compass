import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "border-line bg-subtle text-ink-2",
  outline: "border-line-strong bg-surface text-ink-2",
  accent: "border-needle/25 bg-needle-soft text-needle-ink",
  moss: "border-moss/20 bg-moss-soft text-moss",
  amber: "border-amber/20 bg-amber-soft text-amber",
  ink: "border-ink bg-ink text-canvas",
};

export function Tag({ children, tone = "neutral", className, onRemove, title }: { children: ReactNode; tone?: keyof typeof tones; className?: string; onRemove?: () => void; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex h-7 max-w-full items-center gap-1 rounded-full border px-2.5 text-[0.8rem] leading-none font-medium", tones[tone], className)}>
      <span className="truncate">{children}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} className="-mr-1 grid size-5 place-items-center rounded-full text-current/70 hover:bg-ink/10 hover:text-current" aria-label={`Remove ${typeof children === "string" ? children : "tag"}`}>
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

/** Pressable chip for multi-select filters (roles, availability…). */
export function ToggleChip({ pressed, onPressedChange, children, className }: { pressed: boolean; onPressedChange: (v: boolean) => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[0.85rem] font-medium transition-colors",
        pressed ? "border-ink bg-ink text-canvas" : "border-line-strong bg-surface text-ink-2 hover:border-ink-4 hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}
