"use client";

import { useFormStatus } from "react-dom";

/**
 * A form's button that answers the tap at once: it shows it is working
 * ("Saving…") and can't be pressed twice while the server replies.
 */
export function SubmitButton({
  children,
  pending: pendingText,
  className = "rounded-full bg-lime px-5 py-3 text-sm font-semibold text-ink hover:brightness-95",
  name,
  value,
}: {
  children: React.ReactNode;
  /** What it says while working, for example "Saving…". */
  pending?: string;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending, data } = useFormStatus();
  // With several buttons in one form (Approve / Don't approve), only the one
  // that was pressed says it is working.
  const mine = pending && (!name || data?.get(name) === value);
  return (
    <button
      name={name}
      value={value}
      disabled={pending}
      aria-busy={mine}
      className={`${className} inline-flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:cursor-wait disabled:opacity-70`}
    >
      {mine && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {mine && pendingText ? pendingText : children}
    </button>
  );
}
