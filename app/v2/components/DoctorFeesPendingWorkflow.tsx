"use client";

import { useState } from "react";
import { CheckCircle2, LoaderCircle, Search, RefreshCw, AlertCircle, DollarSign, User } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { Profile, Row } from "../lib/types";
import { usePagedQuery } from "../lib/usePagedQuery";
import { getV2Module } from "../lib/modules";
import { fmtDate, money } from "../lib/format";

const workflowModule = getV2Module("doctor-fees-pending");

export function DoctorFeesPendingWorkflow({ profile, notify }: { profile: Profile; notify: (s: string) => void }) {
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [rowPaymentModes, setRowPaymentModes] = useState<Record<string, "cash" | "upi" | "card" | "bank">>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const { rows, count, loading, error, reload } = usePagedQuery({
    module: workflowModule!,
    page,
    pageSize,
    search,
    filters: { doctor_fee_collected: "false" },
    organizationId: profile?.organization_id,
  });

  // Strict client-side filter: only genuinely uncollected, unbilled consultations with fee > 0
  const pendingRows = rows.filter(
    (r) => !r.doctor_fee_collected && !r.doctor_fee_collected_bill_id && Number(r.doctor_fee || 0) > 0
  );

  const totalPendingAmount = pendingRows.reduce((sum, r) => sum + Number(r.doctor_fee || 0), 0);

  if (!workflowModule) return <div className="error-box">Module not found</div>;

  const handleCollect = async (row: Row) => {
    if (!supabase) return;
    const mode = rowPaymentModes[row.id] || "cash";
    setCollectingId(row.id);
    try {
      const fee = Number(row.doctor_fee || 0);
      const today = new Date().toISOString().slice(0, 10);

      const { error: updateError } = await supabase
        .from("consultations")
        .update({
          doctor_fee_collected: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("organization_id", profile.organization_id);
      if (updateError) throw updateError;

      // 1. Record receipt in cash ledger
      await supabase.from("cash_ledger").insert({
        organization_id: profile.organization_id,
        occurred_at: new Date().toISOString(),
        entry_type: "receipt",
        category: "Doctor Fee",
        reference_type: "consultation",
        reference_id: row.id,
        amount: fee,
        payment_mode: mode,
        created_by: profile.id,
      });

      // 2. Record payment
      await supabase.from("payments").insert({
        organization_id: profile.organization_id,
        patient_id: row.patient_id || null,
        amount: fee,
        mode: mode,
        created_by: profile.id,
      });

      // 3. Record accounting journal entry
      const voucherNo = `REC-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}`;
      const journalRes = await supabase
        .from("journal_entries")
        .insert({
          organization_id: profile.organization_id,
          voucher_no: voucherNo,
          voucher_type: "receipt",
          entry_date: today,
          narration: `Doctor fee collected — ${row.patient?.name || "patient"}`,
          reference_type: "consultation",
          reference_id: row.id,
          created_by: profile.id,
        })
        .select("id")
        .single();
      const journalData = journalRes?.data;

      if (journalData) {
        const debitAccount = mode === "cash" ? "Cash" : mode === "bank" ? "Bank" : "UPI / Online";
        await supabase.from("journal_lines").insert([
          {
            organization_id: profile.organization_id,
            journal_entry_id: journalData.id,
            ledger_name: debitAccount,
            debit: fee,
            credit: 0,
            line_order: 1,
          },
          {
            organization_id: profile.organization_id,
            journal_entry_id: journalData.id,
            ledger_name: "Doctor Fee Income",
            debit: 0,
            credit: fee,
            line_order: 2,
          },
        ]);
      }

      notify(`Doctor fee of ₹${fee} collected (${mode.toUpperCase()})`);
      reload();
    } catch (e: any) {
      notify(e.message || "Failed to collect fee");
    } finally {
      setCollectingId(null);
    }
  };

  return (
    <div>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1>{workflowModule.title}</h1>
          <p>{workflowModule.subtitle}</p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              borderRadius: "8px",
              padding: "8px 14px",
            }}
          >
            <span style={{ fontSize: "13px", color: "#065f46" }}>Total Pending:</span>
            <strong style={{ fontSize: "16px", color: "#047857" }}>{pendingRows.length} visit{pendingRows.length === 1 ? "" : "s"}</strong>
            <span style={{ color: "#cbd5e1" }}>|</span>
            <strong style={{ fontSize: "18px", color: "#dc2626", fontWeight: 800 }}>{money(totalPendingAmount)}</strong>
          </div>
          <button
            onClick={() => reload()}
            className="secondary"
            title="Reload pending fees"
            style={{ display: "flex", alignItems: "center", gap: "6px", height: "38px" }}
          >
            <RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      <div className="panel data-view doctor-fees-page">
        <div className="data-toolbar">
          <div className="search-box">
            <Search size={16} />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (setSearch(searchInput), setPage(1))}
              placeholder="Search patient, doctor, mobile..."
            />
            {searchInput !== search && (
              <button
                onClick={() => {
                  setSearch(searchInput);
                  setPage(1);
                }}
                className="secondary"
              >
                Search
              </button>
            )}
            {search && (
              <button
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                  setPage(1);
                }}
                className="ghost"
                style={{ padding: "4px 8px" }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="error-box" style={{ margin: "12px 16px" }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <div className="data-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Visit Date</th>
                <th>Token</th>
                <th>Patient</th>
                <th>Doctor</th>
                <th>Symptoms / Diagnosis</th>
                <th>Doctor Fee</th>
                <th>Payment Mode</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingRows.map((row) => {
                const tokenNo = row.vitals?.token_no;
                const patName = row.patient?.name || "Patient";
                const patId = row.patient?.patient_id;
                const patMobile = row.patient?.mobile;
                const patAddress = row.patient?.address;
                const docName = row.doctor?.name || "Doctor";
                const docSpec = row.doctor?.specialization;
                const fee = Number(row.doctor_fee || 0);
                const currentMode = rowPaymentModes[row.id] || "cash";

                return (
                  <tr key={row.id}>
                    <td data-label="Visit Date" style={{ whiteSpace: "nowrap" }}>
                      {fmtDate(row.visited_at || row.created_at)}
                    </td>
                    <td data-label="Token">
                      {tokenNo ? (
                        <span
                          style={{
                            background: "#e0f2fe",
                            color: "#0369a1",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: "12px",
                            fontSize: "12px",
                          }}
                        >
                          #{tokenNo}
                        </span>
                      ) : (
                        <span style={{ color: "#94a3b8" }}>-</span>
                      )}
                    </td>
                    <td data-label="Patient">
                      <div>
                        <strong style={{ fontSize: "14px", color: "#0f172a" }}>{patName}</strong>
                        {patId && (
                          <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "6px" }}>
                            ({patId})
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>
                        {patMobile && <span>{patMobile}</span>}
                        {patMobile && patAddress && <span> • </span>}
                        {patAddress && <span>{patAddress}</span>}
                      </div>
                    </td>
                    <td data-label="Doctor">
                      <div style={{ fontWeight: 600, color: "#1e293b" }}>{docName}</div>
                      {docSpec && <div style={{ fontSize: "12px", color: "#64748b" }}>{docSpec}</div>}
                    </td>
                    <td data-label="Symptoms / Diagnosis" style={{ maxWidth: "220px", fontSize: "13px" }}>
                      {row.symptoms || row.diagnosis ? (
                        <div>
                          {row.symptoms && <div><b>Sym:</b> {row.symptoms}</div>}
                          {row.diagnosis && <div><b>Diag:</b> {row.diagnosis}</div>}
                        </div>
                      ) : (
                        <span style={{ color: "#94a3b8" }}>-</span>
                      )}
                    </td>
                    <td data-label="Doctor Fee">
                      <strong style={{ fontSize: "15px", color: "#16a34a", fontWeight: 800 }}>
                        {money(fee)}
                      </strong>
                    </td>
                    <td data-label="Payment Mode">
                      <select
                        value={currentMode}
                        onChange={(e) =>
                          setRowPaymentModes((prev) => ({
                            ...prev,
                            [row.id]: e.target.value as any,
                          }))
                        }
                        style={{ padding: "4px 8px", fontSize: "13px", borderRadius: "6px" }}
                      >
                        <option value="cash">Cash</option>
                        <option value="upi">UPI</option>
                        <option value="card">Card</option>
                        <option value="bank">Bank</option>
                      </select>
                    </td>
                    <td data-label="Action">
                      <button
                        className="primary"
                        style={{ padding: "6px 14px", fontSize: "13px", whiteSpace: "nowrap" }}
                        disabled={collectingId === row.id}
                        onClick={() => handleCollect(row)}
                      >
                        {collectingId === row.id ? (
                          <>
                            <LoaderCircle className="spin" size={13} /> Collecting…
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={13} /> Collect {money(fee)}
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {pendingRows.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="empty" style={{ textAlign: "center", padding: "32px 16px" }}>
                    <CheckCircle2 size={32} color="#16a34a" style={{ margin: "0 auto 8px" }} />
                    <div style={{ fontWeight: 600, fontSize: "15px", color: "#166534" }}>
                      No pending doctor fees!
                    </div>
                    <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "13px" }}>
                      All consultation fees have been billed or collected.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
