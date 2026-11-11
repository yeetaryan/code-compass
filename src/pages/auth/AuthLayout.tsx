import type { ReactNode } from "react";
import { Logo } from "@/components/app/Logo";

export function AuthLayout({ title, subtitle, children, footer }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Logo />
        <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-12">
          <h1 className="text-h1">{title}</h1>
          {subtitle && <p className="mt-3 text-[0.98rem] text-ink-3">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-[0.9rem] text-ink-3">{footer}</div>}
        </main>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-line bg-subtle lg:block" aria-hidden>
        <div className="grain absolute inset-0" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <p className="eyebrow">Code Compass</p>
          <div>
            <p className="font-display text-[2.4rem] leading-[1.1] font-semibold tracking-[-0.03em] text-balance">
              The right team turns an idea into <span className="em">something real.</span>
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-2">
              {["Design", "Frontend", "Backend", "AI / ML", "Hardware", "Product"].map((r) => (
                <span key={r} className="rounded-full border border-line-strong bg-surface px-3 py-1 text-[0.8rem] text-ink-2">{r}</span>
              ))}
            </div>
            <p className="mt-3 text-[0.88rem] text-ink-3">Find designers, engineers, researchers and founders — all students.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-[0.88rem] text-danger">
      {message}
    </div>
  );
}
