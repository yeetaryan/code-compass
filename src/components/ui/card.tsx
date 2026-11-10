import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("rounded-[var(--radius-card)] border border-line bg-surface shadow-xs", className)} {...p} />
);

export const SectionCard = ({ title, description, children, className, action }: { title: string; description?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) => (
  <Card className={cn("p-5 sm:p-7", className)}>
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-h3">{title}</h2>
        {description && <p className="mt-1 text-[0.9rem] text-ink-3">{description}</p>}
      </div>
      {action}
    </div>
    {children}
  </Card>
);
