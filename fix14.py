import codecs
import re

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    lines = f.readlines()

start = -1
end = -1
for i, line in enumerate(lines):
    if 'const save = async () => {' in line and start == -1:
        start = i
    if start != -1 and 'try {' in line and 'await postJournal' in lines[i+1]:
        end = i + 4
        break

if start != -1 and end != -1:
    new_code = '''  const save = async () => {
    if (!supabase || !cart.length) {
      notify("Add at least one medicine");
      return;
    }
    if (Number(specialDiscountPercent || 0) < 0 || Number(specialDiscountPercent || 0) > 100) {
      notify("Special discount must be between 0 and 100");
      return;
    }
    setSaving(true);
    const fee = Number(pending?.doctor_fee || 0);
    const invoice = V2--;
    const hasRateEdit = cart.some((item) => item.rate_edited) || Number(specialDiscountPercent || 0) > 0;
    const pharmacyRevenue = Math.max(0, medicine + tax - specialDiscountAmount);
    const { data: sale, error } = await supabase.from("sales").insert({
      organization_id: profile.organization_id,
      invoice_no: invoice,
      patient_id: patientId || null,
      medicine_subtotal: medicine,
      medicine_tax: tax,
      pharmacy_revenue: pharmacyRevenue,
      doctor_fee: fee,
      gross_total: grossTotal,
      special_discount_percent: Number(specialDiscountPercent || 0),
      special_discount_amount: specialDiscountAmount,
      grand_total: total + fee,
      payment_mode: "cash",
      has_rate_edit: hasRateEdit,
      rate_edit_verified: !hasRateEdit,
      status: "completed",
      created_by: profile.id,
    }).select("id").single();
    if (error || !sale) {
      setSaving(false);
      notify(error?.message || "Sale save failed");
      return;
    }
    if (pending) {
      await supabase.from("consultations").update({
        doctor_fee_collected: true,
        fee_receipt_id: sale.id
      }).eq("id", pending.id);
    }
    for (const item of cart) {
      const balance = Number(item.current_stock) - Number(item.qty);
      await supabase.from("sale_items").insert({ organization_id: profile.organization_id, sale_id: sale.id, product_id: item.product_id, batch_id: item.batch_id, quantity: item.qty, unit_rate: item.selling_rate, original_unit_rate: item.original_selling_rate || item.selling_rate, rate_edited: !!item.rate_edited, mrp: item.mrp, mrp_unit_rate: item.mrp_unit_rate, original_sales_discount_percent: item.original_sales_discount_percent, sales_discount_percent: item.sales_discount_percent, gst_percent: item.gst_percent || 0, line_total: Number(item.selling_rate) * Number(item.qty) });
      await supabase.from("medicine_batches").update({ current_stock: balance }).eq("id", item.batch_id);
      await supabase.from("stock_movements").insert({ organization_id: profile.organization_id, product_id: item.product_id, batch_id: item.batch_id, movement_type: "sale", reference_type: "sale", reference_id: sale.id, reference_number: invoice, out_quantity: item.qty, balance_quantity: balance, created_by: profile.id });
    }
    const cashAmount = total + fee;
    await supabase.from("cash_ledger").insert({
      organization_id: profile.organization_id,
      occurred_at: new Date().toISOString(),
      entry_type: "receipt",
      category: "Pharmacy sale",
      reference_type: "sale",
      reference_id: sale.id,
      amount: cashAmount,
      payment_mode: "cash",
      created_by: profile.id,
    });
    try {
      const lines = [];
      lines.push({ ledger: "Cash", debit: total + fee });
      if (pharmacyRevenue > 0) lines.push({ ledger: "Pharmacy Sales", credit: pharmacyRevenue });
      if (fee > 0) lines.push({ ledger: "Consultation Revenue", credit: fee });
      await postJournal(profile, { voucherType: "sale", entryDate: new Date().toISOString(), referenceType: "sale", referenceId: sale.id, referenceNumber: invoice, narration: Sale bill , lines });
    } catch {}
'''
    
    with codecs.open(path, 'w', 'utf-8') as f:
        f.writelines(lines[:start])
        f.write(new_code)
        f.writelines(lines[end+1:])
    print(f"Replaced {end - start + 1} lines")
else:
    print(f"Failed to find block! Start: {start}, End: {end}")

