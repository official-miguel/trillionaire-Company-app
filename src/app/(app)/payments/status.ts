import type { PaymentStatus } from "@/lib/mpesa/types";

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: "green" | "grey" | "amber" | "red" | "ink" }> = {
  received: { label: "Pending", tone: "grey" },
  matched: { label: "Reconciled", tone: "green" },
  unmatched: { label: "Not matched", tone: "amber" },
  review: { label: "Needs review", tone: "amber" },
  reversed: { label: "Reversed", tone: "grey" },
};

export const MATCH_METHOD = {
  invoice: "by invoice number",
  school: "by the school's Bidii id",
  phone: "by the school's phone",
  manual: "by hand",
} as const;
