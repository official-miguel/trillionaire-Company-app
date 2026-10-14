// Sample figures for demo mode, matching the examples in
// "How the Web App Should Work" (KES 150,000 counted by the 15th).
import type {
  ComingUpItem,
  Invoice,
  LedgerLine,
  MonthToDate,
  Pot,
  School,
  SpendRequest,
  Statement,
  Viewer,
} from "./types";



export const DEMO_VIEWERS: Record<string, Viewer> = {
  miguel: {
    id: "demo-miguel",
    slug: "miguel",
    name: "Miguel Muiruri",
    email: "miguel@example.com",
    role: "td_cofounder",
    shareClass: "A",
    ledgers: ["company", "bidii"],
    permissions: {
      bidii: ["approver", "second_signer", "statement_checker", "task_reviewer", "commission_assigner", "settings_editor", "task_assigner"],
      company: ["approver", "second_signer", "settings_editor", "people_admin", "task_assigner"],
    },
    approverLimit: 20000,
    bidiiSuperAdmin: true,
    mustChangePassword: false,
    isOwner: true,
  },
  romeo: {
    id: "demo-romeo",
    slug: "romeo",
    name: "Romeo Mbote",
    email: "romeo@example.com",
    role: "td_cofounder",
    shareClass: "A",
    ledgers: ["company", "bidii"],
    permissions: {
      bidii: ["approver", "second_signer", "statement_preparer", "month_closer", "ledger_editor", "settings_editor"],
      company: ["approver", "second_signer", "ledger_editor", "settings_editor"],
    },
    approverLimit: 20000,
    bidiiSuperAdmin: false,
    mustChangePassword: false,
    isOwner: false,
  },
  samuel: {
    id: "demo-samuel",
    slug: "samuel",
    name: "Samuel Kuhia",
    email: "samuel@example.com",
    role: "product_cofounder",
    shareClass: "B",
    ledgers: ["bidii"],
    permissions: { bidii: [] },
    approverLimit: null,
    bidiiSuperAdmin: false,
    mustChangePassword: false,
    isOwner: false,
  },
  larmeck: {
    id: "demo-larmeck",
    slug: "larmeck",
    name: "Larmeck",
    email: "larmeck@example.com",
    role: "product_cofounder",
    shareClass: "B",
    ledgers: ["bidii"],
    permissions: { bidii: ["special_price_approver"] },
    approverLimit: null,
    bidiiSuperAdmin: false,
    mustChangePassword: false,
    isOwner: false,
  },
};

export const DEMO_MONTH: MonthToDate = {
  periodLabel: "October 2026",
  startsOn: "2026-10-01",
  endsOn: "2026-10-31",
  income: 150000,
  bills: 27585,
  commissions: 0,
  misses: {},
  reserveBalance: 96400,
  monthlyRunningCosts: 55170,
};

export const DEMO_POTS: Pot[] = [
  { id: "bidii.growth", ledgerId: "bidii", key: "growth", name: "Bidii growth", classAOnly: false, balance: 84200 },
  { id: "bidii.product", ledgerId: "bidii", key: "product", name: "Bidii product", classAOnly: false, balance: 41750 },
  { id: "bidii.reserve", ledgerId: "bidii", key: "reserve", name: "Bidii reserve", classAOnly: false, balance: 96400 },
  { id: "bidii.advance", ledgerId: "bidii", key: "advance", name: "Advance fees held", classAOnly: false, balance: 124200 },
  { id: "company.fee", ledgerId: "company", key: "fee", name: "Trillionaire Designs fee", classAOnly: true, balance: 38900 },
  { id: "company.growth", ledgerId: "company", key: "growth", name: "Class A growth fund", classAOnly: true, balance: 25000 },
];

export const DEMO_LINES: LedgerLine[] = [
  { id: "l1", ledgerId: "bidii", occurredOn: "2026-10-01", type: "bill", potId: "bidii.bills", amount: -3200, who: null, description: "Supabase, monthly", status: "reconciled", hasReceipt: true, edits: 0 },
  { id: "l2", ledgerId: "bidii", occurredOn: "2026-10-01", type: "advance_release", potId: "bidii.advance", amount: 15525, who: "Kiambu Hills Academy", description: "Yearly fee, October part", status: "approved", hasReceipt: false, edits: 0 },
  { id: "l3", ledgerId: "bidii", occurredOn: "2026-10-03", type: "money_in", potId: null, amount: 69000, who: "Thika Road Primary", description: "Invoice BD-0412, Term 3", status: "reconciled", hasReceipt: false, edits: 0 },
  { id: "l4", ledgerId: "bidii", occurredOn: "2026-10-06", type: "bill", potId: "bidii.bills", amount: -16800, who: null, description: "SMS credits, Term 3", status: "approved", hasReceipt: true, edits: 1 },
  { id: "l5", ledgerId: "bidii", occurredOn: "2026-10-08", type: "money_in", potId: null, amount: 23000, who: "Ruiru Junior School", description: "Invoice BD-0418, September", status: "reconciled", hasReceipt: false, edits: 0 },
  { id: "l6", ledgerId: "bidii", occurredOn: "2026-10-09", type: "bill", potId: "bidii.growth", amount: -12000, who: "Ruth Lewis", description: "Facebook adverts, request R-031", status: "approved", hasReceipt: true, edits: 0 },
  { id: "l7", ledgerId: "bidii", occurredOn: "2026-10-11", type: "money_in", potId: null, amount: 42475, who: "Limuru Girls", description: "Invoice BD-0420, part payment", status: "draft", hasReceipt: false, edits: 0 },
  { id: "l8", ledgerId: "bidii", occurredOn: "2026-10-12", type: "bill", potId: "bidii.bills", amount: -7585, who: null, description: "AI usage (USD 58 at 130.8)", status: "approved", hasReceipt: true, edits: 0 },
  { id: "l9", ledgerId: "company", occurredOn: "2026-10-05", type: "bill", potId: "company.fee", amount: -6500, who: null, description: "Accountant, September", status: "reconciled", hasReceipt: true, edits: 0 },
  { id: "l10", ledgerId: "company", occurredOn: "2026-10-10", type: "bill", potId: "company.fee", amount: -1450, who: null, description: "Domain renewal, trillionairedesigns.co.ke", status: "approved", hasReceipt: true, edits: 0 },
];

export const DEMO_REQUESTS: SpendRequest[] = [
  { id: "r1", ledgerId: "bidii", potId: "bidii.growth", potName: "Bidii growth", requesterSlug: "samuel", requesterName: "Samuel Kuhia", amount: 8500, purpose: "Matatu and lunch, school visits in Murang'a (4 schools)", status: "waiting", createdAt: "2026-10-13", receiptDueOn: null, hasReceipt: false, approvals: [] },
  { id: "r2", ledgerId: "bidii", potId: "bidii.growth", potName: "Bidii growth", requesterSlug: "ruth", requesterName: "Ruth Lewis", amount: 12000, purpose: "Facebook adverts for the Term 1 campaign", status: "paid", createdAt: "2026-10-07", receiptDueOn: "2026-10-12", hasReceipt: true, approvals: [{ name: "Romeo Mbote", decision: "approve" }] },
  { id: "r3", ledgerId: "bidii", potId: "bidii.product", potName: "Bidii product", requesterSlug: "miguel", requesterName: "Miguel Muiruri", amount: 26000, purpose: "Thermal receipt printer and QR scanner for library demos", status: "waiting", createdAt: "2026-10-12", receiptDueOn: null, hasReceipt: false, approvals: [{ name: "Romeo Mbote", decision: "approve" }] },
  { id: "r4", ledgerId: "bidii", potId: "bidii.growth", potName: "Bidii growth", requesterSlug: "samuel", requesterName: "Samuel Kuhia", amount: 3500, purpose: "Printing brochures for Kiambu visits", status: "paid", createdAt: "2026-10-09", receiptDueOn: "2026-10-14", hasReceipt: false, approvals: [{ name: "Romeo Mbote", decision: "approve" }] },
];

export const DEMO_SCHOOLS: School[] = [
  { id: "s1", name: "Thika Road Primary", package: "termly", students: 500, lowFee: false, founding10: true, groupCampuses: null, status: "paying", signedOn: "2026-01-06", finder: { kind: "team", name: "Samuel Kuhia" } },
  { id: "s2", name: "Kiambu Hills Academy", package: "yearly", students: 500, lowFee: false, founding10: false, groupCampuses: null, status: "paying", signedOn: "2026-05-04", finder: { kind: "outside", name: "Grace Wanjiku" } },
  { id: "s3", name: "Ruiru Junior School", package: "monthly", students: 500, lowFee: false, founding10: false, groupCampuses: null, status: "paying", signedOn: "2026-08-24", finder: { kind: "team", name: "Ruth Lewis" } },
  { id: "s4", name: "Limuru Girls", package: "termly", students: 650, lowFee: false, founding10: false, groupCampuses: 3, status: "paying", signedOn: "2026-09-01", finder: null },
  { id: "s5", name: "Gatundu Day Secondary", package: "termly", students: 320, lowFee: true, founding10: false, groupCampuses: null, status: "signed", signedOn: "2026-10-10", finder: { kind: "team", name: "Samuel Kuhia" } },
];

export const DEMO_INVOICES: Invoice[] = [
  { id: "i1", number: "BD-0412", schoolName: "Thika Road Primary", kind: "subscription", periodLabel: "Term 3 2026", amount: 69000, paid: 69000, issuedOn: "2026-09-01", dueOn: "2026-09-15", status: "paid" },
  { id: "i2", number: "BD-0418", schoolName: "Ruiru Junior School", kind: "subscription", periodLabel: "September 2026", amount: 23000, paid: 23000, issuedOn: "2026-10-01", dueOn: "2026-10-15", status: "paid" },
  { id: "i3", number: "BD-0420", schoolName: "Limuru Girls", kind: "subscription", periodLabel: "Term 3 2026", amount: 78300, paid: 42475, issuedOn: "2026-09-01", dueOn: "2026-09-15", status: "part_paid" },
  { id: "i4", number: "BD-0423", schoolName: "Gatundu Day Secondary", kind: "onboarding", periodLabel: "One time", amount: 7500, paid: 0, issuedOn: "2026-10-10", dueOn: "2026-10-24", status: "open" },
];

export const DEMO_STATEMENTS: Statement[] = [
  {
    id: "st1",
    periodLabel: "September 2026",
    personName: "Samuel Kuhia",
    personSlug: "samuel",
    status: "paid",
    total: 15910,
    figures: [
      { label: "Money counted", amount: 268400, how: "Cash received in September plus KES 15,525 released from advance fees" },
      { label: "Bills", amount: -51320, how: "Recurring expenses and approved bills, within the quarterly budget" },
      { label: "Leftover", amount: 217080, how: "Money counted less bills and commission" },
      { label: "Pool pay", amount: 9130, how: "Team pool KES 65,124 × weight 15 of 107, no missed tasks" },
      { label: "Owners' payout", amount: 3377, how: "Class B's 20% of KES 43,416, × 7 of 18 issued parts" },
      { label: "Commission", amount: 3403, how: "3% of KES 113,437 paid in September by schools you found, in their first year" },
    ],
  },
];

export const DEMO_COMING_UP: ComingUpItem[] = [
  { date: "2026-10-14", label: "Receipt due: brochures (Samuel)", kind: "receipt" },
  { date: "2026-10-15", label: "Ruiru Junior School, October invoice due", kind: "invoice", amount: 23000 },
  { date: "2026-10-24", label: "Gatundu Day Secondary, onboarding fee due", kind: "invoice", amount: 7500 },
  { date: "2026-11-01", label: "Supabase", kind: "bill", amount: 3200 },
  { date: "2026-11-05", label: "October payout", kind: "payout" },
];

export const DEMO_WARNINGS = [
  "Limuru Girls has KES 35,825 unpaid on invoice BD-0420, 29 days late.",
  "One bank line from 11 Oct is not matched to an invoice yet.",
  "Samuel's brochure receipt is due today.",
];
