"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { labelPayment, reconcilePayment } from "@/app/(app)/payments/actions";
import { CloseIcon } from "@/components/icons";
import { kes } from "@/lib/format";

export interface AssignTargets {
  invoices: { id: string; number: string; schoolName: string; owed: number }[];
  schools: { id: string; name: string }[];
  topics: { id: string; label: string }[];
  categories: string[];
}
export interface AssignRow {
  id: string;
  receipt: string;
  amount: number;
  payerName: string | null;
  suggestedSchoolId?: string | null;
}

const field = "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-base outline-none focus:border-lime sm:text-sm";

/**
 * "Assign" for a payment nobody could identify. A school or invoice is
 * reconciled by hand exactly as on the payment page (it credits the ledger,
 * so it needs a reason). A topic or category is only a label.
 */
export function AssignPayment({ row, targets }: { row: AssignRow; targets: AssignTargets }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(row.suggestedSchoolId ? `school:${row.suggestedSchoolId}` : "");
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  const credits = choice.startsWith("invoice:") || choice.startsWith("school:") || choice === "none";

  const submit = () => {
    setError(null);
    start(async () => {
      if (credits) {
        if (!note.trim()) return setError("Give a reason for the match.");
        const fd = new FormData();
        fd.set("id", row.id);
        fd.set("target", choice);
        fd.set("note", note);
        await reconcilePayment(fd); // redirects to the payment page when done
        return;
      }
      const [kind, ...rest] = choice.split(":");
      const value = rest.join(":");
      let id = value;
      let label = value;
      if (kind === "topic") label = targets.topics.find((t) => t.id === value)?.label ?? value;
      if (kind === "other") {
        if (!custom.trim()) return setError("Type a category name.");
        id = label = custom.trim();
      }
      const r = await labelPayment(row.id, kind === "topic" ? "topic" : "category", id, label, remember);
      if (!r.ok) return setError(r.message);
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-full bg-lime px-3 py-1 text-xs font-semibold text-ink hover:brightness-95">
        Assign
      </button>
      {open && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Assign payment">
          <button type="button" className="absolute inset-0 bg-ink/25" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-4 top-[8%] mx-auto max-h-[84vh] max-w-md overflow-y-auto rounded-3xl bg-white p-5 text-left shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">Assign this payment</h2>
                <p className="truncate text-sm text-muted">
                  {row.payerName ?? "Unknown payer"} · {kes(row.amount)} · {row.receipt}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2" aria-label="Close">
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            <label className="mt-4 block text-xs font-semibold text-muted" htmlFor={`assign-${row.id}`}>
              It belongs to
            </label>
            <select id={`assign-${row.id}`} value={choice} onChange={(e) => setChoice(e.target.value)} className={`${field} mt-1`}>
              <option value="">Choose…</option>
              {targets.invoices.length > 0 && (
                <optgroup label="Bidii invoices still owed (credits the ledger)">
                  {targets.invoices.map((i) => (
                    <option key={i.id} value={`invoice:${i.id}`}>
                      {i.number} · {i.schoolName} · owes {kes(i.owed)}
                    </option>
                  ))}
                </optgroup>
              )}
              {targets.schools.length > 0 && (
                <optgroup label="Bidii school, no invoice (credits the ledger)">
                  {targets.schools.map((s) => (
                    <option key={s.id} value={`school:${s.id}`}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value="none">Other money in, not a school (credits the ledger)</option>
              {targets.topics.length > 0 && (
                <optgroup label="My topics (label only)">
                  {targets.topics.map((t) => (
                    <option key={t.id} value={`topic:${t.id}`}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Category (label only)">
                {targets.categories.map((c) => (
                  <option key={c} value={`category:${c}`}>
                    {c}
                  </option>
                ))}
                <option value="other">Other (type a name)…</option>
              </optgroup>
            </select>
            {choice === "other" && <input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={60} placeholder="Category name" aria-label="Category name" className={`${field} mt-2`} />}
            {credits ? (
              <>
                <label className="mt-3 block text-xs font-semibold text-muted" htmlFor={`why-${row.id}`}>
                  Why
                </label>
                <input id={`why-${row.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: their bursar paid from her own phone" className={`${field} mt-1`} />
                <p className="mt-2 text-xs text-muted">This reconciles the payment and puts {kes(row.amount)} on Bidii&apos;s ledger, the same as &quot;Reconcile by hand&quot; on the payment page.</p>
              </>
            ) : (
              choice && (
                <>
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4" />
                    Remember for the same account number
                  </label>
                  <p className="mt-2 text-xs text-muted">Only a label. Nothing is credited to an invoice or the ledger.</p>
                </>
              )
            )}
            {error && <p className="mt-3 rounded-2xl bg-warn-soft px-4 py-2 text-sm text-warn">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-line px-4 py-2 text-sm font-semibold">
                Cancel
              </button>
              <button type="button" onClick={submit} disabled={!choice || busy} className="rounded-full bg-lime px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">
                {busy ? "Saving…" : credits ? `Reconcile and credit ${kes(row.amount)}` : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
