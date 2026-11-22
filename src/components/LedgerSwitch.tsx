"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createTopic } from "@/app/(app)/topics/actions";
import { TEMPLATES, type TopicTab } from "@/lib/topics/types";

/**
 * Switch between ledgers (Trillionaire Designs / Bidii). Big, equal halves
 * that are easy to hit with a thumb, and it moves the moment it is tapped;
 * the figures fade while the other ledger loads.
 */
export function LedgerSwitch({
  ledgers: baseLedgers,
  current,
  names: baseNames,
  topics,
}: {
  ledgers: string[];
  current: string;
  names: Record<string, string>;
  /** Owner's custom topics, shown beside Bidii with a "+" to add more. Omit for no "+". */
  topics?: TopicTab[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [template, setTemplate] = useState("blank");
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Topics sit right after Bidii (or at the end if there is no Bidii tab).
  const topicIds = (topics ?? []).map((t) => `topic:${t.id}`);
  const at = baseLedgers.indexOf("bidii");
  const ledgers = topicIds.length ? (at < 0 ? [...baseLedgers, ...topicIds] : [...baseLedgers.slice(0, at + 1), ...topicIds, ...baseLedgers.slice(at + 1)]) : baseLedgers;
  const names = { ...baseNames, ...Object.fromEntries((topics ?? []).map((t) => [`topic:${t.id}`, `${t.icon} ${t.name}`])) };

  const add = async () => {
    setSaving(true);
    setAddError(null);
    const r = await createTopic(newName, template);
    setSaving(false);
    if (!r.ok) return setAddError(r.message);
    setAdding(false);
    setNewName("");
    setPicked(`topic:${r.data.id}`);
    start(() => router.push(`/money?ledger=topic:${r.data.id}`, { scroll: false }));
  };
  const [picked, setPicked] = useState(current);
  const [loading, start] = useTransition();

  // With many topics the tabs scroll; keep the open one in view. The "+" is
  // outside the scrolling part, so it never scrolls away.
  useEffect(() => {
    document.querySelector('[role="tab"][aria-selected="true"]')?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [picked]);

  const choose = (id: string) => {
    if (id === picked) return;
    setPicked(id);
    start(() => router.push(`/money?ledger=${id}`, { scroll: false }));
  };

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1 overflow-x-auto sm:flex-none">
      <div
        role="tablist"
        aria-label="Ledger"
        className="relative grid w-full rounded-full border border-line bg-white p-1 sm:inline-grid sm:w-auto"
        style={{ gridTemplateColumns: `repeat(${ledgers.length}, minmax(${topicIds.length ? "5.5rem" : "0px"}, 1fr))` }}
        onKeyDown={(e) => {
          const i = ledgers.indexOf(picked);
          if (e.key === "ArrowRight") choose(ledgers[(i + 1) % ledgers.length]);
          if (e.key === "ArrowLeft") choose(ledgers[(i - 1 + ledgers.length) % ledgers.length]);
        }}
      >
        {/* The dark pill slides to the chosen side. */}
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 rounded-full bg-ink transition-transform duration-200 ease-out"
          style={{
            width: `calc((100% - 0.5rem) / ${ledgers.length})`,
            transform: `translateX(${ledgers.indexOf(picked) * 100}%)`,
          }}
        />
        {ledgers.map((id) => {
          const on = id === picked;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => choose(id)}
              className={`relative z-10 min-h-11 truncate rounded-full ${topicIds.length ? "px-3" : "px-5"} text-sm font-semibold transition-colors sm:min-w-40 ${on ? "text-white" : "text-ink/65 active:bg-surface"}`}
            >
              {/* Phones get the first word ("Trillionaire"), so it never cuts off. */}
              <span className="sm:hidden">{(names[id] ?? id).split(" ")[0]}</span>
              <span className="hidden sm:inline">{names[id] ?? id}</span>
            </button>
          );
        })}
      </div>
      </div>
      {topics && (
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          aria-label="Add a topic"
          aria-expanded={adding}
          title="Add a topic"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-white text-xl font-semibold text-ink/70 hover:border-ink/30"
        >
          +
        </button>
      )}
      </div>
      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={60}
            placeholder="Name it, e.g. Farm, Church Fund, Side Hustle"
            aria-label="New topic name"
            className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2.5 text-base outline-none focus:border-lime sm:text-sm"
          />
          <select value={template} onChange={(e) => setTemplate(e.target.value)} aria-label="Start from" className="rounded-full border border-line bg-white px-4 py-2.5 text-base outline-none focus:border-lime sm:text-sm">
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.icon} {t.label} — {t.hint}
              </option>
            ))}
          </select>
          <button disabled={saving || !newName.trim()} className="rounded-full bg-lime px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-50">
            {saving ? "Creating…" : "Create topic"}
          </button>
          {addError && <p className="w-full text-sm text-warn">{addError}</p>}
        </form>
      )}
      {loading && <p className="mt-2 text-xs text-muted">Loading {names[picked] ?? picked}…</p>}
    </div>
  );
}
