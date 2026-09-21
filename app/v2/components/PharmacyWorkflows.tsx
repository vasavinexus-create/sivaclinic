"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { money } from "../lib/format";
import { postJournal } from "../lib/accounting";
import { Organization, Profile, Row } from "../lib/types";
import { AsyncSelect, Field } from "./controls";

function productText(row: Row) {
  return `${row.product_id || ""} - ${row.name || ""}`;
}

function patientText(row: Row) {
  return `${row.patient_id || ""} - ${row.name || ""}${row.mobile ? ` - ${row.mobile}` : ""}`;
}

const todayInput = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};
const roundedSaleRate = (mrp: any, retailCount: any) => {
  const units = Number(retailCount || 1) || 1;
  const rate = Number(mrp || 0) / units;
  return rate > 0 ? Math.ceil(rate) : 0;
};
const discountedSaleRate = (mrp: any, retailCount: any, discountPercent: any) => {
  const rate = roundedSaleRate(mrp, retailCount);
  const discount = rate * (Number(discountPercent || 0) / 100);
  return Math.max(0, Number((rate - discount).toFixed(2)));
};

export function BillingWorkflow({ profile, organization, notify }: { profile: Profile; organization: Organization | null; notify: (message: string) => void }) {
  const [patientId, setPatientId] = useState("");
  const [productId, setProductId] = useState("");
  const [product, setProduct] = useState<Row | null>(null);
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
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

  useEffect(() => {
    if (!supabase || !productId) {
      setRatePreview(null);
      return;
    }
    let alive = true;
    supabase.from("medicine_batches").select("mrp,units_per_purchase_unit,sales_discount_percent,gst_percent").eq("product_id", productId).gt("current_stock", 0).gte("expiry_date", todayInput()).order("expiry_date", { ascending: true }).order("created_at", { ascending: true }).limit(1).maybeSingle().then(({ data }) => {
      if (!alive || !data) return;
      const discount = data.sales_discount_percent == null ? settingDiscount : Number(data.sales_discount_percent);
      const finalRate = discountedSaleRate(data.mrp, data.units_per_purchase_unit, discount);
      const gst = Number(data.gst_percent || 0);
      const taxEach = isPriceOnly ? finalRate * gst / 100 : finalRate - (finalRate / (1 + gst / 100));
      setRatePreview({ mrp_unit_rate: roundedSaleRate(data.mrp, data.units_per_purchase_unit), sales_discount_percent: discount, final_rate: finalRate, gst_percent: gst, tax_each: taxEach, bill_rate: isPriceOnly ? finalRate + taxEach : finalRate });
    });
    return () => { alive = false; };
  }, [productId, settingDiscount, isPriceOnly]);

  const add = async () => {
    if (!supabase || !productId || Number(qty) <= 0) {
      notify("Select medicine and quantity");
      return;
    }
    const { data, error } = await supabase.from("medicine_batches").select("id,batch_number,expiry_date,current_stock,selling_rate,mrp,gst_percent,units_per_purchase_unit,sales_discount_percent").eq("product_id", productId).gt("current_stock", 0).gte("expiry_date", todayInput()).order("expiry_date", { ascending: true }).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (error || !data) {
      notify(error?.message || "No FEFO stock available");
      return;
    }
    if (Number(data.current_stock) < Number(qty)) {
      notify(`Only ${data.current_stock} available in FEFO batch`);
      return;
    }
    const discount = data.sales_discount_percent == null ? settingDiscount : Number(data.sales_discount_percent);
    const originalRate = discountedSaleRate(data.mrp, data.units_per_purchase_unit, discount);
    setCart((items) => [...items, { ...product, ...data, product_id: productId, batch_id: data.id, qty, mrp_unit_rate: roundedSaleRate(data.mrp, data.units_per_purchase_unit), sales_discount_percent: discount, original_sales_discount_percent: discount, original_selling_rate: originalRate, selling_rate: originalRate, rate_edited: false }]);
    setProductId("");
    setProduct(null);
    setRatePreview(null);
    setQty(1);
  };

  const changeDiscount = (index: number, next: number) => {
    const value = Number(next);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      notify("Discount must be between 0 and 100");
      return;
    }
    setCart((items) => items.map((item, i) => {
      if (i !== index) return item;
      const sellingRate = discountedSaleRate(item.mrp, item.units_per_purchase_unit, value);
      const changed = Math.abs(value - Number(item.original_sales_discount_percent || 0)) > 0.001;
      return { ...item, sales_discount_percent: value, selling_rate: sellingRate, rate_edited: changed };
    }));
  };

  const save = async () => {
    if (!supabase || !cart.length) {
      notify("Add at least one medicine");
      return;
    }
    if (Number(specialDiscountPercent || 0) < 0 || Number(specialDiscountPercent || 0) > 100) {
      notify("Special discount must be between 0 and 100");
      return;
    }
    setSaving(true);
    const invoice = `V2-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const hasRateEdit = cart.some((item) => item.rate_edited) || Number(specialDiscountPercent || 0) > 0;
    const pharmacyRevenue = Math.max(0, medicine + tax - specialDiscountAmount);
    const { data: sale, error } = await supabase.from("sales").insert({
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
      await supabase.from("sale_items").insert({ organization_id: profile.organization_id, sale_id: sale.id, product_id: item.product_id, batch_id: item.batch_id, quantity: item.qty, unit_rate: item.selling_rate, original_unit_rate: item.original_selling_rate || item.selling_rate, rate_edited: !!item.rate_edited, mrp: item.mrp, mrp_unit_rate: item.mrp_unit_rate, original_sales_discount_percent: item.original_sales_discount_percent, sales_discount_percent: item.sales_discount_percent, gst_percent: item.gst_percent || 0, line_total: Number(item.selling_rate) * Number(item.qty) });
      await supabase.from("medicine_batches").update({ current_stock: balance }).eq("id", item.batch_id);
      await supabase.from("stock_movements").insert({ organization_id: profile.organization_id, product_id: item.product_id, batch_id: item.batch_id, movement_type: "sale", reference_type: "sale", reference_id: sale.id, reference_number: invoice, out_quantity: item.qty, balance_quantity: balance, created_by: profile.id });
    }
    try {
      await postJournal(profile, { voucherType: "sale", entryDate: new Date().toISOString(), referenceType: "sale", referenceId: sale.id, referenceNumber: invoice, narration: `Sale bill ${invoice}`, lines: [{ ledger: "Cash", debit: total }, { ledger: "Pharmacy Sales", credit: pharmacyRevenue }] });
    } catch {}
    setSaving(false);
    setCart([]);
    setSpecialDiscountPercent(0);
    notify(`${invoice} saved`);
  };

  return <div><div className="page-head"><div><h1>Billing {cart.length > 0 && <span className="billing-head-total">{money(total)}</span>}</h1><p>Native V2 pharmacy billing with FEFO stock deduction.</p></div></div><div className="panel billing-panel"><div className="form-grid"><AsyncSelect table="patients" select="id,patient_id,name,mobile" searchColumns={["patient_id", "name", "mobile"]} label="Patient / walk-in" value={patientId} onChange={setPatientId} render={patientText}/><AsyncSelect table="products" select="id,product_id,name,gst_percent" searchColumns={["product_id", "name", "barcode", "generic_name"]} label="Medicine" value={productId} onChange={(id, row) => { setProductId(id); setProduct(row || null); setRatePreview(null); }} render={productText}/><label className="field"><span>Quantity</span><input type="number" min="1" step="1" value={qty} onChange={(event) => setQty(Number(event.currentTarget.value))}/></label><div className="field"><span>&nbsp;</span><button type="button" className="secondary" onClick={add}><Plus size={16}/> Add</button></div></div>{ratePreview && <div className="auth-message stock-preview">MRP rate: <b>{money(ratePreview.mrp_unit_rate)}</b> · Discount: <b>{Number(ratePreview.sales_discount_percent || 0)}%</b> · Final rate: <b>{money(ratePreview.final_rate)}</b> · GST: <b>{Number(ratePreview.gst_percent || 0)}% / {money(ratePreview.tax_each)}</b> · Billing rate: <b>{money(ratePreview.bill_rate)}</b></div>}{cart.length ? <><div className="data-wrap"><table className="data-table"><thead><tr><th>Medicine</th><th>Batch</th><th>Qty</th><th>MRP rate</th><th>Discount %</th><th>Final rate</th><th>GST</th><th>Total</th><th></th></tr></thead><tbody>{cart.map((item, index) => <tr key={`${item.batch_id}-${index}`}><td>{item.name}</td><td>{item.batch_number}</td><td>{item.qty}</td><td>{money(item.mrp_unit_rate)}</td><td><input className="table-qty-input" type="number" min="0" max="100" step="0.01" value={item.sales_discount_percent ?? 0} onChange={(event) => changeDiscount(index, Number(event.currentTarget.value))}/></td><td>{money(item.selling_rate)}</td><td>{Number(item.gst_percent || 0)}%</td><td>{money(Number(item.selling_rate) * Number(item.qty))}</td><td><button className="table-edit danger-btn" onClick={() => setCart((items) => items.filter((_, i) => i !== index))}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div><div className="checkout sales-checkout"><label className="field qty-field special-discount-field"><span>Additional special discount %</span><input type="number" min="0" max="100" step="0.01" value={specialDiscountPercent} onChange={(event) => setSpecialDiscountPercent(Number(event.currentTarget.value))}/></label><div className="totals-mini"><span>Medicine <b>{money(medicine)}</b></span><span>Tax <b>{money(tax)}</b></span>{Number(specialDiscountPercent || 0) > 0 && <span>Special discount <b>-{money(specialDiscountAmount)}</b></span>}<strong>Grand total <b>{money(total)}</b></strong></div><button className="primary" onClick={save} disabled={saving}>{saving ? <LoaderCircle className="spin"/> : <CheckCircle2 size={16}/>} Complete sale</button></div></> : <div className="empty"><h3>No medicines added.</h3><p>Select medicine and add quantity.</p></div>}</div></div>;
}

export function SalesWorkflow({ profile, notify }: { profile: Profile; notify: (message: string) => void }) {
  return <BillingWorkflow profile={profile} organization={null} notify={notify}/>;
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
