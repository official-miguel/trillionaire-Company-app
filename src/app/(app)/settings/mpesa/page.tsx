import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { can, getViewer } from "@/lib/data/queries";
import { getMpesaConfig } from "@/lib/mpesa/queries";
import { appUrl } from "@/lib/mpesa/appUrl";
import { callbackUrlProblem } from "@/lib/mpesa/helpers";
import { dateTime } from "@/lib/format";
import { registerCallbackUrls, saveMpesaSettings, sendTestPayment, testConnection } from "./actions";

export const metadata = { title: "M-PESA / Daraja" };

const MESSAGES: Record<string, [string, "ok" | "warn"]> = {
  "saved=1": ["Saved. The keys are stored encrypted on the server and are never shown again.", "ok"],
  "saved=demo": ["Demo mode: nothing was saved.", "ok"],
  "tested=1": ["Connected. Safaricom accepted the keys.", "ok"],
  "tested=demo": ["Demo mode: no call was made to Safaricom.", "ok"],
  "registered=1": ["Callback addresses registered. Payments to the shortcode now reach the app.", "ok"],
  "registered=demo": ["Demo mode: nothing was registered.", "ok"],
  "simulated=1": ["Safaricom accepted the test payment. It appears under M-PESA payments as soon as Safaricom calls back, usually within a minute.", "ok"],
  "simulated=demo": ["Demo mode: no test payment was sent.", "ok"],
  "error=reason": ["Write a reason for the change.", "warn"],
  "error=amount": ["A test payment is between KES 1 and KES 150,000.", "warn"],
  "error=not-allowed": ["Only the owner, or someone the owner allows, can change Settings.", "warn"],
};

const STATUS = {
  connected: { label: "Connected", tone: "green" },
  disconnected: { label: "Disconnected", tone: "grey" },
  error: { label: "Connection failed", tone: "red" },
} as const;

const field = "rounded-full border border-line bg-white px-4 py-2.5 text-base font-normal outline-none focus:border-lime";

export default async function MpesaSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const [viewer, params] = await Promise.all([getViewer(), searchParams]);
  if (!can(viewer, "bidii", "settings_editor")) redirect("/settings?error=not-allowed");
  const [config, url] = await Promise.all([getMpesaConfig(), appUrl()]);
  if (!config) redirect("/settings?error=not-allowed");

  const [key, value] = Object.entries(params)[0] ?? [];
  const message = MESSAGES[`${key}=${value}`] ?? (key === "error" && value ? ([value, "warn"] as const) : null);
  const ready = !!config.shortcode && config.hasConsumerKey && config.hasConsumerSecret;
  const urlProblem = url ? callbackUrlProblem(url, config.environment) : "Set APP_URL to the app's public https address.";
  const base = `${url}/api/payments/c2b/••••••••`;
  const status = STATUS[config.status];

  return (
    <>
      <PageHeader
        title="M-PESA / Daraja"
        subtitle="Payments to your Paybill or Till arrive from Safaricom, are matched to schools and invoices, and credited to Bidii's ledger automatically."
        action={
          <Link href="/settings" className="text-sm text-muted hover:text-ink">
            Back to Settings
          </Link>
        }
      />
      {message && <p className={`mb-5 rounded-2xl px-4 py-3 text-sm ${message[1] === "ok" ? "bg-lime-soft" : "bg-warn-soft text-warn"}`}>{message[0]}</p>}

      <div className="flex flex-col gap-5">
        <Card title="Connection" action={<Badge tone={status.tone}>{status.label}</Badge>}>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Row label="Integration">{config.enabled ? "On" : "Off: payments are recorded but not credited"}</Row>
            <Row label="Environment">{config.environment === "production" ? "Production (live money)" : "Sandbox (test)"}</Row>
            <Row label="Shortcode">{config.shortcode ? `${config.shortcode} (${config.shortcodeType === "till" ? "Till" : "Paybill"})` : "Not set"}</Row>
            <Row label="Last tested">{config.testedAt ? dateTime(config.testedAt) : "Never"}</Row>
            <Row label="Callback addresses registered">{config.urlsRegisteredAt ? dateTime(config.urlsRegisteredAt) : "Not yet"}</Row>
            <Row label="Last successful sync">{config.lastSyncAt ? dateTime(config.lastSyncAt) : "Never"}</Row>
          </dl>
          {config.statusDetail && <p className={`mt-4 rounded-2xl px-3 py-2.5 text-sm ${config.status === "error" ? "bg-warn-soft text-warn" : "bg-surface text-ink/80"}`}>{config.statusDetail}</p>}

          <div className="mt-5 border-t border-line pt-5 text-sm">
            <p className="font-medium">Callback addresses</p>
            <p className="mt-1 text-muted">Registered with Safaricom for you. The hidden part is a secret only Safaricom and the server know.</p>
            <ul className="mt-2 flex flex-col gap-1 font-mono text-xs text-ink/80">
              <li className="break-all">{base}/confirmation</li>
              <li className="break-all">{base}/validation</li>
            </ul>
            {urlProblem && <p className="mt-2 rounded-2xl bg-warn-soft px-3 py-2.5 text-warn">{urlProblem}</p>}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <form action={testConnection}>
              <SubmitButton pending="Testing…" className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:border-ink/30">
                Test connection
              </SubmitButton>
            </form>
            <form action={registerCallbackUrls}>
              <SubmitButton pending="Registering…" className="rounded-full bg-lime px-5 py-2.5 text-sm font-semibold text-ink hover:brightness-95">
                Register callback addresses
              </SubmitButton>
            </form>
          </div>
          {!ready && <p className="mt-3 text-xs text-muted">Save the shortcode, Consumer Key and Consumer Secret below first.</p>}
        </Card>

        {config.environment === "sandbox" && (
          <Card title="Send a test payment" action={<Badge tone="amber">Sandbox only</Badge>}>
            <p className="mb-4 text-sm text-muted">
              Safaricom sends a pretend payment from its test phone to your sandbox shortcode. It comes back through the callback like a real one, so you can check the whole path: received, matched, credited and notified.
            </p>
            <form action={sendTestPayment} className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink/70">Amount (KES)</span>
                <input name="amount" type="number" min="1" max="150000" step="1" defaultValue={100} required inputMode="numeric" className={field} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink/70">Account number (an invoice number to match)</span>
                <input name="account" maxLength={20} placeholder="INV-1001" className={field} />
              </label>
              <SubmitButton pending="Sending…" className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:border-ink/30">
                Send test payment
              </SubmitButton>
            </form>
          </Card>
        )}

        <Card title="Daraja settings" action={<Badge>Keys stored encrypted</Badge>}>
          <form action={saveMpesaSettings} className="flex flex-col gap-5">
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="enabled" defaultChecked={config.enabled} className="h-5 w-5 accent-[var(--lime)]" />
              <span>
                <span className="font-medium">Credit M-PESA payments automatically</span>
                <span className="block text-muted">When off, payments are still recorded but held for review.</span>
              </span>
            </label>

            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Environment</legend>
              <div className="flex gap-2">
                {(["sandbox", "production"] as const).map((env) => (
                  <label key={env} className="flex flex-1 items-center justify-center rounded-full border border-line px-4 py-2.5 text-sm has-[:checked]:border-lime has-[:checked]:bg-lime-soft sm:flex-none sm:px-6">
                    <input type="radio" name="environment" value={env} defaultChecked={config.environment === env} className="sr-only" />
                    {env === "sandbox" ? "Sandbox" : "Production"}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Business shortcode
                <input name="shortcode" defaultValue={config.shortcode ?? ""} inputMode="numeric" pattern="[0-9]{5,7}" placeholder="Paybill or Till number" className={field} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Shortcode type
                <select name="shortcode_type" defaultValue={config.shortcodeType} className={field}>
                  <option value="paybill">Paybill</option>
                  <option value="till">Till (Buy Goods)</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SecretField name="consumer_key" label="Consumer Key" saved={config.hasConsumerKey} />
              <SecretField name="consumer_secret" label="Consumer Secret" saved={config.hasConsumerSecret} />
              <SecretField name="passkey" label="Passkey (Lipa na M-PESA Online, optional)" saved={config.hasPasskey} />
            </div>
            <p className="-mt-2 text-xs text-muted">
              From your app on developer.safaricom.co.ke. Leave a box empty to keep the key already saved. Keys are never shown again, here or anywhere in the browser.
            </p>

            <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-end">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                <span className="font-medium">Reason for the change</span>
                <input name="reason" required placeholder="Kept in the audit trail" className={field} />
              </label>
              <SubmitButton pending="Saving…" className="rounded-full bg-lime px-6 py-2.5 text-sm font-semibold text-ink hover:brightness-95">
                Save settings
              </SubmitButton>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function SecretField({ name, label, saved }: { name: string; label: string; saved: boolean }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      <span className="flex items-center gap-2">
        {label} {saved && <Badge tone="green">Saved</Badge>}
      </span>
      <input name={name} type="password" autoComplete="off" spellCheck={false} placeholder={saved ? "•••••••• (leave empty to keep)" : "Paste it here"} className={field} />
    </label>
  );
}
