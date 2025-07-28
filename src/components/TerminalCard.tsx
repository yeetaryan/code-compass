import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TerminalCardProps {
  children: ReactNode;
  className?: string;
  title?: string;
}

export function TerminalCard({ children, className, title }: TerminalCardProps) {
  return (
    <div className={cn("terminal-card crt-scanlines", className)}>
      {title && (
        <>
          <div className="terminal-prompt text-sm mb-2">{title}</div>
          <div className="ascii-divider">
            {'─'.repeat(30)}
          </div>
        </>
      )}
      {children}
    </div>
  );
}

interface SkillTagProps {
  skill: string;
  className?: string;
}

export function SkillTag({ skill, className }: SkillTagProps) {
  return (
    <span className={cn("skill-tag", className)}>
      {skill}
    </span>
  );
}