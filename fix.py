import codecs

path = 'app/v2/components/PharmacyWorkflows.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

code = code.replace('const changeDiscount = (index: number, next: number) => {', '''const changeQty = (index: number, next: number) => {
    const value = Number(next);
    if (!Number.isFinite(value) || value < 1) {
      notify("Quantity must be at least 1");
      return;
    }
    setCart((items) => items.map((item, i) => i !== index ? item : { ...item, qty: value }));
  };

  const changeDiscount = (index: number, next: number) => {''')

old_layout = '<div className="form-grid"><AsyncSelect table="patients" select="id,patient_id,name,mobile" searchColumns={["patient_id", "name", "mobile"]} label="Patient / walk-in" value={patientId} onChange={setPatientId} render={patientText}/><AsyncSelect table="products" select="id,product_id,name,gst_percent" searchColumns={["product_id", "name", "barcode", "generic_name"]} label="Medicine" value={productId} onChange={(id, row) => { setProductId(id); setProduct(row || null); setRatePreview(null); }} render={productText}/><label className="field"><span>Quantity</span><input type="number" min="1" step="1" value={qty} onChange={(event) => setQty(Number(event.currentTarget.value))}/></label><div className="field"><span>&nbsp;</span><button type="button" className="secondary" onClick={add}><Plus size={16}/> Add</button></div></div>'
new_layout = '<div className="billing-patient-line" style={{ marginBottom: "20px" }}><AsyncSelect table="patients" select="id,patient_id,name,mobile" searchColumns={["patient_id", "name", "mobile"]} label="Patient / walk-in" value={patientId} onChange={setPatientId} render={patientText}/></div><div className="billing-entry-line"><AsyncSelect table="products" select="id,product_id,name,gst_percent" searchColumns={["product_id", "name", "barcode", "generic_name"]} label="Medicine" value={productId} onChange={(id, row) => { setProductId(id); setProduct(row || null); setRatePreview(null); }} render={productText}/><label className="field qty-field"><span>Quantity</span><input type="number" min="1" step="1" value={qty} onChange={(event) => setQty(Number(event.currentTarget.value))}/></label><button type="button" className="primary" onClick={add}><Plus size={16}/> Add</button></div>'
code = code.replace(old_layout, new_layout)

old_th = '<thead><tr><th>Medicine</th><th>Batch</th><th>Qty</th><th>MRP rate</th><th>Discount %</th><th>Final rate</th><th>GST</th><th>Total</th><th></th></tr></thead>'
new_th = '<thead><tr><th className="col-med">Medicine</th><th className="col-batch">Batch</th><th className="col-qty">Qty</th><th className="col-rate">MRP rate</th><th className="col-rate">Discount %</th><th className="col-rate">Final rate</th><th className="col-gst">GST</th><th className="col-total">Total</th><th className="col-action"></th></tr></thead>'
code = code.replace(old_th, new_th)

code = code.replace('<table className="data-table">', '<table className="data-table billing-table">')

old_tr = '<tr key={${item.batch_id}-}><td>{item.name}</td><td>{item.batch_number}</td><td>{item.qty}</td><td>{money(item.mrp_unit_rate)}</td><td><input className="table-qty-input" type="number" min="0" max="100" step="0.01" value={item.sales_discount_percent ?? 0} onChange={(event) => changeDiscount(index, Number(event.currentTarget.value))}/></td><td>{money(item.selling_rate)}</td><td>{Number(item.gst_percent || 0)}%</td><td>{money(Number(item.selling_rate) * Number(item.qty))}</td><td><button className="table-edit danger-btn" onClick={() => setCart((items) => items.filter((_, i) => i !== index))}><Trash2 size={14}/></button></td></tr>'
new_tr = '<tr key={${item.batch_id}-} className="cart-row-interactive"><td className="col-med"><strong>{item.name}</strong></td><td className="col-batch">{item.batch_number}</td><td className="col-qty"><input className="table-qty-input" type="number" min="1" step="1" value={item.qty} onChange={(event) => changeQty(index, Number(event.currentTarget.value))} onClick={(e)=>e.stopPropagation()}/></td><td className="col-rate">{money(item.mrp_unit_rate)}</td><td className="col-rate"><input className="table-qty-input" type="number" min="0" max="100" step="0.01" value={item.sales_discount_percent ?? 0} onChange={(event) => changeDiscount(index, Number(event.currentTarget.value))} onClick={(e)=>e.stopPropagation()}/></td><td className="col-rate">{money(item.selling_rate)}</td><td className="col-gst">{Number(item.gst_percent || 0)}%</td><td className="col-total"><strong>{money(Number(item.selling_rate) * Number(item.qty))}</strong></td><td className="col-action"><button className="table-edit danger-btn" onClick={() => setCart((items) => items.filter((_, i) => i !== index))}><Trash2 size={14}/></button></td></tr>'
code = code.replace(old_tr, new_tr)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)

print("Done")
