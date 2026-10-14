"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { InstallApp } from "./InstallApp";
import { turnOffPush } from "@/lib/calendar/push";
import {
  CalendarIcon,
  CloseIcon,
  ExternalIcon,
  HomeIcon,
  LedgerIcon,
  LogoutIcon,
  MenuIcon,
  RequestIcon,
  SchoolIcon,
  PeopleIcon,
  SettingsIcon,
  StatementIcon,
} from "./icons";

const NAV = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/calendar", label: "Calendar", Icon: CalendarIcon },
  { href: "/money", label: "Money", Icon: LedgerIcon },
  { href: "/requests", label: "Requests", Icon: RequestIcon },
  { href: "/schools", label: "Schools & invoices", Icon: SchoolIcon },
  { href: "/statements", label: "Statements", Icon: StatementIcon },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
];

export interface SidebarProps {
  name: string;
  roleLabel: string;
  bidiiSuperAdmin: boolean;
  peopleAdmin: boolean;
  demo?: { current: string; options: { slug: string; label: string }[]; action: (formData: FormData) => void };
  signOut: () => void;
}

export function Sidebar({ name, roleLabel, bidiiSuperAdmin, peopleAdmin, demo, signOut }: SidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // The tapped item lights up at once, before the page has finished loading.
  const [tapped, setTapped] = useState<string | null>(null);
  useEffect(() => setTapped(null), [pathname]);
  const isAt = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const active = (href: string) => (tapped ? tapped === href : isAt(href));

  const nav = (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {[...NAV, ...(peopleAdmin ? [{ href: "/people", label: "People", Icon: PeopleIcon }] : [])].map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={() => {
            setOpen(false);
            if (!isAt(href)) setTapped(href);
          }}
          aria-current={active(href) ? "page" : undefined}
          className={`flex items-center gap-3 rounded-full px-4 py-2.5 text-[15px] transition-colors ${
            active(href) ? "bg-lime-soft font-semibold text-ink" : "text-ink/65 hover:bg-surface hover:text-ink"
          }`}
        >
          <Icon className={`w-[18px] h-[18px] ${active(href) ? "text-lime-deep" : ""}`} />
          {label}
        </Link>
      ))}
      {bidiiSuperAdmin && (
        <a
          href="/bidii-admin"
          className="mt-3 flex items-center justify-between rounded-full border border-line px-4 py-2.5 text-[15px] text-ink/80 hover:border-ink/30"
        >
          Bidii super admin
          <ExternalIcon className="w-4 h-4" />
        </a>
      )}
    </nav>
  );

  const footer = (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      <InstallApp />
      {demo && (
        <form action={demo.action} className="rounded-2xl bg-warn-soft p-3 text-xs text-warn">
          <label className="font-semibold" htmlFor="demo-as">
            Demo: view as
          </label>
          <select
            id="demo-as"
            name="as"
            defaultValue={demo.current}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="mt-1.5 w-full rounded-full border border-warn/30 bg-white px-3 py-1.5 text-sm text-ink"
          >
            {demo.options.map((o) => (
              <option key={o.slug} value={o.slug}>
                {o.label}
              </option>
            ))}
          </select>
        </form>
      )}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-xs text-muted">{roleLabel}</p>
        </div>
        <form
          action={async () => {
            // This device stops getting this person's reminders and kept pages.
            navigator.serviceWorker?.controller?.postMessage("clear-pages");
            await turnOffPush().catch(() => undefined);
            await signOut();
          }}
        >
          <button className="rounded-full p-2 text-ink/60 hover:bg-surface hover:text-ink" aria-label="Sign out" title="Sign out">
            <LogoutIcon />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Phone: top bar with a menu sheet */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <button
          onClick={() => setOpen(true)}
          className="rounded-full p-2 text-ink"
          aria-label="Open menu"
          aria-expanded={open}
        >
          <MenuIcon className="w-6 h-6" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-ink/20" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[82%] max-w-xs flex-col gap-6 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <Logo />
              <button onClick={() => setOpen(false)} className="rounded-full p-2" aria-label="Close menu">
                <CloseIcon className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{nav}</div>
            {footer}
          </div>
        </div>
      )}

      {/* Laptop: fixed left menu */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-8 border-r border-line bg-white px-4 py-6 lg:flex">
        <div className="px-3">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        {footer}
      </aside>
    </>
  );
}
