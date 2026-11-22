"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps a server-rendered page up to date: asks for fresh data every few
 * seconds while the tab is on screen, and when you come back to it. Same
 * approach as the notification bell (polling), so a new M-PESA payment shows
 * up without reloading.
 */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && router.refresh();
    const id = setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, seconds]);
  return null;
}
