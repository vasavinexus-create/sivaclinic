"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { supabase } from "../../../lib/supabase";
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
    setItems((rows) => [...rows, { product_id: productId, product_name: product.name, product_code: product.product_id, batch_number: data.get("batch_number"), expiry_date: data.get("expiry_date"), quantity: qty, free_quantity: free, units_per_purchase_unit: units, stock_qty: (qty + free) * units, purchase_rate: rate, purchase_rate_per_unit: rate / units, sales_discount_percent: salesDiscount, selling_rate: 0, mrp: Number(data.get("mrp") || 0), gst_percent: gst, discount, line_total: lineTotal }]);
    setProductId("");
    setProduct(null);
    setEntry({ units_per_purchase_unit: 1, mrp: 0, sales_discount_percent: "" });
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !supplierId || !items.length) {
      notify("Select supplier and add medicines");
      return;
    }
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const purchaseNo = `VP-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const invoiceDate = String(form.get("invoice_date"));
    const amountPaid = Number(form.get("amount_paid") || 0);
    const { data: purchase, error } = await supabase.from("purchases").insert({ organization_id: profile.organization_id, purchase_no: purchaseNo, supplier_id: supplierId, supplier_invoice_no: form.get("supplier_invoice_no"), invoice_date: invoiceDate, subtotal: total, tax_total: 0, invoice_total: total, amount_paid: amountPaid, status: "completed", created_by: profile.id }).select("id").single();
    if (error || !purchase) {
      setSaving(false);
      notify(error?.message || "Purchase save failed");
      return;
    }
    for (const item of items) {
      const { data: batch } = await supabase.from("medicine_batches").insert({ organization_id: profile.organization_id, product_id: item.product_id, batch_number: item.batch_number, expiry_date: item.expiry_date, supplier_id: supplierId, purchase_id: purchase.id, quantity_received: item.stock_qty, current_stock: item.stock_qty, purchase_rate: item.purchase_rate_per_unit, mrp: item.mrp, selling_rate: item.selling_rate, sales_discount_percent: item.sales_discount_percent, gst_percent: item.gst_percent }).select("id").single();
      if (!batch) continue;
      await supabase.from("purchase_items").insert({ organization_id: profile.organization_id, purchase_id: purchase.id, product_id: item.product_id, batch_id: batch.id, quantity: item.quantity, free_quantity: item.free_quantity, rate: item.purchase_rate, gst_percent: item.gst_percent, discount: item.discount, line_total: item.line_total });
      await supabase.from("stock_movements").insert({ organization_id: profile.organization_id, product_id: item.product_id, batch_id: batch.id, movement_type: "purchase", reference_type: "purchase", reference_id: purchase.id, reference_number: purchaseNo, in_quantity: item.stock_qty, balance_quantity: item.stock_qty, created_by: profile.id });
    }
    await supabase.from("supplier_ledger").insert({ organization_id: profile.organization_id, supplier_id: supplierId, occurred_on: invoiceDate, particulars: `Purchase bill ${purchaseNo}`, reference_type: "purchase", reference_id: purchase.id, reference_number: purchaseNo, debit: total, credit: amountPaid, created_by: profile.id });
    try {
      await postJournal(profile, { voucherType: "purchase", entryDate: invoiceDate, referenceType: "purchase", referenceId: purchase.id, referenceNumber: purchaseNo, narration: `Purchase bill ${purchaseNo}`, lines: [{ ledger: "Purchase", debit: total }, { ledger: amountPaid ? "Cash" : "Supplier Payable", credit: total }] });
    } catch {}
    setSaving(false);
    setItems([]);
    notify(`${purchaseNo} saved`);
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
    if (!supabase || row.status === "cancelled") return;
    for (const item of row.purchase_items || []) {
      const qty = Number(item.quantity || 0) + Number(item.free_quantity || 0);
      if (Number(item.batch?.current_stock || 0) < qty) {
        notify(`Cannot cancel ${row.purchase_no}: stock from ${item.product?.name || "item"} already sold`);
        return;
      }
    }
    const reason = window.prompt(`Reason for deleting purchase ${row.purchase_no}`) || "";
    const { error: auditError } = await supabase.from("deleted_purchases_audit").insert({ organization_id: profile.organization_id, purchase_id: row.id, purchase_no: row.purchase_no, supplier_invoice_no: row.supplier_invoice_no, bill_date: row.invoice_date, deleted_reason: reason, bill_snapshot: row, deleted_by: profile.id });
    if (auditError) {
      notify(auditError.message);
      return;
    }
    for (const item of row.purchase_items || []) {
      const qty = Number(item.quantity || 0) + Number(item.free_quantity || 0);
      const balance = Number(item.batch?.current_stock || 0) - qty;
      await supabase.from("medicine_batches").update({ current_stock: balance }).eq("id", item.batch_id);
      await supabase.from("stock_movements").insert({ organization_id: profile.organization_id, product_id: item.product_id, batch_id: item.batch_id, movement_type: "adjustment_out", reference_type: "purchase_delete", reference_id: row.id, reference_number: row.purchase_no, out_quantity: qty, balance_quantity: balance, created_by: profile.id });
    }
    try { await postJournal(profile, { voucherType: "purchase_cancel", entryDate: new Date().toISOString(), referenceType: "purchase_delete", referenceId: row.id, referenceNumber: row.purchase_no, narration: `Cancelled purchase bill ${row.purchase_no}`, lines: [{ ledger: "Supplier Payable", debit: Number(row.balance_payable || 0) }, { ledger: "Cash", debit: Number(row.amount_paid || 0) }, { ledger: "Inventory Stock", credit: Number(row.invoice_total || 0) }] }); } catch {}
    const { error } = await supabase.from("purchases").update({ status: "cancelled" }).eq("id", row.id);
    notify(error?.message || `${row.purchase_no} cancelled and audited`);
    load();
  };
  return <div><div className="page-head"><div><h1>Purchase History</h1><p>Native V2 purchase history with cancellation audit.</p></div></div><div className="panel">{loading ? <div className="loading-panel">Loading purchases...</div> : rows.length ? <div className="data-wrap"><table className="data-table"><thead><tr><th>Purchase</th><th>Date</th><th>Supplier</th><th>Invoice</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.purchase_no}</td><td>{row.invoice_date}</td><td>{row.supplier?.name}</td><td>{row.supplier_invoice_no}</td><td>{money(row.invoice_total)}</td><td>{money(row.amount_paid)}</td><td>{money(row.balance_payable)}</td><td>{row.status}</td><td>{row.status !== "cancelled" ? <button className="table-edit danger-btn" onClick={() => cancel(row)}><Trash2 size={14}/> Cancel</button> : "-"}</td></tr>)}</tbody></table></div> : <div className="empty"><h3>No purchases found.</h3><p>Purchase bills will appear here.</p></div>}</div></div>;
}
