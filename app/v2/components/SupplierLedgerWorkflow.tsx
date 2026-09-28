"use client";

import { useState, useEffect } from "react";
import { AsyncSelect } from "./controls";
import { supabase } from "../../../lib/supabase";
import { Profile, SupplierLedgerEntry, Row } from "../lib/types";
import { money, fmtDate } from "../lib/format";
import { LoaderCircle } from "lucide-react";

export function SupplierLedgerWorkflow({ profile }: { profile: Profile }) {
  const [supplierId, setSupplierId] = useState("");
  const [entries, setEntries] = useState<SupplierLedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supplierId || !supabase) { setEntries([]); return; }
    setLoading(true);
    supabase.from("supplier_ledger")
      .select("*")
      .eq("supplier_id", supplierId)
      .order("occurred_on", { ascending: true })
      .then(({ data }) => {
        setEntries(data as SupplierLedgerEntry[] || []);
        setLoading(false);
      });
  }, [supplierId]);

  let balance = 0;

  return (
    <div>
      <div className="page-head">
        <div><h1>Supplier Ledger</h1><p>Running balance of supplier purchases and payments</p></div>
      </div>
      <div className="panel form-panel">
        <AsyncSelect
          table="suppliers"
          select="id,supplier_id,name"
          searchColumns={["supplier_id", "name"]}
          label="Select Supplier"
          value={supplierId}
          onChange={setSupplierId}
          render={(r: Row) => `${r.supplier_id} - ${r.name}`}
        />
      </div>
      {loading && <div className="loading-panel"><LoaderCircle className="spin"/> Loading ledger...</div>}
      {supplierId && !loading && (
        <div className="panel" style={{ marginTop: 16 }}>
          {entries.length === 0 ? <p className="empty">No ledger entries found.</p> : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Date</th><th>Particulars</th><th>Ref</th><th className="right">Debit (₹)</th><th className="right">Credit (₹)</th><th className="right">Balance (₹)</th></tr>
                </thead>
                <tbody>
                  {entries.map(entry => {
                    // Suppliers usually have credit balance, so Balance = Credit - Debit. Adjusting presentation:
                    balance += Number(entry.credit || 0) - Number(entry.debit || 0);
                    return (
                      <tr key={entry.id}>
                        <td>{fmtDate(entry.occurred_on)}</td>
                        <td>{entry.particulars}</td>
                        <td>{entry.reference_number || entry.reference_type || "-"}</td>
                        <td className="right">{money(entry.debit)}</td>
                        <td className="right">{money(entry.credit)}</td>
                        <td className="right"><strong>{money(Math.abs(balance))}</strong> {balance > 0 ? "Cr" : balance < 0 ? "Dr" : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
