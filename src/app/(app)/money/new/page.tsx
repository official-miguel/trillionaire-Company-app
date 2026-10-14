import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Card, PageHeader } from "@/components/ui";
import { can, getPots, getViewer } from "@/lib/data/queries";
import { isDemo } from "@/lib/demo";
import { supabaseServer } from "@/lib/supabase/server";
import { todayIso } from "@/lib/format";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Add a ledger line" };

async function addLine(formData: FormData) {
  "use server";
  const ledgerId = String(formData.get("ledger"));
  const viewer = await getViewer();
  if (!can(viewer, ledgerId, "ledger_editor")) redirect("/money");
  if (isDemo()) redirect(`/money?ledger=${ledgerId}`);

  const direction = formData.get("direction") === "out" ? -1 : 1;
  const sb = await supabaseServer();
  const { error } = await sb.from("ledger_lines").insert({
    ledger_id: ledgerId,
    occurred_on: String(formData.get("date")),
    type: String(formData.get("type")),
    pot_id: String(formData.get("pot") || "") || null,
    amount: direction * Math.abs(Number(formData.get("amount"))),
    description: String(formData.get("description")).trim(),
    status: "draft",
  });
  if (error) redirect(`/money/new?ledger=${ledgerId}&error=1`);
  revalidatePath("/money");
  redirect(`/money?ledger=${ledgerId}`);
}

const field = "rounded-full border border-line bg-white px-4 py-3 text-base font-normal outline-none focus:border-lime";

export default async function NewLinePage({ searchParams }: { searchParams: Promise<{ ledger?: string; error?: string }> }) {
  const [viewer, pots, params] = await Promise.all([getViewer(), getPots(), searchParams]);
  const ledgerId = params.ledger ?? "bidii";
  if (!can(viewer, ledgerId, "ledger_editor")) redirect("/money");

  return (
    <>
      <PageHeader title="Add a ledger line" subtitle="It is saved as a draft until it is approved or matched to the bank." />
      <Card className="max-w-xl">
        {params.error && <p className="mb-4 rounded-2xl bg-warn-soft px-3 py-2.5 text-sm text-warn">The line couldn&apos;t be saved. Check the fields and try again.</p>}
        <form action={addLine} className="flex flex-col gap-4">
          <input type="hidden" name="ledger" value={ledgerId} />
          <fieldset className="flex gap-2">
            <legend className="mb-1.5 text-sm font-medium">Money is</legend>
            <label className="flex flex-1 items-center justify-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm has-[:checked]:border-lime has-[:checked]:bg-lime-soft">
              <input type="radio" name="direction" value="in" defaultChecked className="sr-only" /> Coming in
            </label>
            <label className="flex flex-1 items-center justify-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm has-[:checked]:border-lime has-[:checked]:bg-lime-soft">
              <input type="radio" name="direction" value="out" className="sr-only" /> Going out
            </label>
          </fieldset>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Amount (KES)
            <input name="amount" type="number" min="1" step="1" required inputMode="numeric" className={field} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            What was it?
            <input name="description" required className={field} />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Type
              <select name="type" className={field}>
                <option value="money_in">Money in</option>
                <option value="bill">Bill</option>
                <option value="refund">Refund</option>
                <option value="transfer">Transfer between pots</option>
                <option value="advance_held">Advance fee held</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Date
              <input name="date" type="date" defaultValue={todayIso()} required className={field} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Pot
            <select name="pot" className={field}>
              <option value="">None (counted at month-end)</option>
              {pots
                .filter((p) => p.ledgerId === ledgerId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              {ledgerId === "bidii" && <option value="bidii.bills">Bills</option>}
            </select>
          </label>
          <div className="mt-2 flex gap-3">
            <SubmitButton pending="Saving…">Save as draft</SubmitButton>
            <Link href={`/money?ledger=${ledgerId}`} className="rounded-full border border-line px-5 py-3 text-sm font-semibold">
              Cancel
            </Link>
          </div>
        </form>
      </Card>
    </>
  );
}
