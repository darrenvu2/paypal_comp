const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";

type ParsedReceipt = {
  merchant: string | null;
  items: { name: string; priceCents: number }[];
  taxCents: number;
  tipCents: number;
  totalCents: number;
};

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return errorResponse("GEMINI_API_KEY is not configured on the server.", 500);

  let imageBase64: string;
  let mediaType: string;
  try {
    const body = (await request.json()) as { imageBase64?: string; mediaType?: string };
    imageBase64 = body.imageBase64 ?? "";
    mediaType = body.mediaType ?? "";
  } catch {
    return errorResponse("Invalid JSON request.", 400);
  }

  if (!imageBase64 || !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mediaType)) {
    return errorResponse("A supported receipt image is required.", 400);
  }

  try {
    const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
        "Api-Revision": "2026-05-20",
      },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model,
        input: [
          { type: "image", data: imageBase64, mime_type: mediaType },
          { type: "text", text: `Read this receipt and return ONLY valid JSON with this exact shape:
{"merchant":string|null,"items":[{"name":string,"priceCents":number}],"taxCents":number,"tipCents":number,"totalCents":number}

Rules:
- Convert every money value to integer US cents.
- Include each purchased line item, but do not include subtotal, tax, tip, or total as an item.
- Use 0 when tax or tip is not shown.
- Do not guess missing values. If the receipt is unreadable, return an empty items array and zero amounts.
 - Return no markdown, explanation, or code fence.` },
        ],
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: {
            type: "object",
            properties: {
              merchant: { type: ["string", "null"] },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: { name: { type: "string" }, priceCents: { type: "integer" } },
                  required: ["name", "priceCents"],
                },
              },
              taxCents: { type: "integer" },
              tipCents: { type: "integer" },
              totalCents: { type: "integer" },
            },
            required: ["merchant", "items", "taxCents", "tipCents", "totalCents"],
          },
        },
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      console.error("Gemini API error", response.status, body);
      return errorResponse(body?.error?.message || "Gemini could not read the receipt.", 502);
    }
    const text = body?.steps
      ?.find((step: { type?: string }) => step.type === "model_output")
      ?.content?.find((part: { type?: string; text?: string }) => part.type === "text")
      ?.text?.trim();
    if (!text) {
      console.error("Gemini returned no model output", body);
      return errorResponse("Gemini returned no receipt data.", 502);
    }
    const parsed = JSON.parse(text) as ParsedReceipt;
    if (
      !Array.isArray(parsed.items) ||
      parsed.items.some((item) => !item.name || !Number.isInteger(item.priceCents) || item.priceCents < 0) ||
      !Number.isInteger(parsed.taxCents) || !Number.isInteger(parsed.tipCents) || !Number.isInteger(parsed.totalCents)
    ) return errorResponse("Gemini returned an invalid receipt format.", 502);
    return Response.json(parsed);
  } catch (error) {
    console.error("Receipt parsing failed", error);
    return errorResponse(error instanceof Error && error.name === "TimeoutError" ? "Gemini timed out while reading the receipt." : "Gemini returned unreadable receipt data.", 502);
  }
}
