import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { getViewer } from "@/lib/data/queries";
import { isDemo } from "@/lib/demo";
import { signBidiiPass } from "@/lib/sso";
import { AutoSubmit } from "./AutoSubmit";

export const metadata = { title: "Bidii super admin" };
export const dynamic = "force-dynamic";

// Signs a one-time pass and posts it to Bidii, which signs the person in as
// a super admin. The pass is sent in a form body, never in the address.
export default async function BidiiAdminPage() {
  const viewer = await getViewer();
  if (!viewer.bidiiSuperAdmin) redirect("/");

  const secret = process.env.TD_SSO_SECRET;
  const bidii = process.env.BIDII_URL?.replace(/\/$/, "");
  if (isDemo() || !secret || !bidii) {
    return (
      <>
        <PageHeader title="Bidii super admin" />
        <Card className="max-w-xl">
          <p className="text-ink/80">
            {isDemo() ? "Demo mode: the button would open the Bidii super admin here, already signed in." : "The link to Bidii isn't set up yet (TD_SSO_SECRET and BIDII_URL)."}
          </p>
        </Card>
      </>
    );
  }

  const pass = signBidiiPass(viewer.email, secret);
  return (
    <>
      <PageHeader title="Opening the Bidii super admin…" />
      <Card className="max-w-xl">
        <form id="bidii-sso" method="post" action={`${bidii}/api/auth/td-sso`}>
          <input type="hidden" name="ticket" value={pass} />
          <p className="text-ink/80">You&apos;ll be signed in with your Trillionaire Designs account. If nothing happens, press the button.</p>
          <button className="mt-5 rounded-full bg-lime px-5 py-2.5 text-sm font-semibold text-ink hover:brightness-95">Continue to Bidii</button>
        </form>
        <AutoSubmit formId="bidii-sso" />
      </Card>
    </>
  );
}
