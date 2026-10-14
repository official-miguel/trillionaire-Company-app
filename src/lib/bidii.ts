import "server-only";
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
// people who do. Answers are kept for five minutes; if Bidii can't be reached
// the button is hidden rather than shown to someone who may not have access.
const TTL_MS = 5 * 60 * 1000;
const answers = new Map<string, { exists: boolean; at: number }>();

export async function hasBidiiAccount(email: string): Promise<boolean> {
  const secret = process.env.TD_SSO_SECRET;
  const bidii = process.env.BIDII_URL?.replace(/\/$/, "");
  if (!secret || !bidii || !email) return false;

  const key = email.toLowerCase();
  const cached = answers.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.exists;

  try {
    const res = await fetch(`${bidii}/api/auth/td-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: signBidiiToken(ACCOUNT_CHECK_AUDIENCE, key, secret) }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const exists = (await res.json()).exists === true;
    answers.set(key, { exists, at: Date.now() });
    return exists;
  } catch {
    return false;
  }
}
