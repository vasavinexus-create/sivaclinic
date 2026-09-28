import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

// Validation schema for sales
const SaleItemSchema = z.object({
  product_id: z.string().uuid(),
  batch_id: z.string().uuid(),
  qty: z.number().min(1),
  selling_rate: z.number().min(0),
  mrp_unit_rate: z.number().min(0),
  sales_discount_percent: z.number().min(0).max(100).nullable().optional(),
  gst_percent: z.number().min(0).nullable().optional(),
  current_stock: z.number().min(0),
  original_selling_rate: z.number().nullable().optional(),
  rate_edited: z.boolean().nullable().optional(),
  mrp: z.number().min(0),
  original_sales_discount_percent: z.number().nullable().optional(),
});

const SaleSchema = z.object({
  patient_id: z.string().uuid().nullable().optional(),
  cart: z.array(SaleItemSchema).min(1),
  special_discount_percent: z.number().min(0).max(100).optional(),
  sale_type: z.enum(["outpatient", "inpatient"]).default("outpatient"),
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
    const parsed = SaleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 422 });
    }

    const { patient_id, cart, special_discount_percent, sale_type } = parsed.data;

    // Calculate totals
    const medicine = cart.reduce((sum, item) => sum + (item.selling_rate * item.qty) / (1 + (item.gst_percent || 0) / 100), 0);
    const tax = cart.reduce((sum, item) => sum + (item.selling_rate * item.qty) - ((item.selling_rate * item.qty) / (1 + (item.gst_percent || 0) / 100)), 0);
    const grossTotal = medicine + tax;
    const specialDiscountAmount = (grossTotal * (special_discount_percent || 0)) / 100;
    const total = Math.round(grossTotal - specialDiscountAmount);
    
    const invoicePrefix = sale_type === "inpatient" ? "IP" : "V2";
    const invoice = `${invoicePrefix}-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const hasRateEdit = cart.some(item => item.rate_edited) || (special_discount_percent || 0) > 0;
    const pharmacyRevenue = Math.max(0, medicine + tax - specialDiscountAmount);

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Insert Sale
    const { data: sale, error: saleError } = await adminClient.from("sales").insert({
      organization_id: profile.organization_id,
      invoice_no: invoice,
      patient_id: patient_id || null,
      medicine_subtotal: medicine,
      medicine_tax: tax,
      pharmacy_revenue: pharmacyRevenue,
      doctor_fee: 0,
      gross_total: grossTotal,
      special_discount_percent: special_discount_percent || 0,
      special_discount_amount: specialDiscountAmount,
      grand_total: total,
      payment_mode: sale_type === "inpatient" ? "credit" : "cash",
      sale_type: sale_type,
      has_rate_edit: hasRateEdit,
      rate_edit_verified: !hasRateEdit,
      status: "completed",
      created_by: profile.id,
    }).select("id").single();

    if (saleError || !sale) throw saleError;

    // 2. Insert items and update stock (Sequentially or in parallel, Supabase JS uses multiple queries)
    for (const item of cart) {
      const balance = item.current_stock - item.qty;
      
      await adminClient.from("sale_items").insert({
        organization_id: profile.organization_id,
        sale_id: sale.id,
        product_id: item.product_id,
        batch_id: item.batch_id,
        quantity: item.qty,
        unit_rate: item.selling_rate,
        original_unit_rate: item.original_selling_rate || item.selling_rate,
        rate_edited: !!item.rate_edited,
        mrp: item.mrp,
        mrp_unit_rate: item.mrp_unit_rate,
        original_sales_discount_percent: item.original_sales_discount_percent,
        sales_discount_percent: item.sales_discount_percent,
        gst_percent: item.gst_percent || 0,
        line_total: item.selling_rate * item.qty
      });

      await adminClient.from("medicine_batches").update({ current_stock: balance }).eq("id", item.batch_id);

      await adminClient.from("stock_movements").insert({
        organization_id: profile.organization_id,
        product_id: item.product_id,
        batch_id: item.batch_id,
        movement_type: "sale",
        reference_type: "sale",
        reference_id: sale.id,
        reference_number: invoice,
        out_quantity: item.qty,
        balance_quantity: balance,
        created_by: profile.id
      });
    }

    // 2.5 Inpatient Specific Ledger
    if (sale_type === "inpatient" && patient_id) {
      await adminClient.from("patient_ledger").insert({
        organization_id: profile.organization_id,
        patient_id: patient_id,
        occurred_on: new Date().toISOString().slice(0, 10),
        particulars: `Inpatient medicine bill ${invoice}`,
        reference_type: "inpatient_bill",
        reference_id: sale.id,
        reference_number: invoice,
        debit: total,
        credit: 0,
        created_by: profile.id
      });
    }

    // 3. Post Journal (Optional / Best Effort)
    try {
      const { data: journalData } = await adminClient.from("journal_entries").insert({
        organization_id: profile.organization_id,
        voucher_no: `JV-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}`,
        voucher_type: "sale",
        entry_date: new Date().toISOString(),
        narration: `Sale bill ${invoice}`,
        reference_type: "sale",
        reference_id: sale.id,
        reference_number: invoice,
        created_by: profile.id,
      }).select("id").single();

      if (journalData) {
        await adminClient.from("journal_lines").insert([
          { organization_id: profile.organization_id, journal_entry_id: journalData.id, ledger_name: sale_type === "inpatient" ? "Accounts Receivable" : "Cash", debit: total, credit: 0, line_order: 1 },
          { organization_id: profile.organization_id, journal_entry_id: journalData.id, ledger_name: "Pharmacy Sales", debit: 0, credit: pharmacyRevenue, line_order: 2 }
        ]);
      }
    } catch (journalErr) {
      console.error("Journal entry failed:", journalErr);
      // We do not fail the sale if journal posting fails
    }

    return NextResponse.json({ data: sale, invoice }, { status: 201 });
  } catch (error: any) {
    console.error("Sales API Error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
