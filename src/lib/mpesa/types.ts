export type PaymentStatus = "received" | "matched" | "unmatched" | "review" | "reversed";

export interface MpesaConfig {
  enabled: boolean;
  environment: "sandbox" | "production";
  shortcode: string | null;
  shortcodeType: "paybill" | "till";
  /** Only whether each key is saved; the keys never leave the server. */
  hasConsumerKey: boolean;
  hasConsumerSecret: boolean;
  hasPasskey: boolean;
  hasCallbackToken: boolean;
  status: "connected" | "disconnected" | "error";
  statusDetail: string | null;
  testedAt: string | null;
  urlsRegisteredAt: string | null;
  lastSyncAt: string | null;
  updatedAt: string;
}

export interface Payment {
  id: string;
  receipt: string;
  paidAt: string;
  amount: number;
  phone: string | null;
  payerName: string | null;
  accountRef: string | null;
  status: PaymentStatus;
  matchMethod: "invoice" | "school" | "phone" | "manual" | null;
  schoolId: string | null;
  schoolName: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  note: string | null;
}

export interface PaymentDetail extends Payment {
  transactionType: string | null;
  shortcode: string | null;
  orgBalance: number | null;
  ledgerLineId: string | null;
  reversalLineId: string | null;
  reconciledBy: string | null;
  reconciledAt: string | null;
  createdAt: string;
  trail: { action: string; who: string | null; at: string; details: Record<string, unknown> }[];
}

export interface FailedCallback {
  id: number;
  receivedAt: string;
  status: "pending" | "failed";
  attempts: number;
  error: string | null;
  receipt: string | null;
  amount: string | null;
}

export interface PaymentFilters {
  from?: string;
  to?: string;
  q?: string;
  status?: PaymentStatus | "failed" | "pending";
}

export interface PaymentSummary {
  count: number;
  matched: number;
  unmatched: number;
  review: number;
  pending: number;
  failed: number;
  reversed: number;
  total: number;
  matchedTotal: number;
}
