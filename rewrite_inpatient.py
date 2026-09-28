# -*- coding: utf-8 -*-
import codecs

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

start = code.find('export function InpatientBillingWorkflow')
end = code.find('\nexport function', start + 1)
if end == -1: end = len(code)

new_component = '''export function InpatientBillingWorkflow({ profile, organization, notify }: { profile: Profile; organization: Organization | null; notify: (message: string) => void }) {
  const [patientId, setPatientId] = useState("");
  const [productId, setProductId] = useState("");
  const [product, setProduct] = useState<Row | null>(null);
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Row[]>([]);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!patientId || !supabase) { setBalance(null); setPending([]); return; }
    // Fetch ledger balance
    supabase.from("patient_ledger").select("debit,credit").eq("patient_id", patientId).then(({ data }) => {
      if (!data) { setBalance(null); return; }
      const bal = data.reduce((sum: number, r: any) => sum + Number(r.debit || 0) - Number(r.credit || 0), 0);
      setBalance(bal);
    });
    // Fetch pending doctor fees
    supabase.from("consultations").select("id,doctor_fee,visited_at").eq("patient_id", patientId).eq("doctor_fee_collected", false).gt("doctor_fee", 0).order("visited_at", { ascending: false }).then(({ data }) => setPending(data || []));
  }, [patientId]);

  const [ratePreview, setRatePreview] = useState<Row | null>(null);
  const [specialDiscountPercent, setSpecialDiscountPercent] = useState(0);
  const salesGstMode = organization?.sales_gst_mode || "price_plus_gst";
  const isPriceOnly = salesGstMode === "price_only";
  const settingDiscount = Number(organization?.sales_discount_percent || 0);

  const medicine = cart.reduce((sum, item) => sum + (isPriceOnly ? Number(item.selling_rate) * Number(item.qty) : (Number(item.selling_rate) * Number(item.qty)) / (1 + Number(item.gst_percent || 0) / 100)), 0);
  const tax = cart.reduce((sum, item) => sum + (isPriceOnly ? Number(item.selling_rate) * Number(item.qty) * Number(item.gst_percent || 0) / 100 : Number(item.selling_rate) * Number(item.qty) - (Number(item.selling_rate) * Number(item.qty)) / (1 + Number(item.gst_percent || 0) / 100)), 0);
  const grossTotal = isPriceOnly ? medicine + tax : cart.reduce((sum, item) => sum + Number(item.selling_rate) * Number(item.qty), 0);
  const specialDiscountAmount = Number(((medicine + tax) * (Number(specialDiscountPercent || 0) / 100)).toFixed(2));
  const total = Math.max(0, grossTotal - specialDiscountAmount);
  
  const pendingFee = pending.reduce((sum, row) => sum + Number(row.doctor_fee || 0), 0);

  useEffect(() => {
    if (!supabase || !productId) {
      setRatePreview(null);
      return;
    }
    let alive = true;
    supabase.from("medicine_batches").select("mrp,selling_rate,sales_discount_percent,gst_percent").eq("product_id", productId).gt("current_stock", 0).gte("expiry_date", todayInput()).order("expiry_date", { ascending: true }).order("created_at", { ascending: true }).limit(1).maybeSingle().then(({ data }) => {
      if (!alive || !data) return;
      const discount = data.sales_discount_percent == null ? settingDiscount : Number(data.sales_discount_percent);
      const finalRate = discountedSaleRate(data.selling_rate, 1, discount);
      const gst = Number(data.gst_percent || 0);
      const taxEach = isPriceOnly ? finalRate * gst / 100 : finalRate - (finalRate / (1 + gst / 100));
      setRatePreview({ mrp_unit_rate: Math.ceil(Number(data.selling_rate)), sales_discount_percent: discount, final_rate: finalRate, gst_percent: gst, tax_each: taxEach, bill_rate: isPriceOnly ? finalRate + taxEach : finalRate });
    });
    return () => { alive = false; };
  }, [productId, settingDiscount, isPriceOnly]);

  const add = async () => {
    if (!supabase || !productId || Number(qty) <= 0) {
      notify("Select medicine and quantity");
      return;
    }
    const { data, error } = await supabase.from("medicine_batches").select("id,batch_number,expiry_date,current_stock,selling_rate,mrp,gst_percent,sales_discount_percent").eq("product_id", productId).gt("current_stock", 0).gte("expiry_date", todayInput()).order("expiry_date", { ascending: true }).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (error || !data) {
      notify(error?.message || "No FEFO stock available");
      return;
    }
    if (Number(data.current_stock) < Number(qty)) {
      notify(`Only ${data.current_stock} available in FEFO batch`);
      return;
    }
    const discount = data.sales_discount_percent == null ? settingDiscount : Number(data.sales_discount_percent);
    const originalRate = discountedSaleRate(data.selling_rate, 1, discount);
    setCart((items) => [...items, { ...product, ...data, product_id: productId, batch_id: data.id, qty, mrp_unit_rate: Math.ceil(Number(data.selling_rate)), sales_discount_percent: discount, original_sales_discount_percent: discount, original_selling_rate: originalRate, selling_rate: originalRate, rate_edited: false }]);
    setProductId("");
    setProduct(null);
    setRatePreview(null);
    setQty(1);
  };

  const changeQty = (index: number, next: number) => {
    setCart((items) => items.map((item, i) => i === index ? { ...item, qty: Math.max(1, next) } : item));
  };
  const changeDiscount = (index: number, value: number) => {
    setCart((items) => items.map((item, i) => {
      if (i !== index) return item;
      const sellingRate = discountedSaleRate(item.mrp_unit_rate || item.selling_rate, 1, value);
      const changed = Math.abs(value - Number(item.original_sales_discount_percent || 0)) > 0.001;
      return { ...item, sales_discount_percent: value, selling_rate: sellingRate, rate_edited: changed };
    }));
  };

  const save = async () => {
    if (!supabase || !patientId || !cart.length) {
      notify("Select inpatient and add medicines");
      return;
    }
    if (Number(specialDiscountPercent || 0) < 0 || Number(specialDiscountPercent || 0) > 100) {
      notify("Special discount must be between 0 and 100");
      return;
    }
    setSaving(true);
    const invoice = `IP-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const hasRateEdit = cart.some((item) => item.rate_edited) || Number(specialDiscountPercent || 0) > 0;
    const pharmacyRevenue = Math.max(0, medicine + tax - specialDiscountAmount);
    const { data: sale, error } = await supabase.from("sales").insert({
      organization_id: profile.organization_id,
      invoice_no: invoice,
      patient_id: patientId,
      consultation_id: null,
      medicine_subtotal: medicine,
      medicine_tax: tax,
      pharmacy_revenue: pharmacyRevenue,
      doctor_fee: 0,
      gross_total: grossTotal,
      special_discount_percent: Number(specialDiscountPercent || 0),
      special_discount_amount: specialDiscountAmount,
      grand_total: total,
      payment_mode: "credit",
      sale_type: "inpatient",
      has_rate_edit: hasRateEdit,
      rate_edit_verified: !hasRateEdit,
      status: "completed",
      created_by: profile.id,
    }).select("id").single();
    if (error || !sale) {
      setSaving(false);
      notify(error?.message || "Inpatient bill save failed.");
      return;
    }
    for (const p of pending) {
      await supabase.rpc("collect_consultation_fee", {
        p_consultation_id: p.id,
        p_sale_id: sale.id
      });
    }
    for (const item of cart) {
      const balanceQty = Number(item.current_stock) - Number(item.qty);
      await supabase.from("sale_items").insert({
        organization_id: profile.organization_id, sale_id: sale.id, product_id: item.product_id, batch_id: item.batch_id, quantity: item.qty, unit_rate: item.selling_rate, original_unit_rate: item.original_selling_rate || item.selling_rate, rate_edited: !!item.rate_edited, mrp: item.mrp, mrp_unit_rate: item.mrp_unit_rate, original_sales_discount_percent: item.original_sales_discount_percent, sales_discount_percent: item.sales_discount_percent, gst_percent: item.gst_percent || 0, line_total: Number(item.selling_rate) * Number(item.qty)
      });
      await supabase.from("medicine_batches").update({ current_stock: balanceQty }).eq("id", item.batch_id);
      await supabase.from("stock_movements").insert({
        organization_id: profile.organization_id, product_id: item.product_id, batch_id: item.batch_id, movement_type: "sale", reference_type: "inpatient_sale", reference_id: sale.id, reference_number: invoice, out_quantity: item.qty, balance_quantity: balanceQty, created_by: profile.id
      });
    }
    
    // Post medicine bill to patient ledger
    await supabase.from("patient_ledger").insert({ organization_id: profile.organization_id, patient_id: patientId, occurred_on: new Date().toISOString().slice(0, 10), particulars: `Inpatient medicine bill ${invoice}`, reference_type: "inpatient_bill", reference_id: sale.id, reference_number: invoice, debit: total, credit: 0, created_by: profile.id });
    // If doctor fees pending, post separately to patient ledger
    if (pendingFee > 0) {
      await supabase.from("patient_ledger").insert({ organization_id: profile.organization_id, patient_id: patientId, occurred_on: new Date().toISOString().slice(0, 10), particulars: `Doctor fee collected with bill ${invoice}`, reference_type: "inpatient_bill", reference_id: sale.id, reference_number: invoice, debit: pendingFee, credit: 0, created_by: profile.id });
    }
    
    try {
      const journalLines = [{ ledger: "Patient Receivable", debit: total }, { ledger: "Pharmacy Sales", credit: pharmacyRevenue }];
      if (tax > 0) journalLines.push({ ledger: "GST Payable", credit: tax });
      if (pendingFee > 0) journalLines.push({ ledger: "Consultation Revenue", credit: pendingFee });
      await postJournal(profile, { voucherType: "inpatient_bill", entryDate: new Date().toISOString(), referenceType: "inpatient_bill", referenceId: sale.id, referenceNumber: invoice, narration: `Inpatient medicine bill ${invoice}`, lines: journalLines });
    } catch {}

    setSaving(false);
    setCart([]);
    setPatientId("");
    setProductId("");
    setProduct(null);
    setRatePreview(null);
    setQty(1);
    setBalance(null);
    setPending([]);
    notify(`${invoice} added to inpatient ledger`);
  };

  return <div><div className="page-head"><div><h1>Inpatient Billing</h1><p>Credit billing charged to patient ledger.</p></div></div><div className="panel billing-panel">
    <div className="billing-patient-line" style={{ marginBottom: "20px" }}>
      <AsyncSelect table="patients" select="id,patient_id,name,mobile" searchColumns={["patient_id", "name", "mobile"]} label="Inpatient" value={patientId} onChange={setPatientId} render={patientText}/>
    </div>
    
    {patientId && balance !== null && <div className="auth-message" style={{ marginBottom: "16px", display: "flex", gap: "24px", flexWrap: "wrap", padding: "12px", borderRadius: "8px" }}>
      <span>Prev. ledger balance: <b style={{ color: balance > 0 ? "#c53030" : "#276749" }}>{money(balance)}</b></span>
      {cart.length > 0 && <span>Balance after: <b style={{ color: "#c53030" }}>{money(balance + total)}</b></span>}
    </div>}
    
    <div className="billing-entry-line">
      <AsyncSelect table="products" select="id,product_id,name,gst_percent" searchColumns={["product_id", "name", "barcode", "generic_name"]} label="Medicine" value={productId} onChange={(id, row) => { setProductId(id); setProduct(row || null); setRatePreview(null); }} render={productText}/>
      <label className="field qty-field"><span>Quantity</span><input type="number" min="1" step="1" value={qty} onChange={(event) => setQty(Number(event.currentTarget.value))}/></label>
      <button type="button" className="primary" onClick={add}><Plus size={16}/> Add</button>
    </div>
    
    {ratePreview && <div className="auth-message stock-preview">MRP rate: <b>{money(ratePreview.mrp_unit_rate)}</b>  Discount: <b>{Number(ratePreview.sales_discount_percent || 0)}%</b>  Final rate: <b>{money(ratePreview.final_rate)}</b>  GST: <b>{Number(ratePreview.gst_percent || 0)}% / {money(ratePreview.tax_each)}</b>  Billing rate: <b>{money(ratePreview.bill_rate)}</b></div>}
    
    {cart.length ? <><div className="data-wrap"><table className="data-table billing-table"><thead><tr><th className="col-med">Medicine</th><th className="col-batch">Batch</th><th className="col-qty">Qty</th><th className="col-rate">MRP rate</th><th className="col-rate">Discount %</th><th className="col-rate">Final rate</th><th className="col-gst">GST</th><th className="col-total">Total</th><th className="col-action"></th></tr></thead><tbody>{cart.map((item, index) => <tr key={`${item.batch_id}-${index}`} className="cart-row-interactive"><td className="col-med"><strong>{item.name}</strong></td><td className="col-batch">{item.batch_number}</td><td className="col-qty"><input className="table-qty-input" type="number" min="1" step="1" value={item.qty} onChange={(event) => changeQty(index, Number(event.currentTarget.value))} onClick={(e)=>e.stopPropagation()}/></td><td className="col-rate">{money(item.mrp_unit_rate)}</td><td className="col-rate"><input className="table-qty-input" type="number" min="0" max="100" step="0.01" value={item.sales_discount_percent ?? 0} onChange={(event) => changeDiscount(index, Number(event.currentTarget.value))} onClick={(e)=>e.stopPropagation()}/></td><td className="col-rate">{money(item.selling_rate)}</td><td className="col-gst">{Number(item.gst_percent || 0)}%</td><td className="col-total"><strong>{money(Number(item.selling_rate) * Number(item.qty))}</strong></td><td className="col-action"><button className="table-edit danger-btn" onClick={() => setCart((items) => items.filter((_, i) => i !== index))}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>
    <div className="checkout sales-checkout">
      <div className="discount-wrap">
        <label>Special Discount %</label>
        <input type="number" min="0" max="100" step="0.01" value={specialDiscountPercent} onChange={(e) => setSpecialDiscountPercent(Number(e.currentTarget.value))} />
      </div>
      <div className="totals-mini">
        <span>Medicine <b>{money(medicine)}</b></span>
        <span>Tax <b>{money(tax)}</b></span>
        {specialDiscountAmount > 0 && <span>Special disc. <b>-{money(specialDiscountAmount)}</b></span>}
        <strong>Bill total <b>{money(total)}</b></strong>
      </div>
      <button className="primary" onClick={save} disabled={saving}>{saving ? <LoaderCircle className="spin"/> : <CheckCircle2 size={16}/>} Credit to patient</button>
    </div></>
    : <div className="empty"><h3>No medicines added.</h3><p>Select medicine and add quantity.</p></div>}
  </div></div>;
}
'''

code = code[:start] + new_component + code[end:]

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Done rewriting InpatientBillingWorkflow!")
