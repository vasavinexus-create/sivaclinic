import test from "node:test";
import assert from "node:assert/strict";
import { validateInvoiceFile, parseInvoiceResponse, geminiFailure } from "../supabase/functions/_shared/purchase-extraction.mjs";

test("validates file payload before contacting Gemini", () => {
  assert.equal(validateInvoiceFile("YWJj", "image/jpg"), "image/jpeg");
  assert.throws(() => validateInvoiceFile("", "application/pdf"), /could not be read/);
  assert.throws(() => validateInvoiceFile("YWJj", "text/html"), /PDF/);
  assert.throws(() => validateInvoiceFile("a".repeat(4 * 1024 * 1024 + 4), "application/pdf"), /3 MB/);
});

test("joins output parts and ignores thinking text", () => {
  const invoice = parseInvoiceResponse({ candidates: [{ finishReason: "STOP", content: { parts: [
    { thought: true, text: "Thinking about the invoice" },
    { text: '```json\n{"items":[' }, { text: '{"product_name":"Medicine"}]}\n```' },
  ] } }] });
  assert.equal(invoice.items[0].product_name, "Medicine");
});

test("rejects incomplete, blocked, malformed and empty extractions", () => {
  assert.throws(() => parseInvoiceResponse({ candidates: [{ finishReason: "MAX_TOKENS" }] }), /incomplete/);
  assert.throws(() => parseInvoiceResponse({ promptFeedback: { blockReason: "OTHER" } }), /could not process/);
  for (const text of ['{}', '{"items":[]}', '{"items":[null]}', 'not JSON']) {
    assert.throws(() => parseInvoiceResponse({ candidates: [{ content: { parts: [{ text }] } }] }));
  }
});

test("only model-not-found errors cause model fallback", () => {
  assert.equal(geminiFailure(404, "{}", "model").retryModel, true);
  for (const status of [400, 401, 403, 429, 500, 503]) {
    assert.equal(geminiFailure(status, "{}", "model").retryModel, false);
  }
  assert.match(geminiFailure(400, JSON.stringify({ error: { message: "API key not valid" } }), "model").message, /invalid or restricted/);
  assert.equal(geminiFailure(429, "{}", "model").status, 429);
});
