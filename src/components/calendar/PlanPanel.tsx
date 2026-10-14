"use client";

import { useState } from "react";
import { shortDate } from "@/lib/format";
import { dayKey, timeLabel } from "@/lib/calendar/dates";
import type { Todo } from "@/lib/calendar/types";

export function PlanPanel({
  todos,
  given,
  names,
  onAdd,
  onToggle,
  onPlan,
  onUnplan,
  onDelete,
}: {
  /** The person's own to-dos and tasks given to them. */
  todos: Todo[];
  /** Tasks this person gave to others. */
  given: Todo[];
  names: Record<string, string>;
  onAdd: (title: string) => void;
  onToggle: (t: Todo) => void;
  onPlan: (t: Todo) => void;
  onUnplan: (t: Todo) => void;
  onDelete: (t: Todo) => void;
}) {
  const [text, setText] = useState("");
  const today = dayKey(new Date());
  const order = (t: Todo) => t.scheduledStart ?? (t.dueOn ? `${t.dueOn}T23:59` : "z");
  const open = todos.filter((t) => !t.doneAt).sort((a, b) => order(a).localeCompare(order(b)));
  const done = todos.filter((t) => t.doneAt).slice(-5);
  const first = (id: string | null) => (id ? (names[id] ?? "someone").split(" ")[0] : "");

  return (
    <section aria-label="Tasks">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Tasks</h2>
        <span className="text-xs text-muted">{open.length} open</span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onAdd(text.trim());
          setText("");
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a to-do"
          className="w-full rounded-full border border-line bg-white px-4 py-2 text-sm outline-none focus:border-lime"
        />
      </form>
      <ul className="mt-3 flex flex-col gap-1">
        {open.map((t) => {
          const late = t.dueOn && t.dueOn < today;
          return (
            <li key={t.id} className="group flex items-start gap-2 rounded-xl px-1.5 py-1.5 hover:bg-surface">
              <input type="checkbox" checked={false} onChange={() => onToggle(t)} className="mt-1 h-4 w-4 shrink-0 accent-[#32cd32]" aria-label={`Done: ${t.title}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug">{t.title}</p>
                <p className="flex flex-wrap gap-x-2 text-xs">
                  {t.assignedBy && <span className="font-medium text-ink/70">From {first(t.assignedBy)}</span>}
                  {t.dueOn && <span className={late ? "text-danger" : "text-muted"}>{late ? "Late, was due" : "Due"} {shortDate(t.dueOn)}</span>}
                  {t.scheduledStart ? (
                    <button onClick={() => onUnplan(t)} className="text-lime-deep hover:underline">
                      Planned {new Date(t.scheduledStart).toLocaleDateString("en-KE", { weekday: "short" })} {timeLabel(new Date(t.scheduledStart))} · unplan
                    </button>
                  ) : (
                    <button onClick={() => onPlan(t)} className="font-medium text-ink/60 hover:text-lime-deep">
                      Plan it into my day
                    </button>
                  )}
                </p>
              </div>
              {!t.assignedBy && (
                <button onClick={() => onDelete(t)} className="rounded-full px-1.5 text-ink/30 opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100" aria-label={`Remove ${t.title}`}>
                  ×
                </button>
              )}
            </li>
          );
        })}
        {open.length === 0 && <li className="px-1.5 py-2 text-sm text-muted">Nothing to do. Enjoy it.</li>}
      </ul>
      {done.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer px-1.5 text-xs text-muted">Done ({done.length})</summary>
          <ul className="mt-1 flex flex-col gap-1">
            {done.map((t) => (
              <li key={t.id} className="flex items-center gap-2 px-1.5 py-1 text-sm text-muted line-through">
                <input type="checkbox" checked onChange={() => onToggle(t)} className="h-4 w-4 accent-[#32cd32]" aria-label={`Not done: ${t.title}`} />
                {t.title}
              </li>
            ))}
          </ul>
        </details>
      )}

      {given.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Tasks I gave</h3>
          <ul className="flex flex-col gap-1">
            {given.map((t) => (
              <li key={t.id} className="group flex items-start justify-between gap-2 rounded-xl px-1.5 py-1 text-sm hover:bg-surface">
                <span className={`min-w-0 ${t.doneAt ? "text-muted line-through" : ""}`}>
                  {t.title}
                  <span className="block text-xs text-muted no-underline">
                    {first(t.ownerId)}
                    {t.doneAt ? " · done" : t.dueOn ? ` · due ${shortDate(t.dueOn)}` : t.scheduledStart ? ` · ${shortDate(t.scheduledStart)} ${timeLabel(new Date(t.scheduledStart))}` : ""}
                  </span>
                </span>
                {!t.doneAt && (
                  <button onClick={() => onDelete(t)} className="shrink-0 text-xs text-ink/40 opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100">
                    Cancel
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
