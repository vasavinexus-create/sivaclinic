"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { fmtDate, money } from "../lib/format";
import { postJournal } from "../lib/accounting";
import { Profile, Row } from "../lib/types";

export function SalesWorkflow({ profile, notify }: { profile: Profile; notify: (message: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const load = () => {
    if (!supabase) return;
    setLoading(true);
    supabase.from("sales").select("id,invoice_no,sold_at,grand_total,pharmacy_revenue,doctor_fee,payment_mode,status,sale_type,patient:patients(patient_id,name,mobile),sale_items(id,product_id,batch_id,quantity,batch:medicine_batches(current_stock))").order("sold_at", { ascending: false }).limit(200).then(({ data }) => {
      setRows(data || []);
      setLoading(false);
    });
  };
  useEffect(load, []);

  const cancelSale = async (sale: Row) => {
    if (!supabase || sale.status === "cancelled") return;
    const reason = window.prompt(`Reason for deleting ${sale.invoice_no}`) || "";
    const { error: auditError } = await supabase.from("deleted_sales_audit").insert({ organization_id: profile.organization_id, sale_id: sale.id, invoice_no: sale.invoice_no, bill_date: sale.sold_at, deleted_reason: reason, bill_snapshot: sale, deleted_by: profile.id });
    if (auditError) {
      notify(auditError.message);
      return;
    }
    for (const item of sale.sale_items || []) {
      const qty = Number(item.quantity || 0);
      const balance = Number(item.batch?.current_stock || 0) + qty;
      await supabase.from("medicine_batches").update({ current_stock: balance }).eq("id", item.batch_id);
      await supabase.from("stock_movements").insert({ organization_id: profile.organization_id, product_id: item.product_id, batch_id: item.batch_id, movement_type: "adjustment_in", reference_type: "sale_delete", reference_id: sale.id, reference_number: sale.invoice_no, in_quantity: qty, balance_quantity: balance, created_by: profile.id });
    }
    try { await postJournal(profile, { voucherType: "sale_cancel", entryDate: new Date().toISOString(), referenceType: "sale_delete", referenceId: sale.id, referenceNumber: sale.invoice_no, narration: `Cancelled sale bill ${sale.invoice_no}`, lines: [{ ledger: "Pharmacy Sales", debit: Number(sale.pharmacy_revenue || 0) }, { ledger: "Doctor Fee Income", debit: Number(sale.doctor_fee || 0) }, { ledger: "Cash", credit: Number(sale.grand_total || 0) }] }); } catch {}
    const { error } = await supabase.from("sales").update({ status: "cancelled", cancellation_reason: reason || "Deleted bill" }).eq("id", sale.id);
    notify(error?.message || `${sale.invoice_no} cancelled and audited`);
    load();
  };

  return <div><div className="page-head"><div><h1>Sales</h1><p>Native V2 sales register with cancellation audit and stock reversal.</p></div></div><div className="panel">{loading ? <div className="loading-panel">Loading sales...</div> : rows.length ? <div className="data-wrap"><table className="data-table"><thead><tr><th>Invoice</th><th>Date</th><th>Patient</th><th>Type</th><th>Total</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map((sale) => <tr key={sale.id}><td>{sale.invoice_no}</td><td>{fmtDate(sale.sold_at)}</td><td>{sale.patient?.name || "Walk-in"}</td><td>{sale.sale_type || "outpatient"}</td><td>{money(sale.grand_total)}</td><td>{sale.status}</td><td>{sale.status !== "cancelled" ? <button className="table-edit danger-btn" onClick={() => cancelSale(sale)}><Trash2 size={14}/> Cancel</button> : "-"}</td></tr>)}</tbody></table></div> : <div className="empty"><h3>No sales found.</h3><p>Completed sales will appear here.</p></div>}</div></div>;
}
