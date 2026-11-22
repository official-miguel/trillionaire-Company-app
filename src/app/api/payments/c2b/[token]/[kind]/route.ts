import { NextResponse, type NextRequest } from "next/server";
import { isDemo } from "@/lib/demo";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { clientIp, ipAllowed } from "@/lib/mpesa/helpers";

// Safaricom Daraja C2B callbacks:
//   POST /api/payments/c2b/<secret>/validation    before a payment completes
//   POST /api/payments/c2b/<secret>/confirmation  after it completes
// Daraja does not sign callbacks, so the address carries a long secret made
// by the app (checked in the database) and, in production, callers can be
// limited to Safaricom's addresses with DARAJA_ALLOWED_IPS. A confirmation is
// stored before it is processed; if processing fails it is tried again later.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const accepted = () => NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
const notFound = () => new NextResponse("Not found", { status: 404 });

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string; kind: string }> }) {
  const { token, kind } = await params;
  if ((kind !== "confirmation" && kind !== "validation") || !/^[a-f0-9]{64}$/.test(token)) return notFound();
  if (isDemo()) return notFound();

  const ip = clientIp(req.headers);
  if (!ipAllowed(ip, process.env.DARAJA_ALLOWED_IPS)) {
    console.warn(`M-PESA callback refused from ${ip || "unknown address"}: not in DARAJA_ALLOWED_IPS`);
    return new NextResponse("Forbidden", { status: 403 });
  }

  const text = await req.text();
  if (text.length > 20_000) return new NextResponse("Too large", { status: 413 });
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  // Something that isn't a JSON object is still kept (and fails visibly).
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) payload = { _unreadable: text.slice(0, 5000) };

  const sb = supabaseAdmin();

  if (kind === "validation") {
    // Every payment is accepted: an unknown account is matched by hand later
    // rather than turned away at the till.
    const { data, error } = await sb.rpc("mpesa_check_token", { p_token: token });
    if (error) console.error("M-PESA validation check failed:", error.message);
    else if (data !== true) return notFound();
    return accepted();
  }

  const { data, error } = await sb.rpc("mpesa_receive", { p_token: token, p_payload: payload, p_ip: ip });
  if (error) {
    // Not stored: log everything so the payment can be recovered by hand.
    console.error("M-PESA confirmation could not be stored:", error.message, text);
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Temporarily unavailable" }, { status: 500 });
  }
  if (data === "rejected") {
    console.warn(`M-PESA confirmation with an unknown secret from ${ip || "unknown address"}`);
    return notFound();
  }
  return accepted();
}
