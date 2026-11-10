import * as LabelPrimitive from "@radix-ui/react-label";
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-[var(--radius-input)] border border-line-strong bg-surface px-3.5 text-[0.94rem] text-ink shadow-xs transition-[border-color,box-shadow] placeholder:text-ink-4 hover:border-ink-4 focus:border-ink focus:shadow-[0_0_0_3px_var(--color-needle-soft)] focus:outline-none disabled:cursor-not-allowed disabled:bg-subtle aria-[invalid=true]:border-danger aria-[invalid=true]:focus:shadow-[0_0_0_3px_var(--color-danger-soft)]";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(control, "h-11", className)} {...p} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(control, "min-h-28 resize-y py-2.5 leading-relaxed", className)} {...p} />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <div className="relative">
    <select ref={ref} className={cn(control, "h-11 cursor-pointer appearance-none pr-10", className)} {...p}>
      {children}
    </select>
    <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-ink-3">
      <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
));
Select.displayName = "Select";

export const Label = forwardRef<HTMLLabelElement, LabelPrimitive.LabelProps>(({ className, ...p }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn("text-[0.86rem] font-medium text-ink", className)} {...p} />
));
Label.displayName = "Label";

/** Label + control + hint/error, wired up with ids for screen readers. */
export function Field({
  label,
  hint,
  error,
  optional,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  className?: string;
  children: (props: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => ReactNode;
}) {
  const id = useId();
  const descId = hint || error ? `${id}-desc` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="flex items-baseline justify-between gap-2">
        <span>{label}</span>
        {optional && <span className="text-[0.78rem] font-normal text-ink-4">Optional</span>}
      </Label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": descId })}
      {(error || hint) && (
        <p id={descId} className={cn("text-[0.8rem] leading-snug", error ? "text-danger" : "text-ink-3")} role={error ? "alert" : undefined}>
          {error || hint}
        </p>
      )}
    </div>
  );
}
