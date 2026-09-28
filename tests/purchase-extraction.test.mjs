import test from "node:test";
import assert from "node:assert/strict";
import { validateInvoiceFile, parseInvoiceResponse, geminiFailure, invoiceGenerationConfig } from "../supabase/functions/_shared/purchase-extraction.mjs";

test("disables thinking overhead only for supported Flash models", () => {
  for (const model of ["gemini-2.5-flash", "gemini-2.5-flash-lite"]) {
    assert.equal(invoiceGenerationConfig(model).thinkingConfig.thinkingBudget, 0);
    assert.equal(invoiceGenerationConfig(model).responseMimeType, "application/json");
  }
  assert.equal(invoiceGenerationConfig("gemini-3.6-flash").thinkingConfig, undefined);
  assert.equal(invoiceGenerationConfig("gemini-2.5-pro").thinkingConfig, undefined);
});

test("validates file payload before contacting Gemini", () => {
  assert.equal(validateInvoiceFile("YWJj", "image/jpg"), "image/jpeg");
  assert.throws(() => validateInvoiceFile("", "application/pdf"), /could not be read/);
  assert.throws(() => validateInvoiceFile("YWJj", "text/html"), /PDF/);
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

test("reports unavailable and busy models without changing the selection", () => {
  assert.match(geminiFailure(404, "{}", "gemini-2.5-flash").message, /selected Gemini model is unavailable/);
  const busy = geminiFailure(503, "{}", "gemini-2.5-flash");
  assert.equal(busy.status, 503);
  assert.match(busy.message, /gemini-2.5-flash/);
  assert.match(busy.message, /model has not been changed/);
  assert.match(geminiFailure(400, JSON.stringify({ error: { message: "API key not valid" } }), "model").message, /invalid or restricted/);
  assert.equal(geminiFailure(429, "{}", "model").status, 429);
});
