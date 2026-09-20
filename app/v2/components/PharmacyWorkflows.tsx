"use client";

import { useState } from "react";
import { CheckCircle2, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { money } from "../lib/format";
import { postJournal } from "../lib/accounting";
import { Profile, Row } from "../lib/types";
import { AsyncSelect, Field } from "./controls";

function productText(row: Row) {
  return `${row.product_id || ""} - ${row.name || ""}`;
}

function patientText(row: Row) {
  return `${row.patient_id || ""} - ${row.name || ""}${row.mobile ? ` - ${row.mobile}` : ""}`;
}

export function BillingWorkflow({ profile, notify }: { profile: Profile; notify: (message: string) => void }) {
  const [patientId, setPatientId] = useState("");
  const [productId, setProductId] = useState("");
  const [product, setProduct] = useState<Row | null>(null);
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const total = cart.reduce((sum, item) => sum + Number(item.selling_rate) * Number(item.qty), 0);

  const add = async () => {
    if (!supabase || !productId || Number(qty) <= 0) {
      notify("Select medicine and quantity");
      return;
    }
    const { data, error } = await supabase.from("medicine_batches").select("id,batch_number,expiry_date,current_stock,selling_rate,mrp,gst_percent").eq("product_id", productId).gt("current_stock", 0).gte("expiry_date", new Date().toISOString().slice(0, 10)).order("expiry_date", { ascending: true }).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (error || !data) {
      notify(error?.message || "No FEFO stock available");
      return;
    }
    if (Number(data.current_stock) < Number(qty)) {
      notify(`Only ${data.current_stock} available in FEFO batch`);
      return;
    }
    setCart((items) => [...items, { ...product, ...data, product_id: productId, batch_id: data.id, qty }]);
    setProductId("");
    setProduct(null);
    setQty(1);
  };

  const save = async () => {
    if (!supabase || !cart.length) {
      notify("Add at least one medicine");
      return;
    }
    setSaving(true);
    const invoice = `V2-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const { data: sale, error } = await supabase.from("sales").insert({
      organization_id: profile.organization_id,
      invoice_no: invoice,
      patient_id: patientId || null,
      medicine_subtotal: total,
      medicine_tax: 0,
      pharmacy_revenue: total,
      doctor_fee: 0,
      grand_total: total,
      payment_mode: "cash",
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
      await supabase.from("sale_items").insert({ organization_id: profile.organization_id, sale_id: sale.id, product_id: item.product_id, batch_id: item.batch_id, quantity: item.qty, unit_rate: item.selling_rate, mrp: item.mrp, gst_percent: item.gst_percent || 0, line_total: Number(item.selling_rate) * Number(item.qty) });
      await supabase.from("medicine_batches").update({ current_stock: balance }).eq("id", item.batch_id);
      await supabase.from("stock_movements").insert({ organization_id: profile.organization_id, product_id: item.product_id, batch_id: item.batch_id, movement_type: "sale", reference_type: "sale", reference_id: sale.id, reference_number: invoice, out_quantity: item.qty, balance_quantity: balance, created_by: profile.id });
    }
    try {
      await postJournal(profile, { voucherType: "sale", entryDate: new Date().toISOString(), referenceType: "sale", referenceId: sale.id, referenceNumber: invoice, narration: `Sale bill ${invoice}`, lines: [{ ledger: "Cash", debit: total }, { ledger: "Pharmacy Sales", credit: total }] });
    } catch {}
    setSaving(false);
    setCart([]);
    notify(`${invoice} saved`);
  };

  return <div><div className="page-head"><div><h1>Billing</h1><p>Native V2 pharmacy billing with FEFO stock deduction.</p></div></div><div className="panel billing-panel"><div className="form-grid"><AsyncSelect table="patients" select="id,patient_id,name,mobile" searchColumns={["patient_id", "name", "mobile"]} label="Patient / walk-in" value={patientId} onChange={setPatientId} render={patientText}/><AsyncSelect table="products" select="id,product_id,name,gst_percent" searchColumns={["product_id", "name", "barcode", "generic_name"]} label="Medicine" value={productId} onChange={(id, row) => { setProductId(id); setProduct(row || null); }} render={productText}/><label className="field"><span>Quantity</span><input type="number" min="1" step="1" value={qty} onChange={(event) => setQty(Number(event.currentTarget.value))}/></label><div className="field"><span>&nbsp;</span><button type="button" className="secondary" onClick={add}><Plus size={16}/> Add</button></div></div>{cart.length ? <><div className="data-wrap"><table className="data-table"><thead><tr><th>Medicine</th><th>Batch</th><th>Qty</th><th>Rate</th><th>Total</th><th></th></tr></thead><tbody>{cart.map((item, index) => <tr key={`${item.batch_id}-${index}`}><td>{item.name}</td><td>{item.batch_number}</td><td>{item.qty}</td><td>{money(item.selling_rate)}</td><td>{money(Number(item.selling_rate) * Number(item.qty))}</td><td><button className="table-edit danger-btn" onClick={() => setCart((items) => items.filter((_, i) => i !== index))}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div><div className="checkout"><strong>Total {money(total)}</strong><button className="primary" onClick={save} disabled={saving}>{saving ? <LoaderCircle className="spin"/> : <CheckCircle2 size={16}/>} Complete sale</button></div></> : <div className="empty"><h3>No medicines added.</h3><p>Select medicine and add quantity.</p></div>}</div></div>;
}

export function SalesWorkflow({ profile, notify }: { profile: Profile; notify: (message: string) => void }) {
  return <BillingWorkflow profile={profile} notify={notify}/>;
}

export function InpatientBillingWorkflow({ profile, notify }: { profile: Profile; notify: (message: string) => void }) {
  const [patientId, setPatientId] = useState("");
  const [productId, setProductId] = useState("");
  const [product, setProduct] = useState<Row | null>(null);
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const total = cart.reduce((sum, item) => sum + Number(item.selling_rate) * Number(item.qty), 0);

  const add = async () => {
    if (!supabase || !patientId || !productId || Number(qty) <= 0) {
      notify("Select inpatient, medicine and quantity");
      return;
    }
    const { data, error } = await supabase.from("medicine_batches").select("id,batch_number,expiry_date,current_stock,selling_rate,mrp,gst_percent").eq("product_id", productId).gt("current_stock", 0).gte("expiry_date", new Date().toISOString().slice(0, 10)).order("expiry_date", { ascending: true }).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (error || !data) {
      notify(error?.message || "No FEFO stock available");
      return;
    }
    if (Number(data.current_stock) < Number(qty)) {
      notify(`Only ${data.current_stock} available in FEFO batch`);
      return;
    }
    setCart((items) => [...items, { ...product, ...data, product_id: productId, batch_id: data.id, qty }]);
    setProductId("");
    setProduct(null);
    setQty(1);
  };

  const save = async () => {
    if (!supabase || !patientId || !cart.length) {
      notify("Select inpatient and add medicines");
      return;
    }
    setSaving(true);
    const invoice = `IP-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const { data: sale, error } = await supabase.from("sales").insert({ organization_id: profile.organization_id, invoice_no: invoice, patient_id: patientId, medicine_subtotal: total, medicine_tax: 0, pharmacy_revenue: total, doctor_fee: 0, grand_total: total, payment_mode: "credit", sale_type: "inpatient", status: "completed", created_by: profile.id }).select("id").single();
    if (error || !sale) {
      setSaving(false);
      notify(error?.message || "Inpatient bill save failed. Check inpatient SQL is installed.");
      return;
    }
    for (const item of cart) {
      const balance = Number(item.current_stock) - Number(item.qty);
      await supabase.from("sale_items").insert({ organization_id: profile.organization_id, sale_id: sale.id, product_id: item.product_id, batch_id: item.batch_id, quantity: item.qty, unit_rate: item.selling_rate, mrp: item.mrp, gst_percent: item.gst_percent || 0, line_total: Number(item.selling_rate) * Number(item.qty) });
      await supabase.from("medicine_batches").update({ current_stock: balance }).eq("id", item.batch_id);
      await supabase.from("stock_movements").insert({ organization_id: profile.organization_id, product_id: item.product_id, batch_id: item.batch_id, movement_type: "sale", reference_type: "inpatient_sale", reference_id: sale.id, reference_number: invoice, out_quantity: item.qty, balance_quantity: balance, created_by: profile.id });
    }
    await supabase.from("patient_ledger").insert({ organization_id: profile.organization_id, patient_id: patientId, occurred_on: new Date().toISOString().slice(0, 10), particulars: `Inpatient medicine bill ${invoice}`, reference_type: "inpatient_bill", reference_id: sale.id, reference_number: invoice, debit: total, credit: 0, created_by: profile.id });
    try { await postJournal(profile, { voucherType: "inpatient_bill", entryDate: new Date().toISOString(), referenceType: "inpatient_bill", referenceId: sale.id, referenceNumber: invoice, narration: `Inpatient medicine bill ${invoice}`, lines: [{ ledger: "Patient Receivable", debit: total }, { ledger: "Pharmacy Sales", credit: total }] }); } catch {}
    setSaving(false);
    setCart([]);
    notify(`${invoice} added to inpatient ledger`);
  };

  return <div><div className="page-head"><div><h1>Inpatient Billing</h1><p>Native V2 inpatient credit billing.</p></div></div><div className="panel billing-panel"><div className="form-grid"><AsyncSelect table="patients" select="id,patient_id,name,mobile" searchColumns={["patient_id", "name", "mobile"]} label="Inpatient" value={patientId} onChange={setPatientId} render={patientText}/><AsyncSelect table="products" select="id,product_id,name,gst_percent" searchColumns={["product_id", "name", "barcode", "generic_name"]} label="Medicine" value={productId} onChange={(id, row) => { setProductId(id); setProduct(row || null); }} render={productText}/><label className="field"><span>Quantity</span><input type="number" min="1" step="1" value={qty} onChange={(event) => setQty(Number(event.currentTarget.value))}/></label><div className="field"><span>&nbsp;</span><button type="button" className="secondary" onClick={add}><Plus size={16}/> Add</button></div></div>{cart.length ? <><div className="data-wrap"><table className="data-table"><thead><tr><th>Medicine</th><th>Batch</th><th>Qty</th><th>Rate</th><th>Total</th><th></th></tr></thead><tbody>{cart.map((item, index) => <tr key={`${item.batch_id}-${index}`}><td>{item.name}</td><td>{item.batch_number}</td><td>{item.qty}</td><td>{money(item.selling_rate)}</td><td>{money(Number(item.selling_rate) * Number(item.qty))}</td><td><button className="table-edit danger-btn" onClick={() => setCart((items) => items.filter((_, i) => i !== index))}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div><div className="checkout"><strong>Total {money(total)}</strong><button className="primary" onClick={save} disabled={saving}>{saving ? <LoaderCircle className="spin"/> : <CheckCircle2 size={16}/>} Credit to patient</button></div></> : <div className="empty"><h3>No medicines added.</h3><p>Select medicine and add quantity.</p></div>}</div></div>;
}
