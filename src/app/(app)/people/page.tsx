import { redirect } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { can, getViewer } from "@/lib/data/queries";
import { DEMO_VIEWERS } from "@/lib/data/demo-data";
import type { Permission, Role } from "@/lib/data/types";
import { isDemo } from "@/lib/demo";
import { listPeople, type PersonRow } from "@/lib/people";
import { addPersonAction, resetPasswordAction, setActiveAction, setRolesAction } from "./actions";

export const metadata = { title: "People" };

const ROLES: { value: Role; label: string; sees: string }[] = [
  { value: "product_cofounder", label: "Bidii co-founder (Class B)", sees: "Sees Bidii's ledger, their own statement, and the fee report." },
  { value: "td_cofounder", label: "Trillionaire Designs co-founder (Class A)", sees: "Sees every ledger, including Trillionaire Designs' own money." },
  { value: "product_team", label: "Bidii team member (no shares)", sees: "Sees Bidii's ledger and their own statement." },
  { value: "accountant", label: "Accountant (read only)", sees: "Sees every ledger and report, changes nothing." },
];

const PERMISSION_LABELS: Record<Permission, string> = {
  approver: "Approve requests up to a limit",
  second_signer: "Second signer for big payments, the reserve and month close",
  statement_preparer: "Prepare monthly statements",
  statement_checker: "Check statements before anyone is paid",
  month_closer: "Close the month",
  ledger_editor: "Add and edit ledger lines",
  settings_editor: "Propose changes to Settings",
  commission_assigner: "Record who found each school (commission)",
  task_reviewer: "Mark other people's monthly tasks",
  special_price_approver: "Approve prices outside the Pricing Guide",
  people_admin: "Add people and switch them off",
  task_assigner: "Give tasks to people (they appear on their calendar)",
};

const MESSAGES: Record<string, string> = {
  added: "Added. Give them their temporary password; they will choose their own when they first sign in.",
  reset: "Password reset. They will choose a new one when they next sign in.",
  roles: "Roles saved. They apply from the person's next page.",
  demo: "Demo mode: nothing was saved.",
};

const field = "rounded-full border border-line bg-white px-4 py-3 text-base font-normal outline-none focus:border-lime";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const [viewer, params] = await Promise.all([getViewer(), searchParams]);
  if (!can(viewer, "company", "people_admin")) redirect("/");
  const people = isDemo() ? demoPeople() : await listPeople();

  return (
    <>
      <PageHeader title="People" subtitle="Add the people who use the app, choose what they see and what they may do. Nobody is deleted; switching someone off stops their sign-in at once." />
      {params.done && MESSAGES[params.done] && <p className="mb-5 rounded-2xl bg-lime-soft px-4 py-3 text-sm">{MESSAGES[params.done]}</p>}
      {params.error && <p className="mb-5 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">{params.error}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card title="Add a person" className="lg:col-span-2">
          <form action={addPersonAction} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Full name
              <input name="name" required className={field} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Email
              <input name="email" type="email" required className={field} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Phone (for M-Pesa pay)
              <input name="phone" type="tel" placeholder="0712 345 678" className={field} />
            </label>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-sm font-medium">Who are they?</legend>
              {ROLES.map((r, i) => (
                <label key={r.value} className="flex cursor-pointer gap-3 rounded-2xl border border-line p-3 has-[:checked]:border-lime has-[:checked]:bg-lime-soft">
                  <input type="radio" name="role" value={r.value} defaultChecked={i === 0} className="mt-1 accent-[#32cd32]" />
                  <span>
                    <span className="block text-sm font-medium">{r.label}</span>
                    <span className="block text-xs text-muted">{r.sees}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-sm font-medium">What may they do? (optional)</legend>
              {(Object.keys(PERMISSION_LABELS) as Permission[]).map((p) => (
                <label key={p} className="flex items-center gap-2.5 text-sm text-ink/80">
                  <input type="checkbox" name={`perm_${p}`} className="h-4 w-4 accent-[#32cd32]" />
                  {PERMISSION_LABELS[p]}
                </label>
              ))}
              <p className="text-xs text-muted">
                The Bidii super admin button appears by itself for anyone with a super admin account in Bidii under the same email. Super admins are added in Bidii.
              </p>
              <label className="mt-1 flex flex-col gap-1.5 text-sm font-medium">
                Approval limit (KES), if they approve requests
                <input name="approver_limit" type="number" min="0" step="1000" defaultValue={20000} className={field} />
              </label>
            </fieldset>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Temporary password
              <input name="temporary_password" type="text" required minLength={8} autoComplete="off" className={field} />
              <span className="text-xs font-normal text-muted">At least 8 characters. Tell them in person or by phone; they must change it when they first sign in.</span>
            </label>
            <button className="rounded-full bg-lime px-5 py-3 text-sm font-semibold text-ink hover:brightness-95">Add person</button>
          </form>
        </Card>

        <Card title={`Everyone (${people.length})`} className="lg:col-span-3">
          <ul className="flex flex-col gap-3">
            {people.map((p) => (
              <li key={p.id} className={`rounded-2xl border border-line p-4 ${p.active ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {p.name} {p.isOwner && <Badge tone="ink">Owner</Badge>} {!p.active && <Badge tone="red">Switched off</Badge>} {p.active && p.mustChangePassword && <Badge tone="amber">Hasn&apos;t signed in yet</Badge>}
                    </p>
                    <p className="text-sm text-muted">
                      {ROLES.find((r) => r.value === p.role)?.label ?? "No role"} · {p.email}
                      {p.phone ? ` · ${p.phone}` : ""}
                    </p>
                  </div>
                  {p.id !== viewer.id && (
                    <form action={setActiveAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="active" value={String(!p.active)} />
                      <button className="rounded-full border border-line px-4 py-1.5 text-sm font-medium hover:border-ink/30">{p.active ? "Switch off" : "Switch on"}</button>
                    </form>
                  )}
                </div>
                {p.permissions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[...new Set(p.permissions.map((x) => x.permission))].map((perm) => {
                      const limit = p.permissions.find((x) => x.permission === "approver")?.limitKes;
                      return (
                        <Badge key={perm}>
                          {PERMISSION_LABELS[perm]}
                          {perm === "approver" && limit ? ` (KES ${limit.toLocaleString("en-KE")})` : ""}
                        </Badge>
                      );
                    })}
                  </div>
                )}
                {p.active && !p.isOwner && p.id !== viewer.id && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-muted hover:text-ink">Edit roles</summary>
                    <form action={setRolesAction} className="mt-2 flex flex-col gap-2 rounded-2xl bg-surface p-3">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="ledgers" value={p.role === "td_cofounder" || p.role === "accountant" ? "company,bidii" : "bidii"} />
                      {(Object.keys(PERMISSION_LABELS) as Permission[]).map((perm) => (
                        <label key={perm} className="flex items-center gap-2.5 text-sm text-ink/80">
                          <input type="checkbox" name={`perm_${perm}`} defaultChecked={p.permissions.some((x) => x.permission === perm)} className="h-4 w-4 accent-[#32cd32]" />
                          {PERMISSION_LABELS[perm]}
                        </label>
                      ))}
                      <label className="mt-1 flex items-center gap-2 text-sm">
                        Approval limit (KES)
                        <input name="approver_limit" type="number" min="0" step="1000" defaultValue={p.permissions.find((x) => x.permission === "approver")?.limitKes ?? 20000} className="w-32 rounded-full border border-line bg-white px-3 py-1.5" />
                      </label>
                      <button className="mt-1 self-start rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">Save roles</button>
                    </form>
                  </details>
                )}
                {p.active && p.id !== viewer.id && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-muted hover:text-ink">Reset password</summary>
                    <form action={resetPasswordAction} className="mt-2 flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <input name="temporary_password" required minLength={8} placeholder="New temporary password" autoComplete="off" className={`${field} flex-1 py-2`} />
                      <button className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">Reset</button>
                    </form>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function demoPeople(): PersonRow[] {
  return Object.values(DEMO_VIEWERS).map((v) => ({
    id: v.id,
    slug: v.slug,
    name: v.name,
    email: v.email,
    phone: null,
    role: v.role,
    shareClass: v.shareClass,
    active: true,
    isOwner: v.isOwner,
    mustChangePassword: v.slug === "larmeck",
    permissions: Object.entries(v.permissions).flatMap(([ledgerId, list]) => list.map((permission) => ({ ledgerId, permission, limitKes: permission === "approver" ? v.approverLimit : null }))),
  }));
}
