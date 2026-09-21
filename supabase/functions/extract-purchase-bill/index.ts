import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-3.6-flash";

const GEMINI_SYSTEM_INSTRUCTION = `You are an invoice data extraction engine for an Indian purchase and inventory application.

Extract the purchase invoice into valid JSON only.

Rules:
1. Extract only values visible in the invoice.
2. Never invent missing values.
3. Process all pages.
4. Extract every product row.
5. Preserve supplier product descriptions, product codes, HSN, batch numbers and barcodes as strings.
6. Return numbers as JSON numbers without currency symbols or comma formatting.
7. Do not confuse MRP with purchase rate.
8. Do not combine billed quantity and free quantity.
9. Dates should preferably be normalized to YYYY-MM-DD.
10. Expiry printed as MM/YY must use expiry_month and expiry_year.
11. If uncertain, return null and add a warning.

Return this JSON shape:
{
  "document_type": string | null,
  "supplier": {"name": string | null, "gstin": string | null, "drug_license_no": string | null, "address": string | null, "phone": string | null, "email": string | null, "state": string | null, "state_code": string | null},
  "buyer": {"name": string | null, "gstin": string | null, "drug_license_no": string | null, "address": string | null, "phone": string | null, "state": string | null, "state_code": string | null},
  "invoice": {"invoice_number": string | null, "invoice_date": string | null, "invoice_type": string | null, "payment_terms": string | null, "due_date": string | null, "currency": string | null},
  "items": [{"line_no": number | null, "manufacturer": string | null, "product_name": string | null, "product_code": string | null, "barcode": string | null, "description": string | null, "pack": string | null, "unit": string | null, "hsn": string | null, "batch_no": string | null, "expiry_month": number | null, "expiry_year": number | null, "quantity": number | null, "free_quantity": number | null, "rate": number | null, "purchase_rate": number | null, "mrp": number | null, "discount_percent": number | null, "discount_amount": number | null, "gst_percent": number | null, "line_total": number | null}],
  "tax_summary": [{"gst_percent": number | null, "taxable_amount": number | null, "cgst_amount": number | null, "sgst_amount": number | null, "igst_amount": number | null, "total_tax": number | null}],
  "totals": {"gross_amount": number | null, "total_discount": number | null, "taxable_amount": number | null, "total_tax": number | null, "round_off": number | null, "grand_total": number | null, "paid_amount": number | null, "balance_amount": number | null},
  "validation": {"pages_detected": number | null, "all_pages_processed": boolean | null, "printed_grand_total": number | null, "requires_review": boolean | null, "warnings": string[]}
}`;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseJsonFromGemini(text: string) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(trimmed);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { file_base64, mime_type, organization_id, import_id, user_api_key, gemini_model } = body;

    if (!file_base64 || !organization_id) {
      return jsonResponse({ error: "Missing file_base64 or organization_id" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

    let apiKey = String(user_api_key || "").trim() || Deno.env.get("GEMINI_API_KEY")?.trim() || "";
    let selectedModel = String(gemini_model || "").trim() || DEFAULT_GEMINI_MODEL;

    if ((!apiKey || !gemini_model) && supabase) {
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select("gemini_api_key,gemini_model")
        .eq("id", organization_id)
        .single();
      if (orgError && !apiKey) {
        return jsonResponse({ error: "Gemini API key is missing. Please enter your Google Gemini API key." }, 400);
      }
      if (!orgError) {
        if (!apiKey) apiKey = orgData?.gemini_api_key?.trim() || "";
        if (!gemini_model && orgData?.gemini_model) selectedModel = orgData.gemini_model.trim();
      }
    }

    if (!apiKey) {
      return jsonResponse({ error: "Gemini API key is missing. Please enter your Google Gemini API key." }, 400);
    }

    if ((user_api_key || gemini_model) && supabase) {
      const { error: updateError } = await supabase
        .from("organizations")
        .update({ gemini_api_key: apiKey, gemini_model: selectedModel })
        .eq("id", organization_id);
      if (updateError && updateError.code !== "42P01" && updateError.code !== "42703") {
        throw new Error(`Supabase organization settings update failed: ${updateError.message}. Run the Gemini model settings migration.`);
      }
    }

    let geminiResponseJson: Record<string, any> | null = null;
    let usedModel = "";
    let lastGeminiError = "";
    const modelsToTry = Array.from(new Set([selectedModel, "gemini-3.6-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"].filter(Boolean)));

    for (const model of modelsToTry) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort("Gemini extraction timed out after 110s"), 110_000);
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const payload = {
          systemInstruction: { parts: [{ text: GEMINI_SYSTEM_INSTRUCTION }] },
          contents: [{
            parts: [
              { inlineData: { mimeType: mime_type || "application/pdf", data: file_base64 } },
              { text: "Extract all purchase invoice data as JSON. Return JSON only." },
            ],
          }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        };

        const geminiRes = await fetch(geminiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        const resText = await geminiRes.text();
        if (!geminiRes.ok) {
          let googleMessage = resText.slice(0, 500);
          let googleStatus = `HTTP_${geminiRes.status}`;
          try {
            const parsed = JSON.parse(resText);
            googleMessage = parsed?.error?.message || googleMessage;
            googleStatus = parsed?.error?.status || googleStatus;
          } catch {
            // Keep raw response snippet.
          }
          lastGeminiError = `Google Gemini rejected the request (${model}, ${googleStatus}): ${googleMessage}`;
          continue;
        }

        const jsonRes = JSON.parse(resText);
        const textContent = jsonRes?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textContent) {
          lastGeminiError = `Gemini returned no usable content (${model})`;
          continue;
        }
        geminiResponseJson = parseJsonFromGemini(textContent);
        usedModel = model;
        break;
      } finally {
        clearTimeout(timeout);
      }
    }

    if (!geminiResponseJson) {
      throw new Error(lastGeminiError || "Failed to extract invoice data using Gemini API");
    }

    const warnings: string[] = Array.isArray(geminiResponseJson.validation?.warnings)
      ? [...geminiResponseJson.validation.warnings]
      : [];
    const items = Array.isArray(geminiResponseJson.items) ? geminiResponseJson.items : [];
    const totals = geminiResponseJson.totals || {};
    let calculatedLineTotalSum = 0;

    items.forEach((item: Record<string, unknown>, idx: number) => {
      const lineTotal = Number(item.line_total || 0);
      const qty = Number(item.quantity || 0);
      const rate = Number(item.purchase_rate || item.rate || 0);
      calculatedLineTotalSum += lineTotal;

      if (!item.product_name && !item.description) warnings.push(`Row #${idx + 1}: Missing product description`);
      if (qty <= 0) warnings.push(`Row #${idx + 1} (${item.product_name || "Item"}): Billed quantity is missing or 0`);
      if (rate <= 0) warnings.push(`Row #${idx + 1} (${item.product_name || "Item"}): Purchase rate is missing or 0`);
    });

    const printedGrandTotal = Number(totals.grand_total || geminiResponseJson.validation?.printed_grand_total || 0);
    if (printedGrandTotal > 0 && Math.abs(calculatedLineTotalSum - printedGrandTotal) > 5) {
      warnings.push(`Printed grand total (${printedGrandTotal}) differs from sum of line items (${calculatedLineTotalSum.toFixed(2)})`);
    }

    geminiResponseJson.validation = {
      ...(geminiResponseJson.validation || {}),
      warnings,
      requires_review: warnings.length > 0 || items.some((item: Record<string, unknown>) => !item.batch_no || !item.expiry_year),
    };

    if (supabase) {
      await supabase.from("purchase_invoice_extractions").insert({
        organization_id,
        purchase_import_id: import_id || null,
        raw_json: geminiResponseJson,
        model_name: usedModel || selectedModel,
        extraction_success: true,
      });
    }

    return jsonResponse({ success: true, extraction: geminiResponseJson, model: usedModel || selectedModel });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 400);
  }
});
