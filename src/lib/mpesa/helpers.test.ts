import { describe, expect, it } from "vitest";
import { callbackUrlProblem, callbackUrls, cleanSearch, clientIp, darajaError, ipAllowed, maskedCallbackUrl } from "./helpers";

const token = "a".repeat(8) + "0123456789abcdef".repeat(3) + "b".repeat(8);

describe("callback addresses", () => {
  it("are under /api/payments/c2b with the secret, whatever the trailing slash", () => {
    expect(callbackUrls("https://app.example.com/", token)).toEqual({
      confirmation: `https://app.example.com/api/payments/c2b/${token}/confirmation`,
      validation: `https://app.example.com/api/payments/c2b/${token}/validation`,
    });
  });

  it("hide the secret when shown", () => {
    expect(maskedCallbackUrl(callbackUrls("https://app.example.com", token).confirmation)).toBe("https://app.example.com/api/payments/c2b/aaaa…bbbb/confirmation");
  });

  it("are refused when Daraja would refuse them", () => {
    expect(callbackUrlProblem("https://app.example.com", "production")).toBeNull();
    expect(callbackUrlProblem("http://app.example.com", "production")).toMatch(/https/);
    expect(callbackUrlProblem("http://app.example.com", "sandbox")).toBeNull();
    expect(callbackUrlProblem("http://localhost:3000", "sandbox")).toMatch(/localhost/);
    expect(callbackUrlProblem("https://mpesa.example.com", "production")).toMatch(/mpesa/);
    expect(callbackUrlProblem("not a url", "sandbox")).toMatch(/valid/);
  });
});

describe("who is calling", () => {
  it("is the first forwarded address", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "196.201.214.200, 10.0.0.1" }))).toBe("196.201.214.200");
    expect(clientIp(new Headers({ "x-real-ip": "196.201.214.206" }))).toBe("196.201.214.206");
  });

  it("is allowed when no list is set, otherwise only if listed", () => {
    expect(ipAllowed("1.2.3.4", undefined)).toBe(true);
    expect(ipAllowed("1.2.3.4", "")).toBe(true);
    expect(ipAllowed("196.201.214.200", "196.201.214.200, 196.201.214.206")).toBe(true);
    expect(ipAllowed("1.2.3.4", "196.201.214.200,196.201.214.206")).toBe(false);
  });
});

describe("small things", () => {
  it("shows Daraja's own error words", () => {
    expect(darajaError({ errorMessage: "Invalid Access Token" }, 401)).toBe("Invalid Access Token (HTTP 401)");
    expect(darajaError(null, 503)).toBe("Safaricom answered with HTTP 503.");
  });

  it("keeps searches safe for the database filter", () => {
    expect(cleanSearch("SKA1B2,status.eq.matched)")).toBe("SKA1B2status.eq.matched");
    expect(cleanSearch("  +254 712 ")).toBe("+254 712");
  });
});
