// The wordmark from the website: Grand Hotel script with a green </>.
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="font-script text-xl leading-none text-ink">Trillionaire Designs</span>
      <span className="font-mono text-xs font-semibold text-lime-deep">{"</>"}</span>
    </span>
  );
}
