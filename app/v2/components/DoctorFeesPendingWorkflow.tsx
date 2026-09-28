"use client";

import { useState } from "react";
import { CheckCircle2, LoaderCircle, Search } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { Profile, Row } from "../lib/types";
import { usePagedQuery } from "../lib/usePagedQuery";
import { getV2Module } from "../lib/modules";
import { fmtDate, money } from "../lib/format";

const module = getV2Module("doctor-fees-pending");

export function DoctorFeesPendingWorkflow({ profile, notify }: { profile: Profile; notify: (s: string) => void }) {
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const { rows, count, loading, error, reload } = usePagedQuery({
    module: module!,
    page,
    pageSize,
    search,
    filters: {},
    organizationId: profile.organization_id,
  });

  if (!module) return <div className="error-box">Module not found</div>;

  const handleCollect = async (row: Row) => {
    if (!supabase) return;
    setCollectingId(row.id);
    try {
      const { error: updateError } = await supabase
        .from("consultations")
        .update({ doctor_fee_collected: true })
        .eq("id", row.id);
      if (updateError) throw updateError;

      const today = new Date().toISOString().slice(0, 10);
      await supabase.from("cash_ledger").insert({
        organization_id: profile.organization_id,
        occurred_at: new Date().toISOString(),
        entry_type: "receipt",
        category: "Doctor Fee",
        reference_type: "consultation",
        amount: Number(row.doctor_fee || 0),
        payment_mode: "cash",
        created_by: profile.id,
      });

      const voucherNo = `REC-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}`;
      const { data: journalData } = await supabase.from("journal_entries").insert({
        organization_id: profile.organization_id,
        voucher_no: voucherNo,
        voucher_type: "receipt",
        entry_date: today,
        narration: `Doctor fee collected — ${row.patient?.name || "patient"}`,
        reference_type: "consultation",
        reference_id: row.id,
        created_by: profile.id,
      }).select("id").single();

      if (journalData) {
        await supabase.from("journal_lines").insert([
          { organization_id: profile.organization_id, journal_entry_id: journalData.id, ledger_name: "Cash", debit: Number(row.doctor_fee || 0), credit: 0, line_order: 1 },
          { organization_id: profile.organization_id, journal_entry_id: journalData.id, ledger_name: "Doctor Fee Income", debit: 0, credit: Number(row.doctor_fee || 0), line_order: 2 },
        ]);
      }

      notify(`Doctor fee of ₹${row.doctor_fee} collected`);
      reload();
    } catch (e: any) {
      notify(e.message || "Failed to collect fee");
    } finally {
      setCollectingId(null);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div><h1>{module.title}</h1><p>{module.subtitle}</p></div>
      </div>
      <div className="panel data-view">
        <div className="data-toolbar">
          <div className="search-box">
            <Search size={16} />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (setSearch(searchInput), setPage(1))}
              placeholder="Search..."
            />
            {searchInput !== search && <button onClick={() => { setSearch(searchInput); setPage(1); }} className="secondary">Search</button>}
          </div>
        </div>
        <div className="data-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {module.columns.map(([key, label]) => <th key={key}>{label}</th>)}
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {module.columns.map(([key]) => {
                    const val = key.split(".").reduce((v: any, p) => v?.[p], row);
                    return <td key={key}>{key.includes("date") || key.includes("_at") ? fmtDate(val) : key.includes("fee") ? money(val) : String(val ?? "-")}</td>;
                  })}
                  <td>
                    <button
                      className="primary"
                      style={{ padding: "4px 12px", fontSize: 13 }}
                      disabled={collectingId === row.id}
                      onClick={() => handleCollect(row)}
                    >
                      {collectingId === row.id ? <><LoaderCircle className="spin" size={13} /> Collecting…</> : <><CheckCircle2 size={13} /> Collect</>}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !loading && <tr><td colSpan={module.columns.length + 1} className="empty" style={{ textAlign: "center" }}>No pending doctor fees found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
