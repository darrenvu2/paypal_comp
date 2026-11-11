/**
 * Standalone PayPal sandbox test: token -> create draft invoice -> send -> check status.
 * Add --record-payment to also mark it paid (demo shortcut) and re-check.
 *
 * Run:  npm run paypal:test        (or npm run paypal:test:pay)
 */

const BASE = "https://api-m.sandbox.paypal.com";

const {
  PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET,
  MERCHANT_EMAIL,
  BUYER_EMAIL,
} = process.env;

if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET || !MERCHANT_EMAIL || !BUYER_EMAIL) {
  console.error("Missing env vars. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

// Money is always integer cents; format only at the PayPal boundary.
const money = (cents: number) => (cents / 100).toFixed(2);

// Sample invoice: Sam's share from the mockup ($38.42).
const lines = [
  { name: "Burger", cents: 1650 },
  { name: "Fries", cents: 600 },
  { name: "Pitcher (shared, 1/3)", cents: 734 },
  { name: "Tax (your share)", cents: 261 },
  { name: "Tip (your share)", cents: 597 },
];
const totalCents = lines.reduce((sum, l) => sum + l.cents, 0);

async function paypal<T = any>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PayPal ${init.method ?? "GET"} ${path} failed (${res.status}): ${text}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

async function getToken(): Promise<string> {
  const basic = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Token request failed (${res.status}): ${JSON.stringify(body)}`);
  return body.access_token;
}

async function main() {
  const recordPayment = process.argv.includes("--record-payment");

  console.log("1. Getting access token...");
  const token = await getToken();

  console.log(`2. Creating draft invoice for $${money(totalCents)}...`);
  const created = await paypal<{ href: string }>("/v2/invoicing/invoices", token, {
    method: "POST",
    body: JSON.stringify({
      detail: {
        invoice_number: `SPLIT-${Date.now()}`,
        currency_code: "USD",
        note: "Dinner split - your share",
      },
      invoicer: { email_address: MERCHANT_EMAIL },
      primary_recipients: [{ billing_info: { email_address: BUYER_EMAIL } }],
      items: lines.map((l) => ({
        name: l.name,
        quantity: "1",
        unit_amount: { currency_code: "USD", value: money(l.cents) },
      })),
    }),
  });
  const invoiceId = created.href.split("/").pop()!;
  console.log(`   Invoice ID: ${invoiceId}`);

  console.log("3. Sending invoice...");
  const sent = await paypal<{ href?: string }>(`/v2/invoicing/invoices/${invoiceId}/send`, token, {
    method: "POST",
    body: JSON.stringify({ send_to_recipient: true, send_to_invoicer: false }),
  });
  if (sent.href) console.log(`   Payer link: ${sent.href}`);

  console.log("4. Checking status...");
  const invoice = await paypal(`/v2/invoicing/invoices/${invoiceId}`, token);
  console.log(`   Status: ${invoice.status}`);
  console.log(`   Amount due: ${invoice.amount?.value} ${invoice.amount?.currency_code}`);
  if (invoice.amount?.value !== money(totalCents)) {
    console.warn(`   WARNING: expected ${money(totalCents)}; check line items.`);
  }

  if (recordPayment) {
    console.log("5. Recording a payment (demo shortcut)...");
    await paypal(`/v2/invoicing/invoices/${invoiceId}/payments`, token, {
      method: "POST",
      body: JSON.stringify({
        method: "CASH",
        payment_date: new Date().toISOString().slice(0, 10),
        amount: { currency_code: "USD", value: money(totalCents) },
        note: "Demo payment",
      }),
    });
    const after = await paypal(`/v2/invoicing/invoices/${invoiceId}`, token);
    console.log(`   Status now: ${after.status}`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
