"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Switch between ledgers (Trillionaire Designs / Bidii). Big, equal halves
 * that are easy to hit with a thumb, and it moves the moment it is tapped;
 * the figures fade while the other ledger loads.
 */
export function LedgerSwitch({
  ledgers,
  current,
  names,
}: {
  ledgers: string[];
  current: string;
  names: Record<string, string>;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState(current);
  const [loading, start] = useTransition();

  const choose = (id: string) => {
    if (id === picked) return;
    setPicked(id);
    start(() => router.push(`/money?ledger=${id}`, { scroll: false }));
  };

  return (
    <div className="mb-5">
      <div
        role="tablist"
        aria-label="Ledger"
        className="relative grid w-full rounded-full border border-line bg-white p-1 sm:inline-grid sm:w-auto"
        style={{ gridTemplateColumns: `repeat(${ledgers.length}, minmax(0, 1fr))` }}
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
              className={`relative z-10 min-h-11 truncate rounded-full px-5 text-sm font-semibold transition-colors sm:min-w-40 ${on ? "text-white" : "text-ink/65 active:bg-surface"}`}
            >
              {/* Phones get the first word ("Trillionaire"), so it never cuts off. */}
              <span className="sm:hidden">{(names[id] ?? id).split(" ")[0]}</span>
              <span className="hidden sm:inline">{names[id] ?? id}</span>
            </button>
          );
        })}
      </div>
      {loading && <p className="mt-2 text-xs text-muted">Loading {names[picked] ?? picked}…</p>}
    </div>
  );
}
