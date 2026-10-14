export type Role = "td_cofounder" | "product_cofounder" | "product_team" | "accountant";

export type Permission =
  | "approver"
  | "second_signer"
  | "statement_checker"
  | "statement_preparer"
  | "task_reviewer"
  | "month_closer"
  | "commission_assigner"
  | "special_price_approver"
  | "ledger_editor"
  | "settings_editor"
  | "people_admin"
  | "task_assigner";

export interface Viewer {
  id: string;
  slug: string;
  name: string;
  email: string;
  role: Role;
  shareClass: "A" | "B" | null;
  /** Ledgers this person may see. Class A co-founders see every ledger. */
  ledgers: string[];
  permissions: Record<string, Permission[]>;
  approverLimit: number | null;
  /** Has an active super admin account in Bidii (Bidii decides). */
  bidiiSuperAdmin: boolean;
  /** True until the person replaces the temporary password an admin gave them. */
  mustChangePassword: boolean;
}

export interface Pot {
  id: string;
  ledgerId: string;
  key: string;
  name: string;
  classAOnly: boolean;
  balance: number;
}

export type LineType =
  | "money_in"
  | "bill"
  | "commission"
  | "pay"
  | "fee"
  | "transfer"
  | "refund"
  | "advance_held"
  | "advance_release";

export interface LedgerLine {
  id: string;
  ledgerId: string;
  occurredOn: string;
  type: LineType;
  potId: string | null;
  amount: number;
  who: string | null;
  description: string;
  status: "draft" | "approved" | "reconciled";
  hasReceipt: boolean;
  edits: number;
}

export interface SpendRequest {
  id: string;
  ledgerId: string;
  potId: string;
  potName: string;
  requesterSlug: string;
  requesterName: string;
  amount: number;
  purpose: string;
  status: "waiting" | "approved" | "rejected" | "paid" | "closed";
  createdAt: string;
  receiptDueOn: string | null;
  hasReceipt: boolean;
  approvals: { name: string; decision: "approve" | "reject" }[];
}

export interface School {
  id: string;
  name: string;
  package: "monthly" | "termly" | "yearly" | "buy_it_once";
  students: number;
  lowFee: boolean;
  founding10: boolean;
  groupCampuses: number | null;
  status: "lead" | "signed" | "paying" | "paused" | "refunded" | "ended";
  signedOn: string | null;
  finder: { kind: "team" | "outside"; name: string } | null;
}

export interface Invoice {
  id: string;
  number: string;
  schoolName: string;
  kind: "subscription" | "onboarding" | "messaging" | "licence" | "credit";
  periodLabel: string;
  amount: number;
  paid: number;
  issuedOn: string;
  dueOn: string;
  status: "open" | "part_paid" | "paid" | "written_off" | "credited";
}

export interface Statement {
  id: string;
  periodLabel: string;
  personName: string;
  personSlug: string;
  status: "prepared" | "checked" | "paid";
  total: number;
  figures: { label: string; amount: number; how: string }[];
}

export interface SettingRow {
  key: string;
  ledgerId: string;
  value: unknown;
  approvalRule: "all_shareholders" | "both_classes" | "both_cofounders" | "holder";
  effectiveFrom: string;
  reason: string;
}

export interface MonthToDate {
  periodLabel: string;
  startsOn: string;
  endsOn: string;
  income: number;
  bills: number;
  commissions: number;
  misses: Record<string, number>;
  reserveBalance: number;
  monthlyRunningCosts: number;
}

export interface ComingUpItem {
  date: string;
  label: string;
  kind: "bill" | "invoice" | "request" | "receipt" | "payout";
  amount?: number;
}
