import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { ClearOfflinePages, InstallApp } from "@/components/InstallApp";
import { isDemo } from "@/lib/demo";
import { supabaseServer } from "@/lib/supabase/server";
import { adoptBidiiPassword } from "@/lib/people";

export const metadata = { title: "Sign in" };

async function signIn(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (!error) redirect("/");

  // First time here for a Bidii super admin: their Bidii password works too.
  if (await adoptBidiiPassword(email, password)) {
    const again = await sb.auth.signInWithPassword({ email, password });
    if (!again.error) redirect("/");
  }
  redirect("/login?error=wrong");
}

const ERRORS: Record<string, string> = {
  wrong: "That email and password don't match. Try again, or contact Trillionaire Designs support to reset your password.",
  "no-profile": "Your sign-in works, but you haven't been added to the app yet. Contact Trillionaire Designs support.",
  "switched-off": "Your account has been switched off. Contact Trillionaire Designs support if you think this is a mistake.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (isDemo()) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo className="scale-125" />
        </div>
        <form action={signIn} className="card flex flex-col gap-4 p-6 sm:p-8">
          <div>
            <h1 className="text-xl font-semibold">Sign in</h1>
            <p className="mt-1 text-sm text-muted">One login for this app and the Bidii super admin.</p>
          </div>
          {error && ERRORS[error] && <p className="rounded-2xl bg-warn-soft px-3 py-2.5 text-sm text-warn">{ERRORS[error]}</p>}
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Email
            <input name="email" type="email" required autoComplete="email" className="rounded-full border border-line px-4 py-3 text-base font-normal outline-none focus:border-lime" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Password
            <input name="password" type="password" required autoComplete="current-password" className="rounded-full border border-line px-4 py-3 text-base font-normal outline-none focus:border-lime" />
          </label>
          <button className="mt-2 rounded-full bg-lime px-5 py-3 text-sm font-semibold text-ink transition hover:brightness-95">Sign in</button>
        </form>
        <InstallApp className="mt-4" />
        <ClearOfflinePages />
      </div>
    </main>
  );
}
