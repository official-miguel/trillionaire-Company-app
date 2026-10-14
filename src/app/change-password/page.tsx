import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { getViewer } from "@/lib/data/queries";
import { isDemo } from "@/lib/demo";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Choose your password" };

async function changePassword(formData: FormData) {
  "use server";
  const viewer = await getViewer();
  const password = String(formData.get("password") ?? "");
  // Same rule as Bidii, because super admins use this password there too.
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) redirect("/change-password?error=short");
  if (password !== formData.get("confirm")) redirect("/change-password?error=match");
  if (isDemo()) redirect("/");

  const sb = await supabaseServer();
  const { error } = await sb.auth.updateUser({ password });
  if (error) redirect(`/change-password?error=${error.code === "same_password" ? "same" : "failed"}`);
  // Clearing the flag uses the server client because people can't edit their own row.
  await supabaseAdmin().from("people").update({ must_change_password: false }).eq("id", viewer.id);
  redirect("/");
}

const ERRORS: Record<string, string> = {
  short: "Use at least 8 characters, with a capital letter and a number.",
  match: "The two passwords are different. Type the same one twice.",
  same: "Choose a password different from the temporary one.",
  failed: "The password couldn't be saved. Try again.",
};

export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [viewer, { error }] = await Promise.all([getViewer(), searchParams]);
  const field = "rounded-full border border-line px-4 py-3 text-base font-normal outline-none focus:border-lime";

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo className="scale-125" />
        </div>
        <form action={changePassword} className="card flex flex-col gap-4 p-6 sm:p-8">
          <div>
            <h1 className="text-xl font-semibold">Welcome, {viewer.name.split(" ")[0]}</h1>
            <p className="mt-1 text-sm text-muted">
              Choose your own password to replace the temporary one: at least 8 characters, with a capital letter and a number.
              {viewer.bidiiSuperAdmin ? " You will use the same password for the Bidii super admin." : ""}
            </p>
          </div>
          {error && ERRORS[error] && <p className="rounded-2xl bg-warn-soft px-3 py-2.5 text-sm text-warn">{ERRORS[error]}</p>}
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            New password
            <input name="password" type="password" required minLength={8} autoComplete="new-password" className={field} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Type it again
            <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className={field} />
          </label>
          <SubmitButton pending="Saving…" className="mt-2 rounded-full bg-lime px-5 py-3 text-sm font-semibold text-ink hover:brightness-95">Save and continue</SubmitButton>
        </form>
      </div>
    </main>
  );
}
