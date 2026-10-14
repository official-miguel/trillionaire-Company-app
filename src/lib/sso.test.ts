import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signBidiiPass, SSO_AUDIENCE, SSO_ISSUER } from "./sso";

const SECRET = "s".repeat(48);

describe("Bidii one-time pass", () => {
  it("is a signed HS256 token Bidii can check", () => {
    const pass = signBidiiPass("Miguel@Example.com", SECRET, 1_800_000_000);
    const [h, p, s] = pass.split(".");
    expect(createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")).toBe(s);
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "HS256", typ: "JWT" });
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(payload).toMatchObject({ iss: SSO_ISSUER, aud: SSO_AUDIENCE, email: "miguel@example.com", iat: 1_800_000_000, exp: 1_800_000_060 });
    expect(payload.jti).toMatch(/^[0-9a-f]{32}$/);
  });

  it("gives every pass a different id", () => {
    expect(signBidiiPass("a@b.co", SECRET).split(".")[1]).not.toBe(signBidiiPass("a@b.co", SECRET).split(".")[1]);
  });

  it("refuses a short secret", () => {
    expect(() => signBidiiPass("a@b.co", "short")).toThrow();
  });
});
