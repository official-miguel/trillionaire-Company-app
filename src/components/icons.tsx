// Line icons in the website's style: 24px grid, 1.8 stroke, round caps.
type P = { className?: string };
const base = (className = "w-[18px] h-[18px]") => ({
  viewBox: "0 0 24 24",
  className,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const HomeIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /></svg>
);
export const LedgerIcon = ({ className }: P) => (
  <svg {...base(className)}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
);
export const RequestIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="M12 4v16M5 11l7-7 7 7" /></svg>
);
export const SchoolIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="M12 4 2 9l10 5 10-5-10-5z" /><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" /></svg>
);
export const StatementIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>
);
export const SettingsIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>
);
export const ExternalIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
);
export const AlertIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="M12 4 2.5 20h19L12 4z" /><path d="M12 10v4M12 17.5v.01" /></svg>
);
export const ArrowIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const CheckIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const MenuIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const CloseIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const LogoutIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10" /></svg>
);
export const PeopleIcon = ({ className }: P) => (
  <svg {...base(className)}><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.9-3 3-4.5 5.5-4.5s4.6 1.5 5.5 4.5M16 5.5a3 3 0 0 1 0 5.5M17.5 14.5c1.6.5 2.6 2 3 4.5" /></svg>
);
export const CalendarIcon = ({ className }: P) => (
  <svg {...base(className)}><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
);
