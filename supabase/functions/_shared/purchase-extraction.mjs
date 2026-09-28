export function invoiceGenerationConfig(model) {
  return {
    responseMimeType: "application/json",
    temperature: 0.1,
    ...(model === "gemini-2.5-flash" || model === "gemini-2.5-flash-lite"
      ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
  };
}

export function validateInvoiceFile(data, mimeType) {
  const mime = mimeType === "image/jpg" ? "image/jpeg" : mimeType;
  if (!["application/pdf", "image/jpeg", "image/png"].includes(mime)) {
    throw new Error("Please upload a PDF, JPG, or PNG invoice.");
  }
  if (typeof data !== "string" || !data.length || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 !== 0) {
    throw new Error("The invoice file could not be read. Please select the file again.");
  }
  return mime;
}

export function parseInvoiceResponse(response) {
  const candidate = response?.candidates?.[0];
  if (response?.promptFeedback?.blockReason) {
    throw new Error(`Gemini could not process this document (${response.promptFeedback.blockReason}). Try a clearer invoice.`);
  }
  if (candidate?.finishReason && candidate.finishReason !== "STOP") {
    throw new Error(`Gemini extraction was incomplete (${candidate.finishReason}). Try a smaller invoice file.`);
  }
  const text = candidate?.content?.parts?.filter((part) => !part.thought && typeof part.text === "string").map((part) => part.text).join("") || "";
  let invoice;
  try {
    invoice = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    throw new Error("Gemini returned unreadable invoice data. Please retry with a clearer PDF or image.");
  }
  if (!invoice || !Array.isArray(invoice.items) || invoice.items.length === 0 || invoice.items.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
    throw new Error("No valid product rows were extracted. Please upload a clear purchase invoice with visible medicine rows.");
  }
  return invoice;
}

export function geminiFailure(status, responseText, model) {
  let message = `HTTP ${status}`;
  try { message = JSON.parse(responseText)?.error?.message || message; } catch { /* Keep the HTTP status for non-JSON responses. */ }
  const prefix = status === 429 ? "Gemini quota exceeded. Check Google AI Studio quota/billing and retry later."
    : status === 503 ? "The selected Gemini model is temporarily busy. Please retry later; the model has not been changed."
    : status === 404 ? "The selected Gemini model is unavailable for this API key. Choose another model or check model access."
    : status === 401 || status === 403 || /API_KEY_INVALID|API key not valid|API key expired/i.test(message)
      ? "Gemini API key is invalid or restricted. Update the key in Settings or enter a replacement."
      : "Google Gemini rejected the invoice.";
  return {
    message: `${prefix} (${model}): ${message}`,
    status: status === 503 ? 503 : status === 429 ? 429 : status === 400 || status === 401 || status === 403 ? 400 : 502,
  };
}
