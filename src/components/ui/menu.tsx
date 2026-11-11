import * as M from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ children, align = "end" }: { children: ReactNode; align?: "start" | "end" }) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={8} className="z-50 min-w-52 rounded-xl border border-line bg-surface p-1.5 shadow-md data-[state=open]:animate-fade-up">
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function MenuItem({ children, onSelect, className, asChild }: { children: ReactNode; onSelect?: () => void; className?: string; asChild?: boolean }) {
  return (
    <M.Item asChild={asChild} onSelect={onSelect} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[0.9rem] text-ink-2 outline-none data-[highlighted]:bg-subtle data-[highlighted]:text-ink [&_svg]:size-4 [&_svg]:text-ink-3", className)}>
      {children}
    </M.Item>
  );
}
export const MenuSeparator = () => <M.Separator className="my-1.5 h-px bg-line" />;
export const MenuLabel = ({ children }: { children: ReactNode }) => <M.Label className="px-3 pt-1.5 pb-2 text-[0.8rem] text-ink-3">{children}</M.Label>;
