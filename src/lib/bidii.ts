import "server-only";
import { unstable_cache } from "next/cache";
import { ACCOUNT_CHECK_AUDIENCE, PASSWORD_CHECK_AUDIENCE, signBidiiToken } from "@/lib/sso";

/**
 * Is this the person's Bidii super admin password? Used only the first time
 * they sign in here, so they keep the password they already have. Any
 * problem reaching Bidii counts as "no".
 */
export async function checkBidiiPassword(email: string, password: string): Promise<string> {
  const secret = process.env.TD_SSO_SECRET?.trim();
  const bidii = process.env.BIDII_URL?.trim().replace(/\/$/, "");
  if (!secret || !bidii) return "not set up (TD_SSO_SECRET or BIDII_URL missing)";
  if (!email || !password) return "no email or password";
  try {
    const res = await fetch(`${bidii}/api/auth/td-verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: signBidiiToken(PASSWORD_CHECK_AUDIENCE, email.toLowerCase(), secret), password }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (res.status === 401) return `Bidii refused this app (shared secret differs) at ${bidii}`;
    if (res.status === 429) return "Bidii locked this email after too many wrong passwords; wait 15 minutes";
    if (!res.ok) return `Bidii answered ${res.status} at ${bidii}`;
    return (await res.json()).ok === true ? "ok" : "Bidii says the password is wrong";
  } catch (e) {
    return `could not reach Bidii at ${bidii}: ${(e as Error).message}`;
  }
}

// Bidii decides who is a super admin. This asks it whether an email has an
// active super admin account, so the "Bidii super admin" button shows only to
// people who do. Answers are kept for five minutes, shared by every server
// copy of the app, so pages don't wait on Bidii. If Bidii can't be reached
// the button is hidden rather than shown to someone who may not have access
// (and that "can't reach" is not remembered, so it is asked again next time).
const askBidii = unstable_cache(
  async (email: string): Promise<boolean> => {
    const secret = process.env.TD_SSO_SECRET?.trim();
    const bidii = process.env.BIDII_URL?.trim().replace(/\/$/, "");
    if (!secret || !bidii) throw new Error("not set up");
    const res = await fetch(`${bidii}/api/auth/td-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: signBidiiToken(ACCOUNT_CHECK_AUDIENCE, email, secret) }),
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Bidii answered ${res.status}`);
    return (await res.json()).exists === true;
  },
  ["bidii-super-admin-account"],
  { revalidate: 300 },
);

export async function hasBidiiAccount(email: string): Promise<boolean> {
  if (!email) return false;
  try {
    return await askBidii(email.toLowerCase());
  } catch {
    return false;
  }
}
