import { AVAILABILITY, type Availability } from "@shared/constants";
import { cn } from "@/lib/utils";

const dot: Record<Availability, string> = { looking: "bg-moss", open: "bg-amber", busy: "bg-ink-4" };

export function AvailabilityBadge({ value, className, short }: { value: Availability; className?: string; short?: boolean }) {
  const a = AVAILABILITY.find((x) => x.id === value)!;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[0.8rem] font-medium text-ink-2", className)}>
      <span className={cn("size-1.5 rounded-full", dot[value])} aria-hidden />
      {short ? a.short : a.label}
    </span>
  );
}
