import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const base = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 select-none disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ink text-canvas shadow-sm hover:bg-ink-2",
        secondary: "border border-line-strong bg-surface text-ink shadow-xs hover:border-ink-4 hover:bg-subtle",
        ghost: "text-ink-2 hover:bg-subtle hover:text-ink",
        accent: "bg-needle text-white shadow-sm hover:bg-needle-ink",
        danger: "border border-danger/30 bg-surface text-danger hover:bg-danger-soft",
        link: "h-auto rounded-none px-0 text-ink underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3.5 text-[0.82rem]",
        md: "h-10 px-5 text-[0.9rem]",
        lg: "h-12 px-6 text-[0.95rem]",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

/** Class builder for anything that should look like a button (links, triggers). Conflicting classes resolve via tailwind-merge. */
export const buttonVariants = (p?: Parameters<typeof base>[0]) => cn(base(p));

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof base> & { asChild?: boolean; loading?: boolean };

export const Button = forwardRef<HTMLButtonElement, Props>(({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {asChild ? children : (<>{loading && <Loader2 className="animate-spin" aria-hidden />}{children}</>)}
    </Comp>
  );
});
Button.displayName = "Button";
