// Tokens for Bidii, checked there in src/lib/td-auth.ts (verifyTdToken):
// HS256 with the shared TD_SSO_SECRET, a fixed issuer, about a minute long,
// and a random id. The audience keeps the kinds apart:
//   "bidii-super-admin"   — the one-time sign-in pass from the button
//   "bidii-account-check" — asking whether an email has a super admin account
//   "bidii-password-check" — first sign-in here with an existing Bidii password
import { createHmac, randomBytes } from "node:crypto";

export const SSO_ISSUER = "trillionaire-designs";
export const SSO_AUDIENCE = "bidii-super-admin";
export const ACCOUNT_CHECK_AUDIENCE = "bidii-account-check";
export const PASSWORD_CHECK_AUDIENCE = "bidii-password-check";
export const SSO_SECONDS = 60;

const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

export function signBidiiToken(audience: string, email: string, secret: string, now = Math.floor(Date.now() / 1000)): string {
  if (secret.length < 32) throw new Error("TD_SSO_SECRET must be at least 32 characters.");
  const body = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({
    iss: SSO_ISSUER,
    aud: audience,
    email: email.toLowerCase(),
    jti: randomBytes(16).toString("hex"),
    iat: now,
    exp: now + SSO_SECONDS,
  })}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

export function signBidiiPass(email: string, secret: string, now?: number): string {
  return signBidiiToken(SSO_AUDIENCE, email, secret, now);
}
