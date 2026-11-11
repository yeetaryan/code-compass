import { ArrowUpRight, AtSign, BriefcaseBusiness, FolderGit2, Globe, Mail, MessageCircle, Star } from "lucide-react";
import type { Contact } from "@shared/api-types";
import { CONTACT_LABELS, type ContactChannel } from "@shared/constants";
import { cn } from "@/lib/utils";

export const channelIcon: Record<ContactChannel, typeof Mail> = {
  linkedin: BriefcaseBusiness,
  x: AtSign,
  github: FolderGit2,
  whatsapp: MessageCircle,
  email: Mail,
  website: Globe,
};

/** External links open in a new tab with noopener/noreferrer; hrefs are built server-side from validated values. */
export function ContactLinks({ contacts, preferred, compact, className }: { contacts: Contact[]; preferred?: ContactChannel | null; compact?: boolean; className?: string }) {
  if (!contacts.length) return null;
  const sorted = [...contacts].sort((a, b) => Number(b.channel === preferred) - Number(a.channel === preferred));
  return (
    <ul className={cn("flex flex-wrap gap-2", className)}>
      {sorted.map((c) => {
        const Icon = channelIcon[c.channel];
        const isPreferred = c.channel === preferred;
        const external = !c.href.startsWith("mailto:");
        return (
          <li key={c.channel}>
            <a
              href={c.href}
              target={external ? "_blank" : undefined}
              rel={external ? "noopener noreferrer nofollow" : undefined}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "group inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[0.84rem] font-medium transition-colors",
                c.channel === "linkedin" ? "border-ink/80 bg-ink text-canvas hover:bg-ink-2" : "border-line-strong bg-surface text-ink-2 hover:border-ink-4 hover:text-ink",
              )}
              aria-label={`${CONTACT_LABELS[c.channel]}${compact ? "" : `: ${c.value}`}${isPreferred ? " (preferred)" : ""} — opens ${external ? "in a new tab" : "your email app"}`}
            >
              <Icon className="size-4" aria-hidden />
              <span>{compact ? CONTACT_LABELS[c.channel] : c.channel === "linkedin" ? "LinkedIn" : c.value}</span>
              {isPreferred && <Star className="size-3 fill-current text-needle" aria-hidden />}
              {external && <ArrowUpRight className="size-3.5 opacity-50 transition-opacity group-hover:opacity-90" aria-hidden />}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
