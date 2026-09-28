"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { fmtDate, money } from "../lib/format";
import { canDeleteBill, cancelBill } from "../../../lib/bill-cancellation";
import { Profile, Row } from "../lib/types";

export function SalesWorkflow({ profile, notify }: { profile: Profile; notify: (message: string) => void }) {
  const [tab, setTab] = useState<"completed" | "cancelled">("completed");
  const [fromInput, setFromInput] = useState(() => new Date().toISOString().slice(0, 10));
  const [toInput, setToInput] = useState(() => new Date().toISOString().slice(0, 10));
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const load = () => {
    if (!supabase) return;
    setLoading(true);
    supabase.from("sales").select("id,invoice_no,sold_at,grand_total,pharmacy_revenue,doctor_fee,payment_mode,status,sale_type,patient:patients(patient_id,name,mobile),sale_items(id,product_id,batch_id,quantity,batch:medicine_batches(current_stock))").eq("status", tab).gte("sold_at", fromDate + "T00:00:00").lte("sold_at", toDate + "T23:59:59").order("sold_at", { ascending: false }).limit(200).then(({ data }) => {
      setRows(data || []);
      setLoading(false);
    });
  };
  useEffect(load, [tab, fromDate, toDate]);

  const cancelSale = async (sale: Row) => {
    if (!canDeleteBill(profile.role, sale.sold_at, sale.status)) { notify("Only admin can delete bills from another day"); return; }
    const reason = window.prompt(`Reason for deleting ${sale.invoice_no}`);
    if (reason === null) return;
    try {
      await cancelBill("sale", sale.id, reason);
      notify(`${sale.invoice_no} cancelled; stock and accounts corrected. Pending admin audit.`);
      load();
    } catch (error) { notify(error instanceof Error ? error.message : "Bill cancellation failed"); }
  };

  return <div><div className="page-head"><div><h1>Sales</h1><p>Native V2 sales register with cancellation audit and stock reversal.</p></div></div><div className="panel">
<div className="tab-row" style={{marginBottom:"16px", display: "flex", justifyContent: "space-between", alignItems: "center"}}>
  <div>
    <button className={tab==="completed"?"active":""} onClick={()=>setTab("completed")}>Completed</button>
    <button className={tab==="cancelled"?"active":""} onClick={()=>setTab("cancelled")}>Cancelled</button>
  </div>
  <form onSubmit={(e) => { e.preventDefault(); setFromDate(fromInput); setToDate(toInput); }} style={{display: "flex", gap: "8px", alignItems: "center"}}>
    <label style={{fontSize:"13px", margin:0}}>From</label>
    <input type="date" value={fromInput} onChange={(e) => setFromInput(e.target.value)} required />
    <label style={{fontSize:"13px", margin:0}}>To</label>
    <input type="date" value={toInput} onChange={(e) => setToInput(e.target.value)} required />
    <button type="submit" className="primary">Load</button>
  </form>
</div>
{loading ? <div className="loading-panel">Loading sales...</div> : rows.length ? <div className="data-wrap"><table className="data-table"><thead><tr><th>Invoice</th><th>Date</th><th>Patient</th><th>Type</th><th>Total</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map((sale) => <tr key={sale.id}><td>{sale.invoice_no}</td><td>{fmtDate(sale.sold_at)}</td><td>{sale.patient?.name || "Walk-in"}</td><td>{sale.sale_type || "outpatient"}</td><td>{money(sale.grand_total)}</td><td>{sale.status}</td><td>{tab === "completed" && canDeleteBill(profile.role, sale.sold_at, sale.status) ? <button className="table-edit danger-btn" onClick={() => cancelSale(sale)}><Trash2 size={14}/> Cancel</button> : "-"}</td></tr>)}</tbody></table></div> : <div className="empty"><h3>{tab === "completed" ? "No completed sales found." : "No cancelled sales found."}</h3><p>For the selected date.</p></div>}</div></div>;
}
