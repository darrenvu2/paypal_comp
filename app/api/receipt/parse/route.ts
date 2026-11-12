const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

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
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const response = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: mediaType, data: imageBase64 } },
            { text: `Read this receipt and return ONLY valid JSON with this exact shape:
{"merchant":string|null,"items":[{"name":string,"priceCents":number}],"taxCents":number,"tipCents":number,"totalCents":number}

Rules:
- Convert every money value to integer US cents.
- Include each purchased line item, but do not include subtotal, tax, tip, or total as an item.
- Use 0 when tax or tip is not shown.
- Do not guess missing values. If the receipt is unreadable, return an empty items array and zero amounts.
- Return no markdown, explanation, or code fence.` },
          ],
        }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });
    const body = await response.json();
    if (!response.ok) return errorResponse(body?.error?.message || "Gemini could not read the receipt.", 502);
    const text = body?.candidates?.[0]?.content?.parts?.find((part: { text?: string }) => part.text)?.text?.trim();
    if (!text) return errorResponse("Gemini returned no receipt data.", 502);
    const parsed = JSON.parse(text) as ParsedReceipt;
    if (
      !Array.isArray(parsed.items) ||
      parsed.items.some((item) => !item.name || !Number.isInteger(item.priceCents) || item.priceCents < 0) ||
      !Number.isInteger(parsed.taxCents) || !Number.isInteger(parsed.tipCents) || !Number.isInteger(parsed.totalCents)
    ) return errorResponse("Gemini returned an invalid receipt format.", 502);
    return Response.json(parsed);
  } catch {
    return errorResponse("Gemini returned unreadable receipt data.", 502);
  }
}
