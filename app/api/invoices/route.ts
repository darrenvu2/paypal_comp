const PAYPAL_BASE = "https://api-m.sandbox.paypal.com";

type InvoiceLine = { name: string; cents: number };
type InvoiceRequest = {
  recipientName: string;
  recipientEmail: string;
  lines: InvoiceLine[];
  totalCents: number;
};

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

async function getAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PayPal credentials are not configured on the server.");

  const response = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`PayPal token request failed (${response.status}).`);
  return body.access_token as string;
}

async function paypal<T>(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${PAYPAL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`PayPal request failed (${response.status}).`);
  return body as T;
}

export async function POST(request: Request) {
  const merchantEmail = process.env.MERCHANT_EMAIL;
  if (!merchantEmail) return jsonError("MERCHANT_EMAIL is not configured on the server.", 500);

  let invoices: InvoiceRequest[];
  try {
    const body = (await request.json()) as { invoices?: InvoiceRequest[] };
    invoices = body.invoices ?? [];
  } catch {
    return jsonError("Invalid JSON request.", 400);
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (
    invoices.length === 0 ||
    invoices.some(
      (invoice) =>
        !invoice.recipientName ||
        !emailPattern.test(invoice.recipientEmail) ||
        !Number.isInteger(invoice.totalCents) ||
        invoice.totalCents <= 0 ||
        !Array.isArray(invoice.lines) ||
        invoice.lines.some((line) => !line.name || !Number.isInteger(line.cents) || line.cents < 0),
    )
  ) {
    return jsonError("Each invoice needs a recipient, valid email, positive total, and valid lines.", 400);
  }

  try {
    const token = await getAccessToken();
    const created: { person: string; invoiceId: string; payerLink?: string; status?: string }[] = [];

    for (const [index, invoice] of invoices.entries()) {
      const lines = invoice.lines.filter((line) => line.cents > 0);
      const draft = await paypal<{ href: string }>("/v2/invoicing/invoices", token, {
        method: "POST",
        body: JSON.stringify({
          detail: {
            invoice_number: `SPLIT-${Date.now()}-${index}`,
            currency_code: "USD",
            note: "Dinner split - your share",
          },
          invoicer: { email_address: merchantEmail },
          primary_recipients: [{ billing_info: { email_address: invoice.recipientEmail } }],
          items: lines.map((line) => ({
            name: line.name,
            quantity: "1",
            unit_amount: { currency_code: "USD", value: (line.cents / 100).toFixed(2) },
          })),
        }),
      });

      const invoiceId = draft.href.split("/").pop()!;
      const sent = await paypal<{ href?: string }>(`/v2/invoicing/invoices/${invoiceId}/send`, token, {
        method: "POST",
        body: JSON.stringify({ send_to_recipient: true, send_to_invoicer: false }),
      });
      const status = await paypal<{ status?: string }>(`/v2/invoicing/invoices/${invoiceId}`, token);
      created.push({ person: invoice.recipientName, invoiceId, payerLink: sent.href, status: status.status });
    }

    return Response.json({ invoices: created });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to send PayPal invoices.", 502);
  }
}
