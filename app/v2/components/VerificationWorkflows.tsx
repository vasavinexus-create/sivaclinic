"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { fmtDate, money } from "../lib/format";
import { Profile, Row } from "../lib/types";

export function RateEditVerificationWorkflow({ profile, notify }: { profile: Profile; notify: (message: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const load = () => {
    if (!supabase) return;
    setLoading(true);
    supabase.from("sales").select("id,invoice_no,sold_at,grand_total,rate_edit_verified,patient:patients(patient_id,name,mobile),sale_items(quantity,unit_rate,original_unit_rate,rate_edited,product:products(name))").eq("has_rate_edit", true).eq("rate_edit_verified", false).order("sold_at", { ascending: false }).limit(200).then(({ data }) => {
      setRows(data || []);
      setLoading(false);
    });
  };
  useEffect(load, []);
  const verify = async (row: Row) => {
    if (!supabase) return;
    const { error } = await supabase.from("sales").update({ rate_edit_verified: true, rate_edit_verified_at: new Date().toISOString(), rate_edit_verified_by: profile.id }).eq("id", row.id);
    notify(error?.message || "Rate edit verified");
    load();
  };
  return <div><div className="page-head"><div><h1>Rate Edit Verification</h1><p>Native V2 rate edit approval workflow.</p></div></div><div className="panel">{loading ? <div className="loading-panel"><LoaderCircle className="spin"/> Loading...</div> : rows.length ? <div className="data-wrap"><table className="data-table"><thead><tr><th>Bill</th><th>Date</th><th>Patient</th><th>Total</th><th>Edited items</th><th>Action</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.invoice_no}</td><td>{fmtDate(row.sold_at)}</td><td>{row.patient?.name}</td><td>{money(row.grand_total)}</td><td>{(row.sale_items || []).filter((item: Row) => item.rate_edited).map((item: Row) => `${item.product?.name} ${money(item.original_unit_rate)} -> ${money(item.unit_rate)}`).join(", ")}</td><td><button className="table-edit" onClick={() => verify(row)}><CheckCircle2 size={14}/> Verify</button></td></tr>)}</tbody></table></div> : <div className="empty"><h3>No bills pending verification.</h3><p>Edited-rate bills will appear here.</p></div>}</div></div>;
}
