"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, getSettings, getViewer, SETTING_LABELS } from "@/lib/data/queries";
import { isDemo } from "@/lib/demo";
import { supabaseServer } from "@/lib/supabase/server";

const num = (fd: FormData, name: string) => {
  const v = Number(String(fd.get(name) ?? "").replace(/,/g, ""));
  return Number.isFinite(v) ? v : NaN;
};
const pct = (fd: FormData, name: string) => num(fd, name) / 100;

/**
 * Saves a section of Settings. Only keys whose values changed are saved;
 * each takes effect at once, keeps the old value, and everyone is told.
 * The database checks the permission again (change_setting).
 */
export async function saveSettings(formData: FormData) {
  const section = String(formData.get("section"));
  const reason = String(formData.get("reason") ?? "").trim();
  const back = (q: string) => redirect(`/settings?${q}#${section}`);

  const viewer = await getViewer();
  if (!can(viewer, "bidii", "settings_editor")) back("error=not-allowed");
  if (!reason) back("error=reason");
  if (isDemo()) back("saved=demo");

  const { money, pricing, commission, rows } = await getSettings();
  const current = (key: string) => rows.find((r) => r.ledgerId === "bidii" && r.key === key)?.value as Record<string, unknown> | undefined;
  const changes: { key: string; value: unknown }[] = [];
  const changed = (key: string, value: unknown, was: unknown) => {
    if (JSON.stringify(value) !== JSON.stringify(was)) changes.push({ key, value });
  };

  if (section === "money") {
    const split = { pool: pct(formData, "pool"), payout: pct(formData, "payout"), fee: pct(formData, "fee"), growth: pct(formData, "growth"), product: pct(formData, "product"), reserve: pct(formData, "reserve") };
    const total = Object.values(split).reduce((a, b) => a + b, 0);
    if (Object.values(split).some((v) => !(v >= 0)) || Math.abs(total - 1) > 0.0001) back("error=split");
    changed("split", split, money.split);

    const weights = Object.fromEntries(Object.keys(money.weights).map((slug) => [slug, num(formData, `w_${slug}`)]));
    if (Object.values(weights).some((v) => !(v >= 0))) back("error=number");
    changed("weights", weights, money.weights);

    const comm = { ...(current("commission") ?? {}), team: pct(formData, "c_team"), outside: pct(formData, "c_outside") };
    changed("commission", comm, { ...(current("commission") ?? {}), team: commission.team, outside: commission.outside });

    changed("fee", { ...(current("fee") ?? {}), rate: pct(formData, "fee") }, current("fee"));
    changed("reserve", { targetMonths: num(formData, "reserve_months") }, { targetMonths: money.reserveTargetMonths });
    changed("missCuts", [pct(formData, "cut1"), pct(formData, "cut2"), pct(formData, "cut3")], money.missCuts);
    changed("requests", { ...(current("requests") ?? {}), singleApproverLimit: num(formData, "request_limit") }, current("requests"));
    changed("payout", { ...(current("payout") ?? {}), minimumPool: num(formData, "minimum_payout") }, current("payout"));
  }

  if (section === "prices") {
    const tiers = [
      { upTo: num(formData, "t1_upto"), rate: num(formData, "t1_rate") },
      { upTo: num(formData, "t2_upto"), rate: num(formData, "t2_rate") },
      { upTo: null, rate: num(formData, "t3_rate") },
    ];
    if (!(tiers[0].upTo! > 0 && tiers[1].upTo! > tiers[0].upTo!)) back("error=tiers");
    const next = {
      ...(current("pricing") ?? {}),
      tiers,
      lowFeeCapRate: num(formData, "low_fee_cap"),
      onboarding: { small: num(formData, "on_small"), medium: num(formData, "on_medium"), large: num(formData, "on_large") },
      onboardingBands: { mediumFrom: tiers[0].upTo! + 1, largeFrom: tiers[1].upTo! + 1 },
      yearlyDiscount: pct(formData, "yearly_discount"),
      groupDiscount: pct(formData, "group_discount"),
    };
    changed("pricing", next, current("pricing") ?? pricing);
  }

  if (changes.some((c) => JSON.stringify(c.value).includes("null") && c.key !== "pricing")) back("error=number");
  if (!changes.length) back("saved=none");

  const sb = await supabaseServer();
  for (const c of changes) {
    const { error } = await sb.rpc("change_setting", { p_ledger: "bidii", p_key: c.key, p_value: c.value, p_reason: reason, p_label: SETTING_LABELS[c.key] ?? c.key });
    if (error) back(`error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/", "layout");
  back(`saved=${changes.length}`);
}
