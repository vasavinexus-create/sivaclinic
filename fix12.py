import codecs
import re

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

# Replace the save function block up to the catch block
old_save_regex = r'''const save = async \(\) => \{\s*if \(!supabase \|\| !cart\.length\) \{\s*notify\("Add at least one medicine"\);\s*return;\s*\}\s*if \(Number\(specialDiscountPercent \|\| 0\) < 0 \|\| Number\(specialDiscountPercent \|\| 0\) > 100\) \{\s*notify\("Special discount must be between 0 and 100"\);\s*return;\s*\}\s*setSaving\(true\);\s*const invoice = V2-\$\{new Date\(\)\.getFullYear\(\)\}-\$\{Date\.now\(\)\.toString\(\)\.slice\(-6\)\};\s*const hasRateEdit = cart\.some\(\(item\) => item\.rate_edited\) \|\| Number\(specialDiscountPercent \|\| 0\) > 0;\s*const pharmacyRevenue = Math\.max\(0, medicine \+ tax - specialDiscountAmount\);\s*const \{ data: sale, error \} = await supabase\.from\("sales"\)\.insert\(\{\s*organization_id: profile\.organization_id,\s*invoice_no: invoice,\s*patient_id: patientId \|\| null,\s*medicine_subtotal: medicine,\s*medicine_tax: tax,\s*pharmacy_revenue: pharmacyRevenue,\s*doctor_fee: 0,\s*gross_total: grossTotal,\s*special_discount_percent: Number\(specialDiscountPercent \|\| 0\),\s*special_discount_amount: specialDiscountAmount,\s*grand_total: total,\s*payment_mode: "cash",\s*has_rate_edit: hasRateEdit,\s*rate_edit_verified: !hasRateEdit,\s*status: "completed",\s*created_by: profile\.id,\s*\}\)\.select\("id"\)\.single\(\);\s*if \(error \|\| !sale\) \{\s*setSaving\(false\);\s*notify\(error\?\.message \|\| "Sale save failed"\);\s*return;\s*\}\s*for \(const item of cart\) \{\s*const balance = Number\(item\.current_stock\) - Number\(item\.qty\);\s*await supabase\.from\("sale_items"\)\.insert\(\{\s*organization_id: profile\.organization_id,\s*sale_id: sale\.id,\s*product_id: item\.product_id,\s*batch_id: item\.batch_id,\s*quantity: item\.qty,\s*unit_rate: item\.selling_rate,\s*mrp: item\.mrp,\s*gst_percent: item\.gst_percent \|\| 0,\s*line_total: Number\(item\.selling_rate\) \* Number\(item\.qty\),\s*\}\);\s*await supabase\.from\("medicine_batches"\)\.update\(\{\s*current_stock: balance\s*\}\)\.eq\("id", item\.batch_id\);\s*await supabase\.from\("stock_movements"\)\.insert\(\{\s*organization_id: profile\.organization_id,\s*product_id: item\.product_id,\s*batch_id: item\.batch_id,\s*movement_type: "sale",\s*reference_type: "sale",\s*reference_id: sale\.id,\s*reference_number: invoice,\s*out_quantity: item\.qty,\s*balance_quantity: balance,\s*created_by: profile\.id,\s*\}\);\s*\}\s*const cashAmount = total;\s*await supabase\.from\("cash_ledger"\)\.insert\(\{\s*organization_id: profile\.organization_id,\s*occurred_at: new Date\(\)\.toISOString\(\),\s*entry_type: "receipt",\s*category: "Pharmacy sale",\s*reference_type: "sale",\s*reference_id: sale\.id,\s*amount: cashAmount,\s*payment_mode: "cash",\s*created_by: profile\.id,\s*\}\);\s*try \{\s*await postJournal\(profile, \{\s*voucherType: "sale",\s*entryDate: new Date\(\)\.toISOString\(\),\s*referenceType: "sale",\s*referenceId: sale\.id,\s*referenceNumber: invoice,\s*narration: Pharmacy bill \$\{invoice\},\s*lines: \[\s*\{\s*ledger: "Cash",\s*debit: total\s*\},\s*\{\s*ledger: "Pharmacy Sales",\s*credit: pharmacyRevenue\s*\},\s*\]\s*\}\);\s*\} catch \{\}'''

new_save = '''const save = async () => {
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
      await supabase.from("sale_items").insert({
        organization_id: profile.organization_id,
        sale_id: sale.id,
        product_id: item.product_id,
        batch_id: item.batch_id,
        quantity: item.qty,
        unit_rate: item.selling_rate,
        mrp: item.mrp,
        gst_percent: item.gst_percent || 0,
        line_total: Number(item.selling_rate) * Number(item.qty),
      });
      await supabase.from("medicine_batches").update({ current_stock: balance }).eq("id", item.batch_id);
      await supabase.from("stock_movements").insert({
        organization_id: profile.organization_id,
        product_id: item.product_id,
        batch_id: item.batch_id,
        movement_type: "sale",
        reference_type: "sale",
        reference_id: sale.id,
        reference_number: invoice,
        out_quantity: item.qty,
        balance_quantity: balance,
        created_by: profile.id,
      });
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
      const lines: any[] = [];
      lines.push({ ledger: "Cash", debit: total + fee });
      if (pharmacyRevenue > 0) lines.push({ ledger: "Pharmacy Sales", credit: pharmacyRevenue });
      if (fee > 0) lines.push({ ledger: "Consultation Revenue", credit: fee });
      await postJournal(profile, {
        voucherType: "sale",
        entryDate: new Date().toISOString(),
        referenceType: "sale",
        referenceId: sale.id,
        referenceNumber: invoice,
        narration: Pharmacy bill ,
        lines
      });
    } catch {}'''

if not re.search(old_save_regex, code):
    print("Failed to find regex match!")
else:
    code = re.sub(old_save_regex, new_save, code, count=1)
    with codecs.open(path, 'w', 'utf-8') as f:
        f.write(code)
    print("Done")
