"use client";

import { useEffect } from "react";
import { addDays, timeLabel } from "@/lib/calendar/dates";
import { occurrences } from "@/lib/calendar/recurrence";
import type { CalEvent } from "@/lib/calendar/types";

const FIRED_KEY = "td-cal-reminded";

// Installed apps (and phones) need the service worker to show a notification;
// a plain browser tab can show one directly.
function notify(title: string, options: NotificationOptions) {
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg) void reg.showNotification(title, options);
      else new Notification(title, options);
    });
  } else {
    new Notification(title, options);
  }
}

/**
 * Shows a notification when a reminder is due, while the app is open (or
 * installed and running). Each reminder fires once per device.
 */
export function useReminders(events: CalEvent[]) {
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const check = () => {
      if (Notification.permission !== "granted") return;
      const now = new Date();
      let fired: string[] = [];
      try {
        fired = JSON.parse(localStorage.getItem(FIRED_KEY) ?? "[]");
      } catch {}
      const due = occurrences(events.filter((e) => e.reminders.length), addDays(now, -1), addDays(now, 2));
      for (const o of due) {
        for (const before of o.event.reminders) {
          const at = o.start.getTime() - before * 60_000;
          const key = `${o.key}:${before}`;
          if (at <= now.getTime() && now.getTime() - at < 10 * 60_000 && !fired.includes(key)) {
            const body = o.event.allDay ? "Today" : `${timeLabel(o.start)}${o.event.location ? ` · ${o.event.location}` : ""}`;
            notify(o.event.title, { body, tag: key, icon: "/icons/icon-192.png", badge: "/icons/badge-96.png", requireInteraction: true });
            fired.push(key);
          }
        }
      }
      try {
        localStorage.setItem(FIRED_KEY, JSON.stringify(fired.slice(-300)));
      } catch {}
    };

    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [events]);
}
