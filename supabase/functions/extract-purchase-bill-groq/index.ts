import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";
import { validateInvoiceFile, parseInvoiceResponse, geminiFailure, invoiceGenerationConfig } from "../_shared/purchase-extraction.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";

const GROQ_SYSTEM_INSTRUCTION = `You are an invoice data extraction engine for an Indian purchase and inventory application.
  
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
  12. Read sideways or rotated scans in their correct orientation.
  13. Return compact JSON without indentation. Omit absent optional fields rather than repeating null fields. Do not repeat product_name in description when they are identical.
  14. If printed page numbering indicates missing pages, set all_pages_processed to false, requires_review to true, and add a warning. Do not invent rows from missing pages.
  
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

export function groqFailure(status: number, responseText: string, model: string) {
  let message = `HTTP ${status}`;
  try { message = JSON.parse(responseText)?.error?.message || message; } catch { /* keep status */ }
  const prefix = status === 429 ? "Groq quota exceeded."
    : status === 503 ? "Groq model temporarily busy."
    : status === 404 ? "Groq model unavailable."
    : status === 401 || status === 403 || /API_KEY_INVALID|API key not valid/i.test(message)
      ? "Groq API key is invalid."
      : "Groq API rejected the invoice.";
  return {
    message: `${prefix} (${model}): ${message}`,
    status: status === 503 ? 503 : status === 429 ? 429 : status === 400 || status === 401 || status === 403 ? 400 : 502,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      file_base64,
      mime_type,
      organization_id,
      import_id,
      groq_model,
      user_api_key,
    } = await req.json();

    if (!file_base64 || !organization_id) {
      return jsonResponse({ error: "Missing required fields: file_base64, organization_id." }, 400);
    }

    const invoiceMime = mime_type || "image/jpeg";

    if (invoiceMime === "application/pdf") {
      return jsonResponse({ error: "Groq models do not support PDF files. Please select a Gemini model or upload an image (JPG/PNG)." }, 400);
    }

    const supabaseAdminUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAdminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    let supabase = null;
    if (supabaseAdminUrl && supabaseAdminKey) {
      supabase = createClient(supabaseAdminUrl, supabaseAdminKey, { auth: { persistSession: false } });
    }

    let apiKey = String(user_api_key || "").trim() || Deno.env.get("GROQ_API_KEY")?.trim() || "";
    let selectedModel = String(groq_model || "").trim() || DEFAULT_GROQ_MODEL;

    if (!apiKey && supabase) {
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select("groq_api_key")
        .eq("id", organization_id)
        .single();
      if (!orgError) {
        if (!apiKey) apiKey = orgData?.groq_api_key?.trim() || "";
      }
    }

    if (!apiKey) {
      return jsonResponse({ error: "Groq API key is missing. Please enter your Groq API key." }, 400);
    }

    if (user_api_key && supabase) {
      const { error: updateError } = await supabase
        .from("organizations")
        .update({ groq_api_key: apiKey })
        .eq("id", organization_id);
      if (updateError) console.warn("Groq settings could not be saved", updateError.code);
    }

    let groqResponseJson: Record<string, any> | null = null;
    let usedModel = "";
    let lastError = "";
    let failureStatus = 502;
    const modelsToTry = [selectedModel];

    for (const model of modelsToTry) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort("Groq extraction timed out after 300s"), 300_000);
      try {
        const groqUrl = `https://api.groq.com/openai/v1/chat/completions`;
        const payload = {
          model: model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: GROQ_SYSTEM_INSTRUCTION },
                { type: "image_url", image_url: { url: `data:${invoiceMime};base64,${file_base64}` } }
              ]
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.1
        };

        const groqRes = await fetch(groqUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        const resText = await groqRes.text();
        if (!groqRes.ok) {
          const failure = groqFailure(groqRes.status, resText, model);
          lastError = failure.message;
          failureStatus = failure.status;
          clearTimeout(timeout);
          break;
        }

        const data = JSON.parse(resText);
        const contentStr = data.choices?.[0]?.message?.content || "";
        
        try {
          const cleaned = contentStr.replace(/^```json/i, "").replace(/```$/i, "").trim();
          groqResponseJson = JSON.parse(cleaned);
          usedModel = model;
          clearTimeout(timeout);
          break;
        } catch (_e) {
          lastError = "Failed to parse Groq response as JSON. Content was: " + contentStr.slice(0, 100);
          clearTimeout(timeout);
          break;
        }
      } catch (err: any) {
        clearTimeout(timeout);
      }
    }

    if (!groqResponseJson) {
      return jsonResponse({ error: lastError || "Failed to extract invoice data using Groq API" }, failureStatus);
    }

    const warnings: string[] = Array.isArray(groqResponseJson.validation?.warnings)
      ? [...groqResponseJson.validation.warnings]
      : [];
    const items = Array.isArray(groqResponseJson.items) ? groqResponseJson.items : [];
    if (items.some((item: Record<string, unknown>) => !item.batch_no || !item.expiry_year)) {
      warnings.push("Missing required fields (batch/expiry) in some items. Please review carefully.");
    }
    
    groqResponseJson.validation = {
      ...(groqResponseJson.validation || {}),
      warnings,
      requires_review: groqResponseJson.validation?.requires_review === true || groqResponseJson.validation?.all_pages_processed === false || warnings.length > 0 || items.some((item: Record<string, unknown>) => !item.batch_no || !item.expiry_year),
    };

    if (supabase && import_id) {
      const { error: insertError } = await supabase.from("purchase_imports").update({ raw_extracted_json: groqResponseJson }).eq("id", import_id);
      if (insertError) console.warn("Could not save to purchase_imports:", insertError.message);
    }

    return jsonResponse({
      success: true,
      extraction: groqResponseJson,
      model: usedModel
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: errorMsg }, 500);
  }
});
