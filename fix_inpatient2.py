# -*- coding: utf-8 -*-
import codecs

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

start = code.find('export function InpatientBillingWorkflow')
end = code.find('\nexport ', start + 1)

new_component = '''export function InpatientBillingWorkflow({ profile, notify }: { profile: Profile; notify: (message: string) => void }) {
  const [patientId, setPatientId] = useState("");
  const [productId, setProductId] = useState("");
  const [product, setProduct] = useState<Row | null>(null);
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [pending, setPending] = useState<Row[]>([]);

  // Fetch ledger balance when patient changes
  useEffect(() => {
    if (!patientId || !supabase) { setBalance(null); setPending([]); return; }
    supabase.from("patient_ledger").select("debit,credit").eq("patient_id", patientId)
      .then(({ data }) => {
        if (!data) { setBalance(null); return; }
        const bal = data.reduce((sum: number, r: any) => sum + Number(r.debit || 0) - Number(r.credit || 0), 0);
        setBalance(bal);
      });
    // Fetch all unpaid doctor fees
    supabase.from("consultations")
      .select("id,doctor_fee,visited_at")
      .eq("patient_id", patientId)
      .eq("doctor_fee_collected", false)
      .gt("doctor_fee", 0)
      .order("visited_at", { ascending: false })
      .then(({ data }) => setPending(data || []));
  }, [patientId]);

  const pendingFee = pending.reduce((sum, row) => sum + Number(row.doctor_fee || 0), 0);

  const changeQty = (index: number, val: number) => {
    setCart((items) => items.map((item, i) => i === index ? { ...item, qty: Math.max(1, val) } : item));
  };
  const changeDiscount = (index: number, val: number) => {
    setCart((items) => items.map((item, i) => {
      if (i !== index) return item;
      const clamped = Math.max(0, Math.min(100, val));
      const newRate = Number((Number(item.original_selling_rate) * (1 - clamped / 100)).toFixed(2));
      return { ...item, sales_discount_percent: clamped, selling_rate: newRate, rate_edited: clamped !== Number(item.original_sales_discount_percent) };
    }));
  };

  const medicineTotal = cart.reduce((sum, item) => sum + Number(item.selling_rate) * Number(item.qty), 0);
  const grandTotal = medicineTotal + pendingFee;

  const add = async () => {
    if (!supabase || !patientId || !productId || Number(qty) <= 0) {
      notify("Select inpatient, medicine and quantity");
      return;
    }
    const { data, error } = await supabase.from("medicine_batches")
      .select("id,batch_number,expiry_date,current_stock,selling_rate,mrp,mrp_unit_rate,units_per_purchase_unit,sales_discount_percent,gst_percent")
      .eq("product_id", productId).gt("current_stock", 0)
      .gte("expiry_date", new Date().toISOString().slice(0, 10))
      .order("expiry_date", { ascending: true }).order("created_at", { ascending: true })
      .limit(1).maybeSingle();
    if (error || !data) { notify(error?.message || "No FEFO stock available"); return; }
    if (Number(data.current_stock) < Number(qty)) { notify(`Only ${data.current_stock} available in FEFO batch`); return; }
    const discountPct = data.sales_discount_percent == null ? 0 : Number(data.sales_discount_percent);
    const sellingRate = Number((Number(data.mrp) / Math.max(1, Number(data.units_per_purchase_unit)) * (1 - discountPct / 100)).toFixed(2));
    setCart((items) => [...items, { ...product, ...data, product_id: productId, batch_id: data.id, qty, selling_rate: sellingRate, original_selling_rate: sellingRate, sales_discount_percent: discountPct, original_sales_discount_percent: discountPct }]);
    setProductId("");
    setProduct(null);
    setQty(1);
  };

  const save = async () => {
    if (!supabase || !patientId || !cart.length) { notify("Select inpatient and add medicines"); return; }
    setSaving(true);
    const invoice = `IP-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const { data: sale, error } = await supabase.from("sales").insert({
      organization_id: profile.organization_id, invoice_no: invoice, patient_id: patientId,
      medicine_subtotal: medicineTotal, medicine_tax: 0, pharmacy_revenue: medicineTotal,
      doctor_fee: pendingFee, grand_total: grandTotal, payment_mode: "credit",
      sale_type: "inpatient", status: "completed", created_by: profile.id
    }).select("id").single();
    if (error || !sale) { setSaving(false); notify(error?.message || "Inpatient bill save failed."); return; }
    for (const item of cart) {
      const bal = Number(item.current_stock) - Number(item.qty);
      await supabase.from("sale_items").insert({ organization_id: profile.organization_id, sale_id: sale.id, product_id: item.product_id, batch_id: item.batch_id, quantity: item.qty, unit_rate: item.selling_rate, original_unit_rate: item.original_selling_rate || item.selling_rate, rate_edited: !!item.rate_edited, mrp: item.mrp, mrp_unit_rate: item.mrp_unit_rate, original_sales_discount_percent: item.original_sales_discount_percent, sales_discount_percent: item.sales_discount_percent, gst_percent: item.gst_percent || 0, line_total: Number(item.selling_rate) * Number(item.qty) });
      await supabase.from("medicine_batches").update({ current_stock: bal }).eq("id", item.batch_id);
      await supabase.from("stock_movements").insert({ organization_id: profile.organization_id, product_id: item.product_id, batch_id: item.batch_id, movement_type: "sale", reference_type: "inpatient_sale", reference_id: sale.id, reference_number: invoice, out_quantity: item.qty, balance_quantity: bal, created_by: profile.id });
    }
    // Collect all pending doctor fees via RPC
    for (const p of pending) {
      await supabase.rpc("collect_consultation_fee", { p_consultation_id: p.id, p_sale_id: sale.id });
    }
    // Post medicine bill to patient ledger
    await supabase.from("patient_ledger").insert({ organization_id: profile.organization_id, patient_id: patientId, occurred_on: new Date().toISOString().slice(0, 10), particulars: `Inpatient medicine bill ${invoice}`, reference_type: "inpatient_bill", reference_id: sale.id, reference_number: invoice, debit: medicineTotal, credit: 0, created_by: profile.id });
    // If doctor fees pending, post separately to patient ledger
    if (pendingFee > 0) {
      await supabase.from("patient_ledger").insert({ organization_id: profile.organization_id, patient_id: patientId, occurred_on: new Date().toISOString().slice(0, 10), particulars: `Doctor fee collected with bill ${invoice}`, reference_type: "inpatient_bill", reference_id: sale.id, reference_number: invoice, debit: pendingFee, credit: 0, created_by: profile.id });
    }
    try {
      const journalLines = [{ ledger: "Patient Receivable", debit: grandTotal }, { ledger: "Pharmacy Sales", credit: medicineTotal }];
      if (pendingFee > 0) journalLines.push({ ledger: "Consultation Revenue", credit: pendingFee });
      await postJournal(profile, { voucherType: "inpatient_bill", entryDate: new Date().toISOString(), referenceType: "inpatient_bill", referenceId: sale.id, referenceNumber: invoice, narration: `Inpatient medicine bill ${invoice}`, lines: journalLines });
    } catch {}
    setSaving(false);
    setCart([]);
    setPatientId("");
    setProductId("");
    setProduct(null);
    setQty(1);
    setBalance(null);
    setPending([]);
    notify(`${invoice} added to inpatient ledger`);
  };

  return <div><div className="page-head"><div><h1>Inpatient Billing {cart.length > 0 && <span className="billing-head-total">{money(grandTotal)}</span>}</h1><p>Credit billing charged to patient ledger.</p></div></div><div className="panel billing-panel">
    <div className="billing-patient-line" style={{ marginBottom: "20px" }}>
      <AsyncSelect table="patients" select="id,patient_id,name,mobile" searchColumns={["patient_id", "name", "mobile"]} label="Inpatient" value={patientId} onChange={setPatientId} render={patientText}/>
    </div>
    {patientId && balance !== null && <div className="auth-message" style={{ marginBottom: "16px", display: "flex", gap: "24px", flexWrap: "wrap", padding: "12px", borderRadius: "8px" }}>
      <span>Prev. ledger balance: <b style={{ color: balance > 0 ? "#c53030" : "#276749" }}>{money(balance)}</b></span>
      {pending.length > 0 && <span style={{ color: "#c53030" }}>Pending doctor fee ({pending.length}): <b>{money(pendingFee)}</b></span>}
      {cart.length > 0 && <span>Medicine bill: <b>{money(medicineTotal)}</b></span>}
      {cart.length > 0 && <span>Total charged now: <b>{money(grandTotal)}</b></span>}
      {cart.length > 0 && <span>Balance after: <b style={{ color: "#c53030" }}>{money(balance + grandTotal)}</b></span>}
    </div>}
    <div className="billing-entry-line">
      <AsyncSelect table="products" select="id,product_id,name,gst_percent" searchColumns={["product_id", "name", "barcode", "generic_name"]} label="Medicine" value={productId} onChange={(id, row) => { setProductId(id); setProduct(row || null); }} render={productText}/>
      <label className="field qty-field"><span>Quantity</span><input type="number" min="1" step="1" value={qty} onChange={(event) => setQty(Number(event.currentTarget.value))}/></label>
      <button type="button" className="primary" onClick={add}><Plus size={16}/> Add</button>
    </div>
    {pending.length > 0 && <div className="fee-banner auth-message" style={{ marginBottom: "16px", background: "#fff5f5", color: "#c53030", padding: "12px", borderRadius: "8px", border: "1px solid #fed7d7" }}>Pending doctor fee ({pending.length} consultation{pending.length > 1 ? "s" : ""}) will be added to ledger: <b>{money(pendingFee)}</b></div>}
    {cart.length ? <><div className="data-wrap"><table className="data-table billing-table"><thead><tr><th className="col-med">Medicine</th><th className="col-batch">Batch</th><th className="col-qty">Qty</th><th className="col-rate">Rate</th><th className="col-rate">Discount %</th><th className="col-total">Total</th><th className="col-action"></th></tr></thead><tbody>{cart.map((item, index) => <tr key={`${item.batch_id}-${index}`} className="cart-row-interactive"><td className="col-med"><strong>{item.name}</strong></td><td className="col-batch">{item.batch_number}</td><td className="col-qty"><input className="table-qty-input" type="number" min="1" step="1" value={item.qty} onChange={(event) => changeQty(index, Number(event.currentTarget.value))} onClick={(e)=>e.stopPropagation()}/></td><td className="col-rate">{money(item.selling_rate)}</td><td className="col-rate"><input className="table-qty-input" type="number" min="0" max="100" step="0.01" value={item.sales_discount_percent ?? 0} onChange={(event) => changeDiscount(index, Number(event.currentTarget.value))} onClick={(e)=>e.stopPropagation()}/></td><td className="col-total"><strong>{money(Number(item.selling_rate) * Number(item.qty))}</strong></td><td className="col-action"><button className="table-edit danger-btn" onClick={() => setCart((items) => items.filter((_, i) => i !== index))}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>
    <div className="checkout sales-checkout"><div className="totals-mini">{pending.length > 0 && <span>Medicine <b>{money(medicineTotal)}</b></span>}{pending.length > 0 && <span>Doctor fee <b>{money(pendingFee)}</b></span>}<strong>Grand total <b>{money(grandTotal)}</b></strong></div><button className="primary" onClick={save} disabled={saving}>{saving ? <LoaderCircle className="spin"/> : <CheckCircle2 size={16}/>} Credit to patient</button></div></>
    : <div className="empty"><h3>No medicines added.</h3><p>Select medicine and add quantity.</p></div>}
  </div></div>;
}

'''

code = code[:start] + new_component + code[end:]

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Done!")
