import codecs
import re

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

# 1. Add pending state and useEffect to BillingWorkflow
state_block = '''  const [patientId, setPatientId] = useState("");
  const [productId, setProductId] = useState("");
  const [product, setProduct] = useState<Row | null>(null);
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Row | null>(null);

  useEffect(() => {
    if (!patientId || !supabase) { setPending(null); return; }
    supabase.from("consultations")
      .select("id,doctor_fee,visited_at")
      .eq("patient_id", patientId)
      .eq("doctor_fee_collected", false)
      .gt("doctor_fee", 0)
      .order("visited_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setPending(data));
  }, [patientId]);
'''
code = code.replace(
'''  const [patientId, setPatientId] = useState("");
  const [productId, setProductId] = useState("");
  const [product, setProduct] = useState<Row | null>(null);
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);''',
  state_block,
  1  # Only first occurrence (BillingWorkflow)
)

# 2. Modify save function in BillingWorkflow
old_save = '''    const { data: sale, error } = await supabase.from("sales").insert({
      organization_id: profile.organization_id,
      invoice_no: invoice,
      patient_id: patientId || null,
      medicine_subtotal: medicine,
      medicine_tax: tax,
      pharmacy_revenue: pharmacyRevenue,
      doctor_fee: 0,
      gross_total: grossTotal,
      special_discount_percent: Number(specialDiscountPercent || 0),
      special_discount_amount: specialDiscountAmount,
      grand_total: total,
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
    const cashAmount = total;
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
      await postJournal(profile, {
        voucherType: "sale",
        entryDate: new Date().toISOString(),
        referenceType: "sale",
        referenceId: sale.id,
        referenceNumber: invoice,
        narration: Pharmacy bill ,
        lines: [
          { ledger: "Cash", debit: total },
          { ledger: "Pharmacy Sales", credit: pharmacyRevenue },
        ]
      });
    } catch {}'''

new_save = '''    const fee = Number(pending?.doctor_fee || 0);
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

code = code.replace(old_save, new_save)

# 3. Add to UI
ui_old = '''<div className="totals-mini"><span>Medicine 
<b>{money(medicine)}</b></span><span>Tax <b>{money(tax)}</b></span>{Number(specialDiscountPercent || 0) > 0 && 
<span>Special discount <b>-{money(specialDiscountAmount)}</b></span>}<strong>Grand total 
<b>{money(total)}</b></strong></div>'''

ui_new = '''{pending && <div className="fee-banner auth-message" style={{ marginBottom: "16px", background: "#fff5f5", color: "#c53030", padding: "12px", borderRadius: "8px", border: "1px solid #fed7d7" }}>Pending doctor fee will be collected once: <b>{money(pending.doctor_fee)}</b></div>}
<div className="totals-mini"><span>Medicine 
<b>{money(medicine)}</b></span><span>Tax <b>{money(tax)}</b></span>{Number(specialDiscountPercent || 0) > 0 && 
<span>Special discount <b>-{money(specialDiscountAmount)}</b></span>}{pending && <span>Doctor fee <b>{money(pending.doctor_fee)}</b></span>}<strong>Grand total 
<b>{money(total + Number(pending?.doctor_fee || 0))}</b></strong></div>'''

code = code.replace(ui_old.replace('\n', ''), ui_new.replace('\n', ''))

# If ui_old wasn't exactly right due to formatting, fallback to regex:
if ui_old.replace('\n', '') not in code:
    code = re.sub(
        r'<div className="totals-mini"><span>Medicine\s*<b>\{money\(medicine\)\}</b></span><span>Tax <b>\{money\(tax\)\}</b></span>\{Number\(specialDiscountPercent \|\| 0\) > 0 &&\s*<span>Special discount <b>-\{money\(specialDiscountAmount\)\}</b></span>\}<strong>Grand total\s*<b>\{money\(total\)\}</b></strong></div>',
        ui_new.replace('\n', ''),
        code
    )

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)

print("Done")
