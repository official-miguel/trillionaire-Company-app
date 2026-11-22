"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { listNotifications, readNotifications } from "@/app/actions";
import type { AppNotification } from "@/lib/data/notifications";
import { kes } from "@/lib/format";
import { BellIcon, CloseIcon } from "./icons";

export interface BellState {
  items: AppNotification[];
  unread: number;
}

const STATUS: Record<string, { label: string; className: string }> = {
  matched: { label: "Reconciled", className: "bg-lime-soft text-lime-deep" },
  unmatched: { label: "Not matched", className: "bg-warn-soft text-warn" },
  review: { label: "Needs review", className: "bg-warn-soft text-warn" },
  reversed: { label: "Reversed", className: "bg-surface text-ink/70" },
  received: { label: "Received", className: "bg-surface text-ink/70" },
  failed: { label: "Failed", className: "bg-[#fdecea] text-danger" },
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Nairobi" });

/**
 * The notifications behind the bell, shared by the phone bar and the laptop
 * menu. Asked for again when the bell opens, when the window comes back into
 * view, and every minute.
 */
export function useNotifications(initial: BellState) {
  const [state, setState] = useState(initial);
  // A reply that left before the last "mark read" would bring back old unread
  // counts, so it is dropped.
  const version = useRef(0);
  const refresh = useCallback(() => {
    const asked = version.current;
    listNotifications()
      .then((s) => asked === version.current && setState(s))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && refresh(), 60_000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const markRead = useCallback((ids: string[] | null) => {
    version.current++;
    setState((s) => ({
      items: s.items.map((i) => (ids === null || ids.includes(i.id) ? { ...i, read: true } : i)),
      unread: ids === null ? 0 : Math.max(0, s.unread - s.items.filter((i) => ids.includes(i.id) && !i.read).length),
    }));
    readNotifications(ids).catch(() => undefined);
  }, []);
  return { ...state, refresh, markRead };
}

export function NotificationBell({
  bell,
  placement,
}: {
  bell: ReturnType<typeof useNotifications>;
  /** "bar": phone top bar (panel under it); "menu": laptop menu (panel beside it). */
  placement: "bar" | "menu";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open) bell.refresh();
    setOpen(!open);
  };
  const go = (n: AppNotification) => {
    if (!n.read) bell.markRead([n.id]);
    setOpen(false);
    router.push(n.url);
  };

  return (
    <div ref={box} className="relative">
      <button
        onClick={toggle}
        className="relative rounded-full p-2 text-ink hover:bg-surface"
        aria-label={bell.unread ? `Notifications, ${bell.unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <BellIcon className="h-6 w-6" />
        {bell.unread > 0 && (
          <span className="tabular absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-lime px-1 text-[11px] font-bold text-ink ring-2 ring-white">
            {bell.unread > 99 ? "99+" : bell.unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={`z-50 flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl ${
            placement === "bar" ? "fixed inset-x-4 top-16" : "absolute left-0 top-full mt-2 w-[24rem]"
          }`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <p className="font-semibold">Notifications</p>
            <div className="flex items-center gap-1">
              {bell.unread > 0 && (
                <button onClick={() => bell.markRead(null)} className="rounded-full px-3 py-1.5 text-sm font-medium text-lime-deep hover:bg-lime-soft">
                  Mark all as read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="rounded-full p-1.5 text-ink/60 hover:bg-surface" aria-label="Close notifications">
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
          {bell.items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted">Nothing yet. Payments and changes show up here.</p>
          ) : (
            <ul className="divide-y divide-line overflow-y-auto">
              {bell.items.map((n) => (
                <li key={n.id} className={`flex items-start gap-2 ${n.read ? "" : "bg-lime-soft/40"}`}>
                  <button onClick={() => go(n)} className="min-w-0 flex-1 px-4 py-3 text-left hover:bg-surface">
                    <p className={`text-sm ${n.read ? "" : "font-semibold"}`}>{n.title}</p>
                    {n.payment ? (
                      <>
                        <p className="mt-0.5 text-sm">
                          <span className="tabular font-medium">{kes(n.payment.amount)}</span>
                          <span className="text-muted"> · {n.payment.payer || n.payment.phone}</span>
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                          <span className="font-mono">{n.payment.receipt}</span>
                          <span>{when(n.payment.paidAt)}</span>
                          {STATUS[n.payment.status] && (
                            <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS[n.payment.status].className}`}>{STATUS[n.payment.status].label}</span>
                          )}
                        </p>
                      </>
                    ) : (
                      <>
                        {n.body && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{n.body}</p>}
                        <p className="mt-0.5 text-xs text-muted">{when(n.at)}</p>
                      </>
                    )}
                  </button>
                  {!n.read && (
                    <button
                      onClick={() => bell.markRead([n.id])}
                      className="mr-2 mt-3 shrink-0 rounded-full px-2 py-1 text-xs text-muted hover:bg-white hover:text-ink"
                      aria-label={`Mark "${n.title}" as read`}
                    >
                      Mark read
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
