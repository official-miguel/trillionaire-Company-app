import Link from "next/link";
import { kes } from "@/lib/format";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ title, action, children, className = "" }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** A figure that opens the ledger lines behind it. */
export function Money({ amount, href, className = "" }: { amount: number; href?: string; className?: string }) {
  const text = <span className={`tabular whitespace-nowrap ${amount < 0 ? "text-danger" : ""} ${className}`}>{kes(amount)}</span>;
  return href ? (
    <Link href={href} className="underline decoration-line decoration-2 underline-offset-4 hover:decoration-lime">
      {text}
    </Link>
  ) : (
    text
  );
}

const TONES = {
  green: "bg-lime-soft text-lime-deep",
  grey: "bg-surface text-ink/70",
  amber: "bg-warn-soft text-warn",
  red: "bg-[#fdecea] text-danger",
  ink: "bg-ink text-white",
};

export function Badge({ tone = "grey", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

export function ButtonLink({ href, children, variant = "lime" }: { href: string; children: React.ReactNode; variant?: "lime" | "outline" }) {
  return (
    <Link
      href={href}
      className={
        variant === "lime"
          ? "inline-flex items-center gap-2 rounded-full bg-lime px-5 py-2.5 text-sm font-semibold text-ink transition hover:brightness-95"
          : "inline-flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-ink/30"
      }
    >
      {children}
    </Link>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-surface px-4 py-6 text-center text-sm text-muted">{children}</p>;
}
