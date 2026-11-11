import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { Tag } from "./tag";

type Props = {
  value: string[];
  onChange: (v: string[]) => void;
  suggestions?: string[];
  max: number;
  placeholder?: string;
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

/** Free-form tag entry with keyboard support and suggestion list (combobox pattern). */
export function TagInput({ value, onChange, suggestions = [], max, placeholder, id, ...aria }: Props) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const lower = value.map((v) => v.toLowerCase());
  const full = value.length >= max;

  const matches = useMemo(() => {
    const d = draft.trim().toLowerCase();
    return suggestions.filter((s) => !lower.includes(s.toLowerCase()) && (!d || s.toLowerCase().includes(d))).slice(0, 8);
  }, [draft, suggestions, lower]);

  const add = (raw: string) => {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const next = [...value];
    for (const p of parts) if (next.length < max && !next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p.slice(0, 40));
    onChange(next);
    setDraft("");
    setActive(0);
    // close the list so it never covers the controls below; typing or ArrowDown reopens it
    setOpen(false);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (open && matches[active] && (!draft.trim() || matches[active].toLowerCase().includes(draft.trim().toLowerCase()))) add(matches[active]);
      else if (draft.trim()) add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className="relative">
      <div
        className={cn(
          "flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-[var(--radius-input)] border border-line-strong bg-surface px-2 py-1.5 shadow-xs transition-[border-color,box-shadow] focus-within:border-ink focus-within:shadow-[0_0_0_3px_var(--color-needle-soft)]",
          aria["aria-invalid"] && "border-danger",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((t, i) => (
          <Tag key={t + i} tone="outline" onRemove={() => onChange(value.filter((_, j) => j !== i))}>
            {t}
          </Tag>
        ))}
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
          {...aria}
          value={draft}
          disabled={full}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(",")) add(v);
            else {
              setDraft(v);
              setOpen(true);
              setActive(0);
            }
          }}
          onKeyDown={onKey}
          onFocus={() => !value.length && setOpen(true)}
          onBlur={() => {
            setTimeout(() => setOpen(false), 120);
            if (draft.trim()) add(draft);
          }}
          placeholder={full ? `Limit of ${max} reached` : value.length ? "" : placeholder}
          className="h-8 min-w-[8rem] flex-1 bg-transparent px-1.5 text-[0.94rem] text-ink placeholder:text-ink-4 focus:outline-none disabled:cursor-not-allowed"
        />
      </div>
      {open && !full && matches.length > 0 && (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1.5 max-h-60 w-full overflow-auto rounded-xl border border-line bg-surface p-1 shadow-md">
          {matches.map((m, i) => (
            <li
              key={m}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                add(m);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("cursor-pointer rounded-lg px-3 py-2 text-[0.9rem]", i === active ? "bg-subtle text-ink" : "text-ink-2")}
            >
              {m}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-right text-[0.75rem] text-ink-4" aria-live="polite">
        {value.length}/{max}
      </p>
    </div>
  );
}
