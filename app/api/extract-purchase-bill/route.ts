import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import https from "https";
import { validateInvoiceFile, parseInvoiceResponse, geminiFailure } from "@/supabase/functions/_shared/purchase-extraction.mjs";

// Use the system trust chain when sending API credentials and invoice data.
const httpsAgent = new https.Agent();

/**
 * Makes a POST request to the Gemini API using Node.js https module directly.
 * Bounds request time while preserving TLS certificate verification.
 */
function geminiRequest(url: string, headers: Record<string, string>, body: string): Promise<{ status: number; text: () => string }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "POST",
      headers: {
        ...headers,
        "Content-Length": Buffer.byteLength(body)
      },
      agent: httpsAgent
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const responseText = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: res.statusCode ?? 0,
          text: () => responseText
        });
      });
    });

    req.on("error", reject);
    req.setTimeout(24000, () => { req.destroy(new Error("Gemini API request timed out after 24s. Try a smaller image/PDF or a clearer single-page bill.")); });
    req.write(body);
    req.end();
  });
}


const GEMINI_SYSTEM_INSTRUCTION = `You are an invoice data extraction engine for an Indian purchase and inventory application.

You will receive a purchase invoice as one or more images or a PDF.

Invoices can come from many different suppliers. Layout, terminology, columns, number of pages and ordering can be completely different.

Extract the invoice into valid JSON matching the requested JSON structure.

RULES:
1. Extract only values actually visible in the invoice.
2. Never invent or guess missing values.
3. If a value is absent or unreadable, return null.
4. Process ALL pages.
5. Do not duplicate headers repeated on multiple pages.
6. Extract EVERY product row.
7. Never summarize or truncate product rows.
8. Preserve supplier product descriptions as closely as possible to the printed invoice text.
9. Preserve product codes, HSN, batch numbers and barcodes as strings.
10. Numbers must be returned as JSON numbers without currency symbols or comma formatting.
11. Do not confuse MRP with purchase rate.
12. Do not confuse billed quantity with free quantity.
13. Do not combine quantity and free quantity.
14. Do not invent item-level taxes when only invoice-level taxes are shown.
15. Preserve GST slab for each item when available.
16. Extract discounts exactly according to the invoice.
17. Different discount types must remain separate when identifiable.
18. If a supplier uses unfamiliar columns, preserve them in extra_fields.
19. Dates should preferably be normalized to YYYY-MM-DD.
20. Expiry printed as MM/YY must be represented using expiry_month and expiry_year.
21. Never silently correct an apparent invoice error.
22. If uncertain, return null and add a warning.
23. Return JSON only.`;

const JSON_SCHEMA = {
  type: "OBJECT",
  properties: {
    document_type: { type: "STRING" },
    supplier: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING" },
        gstin: { type: "STRING" },
        drug_license_no: { type: "STRING" },
        address: { type: "STRING" },
        phone: { type: "STRING" },
        email: { type: "STRING" },
        state: { type: "STRING" },
        state_code: { type: "STRING" }
      }
    },
    buyer: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING" },
        gstin: { type: "STRING" },
        drug_license_no: { type: "STRING" },
        address: { type: "STRING" },
        phone: { type: "STRING" },
        state: { type: "STRING" },
        state_code: { type: "STRING" }
      }
    },
    invoice: {
      type: "OBJECT",
      properties: {
        invoice_number: { type: "STRING" },
        invoice_date: { type: "STRING" },
        invoice_type: { type: "STRING" },
        payment_terms: { type: "STRING" },
        due_date: { type: "STRING" },
        salesman: { type: "STRING" },
        purchase_order_number: { type: "STRING" },
        purchase_order_date: { type: "STRING" },
        delivery_challan_number: { type: "STRING" },
        delivery_date: { type: "STRING" },
        delivery_type: { type: "STRING" },
        e_invoice_irn: { type: "STRING" },
        eway_bill_number: { type: "STRING" },
        currency: { type: "STRING" }
      }
    },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          line_no: { type: "INTEGER" },
          manufacturer: { type: "STRING" },
          manufacturer_code: { type: "STRING" },
          product_name: { type: "STRING" },
          product_code: { type: "STRING" },
          barcode: { type: "STRING" },
          description: { type: "STRING" },
          category: { type: "STRING" },
          pack: { type: "STRING" },
          unit: { type: "STRING" },
          hsn: { type: "STRING" },
          sac: { type: "STRING" },
          batch_no: { type: "STRING" },
          expiry_month: { type: "INTEGER" },
          expiry_year: { type: "INTEGER" },
          manufacturing_date: { type: "STRING" },
          quantity: { type: "NUMBER" },
          free_quantity: { type: "NUMBER" },
          scheme_quantity: { type: "NUMBER" },
          total_received_quantity: { type: "NUMBER" },
          rate: { type: "NUMBER" },
          purchase_rate: { type: "NUMBER" },
          mrp: { type: "NUMBER" },
          gross_amount: { type: "NUMBER" },
          discount_percent: { type: "NUMBER" },
          discount_amount: { type: "NUMBER" },
          scheme_discount_percent: { type: "NUMBER" },
          scheme_discount_amount: { type: "NUMBER" },
          cash_discount_percent: { type: "NUMBER" },
          cash_discount_amount: { type: "NUMBER" },
          taxable_amount: { type: "NUMBER" },
          gst_percent: { type: "NUMBER" },
          cgst_percent: { type: "NUMBER" },
          cgst_amount: { type: "NUMBER" },
          sgst_percent: { type: "NUMBER" },
          sgst_amount: { type: "NUMBER" },
          igst_percent: { type: "NUMBER" },
          igst_amount: { type: "NUMBER" },
          cess_percent: { type: "NUMBER" },
          cess_amount: { type: "NUMBER" },
          other_tax_amount: { type: "NUMBER" },
          line_total: { type: "NUMBER" }
        }
      }
    },
    tax_summary: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          gst_percent: { type: "NUMBER" },
          taxable_amount: { type: "NUMBER" },
          cgst_percent: { type: "NUMBER" },
          cgst_amount: { type: "NUMBER" },
          sgst_percent: { type: "NUMBER" },
          sgst_amount: { type: "NUMBER" },
          igst_percent: { type: "NUMBER" },
          igst_amount: { type: "NUMBER" },
          cess_amount: { type: "NUMBER" },
          total_tax: { type: "NUMBER" }
        }
      }
    },
    totals: {
      type: "OBJECT",
      properties: {
        total_line_items: { type: "INTEGER" },
        total_quantity: { type: "NUMBER" },
        total_free_quantity: { type: "NUMBER" },
        gross_amount: { type: "NUMBER" },
        item_discount_total: { type: "NUMBER" },
        scheme_discount_total: { type: "NUMBER" },
        cash_discount_total: { type: "NUMBER" },
        other_discount_total: { type: "NUMBER" },
        total_discount: { type: "NUMBER" },
        taxable_amount: { type: "NUMBER" },
        cgst_total: { type: "NUMBER" },
        sgst_total: { type: "NUMBER" },
        igst_total: { type: "NUMBER" },
        cess_total: { type: "NUMBER" },
        other_tax_total: { type: "NUMBER" },
        total_tax: { type: "NUMBER" },
        freight: { type: "NUMBER" },
        packing_charges: { type: "NUMBER" },
        handling_charges: { type: "NUMBER" },
        delivery_charges: { type: "NUMBER" },
        insurance_charges: { type: "NUMBER" },
        other_charges: { type: "NUMBER" },
        tcs: { type: "NUMBER" },
        tds: { type: "NUMBER" },
        round_off: { type: "NUMBER" },
        grand_total: { type: "NUMBER" },
        paid_amount: { type: "NUMBER" },
        balance_amount: { type: "NUMBER" }
      }
    },
    validation: {
      type: "OBJECT",
      properties: {
        pages_detected: { type: "INTEGER" },
        expected_pages: { type: "INTEGER" },
        all_pages_processed: { type: "BOOLEAN" },
        printed_grand_total: { type: "NUMBER" },
        requires_review: { type: "BOOLEAN" },
        warnings: {
          type: "ARRAY",
          items: { type: "STRING" }
        }
      }
    }
  }
};

function allowMissingValues(schema: any): any {
  return {
    ...schema,
    nullable: true,
    ...(schema.properties ? { properties: Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, allowMissingValues(value)])) } : {}),
    ...(schema.items ? { items: allowMissingValues(schema.items) } : {}),
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { file_base64, mime_type, organization_id, import_id, user_api_key, gemini_model } = body;

    if (!file_base64 || !organization_id) {
      return NextResponse.json({ error: "Missing file_base64 or organization_id" }, { status: 400 });
    }
    let invoiceMime: string;
    try { invoiceMime = validateInvoiceFile(file_base64, mime_type); }
    catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const authHeader = request.headers.get("authorization") || undefined;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, authHeader ? { global: { headers: { Authorization: authHeader } } } : undefined);

    // Fetch Gemini API Key from payload, organization, or environment
    let apiKey = user_api_key?.trim() || process.env.GEMINI_API_KEY?.trim();
    let selectedModel = String(gemini_model || "").trim() || process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";

    if (!apiKey || !gemini_model) {
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select("gemini_api_key")
        .eq("id", organization_id)
        .single();

      if (orgError && !apiKey) {
        return NextResponse.json({
          error: "Could not read the saved Gemini API key. Check clinic access and the Gemini settings migration, or enter your Google Gemini API key to continue."
        }, { status: 400 });
      }

      if (!orgError) {
        if (!apiKey && orgData?.gemini_api_key) {
          apiKey = orgData.gemini_api_key.trim();
        }
      }
    }
    if (!gemini_model) {
      const { data } = await supabase.from("organizations").select("gemini_model").eq("id", organization_id).maybeSingle();
      if (data?.gemini_model) selectedModel = data.gemini_model.trim();
    }

    if (!apiKey) {
      return NextResponse.json({
        error: "Gemini API key is missing. Please enter your Google Gemini API Key."
      }, { status: 400 });
    }

    // Save key to organization table for future use
    if (user_api_key || gemini_model) {
      try {
        await supabase
          .from("organizations")
          .update({ gemini_api_key: apiKey, gemini_model: selectedModel })
          .eq("id", organization_id);
      } catch {}
    }

    const modelsToTry = Array.from(new Set([selectedModel, "gemini-3.6-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"].filter(Boolean)));
    let geminiResponseJson: any = null;
    let usedModel = "";
    let lastErrorMsg = "";
    let failureStatus = 502;

    for (const model of modelsToTry) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        };

        const payload = {
          systemInstruction: {
            parts: [{ text: GEMINI_SYSTEM_INSTRUCTION }]
          },
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: invoiceMime,
                    data: file_base64
                  }
                },
                {
                  text: "Extract all purchase invoice data strictly into JSON according to the schema."
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: allowMissingValues(JSON_SCHEMA),
            temperature: 0.1
          }
        };

        const res = await geminiRequest(geminiUrl, headers, JSON.stringify(payload));
        const resText = res.text();

        if (res.status >= 200 && res.status < 300) {
          let jsonRes: any;
          try { jsonRes = JSON.parse(resText); } catch { lastErrorMsg = "Failed to parse Gemini response JSON"; continue; }
          try {
            geminiResponseJson = parseInvoiceResponse(jsonRes);
            usedModel = model;
          } catch (error) { lastErrorMsg = (error as Error).message; }
          break;
        } else {
          const failure = geminiFailure(res.status, resText, model);
          lastErrorMsg = failure.message;
          failureStatus = failure.status;
          if (!failure.retryModel) break;
        }
      } catch (fetchErr: any) {
        console.error(`HTTPS request exception for ${model}:`, fetchErr);
        lastErrorMsg = `Connection to Gemini API failed (${model}): ${fetchErr.message || fetchErr}`;
        break;
      }
    }

    if (!geminiResponseJson) {
      // Record failed extraction log
      try {
        await supabase.from("purchase_invoice_extractions").insert({
          organization_id,
          purchase_import_id: import_id || null,
          raw_json: { error: lastErrorMsg },
          model_name: "failed",
          extraction_success: false,
          error_message: lastErrorMsg
        });
      } catch {}

      return NextResponse.json({ error: lastErrorMsg || "Failed to extract invoice data using Gemini API" }, { status: failureStatus });
    }

    // Server-side calculation & sanity validation checks
    const warnings: string[] = Array.isArray(geminiResponseJson.validation?.warnings) ? geminiResponseJson.validation.warnings : [];
    const items = geminiResponseJson.items || [];
    const totals = geminiResponseJson.totals || {};

    let calculatedLineTotalSum = 0;
    items.forEach((item: any, idx: number) => {
      const lineTotal = Number(item.line_total || 0);
      const qty = Number(item.quantity || 0);
      const rate = Number(item.purchase_rate || item.rate || 0);
      calculatedLineTotalSum += lineTotal;

      if (!item.product_name && !item.description) {
        warnings.push(`Row #${idx + 1}: Missing product description`);
      }
      if (qty <= 0) {
        warnings.push(`Row #${idx + 1} (${item.product_name || "Item"}): Billed quantity is missing or 0`);
      }
      if (rate <= 0) {
        warnings.push(`Row #${idx + 1} (${item.product_name || "Item"}): Purchase rate is missing or 0`);
      }
    });

    const printedGrandTotal = Number(totals.grand_total || geminiResponseJson.validation?.printed_grand_total || 0);
    if (printedGrandTotal > 0 && Math.abs(calculatedLineTotalSum - printedGrandTotal) > 5) {
      warnings.push(`Printed grand total (₹${printedGrandTotal}) differs from sum of line items (₹${calculatedLineTotalSum.toFixed(2)})`);
    }

    geminiResponseJson.validation = {
      ...geminiResponseJson.validation,
      warnings,
      requires_review: warnings.length > 0 || items.some((i: any) => !i.batch_no || !i.expiry_year)
    };

    // Save raw response audit log
    try {
      await supabase.from("purchase_invoice_extractions").insert({
        organization_id,
        purchase_import_id: import_id || null,
        raw_json: geminiResponseJson,
        model_name: usedModel,
        extraction_success: true
      });
    } catch {}

    return NextResponse.json({ success: true, extraction: geminiResponseJson, model: usedModel });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
