// Sample M-PESA payments for demo mode (no database).
import type { FailedCallback, MpesaConfig, Payment, PaymentDetail, PaymentFilters } from "./types";

export const DEMO_CONFIG: MpesaConfig = {
  enabled: true,
  environment: "sandbox",
  shortcode: "600984",
  shortcodeType: "paybill",
  hasConsumerKey: true,
  hasConsumerSecret: true,
  hasPasskey: false,
  hasCallbackToken: true,
  status: "connected",
  statusDetail: "Connected to the Daraja sandbox.",
  testedAt: "2026-11-06T08:12:00Z",
  urlsRegisteredAt: "2026-11-06T08:13:00Z",
  lastSyncAt: "2026-11-06T11:05:01Z",
  updatedAt: "2026-11-06T08:10:00Z",
};

const pay = (p: Partial<Payment> & Pick<Payment, "id" | "receipt" | "paidAt" | "amount" | "status">): Payment => ({
  phone: "2547****149",
  payerName: null,
  accountRef: null,
  matchMethod: null,
  schoolId: null,
  schoolName: null,
  invoiceId: null,
  invoiceNumber: null,
  note: null,
  ...p,
});

export const DEMO_PAYMENTS: Payment[] = [
  pay({ id: "demo-pay-1", receipt: "SKA1B2C3D4", paidAt: "2026-11-06T11:05:01Z", amount: 20000, status: "matched", matchMethod: "invoice", payerName: "Jane Wanjiru", accountRef: "INV-1001", schoolName: "Thika Road Primary", invoiceNumber: "INV-1001" }),
  pay({ id: "demo-pay-2", receipt: "SKA9F8E7D6", paidAt: "2026-11-05T07:41:00Z", amount: 700, status: "unmatched", payerName: "Peter Otieno", accountRef: "HELLO", note: "Account number HELLO is not an invoice or a school." }),
  pay({ id: "demo-pay-3", receipt: "SKA5K4J3H2", paidAt: "2026-11-04T13:20:00Z", amount: 50000, status: "review", payerName: "Ruiru Academy Bursar", accountRef: "INV-1002", schoolName: "Ruiru Academy", invoiceNumber: "INV-1002", note: "Paid KES 50,000 but invoice INV-1002 owes KES 30,000." }),
  pay({ id: "demo-pay-4", receipt: "SKA2M3N4P5", paidAt: "2026-11-02T09:02:00Z", amount: 15000, status: "matched", matchMethod: "manual", payerName: "Mary Njeri", accountRef: "Bidii fees", schoolName: "Kasarani Junior", note: "Their bursar paid from her own phone" }),
  pay({ id: "demo-pay-5", receipt: "SKA7Q6R5S4", paidAt: "2026-10-30T16:45:00Z", amount: 4500, status: "reversed", payerName: "John Kamau", accountRef: "INV-0990", note: "Paid twice by mistake; refunded on M-PESA" }),
];

export const DEMO_CALLBACKS: FailedCallback[] = [
  { id: 41, receivedAt: "2026-11-05T10:00:00Z", status: "failed", attempts: 5, error: "The callback has no valid M-PESA receipt number (TransID).", receipt: null, amount: "10" },
];

export const DEMO_OPEN_INVOICES = [
  { id: "demo-inv-1", number: "INV-1002", schoolName: "Ruiru Academy", owed: 30000 },
  { id: "demo-inv-2", number: "INV-1003", schoolName: "Kasarani Junior", owed: 22500 },
];

export function filterDemo(f: PaymentFilters) {
  const q = (f.q ?? "").toLowerCase();
  return DEMO_PAYMENTS.filter(
    (p) =>
      (!f.from || p.paidAt.slice(0, 10) >= f.from) &&
      (!f.to || p.paidAt.slice(0, 10) <= f.to) &&
      (!f.status || (f.status === "pending" ? p.status === "received" : p.status === f.status)) &&
      (!q || [p.receipt, p.phone, p.payerName, p.accountRef].some((v) => v?.toLowerCase().includes(q))),
  );
}

export function demoDetail(id: string): PaymentDetail | null {
  const p = DEMO_PAYMENTS.find((x) => x.id === id);
  if (!p) return null;
  return {
    ...p,
    transactionType: "Pay Bill",
    shortcode: "600984",
    orgBalance: 120000,
    ledgerLineId: p.status === "matched" ? "demo-line" : null,
    reversalLineId: null,
    reconciledBy: p.matchMethod === "manual" ? "Romeo Mbote" : null,
    reconciledAt: p.status === "matched" ? p.paidAt : null,
    createdAt: p.paidAt,
    trail: [{ action: "Received from Safaricom", who: null, at: p.paidAt, details: { status: p.status } }],
  };
}
