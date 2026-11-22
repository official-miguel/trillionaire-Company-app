"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Empty } from "@/components/ui";
import { deleteTopic, duplicateTopic, saveTopic } from "@/app/(app)/topics/actions";
import { kes } from "@/lib/format";
import {
  FIELD_TYPES,
  TOPIC_COLORS,
  TOPIC_ICONS,
  doneSummary,
  fieldTotals,
  ledgerSummary,
  newId,
  toCsv,
  type CellValue,
  type FieldType,
  type Topic,
  type TopicField,
} from "@/lib/topics/types";

const input = "w-full rounded-xl border border-line bg-white px-3 py-2 text-base outline-none focus:border-lime sm:text-sm";
const small = "rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:border-ink/30 disabled:opacity-30";

function move<T>(list: T[], i: number, by: number): T[] {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

const fmt = (f: TopicField, v: CellValue | undefined) => (f.type === "money" && typeof v === "number" ? kes(v) : String(v ?? ""));
const n = (x: number) => x.toLocaleString("en-KE", { maximumFractionDigits: 2 });

/**
 * One custom topic. It is whatever you set it up to be: choose the fields,
 * add items, and it totals, searches, sorts and exports. Saves by itself.
 */
export function TopicView({ initial }: { initial: Topic }) {
  const router = useRouter();
  const [topic, setTopic] = useState(initial);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(""); // "" = your own order, else "<fieldId>:asc|desc"
  const [hideDone, setHideDone] = useState(false);
  const latest = useRef(topic);
  const dirty = useRef(false);
  const tabChanged = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    setStatus("saving");
    const r = await saveTopic(latest.current);
    if (!r.ok) {
      dirty.current = true;
      setStatus("error");
      setError(r.message);
      return;
    }
    setError(null);
    setStatus(dirty.current ? "saving" : "saved");
    if (tabChanged.current) {
      tabChanged.current = false;
      router.refresh(); // the tab shows the new name / icon
    }
  }, [router]);

  const change = (fn: (t: Topic) => Topic, tab = false) => {
    const next = fn(latest.current);
    latest.current = next;
    setTopic(next);
    dirty.current = true;
    if (tab) tabChanged.current = true;
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  };

  // Save what is pending when leaving the page.
  useEffect(() => {
    const onHide = () => dirty.current && void flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      if (timer.current) clearTimeout(timer.current);
      onHide();
    };
  }, [flush]);

  const setCell = (itemId: string, fieldId: string, v: CellValue) =>
    change((t) => ({ ...t, items: t.items.map((it) => (it.id === itemId ? { ...it, values: { ...it.values, [fieldId]: v } } : it)) }));
  const setField = (id: string, patch: Partial<TopicField>) => change((t) => ({ ...t, fields: t.fields.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  const totals = fieldTotals(topic);
  const ledger = ledgerSummary(topic);
  const done = doneSummary(topic);
  const checkbox = topic.fields.find((f) => f.type === "checkbox");

  // Search, "hide done" and sort only change what is shown, never the saved order.
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = topic.items.map((it, index) => ({ it, index }));
    if (q) list = list.filter(({ it }) => topic.fields.some((f) => fmt(f, it.values[f.id]).toLowerCase().includes(q)));
    if (hideDone && checkbox) list = list.filter(({ it }) => it.values[checkbox.id] !== true);
    if (sort) {
      const [fid, dir] = sort.split(":");
      const f = topic.fields.find((x) => x.id === fid);
      if (f) {
        const num = f.type === "number" || f.type === "money";
        list = [...list].sort((a, b) => {
          const x = a.it.values[f.id];
          const y = b.it.values[f.id];
          const r = num ? Number(x ?? 0) - Number(y ?? 0) : String(x ?? "").localeCompare(String(y ?? ""));
          return dir === "desc" ? -r : r;
        });
      }
    }
    return list;
  }, [topic, search, hideDone, sort, checkbox]);
  const filtering = !!search.trim() || hideDone || !!sort;

  const remove = async () => {
    if (timer.current) clearTimeout(timer.current);
    dirty.current = false;
    const r = await deleteTopic(topic.id);
    if (!r.ok) return setError(r.message);
    router.push("/money?ledger=bidii");
    router.refresh();
  };

  const copy = async () => {
    await flush();
    const r = await duplicateTopic(topic.id);
    if (!r.ok) return setError(r.message);
    router.push(`/money?ledger=topic:${r.data.id}`);
    router.refresh();
  };

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob(["﻿" + toCsv(topic)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${topic.name.replace(/[^\w-]+/g, "_") || "topic"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: `${topic.color}26` }} aria-hidden>
            {topic.icon}
          </span>
          <input value={topic.name} onChange={(e) => change((t) => ({ ...t, name: e.target.value }), true)} aria-label="Topic name" maxLength={60} className="min-w-0 flex-1 bg-transparent text-xl font-semibold outline-none focus:underline" />
          <span className="text-xs text-muted" aria-live="polite">
            {status === "saving" ? "Saving…" : status === "error" ? "Not saved" : "Saved"}
          </span>
          <button type="button" onClick={() => setSetup((s) => !s)} className={small} aria-expanded={setup}>
            {setup ? "Done" : "Customize"}
          </button>
        </div>
        {error && <p className="mt-3 rounded-2xl bg-warn-soft px-4 py-2 text-sm text-warn">{error}</p>}

        {setup && (
          <div className="mt-5 flex flex-col gap-5 border-t border-line pt-5">
            <div>
              <p className="mb-2 text-xs font-semibold text-muted">Icon</p>
              <div className="flex flex-wrap gap-2">
                {TOPIC_ICONS.map((i) => (
                  <button key={i} type="button" onClick={() => change((t) => ({ ...t, icon: i }), true)} aria-label={`Icon ${i}`} aria-pressed={topic.icon === i} className={`h-10 w-10 rounded-xl border text-xl ${topic.icon === i ? "border-ink" : "border-line"}`}>
                    {i}
                  </button>
                ))}
              </div>
              <p className="mb-2 mt-4 text-xs font-semibold text-muted">Colour</p>
              <div className="flex flex-wrap gap-2">
                {TOPIC_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => change((t) => ({ ...t, color: c }), true)} aria-label={`Colour ${c}`} aria-pressed={topic.color === c} className={`h-9 w-9 rounded-full border-2 ${topic.color === c ? "border-ink" : "border-transparent"}`} style={{ background: c }} />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold text-muted">Fields (the columns of each item)</p>
              <p className="mb-3 text-xs text-muted">Add anything you need to track. A &quot;Choice list&quot; with In and Out plus a money field turns this topic into a money tracker with a balance.</p>
              <ul className="flex flex-col gap-3">
                {topic.fields.map((f, i) => (
                  <li key={f.id} className="rounded-2xl border border-line p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <input value={f.label} onChange={(e) => setField(f.id, { label: e.target.value })} aria-label="Field name" placeholder="Field name" className={`${input} min-w-0 flex-1`} />
                      <select value={f.type} onChange={(e) => setField(f.id, { type: e.target.value as FieldType, options: e.target.value === "select" ? (f.options?.length ? f.options : ["Option 1", "Option 2"]) : f.options })} aria-label="Field type" className={`${input} w-auto`}>
                        {FIELD_TYPES.map((x) => (
                          <option key={x.type} value={x.type}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                      <button type="button" className={small} disabled={i === 0} onClick={() => change((t) => ({ ...t, fields: move(t.fields, i, -1) }))} aria-label="Move field up">
                        ↑
                      </button>
                      <button type="button" className={small} disabled={i === topic.fields.length - 1} onClick={() => change((t) => ({ ...t, fields: move(t.fields, i, 1) }))} aria-label="Move field down">
                        ↓
                      </button>
                      <button type="button" className={small} disabled={topic.fields.length <= 1} onClick={() => confirm(`Delete the field "${f.label || "unnamed"}" and its values in every item?`) && change((t) => ({ ...t, fields: t.fields.filter((x) => x.id !== f.id) }))}>
                        Delete
                      </button>
                    </div>
                    {f.type === "select" && (
                      <label className="mt-2 flex flex-col gap-1 text-xs text-muted">
                        Choices, separated by commas
                        <input
                          defaultValue={(f.options ?? []).join(", ")}
                          onBlur={(e) => setField(f.id, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
                          placeholder="In, Out"
                          className={input}
                        />
                      </label>
                    )}
                  </li>
                ))}
              </ul>
              <button type="button" className={`${small} mt-3`} disabled={topic.fields.length >= 40} onClick={() => change((t) => ({ ...t, fields: [...t.fields, { id: newId(), label: "", type: "text" }] }))}>
                + Add field
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <button type="button" onClick={copy} className={small}>
                Duplicate topic
              </button>
              {confirmDelete ? (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span>
                    Delete &quot;{topic.name}&quot; and all {topic.items.length} items? This can&apos;t be undone.
                  </span>
                  <button type="button" onClick={remove} className="rounded-full bg-danger px-4 py-2 text-sm font-semibold text-white">
                    Yes, delete topic
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className={small}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="text-sm font-semibold text-danger">
                  Delete this topic
                </button>
              )}
            </div>
          </div>
        )}
      </Card>

      {topic.items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Items" value={String(topic.items.length)} />
          {ledger && (
            <>
              <Stat label="Money in" value={kes(ledger.moneyIn)} />
              <Stat label="Money out" value={kes(ledger.moneyOut)} />
              <Stat label="Balance" value={kes(ledger.balance)} bad={ledger.balance < 0} />
            </>
          )}
          {!ledger && totals.map(({ field, total }) => <Stat key={field.id} label={`Total ${field.label || "amount"}`} value={field.type === "money" ? kes(total) : n(total)} />)}
          {done && <Stat label={done.label} value={`${done.done} of ${done.total}`} />}
        </div>
      )}

      <Card
        title="Items"
        action={
          <div className="flex items-center gap-2">
            {topic.items.length > 0 && (
              <button type="button" onClick={exportCsv} className={small}>
                Export CSV
              </button>
            )}
            <button type="button" onClick={() => change((t) => ({ ...t, items: [...t.items, { id: newId(), values: {} }] }))} className="rounded-full bg-lime px-4 py-2 text-sm font-semibold text-ink hover:brightness-95">
              Add item
            </button>
          </div>
        }
      >
        {topic.items.length > 1 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items" aria-label="Search items" className={`${input} min-w-[10rem] flex-1`} />
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort items" className={`${input} w-auto`}>
              <option value="">My order</option>
              {topic.fields
                .filter((f) => f.type !== "notes")
                .flatMap((f) => [
                  <option key={`${f.id}a`} value={`${f.id}:asc`}>
                    {f.label || "Untitled"} ↑
                  </option>,
                  <option key={`${f.id}d`} value={`${f.id}:desc`}>
                    {f.label || "Untitled"} ↓
                  </option>,
                ])}
            </select>
            {checkbox && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="h-4 w-4" />
                Hide done
              </label>
            )}
          </div>
        )}

        {topic.items.length === 0 ? (
          <Empty>
            <span className="block font-medium text-ink">Add your first item</span>
            <span className="mt-1 block">Tap &quot;Add item&quot;, then &quot;Customize&quot; to choose the fields: text, amounts, dates, to-dos, choices, links and notes.</span>
          </Empty>
        ) : shown.length === 0 ? (
          <Empty>Nothing matches.</Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {shown.map(({ it, index }) => (
              <li key={it.id} className="rounded-2xl border border-line p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {topic.fields.map((f) => {
                    const v = it.values[f.id];
                    const label = f.label || "Untitled field";
                    return (
                      <label key={f.id} className={`flex flex-col gap-1 text-xs text-muted ${f.type === "notes" ? "sm:col-span-2" : ""} ${f.type === "checkbox" ? "justify-end" : ""}`}>
                        {f.type !== "checkbox" && label}
                        {f.type === "text" && <input className={input} value={typeof v === "string" ? v : ""} onChange={(e) => setCell(it.id, f.id, e.target.value)} />}
                        {(f.type === "number" || f.type === "money") && <input className={input} type="number" inputMode="decimal" step="any" value={typeof v === "number" ? v : ""} onChange={(e) => setCell(it.id, f.id, e.target.value === "" ? null : Number(e.target.value))} />}
                        {f.type === "date" && <input className={input} type="date" value={typeof v === "string" ? v : ""} onChange={(e) => setCell(it.id, f.id, e.target.value || null)} />}
                        {f.type === "notes" && <textarea className={input} rows={3} value={typeof v === "string" ? v : ""} onChange={(e) => setCell(it.id, f.id, e.target.value)} />}
                        {f.type === "select" && (
                          <select className={input} value={typeof v === "string" ? v : ""} onChange={(e) => setCell(it.id, f.id, e.target.value || null)}>
                            <option value="">—</option>
                            {(f.options ?? []).map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        )}
                        {f.type === "link" && (
                          <span className="flex items-center gap-2">
                            <input className={input} type="url" inputMode="url" placeholder="https://" value={typeof v === "string" ? v : ""} onChange={(e) => setCell(it.id, f.id, e.target.value)} />
                            {typeof v === "string" && /^https?:\/\//i.test(v) && (
                              <a href={v} target="_blank" rel="noopener noreferrer" className={`${small} shrink-0`}>
                                Open
                              </a>
                            )}
                          </span>
                        )}
                        {f.type === "checkbox" && (
                          <span className="flex min-h-10 items-center gap-2 text-sm text-ink">
                            <input type="checkbox" className="h-5 w-5 accent-[var(--lime-deep)]" checked={v === true} onChange={(e) => setCell(it.id, f.id, e.target.checked)} />
                            <span className={v === true ? "text-muted line-through" : ""}>{label}</span>
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button type="button" className={small} disabled={filtering || index === 0} onClick={() => change((t) => ({ ...t, items: move(t.items, index, -1) }))} aria-label="Move item up">
                    ↑
                  </button>
                  <button type="button" className={small} disabled={filtering || index === topic.items.length - 1} onClick={() => change((t) => ({ ...t, items: move(t.items, index, 1) }))} aria-label="Move item down">
                    ↓
                  </button>
                  <button type="button" className={small} onClick={() => change((t) => ({ ...t, items: t.items.filter((x) => x.id !== it.id) }))}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {filtering && topic.items.length > 0 && <p className="mt-3 text-xs text-muted">Showing {shown.length} of {topic.items.length}. Moving items up and down is off while searching, filtering or sorting.</p>}
      </Card>
    </div>
  );
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`tabular mt-1 text-lg font-semibold ${bad ? "text-danger" : ""}`}>{value}</p>
    </div>
  );
}
