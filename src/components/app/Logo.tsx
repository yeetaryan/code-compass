import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--color-ink)" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="var(--color-canvas)" strokeWidth="1.5" opacity=".9" />
      <path d="M16 8.5 19 16h-6z" fill="var(--color-needle)" />
      <path d="M16 23.5 13 16h6z" fill="var(--color-canvas)" />
    </svg>
  );
}

export function Logo({ to = "/", className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={cn("inline-flex items-center gap-2.5 rounded-lg", className)} aria-label="Code Compass home">
      <LogoMark />
      <span className="font-display text-[1.05rem] font-semibold tracking-tight">Code Compass</span>
    </Link>
  );
}
