import { Sidebar } from "@/components/Sidebar";
import { redirect } from "next/navigation";
import { can, getViewer } from "@/lib/data/queries";
import { DEMO_VIEWERS } from "@/lib/data/demo-data";
import { isDemo } from "@/lib/demo";
import { setDemoViewer, signOut } from "../actions";

const ROLE_LABELS = {
  td_cofounder: "Trillionaire Designs co-founder",
  product_cofounder: "Bidii co-founder",
  product_team: "Bidii team",
  accountant: "Accountant (read only)",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (viewer.mustChangePassword) redirect("/change-password");
  const demo = isDemo()
    ? {
        current: viewer.slug,
        options: Object.values(DEMO_VIEWERS).map((v) => ({ slug: v.slug, label: `${v.name.split(" ")[0]}, ${ROLE_LABELS[v.role]}` })),
        action: setDemoViewer,
      }
    : undefined;

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar name={viewer.name} roleLabel={ROLE_LABELS[viewer.role]} bidiiSuperAdmin={viewer.bidiiSuperAdmin} peopleAdmin={can(viewer, "company", "people_admin")} demo={demo} signOut={signOut} />
      <main className="min-w-0 flex-1 bg-surface/60 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
