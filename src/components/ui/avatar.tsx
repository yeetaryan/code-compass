import { useState } from "react";
import { cn, initials } from "@/lib/utils";

const palette = ["#E9E1D3", "#E3E8DF", "#E6E0EA", "#F1DDD3", "#DDE6EA", "#EDE5CF"];
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export function Avatar({ name, src, size = 40, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const bg = palette[hash(name) % palette.length];
  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full border border-ink/5 font-display font-semibold text-ink-2", className)}
      style={{ width: size, height: size, background: bg, fontSize: Math.max(11, size * 0.36) }}
      aria-hidden={!src}
    >
      {src && !failed ? (
        <img src={src} alt={`${name}'s photo`} width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(true)} className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

export function AvatarStack({ people, max = 4, size = 28 }: { people: { id: string; name: string; avatarUrl: string | null }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="flex -space-x-2">
      {shown.map((p) => (
        <Avatar key={p.id} name={p.name} src={p.avatarUrl} size={size} className="ring-2 ring-surface" />
      ))}
      {extra > 0 && (
        <span className="grid place-items-center rounded-full bg-subtle text-[0.7rem] font-medium text-ink-3 ring-2 ring-surface" style={{ width: size, height: size }}>
          +{extra}
        </span>
      )}
    </span>
  );
}
