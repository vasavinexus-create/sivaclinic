import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { receivePurchaseStockWithNegativeOffset } from "../../../../lib/inventory-stock";

const PurchaseItemSchema = z.object({
  product_id: z.string().uuid(),
  batch_number: z.string().min(1),
  expiry_date: z.string().nullable().optional(),
  qty: z.number().min(1),
  free_qty: z.number().min(0).optional(),
  mrp: z.number().min(0),
  purchase_rate: z.number().min(0),
  selling_rate: z.number().min(0),
  sales_discount_percent: z.number().nullable().optional(),
  gst_percent: z.number().min(0).optional(),
  purchase_unit: z.string().optional(),
  sale_unit: z.string().optional(),
  units_per_purchase_unit: z.number().min(1).optional(),
});

const PurchaseSchema = z.object({
  supplier_id: z.string().uuid(),
  invoice_date: z.string(),
  invoice_number: z.string().nullable().optional(),
  amount_paid: z.number().min(0),
  items: z.array(PurchaseItemSchema).min(1),
});

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseServiceKey) {
      return NextResponse.json({ error: "Server missing SUPABASE_SERVICE_ROLE_KEY configuration." }, { status: 500 });
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, organization_id, role, active")
      .eq("id", session.user.id)
      .single();

    if (!profile?.active) return NextResponse.json({ error: "Account is inactive" }, { status: 403 });

    const body = await request.json();
    const parsed = PurchaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 422 });
    }

    const { supplier_id, invoice_date, invoice_number, amount_paid, items } = parsed.data;

    let subtotal = 0;
    let taxAmount = 0;
    items.forEach(item => {
      const lineTotal = item.qty * item.purchase_rate;
      const gst = item.gst_percent || 0;
      // Reverse calculate tax if purchase rate is inclusive of tax
      const lineSubtotal = lineTotal / (1 + gst / 100);
      subtotal += lineSubtotal;
      taxAmount += (lineTotal - lineSubtotal);
    });

    const grandTotal = Math.round(subtotal + taxAmount);

    const purchaseNo = `VP-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Insert Purchase
    const { data: purchase, error: purchaseError } = await adminClient.from("purchases").insert({
      organization_id: profile.organization_id,
      purchase_no: purchaseNo,
      supplier_id,
      invoice_date,
      supplier_invoice_no: invoice_number || purchaseNo,
      subtotal,
      tax_total: taxAmount,
      invoice_total: grandTotal,
      paid_amount: amount_paid,
      status: "approved",
      created_by: profile.id,
    }).select("id").single();

    if (purchaseError || !purchase) throw purchaseError;

    // 2. Insert items and reconcile negative stock batches first
    let totalNegativeOffset = 0;
    for (const item of items) {
      const unitsPerPurchaseUnit = Number(item.units_per_purchase_unit || 1) || 1;
      const purchasePackQty = Number(item.qty || 0);
      const freePackQty = Number(item.free_qty || 0);
      const totalStockQty = (purchasePackQty + freePackQty) * unitsPerPurchaseUnit;
      const freeStockQty = freePackQty * unitsPerPurchaseUnit;
      const purchaseRatePerUnit = Number(item.purchase_rate || 0) / unitsPerPurchaseUnit;
      const sellingRatePerUnit =
        (Number(item.selling_rate) > 0 ? Number(item.selling_rate) : Number(item.mrp || 0)) / unitsPerPurchaseUnit;
      const expiryDate = item.expiry_date || `${new Date().getFullYear() + 2}-12-31`;

      const { offsetTotal } = await receivePurchaseStockWithNegativeOffset(adminClient, {
        organizationId: profile.organization_id,
        purchaseId: purchase.id,
        purchaseNo,
        supplierId: supplier_id,
        createdBy: profile.id,
        item: {
          product_id: item.product_id,
          batch_number: item.batch_number,
          expiry_date: expiryDate,
          purchase_pack_qty: purchasePackQty,
          free_pack_qty: freePackQty,
          units_per_purchase_unit: unitsPerPurchaseUnit,
          total_stock_qty: totalStockQty,
          free_stock_qty: freeStockQty,
          purchase_rate_per_unit: purchaseRatePerUnit,
          mrp: item.mrp,
          selling_rate_per_unit: sellingRatePerUnit,
          sales_discount_percent: item.sales_discount_percent ?? null,
          gst_percent: item.gst_percent || 0,
          discount_amount: 0,
          line_total: item.qty * item.purchase_rate,
          purchase_unit: item.purchase_unit || "unit",
          sale_unit: item.sale_unit || "unit",
        },
      });
      totalNegativeOffset += offsetTotal;
    }

    // 3. Post Journal (Optional / Best Effort)
    try {
      const { data: journalData } = await adminClient.from("journal_entries").insert({
        organization_id: profile.organization_id,
        voucher_no: `JV-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}`,
        voucher_type: "purchase",
        entry_date: new Date().toISOString(),
        narration: `Purchase bill ${purchaseNo}`,
        reference_type: "purchase",
        reference_id: purchase.id,
        reference_number: purchaseNo,
        created_by: profile.id,
      }).select("id").single();

      if (journalData) {
        await adminClient.from("journal_lines").insert([
          { organization_id: profile.organization_id, journal_entry_id: journalData.id, ledger_name: "Purchase", debit: grandTotal, credit: 0, line_order: 1 },
          { organization_id: profile.organization_id, journal_entry_id: journalData.id, ledger_name: "Supplier Payable", debit: 0, credit: grandTotal, line_order: 2 }
        ]);
        
        if (amount_paid > 0) {
          const { data: paymentJournal } = await adminClient.from("journal_entries").insert({
            organization_id: profile.organization_id,
            voucher_no: `JV-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}`,
            voucher_type: "payment",
            entry_date: new Date().toISOString(),
            narration: `Payment for Purchase ${purchaseNo}`,
            reference_type: "purchase",
            reference_id: purchase.id,
            reference_number: purchaseNo,
            created_by: profile.id,
          }).select("id").single();

          if (paymentJournal) {
            await adminClient.from("journal_lines").insert([
              { organization_id: profile.organization_id, journal_entry_id: paymentJournal.id, ledger_name: "Supplier Payable", debit: amount_paid, credit: 0, line_order: 1 },
              { organization_id: profile.organization_id, journal_entry_id: paymentJournal.id, ledger_name: "Cash", debit: 0, credit: amount_paid, line_order: 2 }
            ]);
          }
        }
      }
    } catch (journalErr) {
      console.error("Journal entry failed:", journalErr);
    }

    return NextResponse.json({ data: purchase, purchase_no: purchaseNo }, { status: 201 });
  } catch (error: any) {
    console.error("Purchases API Error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
