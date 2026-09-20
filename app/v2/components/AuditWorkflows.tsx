"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { fmtDate } from "../lib/format";
import { Profile, Row } from "../lib/types";

export function DeletedBillsAuditWorkflow({ profile, notify }: { profile: Profile; notify: (message: string) => void }) {
  const [sales, setSales] = useState<Row[]>([]);
  const [purchases, setPurchases] = useState<Row[]>([]);
  const load = () => {
    if (!supabase) return;
    Promise.all([
      supabase.from("deleted_sales_audit").select("id,invoice_no,bill_date,deleted_reason,deleted_at,audited,audited_at,deleted_by_user:profiles!deleted_sales_audit_deleted_by_fkey(full_name)").order("deleted_at", { ascending: false }).limit(100),
      supabase.from("deleted_purchases_audit").select("id,purchase_no,supplier_invoice_no,bill_date,deleted_reason,deleted_at,audited,audited_at,deleted_by_user:profiles!deleted_purchases_audit_deleted_by_fkey(full_name)").order("deleted_at", { ascending: false }).limit(100),
    ]).then(([s, p]) => { setSales(s.data || []); setPurchases(p.data || []); });
  };
  useEffect(load, []);
  const mark = async (table: string, id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from(table).update({ audited: true, audited_at: new Date().toISOString(), audited_by: profile.id }).eq("id", id);
    notify(error?.message || "Marked audited");
    load();
  };
  const render = (kind: "sale" | "purchase", rows: Row[]) => <div className="panel"><h2 className="panel-title">Deleted {kind} bills</h2>{rows.length ? <div className="data-wrap"><table className="data-table"><thead><tr><th>Bill</th><th>Date</th><th>Deleted by</th><th>Deleted at</th><th>Reason</th><th>Audit</th><th>Action</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{kind === "sale" ? row.invoice_no : `${row.purchase_no} / ${row.supplier_invoice_no}`}</td><td>{fmtDate(row.bill_date)}</td><td>{row.deleted_by_user?.full_name || "-"}</td><td>{fmtDate(row.deleted_at)}</td><td>{row.deleted_reason || "-"}</td><td>{row.audited ? "Audited" : "Not audited"}</td><td>{!row.audited && profile.role === "admin" ? <button className="table-edit" onClick={() => mark(kind === "sale" ? "deleted_sales_audit" : "deleted_purchases_audit", row.id)}><CheckCircle2 size={14}/> Mark</button> : "-"}</td></tr>)}</tbody></table></div> : <div className="empty"><h3>No deleted {kind} bills found.</h3></div>}</div>;
  return <div><div className="page-head"><div><h1>Deleted Bills Audit</h1><p>Native V2 deleted bill audit workflow.</p></div></div>{render("sale", sales)}{render("purchase", purchases)}</div>;
}
