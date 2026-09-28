"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { canDeleteBill, cancelBill } from "../../../lib/bill-cancellation";
import { money } from "../lib/format";
import { postJournal } from "../lib/accounting";
import { Profile, Row } from "../lib/types";
import { AsyncSelect, Field } from "./controls";

function supplierText(row: Row) {
  return `${row.supplier_id || ""} - ${row.name || ""}`;
}

function productText(row: Row) {
  return `${row.product_id || ""} - ${row.name || ""}`;
}

export function PurchaseWorkflow({ profile, notify }: { profile: Profile; notify: (message: string) => void }) {
  const [supplierId, setSupplierId] = useState("");
  const [productId, setProductId] = useState("");
  const [product, setProduct] = useState<Row | null>(null);
  const [entry, setEntry] = useState({ units_per_purchase_unit: 1, mrp: 0, sales_discount_percent: "" });
  const [items, setItems] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const total = items.reduce((sum, item) => sum + Number(item.line_total), 0);

  const addItem = (form: HTMLFormElement) => {
    const data = new FormData(form);
    if (!productId || !product) {
      notify("Select medicine");
      return;
    }
    const qty = Number(data.get("quantity") || 0);
    const free = Number(data.get("free_quantity") || 0);
    const units = Number(data.get("units_per_purchase_unit") || 1);
    const rate = Number(data.get("purchase_rate") || 0);
    const gst = Number(data.get("gst_percent") || 0);
    const discount = Number(data.get("discount") || 0);
    const salesDiscount = data.get("sales_discount_percent") === "" || data.get("sales_discount_percent") == null ? null : Number(data.get("sales_discount_percent"));
    const taxable = qty * rate - discount;
    const lineTotal = taxable + taxable * gst / 100;
    if (!data.get("batch_number") || !data.get("expiry_date") || qty <= 0 || rate <= 0) {
      notify("Enter batch, expiry, qty and rate");
      return;
    }
    setItems((rows) => [...rows, { product_id: productId, product_name: product.name, product_code: product.product_id, batch_number: data.get("batch_number"), expiry_date: data.get("expiry_date"), quantity: qty, free_quantity: free, units_per_purchase_unit: units, stock_qty: (qty + free) * units, purchase_rate: rate, purchase_rate_per_unit: rate / units, sales_discount_percent: salesDiscount, selling_rate: Number(data.get("mrp") || 0) / units, mrp: Number(data.get("mrp") || 0), gst_percent: gst, discount, line_total: lineTotal }]);
    setProductId("");
    setProduct(null);
    setEntry({ units_per_purchase_unit: 1, mrp: 0, sales_discount_percent: "" });
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supplierId || !items.length) {
      notify("Select supplier and add medicines");
      return;
    }
    const form = new FormData(event.currentTarget);
    setSaving(true);
    
    try {
      const payload = {
        supplier_id: supplierId,
        invoice_date: String(form.get("invoice_date")),
        invoice_number: String(form.get("supplier_invoice_no") || ""),
        amount_paid: Number(form.get("amount_paid") || 0),
        items: items.map(item => ({
          product_id: item.product_id,
          batch_number: String(item.batch_number),
          expiry_date: String(item.expiry_date) || null,
          qty: item.quantity,
          free_qty: item.free_quantity,
          mrp: item.mrp,
          purchase_rate: item.purchase_rate,
          selling_rate: item.selling_rate || 0,
          sales_discount_percent: item.sales_discount_percent,
          gst_percent: item.gst_percent,
        }))
      };

      const res = await fetch("/api/v2/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Purchase save failed");

      setSaving(false);
      setItems([]);
      notify(`${result.purchase_no} saved`);
      event.currentTarget.reset();
    } catch (e: any) {
      setSaving(false);
      notify(e.message || "Purchase save failed");
    }
  };

  return <div><div className="page-head"><div><h1>New Purchase</h1><p>Native V2 purchase workflow with batch and stock creation.</p></div></div><div className="panel"><form onSubmit={save}><div className="form-grid"><AsyncSelect table="suppliers" select="id,supplier_id,name,mobile" searchColumns={["supplier_id", "name", "mobile"]} label="Supplier" value={supplierId} onChange={setSupplierId} render={supplierText}/><Field name="supplier_invoice_no" label="Supplier invoice" required/><Field name="invoice_date" label="Invoice date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)}/><Field name="amount_paid" label="Amount paid" type="number"/></div><div className="section-label">ADD MEDICINE</div><div className="form-grid"><AsyncSelect table="products" select="id,product_id,name,mrp,default_units_per_purchase_unit" searchColumns={["product_id", "name", "barcode", "generic_name"]} label="Medicine" value={productId} onChange={(id, row) => { const units = Number(row?.default_units_per_purchase_unit || 1) || 1; const mrp = Number(row?.mrp || 0); setProductId(id); setProduct(row || null); setEntry({ units_per_purchase_unit: units, mrp, sales_discount_percent: "" }); }} render={productText}/><Field name="batch_number" label="Batch" required/><Field name="expiry_date" label="Expiry" type="date" required/><Field name="quantity" label="Qty" type="number" required/><Field name="free_quantity" label="Free" type="number"/><Field name="units_per_purchase_unit" label="Units / pack" type="number" value={entry.units_per_purchase_unit} onChange={(event) => { const units = event.currentTarget.value; setEntry((current) => ({ ...current, units_per_purchase_unit: units })); }}/><Field name="purchase_rate" label="Purchase rate / pack" type="number" required/><Field name="discount" label="Discount" type="number"/><Field name="gst_percent" label="GST %" type="number"/><Field name="mrp" label="MRP" type="number" value={entry.mrp} onChange={(event) => { const mrp = event.currentTarget.value; setEntry((current) => ({ ...current, mrp })); }}/><Field name="sales_discount_percent" label="Discount %" type="number" value={entry.sales_discount_percent} onChange={(event) => setEntry((current) => ({ ...current, sales_discount_percent: event.currentTarget.value }))}/></div><button type="button" className="secondary" onClick={(event) => addItem((event.currentTarget.form as HTMLFormElement))}><Plus size={16}/> Add medicine</button>{items.length > 0 && <div className="data-wrap"><table className="data-table"><thead><tr><th>Medicine</th><th>Batch</th><th>Stock</th><th>Rate</th><th>Total</th><th></th></tr></thead><tbody>{items.map((item, index) => <tr key={`${item.product_id}-${index}`}><td>{item.product_name}</td><td>{item.batch_number}</td><td>{item.stock_qty}</td><td>{money(item.purchase_rate)}</td><td>{money(item.line_total)}</td><td><button type="button" className="table-edit danger-btn" onClick={() => setItems((rows) => rows.filter((_, i) => i !== index))}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>}<div className="checkout"><strong>Total {money(total)}</strong><button className="primary" disabled={saving}>{saving ? <LoaderCircle className="spin"/> : <CheckCircle2 size={16}/>} Save purchase</button></div></form></div></div>;
}

export function PurchaseHistoryWorkflow({ profile, notify }: { profile: Profile; notify: (message: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const load = () => {
    if (!supabase) return;
    setLoading(true);
    supabase.from("purchases").select("id,purchase_no,supplier_invoice_no,invoice_date,invoice_total,amount_paid,balance_payable,status,supplier:suppliers(name),purchase_items(id,product_id,batch_id,quantity,free_quantity,product:products(name),batch:medicine_batches(current_stock))").order("invoice_date", { ascending: false }).limit(200).then(({ data }) => { setRows(data || []); setLoading(false); });
  };
  useEffect(load, []);
  const cancel = async (row: Row) => {
    if (!canDeleteBill(profile.role, row.invoice_date, row.status)) { notify("Only admin can delete bills from another day"); return; }
    const reason = window.prompt(`Reason for deleting purchase ${row.purchase_no}`);
    if (reason === null) return;
    try {
      await cancelBill("purchase", row.id, reason);
      notify(`${row.purchase_no} cancelled; stock and accounts corrected. Pending admin audit.`);
      load();
    } catch (error) { notify(error instanceof Error ? error.message : "Bill cancellation failed"); }
  };

  return <div><div className="page-head"><div><h1>Purchase History</h1><p>Native V2 purchase history with cancellation audit.</p></div></div><div className="panel">{loading ? <div className="loading-panel">Loading purchases...</div> : rows.length ? <div className="data-wrap"><table className="data-table"><thead><tr><th>Purchase</th><th>Date</th><th>Supplier</th><th>Invoice</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.purchase_no}</td><td>{row.invoice_date}</td><td>{row.supplier?.name}</td><td>{row.supplier_invoice_no}</td><td>{money(row.invoice_total)}</td><td>{money(row.amount_paid)}</td><td>{money(row.status === "cancelled" ? 0 : row.balance_payable)}</td><td>{row.status}</td><td>{canDeleteBill(profile.role, row.invoice_date, row.status) ? <button className="table-edit danger-btn" onClick={() => cancel(row)}><Trash2 size={14}/> Cancel</button> : "-"}</td></tr>)}</tbody></table></div> : <div className="empty"><h3>No purchases found.</h3><p>Purchase bills will appear here.</p></div>}</div></div>;
}
