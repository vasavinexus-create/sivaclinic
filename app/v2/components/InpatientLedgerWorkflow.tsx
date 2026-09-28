"use client";

import { useState, useEffect } from "react";
import { AsyncSelect } from "./controls";
import { supabase } from "../../../lib/supabase";
import { Profile, PatientLedgerEntry, Row } from "../lib/types";
import { money, fmtDate } from "../lib/format";
import { LoaderCircle } from "lucide-react";


function PrintableLedger({ organization, patientName, patientId, mobile, entries, balance }: any) {
  return (
    <div className="print-only">
      <div className="print-header">
        <h1>{organization?.clinic_name || organization?.pharmacy_name || "CLINIC / PHARMACY"}</h1>
        <p>{organization?.address || "Address not provided"}</p>
        <p>Phone: {organization?.phone || "-"} | GST: {organization?.gst_number || "Unregistered"}</p>
      </div>

      <div className="print-details">
        <div className="patient-info">
          <strong>Patient Ledger Statement</strong><br />
          <strong>Name:</strong> {patientName || "Select a patient"}<br />
          <strong>ID:</strong> {patientId || "-"}<br />
          {mobile ? `Phone: ${mobile}` : ""}
        </div>
        <div className="invoice-info">
          <strong>Date Generated:</strong> {new Date().toLocaleString()}<br />
          <strong>Closing Balance:</strong> {balance > 0 ? `${balance.toFixed(2)} Dr` : balance < 0 ? `${Math.abs(balance).toFixed(2)} Cr` : "0.00"}
        </div>
      </div>

      <table className="print-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Particulars</th>
            <th>Ref</th>
            <th className="right">Debit</th>
            <th className="right">Credit</th>
            <th className="right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {(() => {
            let runningBalance = 0;
            return entries.map((entry: any, i: number) => {
              runningBalance += Number(entry.debit || 0) - Number(entry.credit || 0);
              return (
                <tr key={i}>
                  <td>{new Date(entry.occurred_on).toLocaleDateString()}</td>
                  <td>{entry.particulars} {entry.is_pending && "(PENDING)"}</td>
                  <td>{entry.reference_number || entry.reference_type || "-"}</td>
                  <td className="right">{Number(entry.debit || 0) > 0 ? Number(entry.debit).toFixed(2) : "-"}</td>
                  <td className="right">{Number(entry.credit || 0) > 0 ? Number(entry.credit).toFixed(2) : "-"}</td>
                  <td className="right"><strong>{Math.abs(runningBalance).toFixed(2)}</strong> {runningBalance > 0 ? "Dr" : runningBalance < 0 ? "Cr" : ""}</td>
                </tr>
              );
            });
          })()}
        </tbody>
      </table>
      
      <div className="print-footer">
        <p>This is a computer generated statement.</p>
      </div>
    </div>
  );
}

export function InpatientLedgerWorkflow({ profile }: { profile: Profile }) {
  const [patientId, setPatientId] = useState("");
  const [entries, setEntries] = useState<PatientLedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [organization, setOrganization] = useState<any>(null);
  const [patientData, setPatientData] = useState<any>(null);

  
  useEffect(() => {
    if (supabase) {
      supabase.from("organizations").select("*").eq("id", profile.organization_id).single().then(({data}) => setOrganization(data));
    }
  }, [profile.organization_id]);

  useEffect(() => {
    if (!patientId || !supabase) { setEntries([]); return; }
    setLoading(true);
    
    Promise.all([
      supabase.from("patient_ledger")
        .select("*")
        .eq("patient_id", patientId)
        .order("occurred_on", { ascending: true }),
      supabase.from("consultations")
        .select("id,visited_at,doctor_fee,created_at")
        .eq("patient_id", patientId)
        .eq("doctor_fee_collected", false)
        .gt("doctor_fee", 0)
    ]).then(([ledgerRes, consRes]) => {
      const ledger = (ledgerRes.data as any[]) || [];
      const cons = (consRes.data || []).map(c => ({
        id: c.id,
        patient_id: patientId,
        occurred_on: c.visited_at,
        particulars: "Pending Doctor Fee",
        reference_type: "Consultation",
        reference_number: c.id,
        debit: c.doctor_fee,
        credit: 0,
        created_at: c.created_at,
        is_pending: true
      }));
      
      const combined = [...ledger, ...cons].sort((a, b) => new Date(a.occurred_on).getTime() - new Date(b.occurred_on).getTime());
      setEntries(combined as any[]);
      setLoading(false);
    });
  }, [patientId]);

  let printBalance = entries.reduce((s, e) => s + Number(e.debit || 0) - Number(e.credit || 0), 0);
  let balance = 0;

  return (
    <div>
      <PrintableLedger organization={organization} patientName={patientData?.name} patientId={patientData?.patient_id} mobile={patientData?.mobile} entries={entries} balance={printBalance} />
      <div className="no-print">
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div><h1>Inpatient Ledger</h1><p>Running balance of patient charges and payments</p></div></div>
      <div className="print-hide" style={{ display: 'flex', gap: '10px' }}>
        <button className="secondary" onClick={() => window.print()} style={{ minHeight: '38px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
          Print
        </button>
        <button className="secondary" onClick={() => { alert("In the print dialog, select 'Save as PDF' as your printer."); window.print(); }} style={{ minHeight: '38px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          PDF Export
        </button>
      </div>
      <div className="panel form-panel">
        <AsyncSelect
          table="patients"
          select="id,patient_id,name,mobile"
          searchColumns={["patient_id", "name", "mobile"]}
          label="Select Patient"
          value={patientId}
          onChange={(id, row) => { setPatientId(id); setPatientData(row); }}
          render={(r: Row) => `${r.patient_id} - ${r.name} - ${r.mobile || ""}`}
        />
      </div>
      {loading && <div className="loading-panel"><LoaderCircle className="spin"/> Loading ledger...</div>}
      {patientId && !loading && (
        <div className="panel" style={{ marginTop: 16 }}>
          {entries.length === 0 ? <p className="empty">No ledger entries found.</p> : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Date</th><th>Particulars</th><th>Ref</th><th className="right">Debit (₹)</th><th className="right">Credit (₹)</th><th className="right">Balance (₹)</th></tr>
                </thead>
                <tbody>
                  {entries.map(entry => {
                    balance += Number(entry.debit || 0) - Number(entry.credit || 0);
                    return (
                      <tr key={entry.id} style={(entry as any).is_pending ? {backgroundColor: "#fff5f5"} : {}}>
                        <td>{fmtDate(entry.occurred_on)}</td>
                        <td>{entry.particulars} {(entry as any).is_pending && <span style={{fontSize:"10px", color:"#c53030", marginLeft:"8px", padding:"2px 4px", background:"#fed7d7", borderRadius:"4px"}}>PENDING</span>}</td>
                        <td>{entry.reference_number || entry.reference_type || "-"}</td>
                        <td className="right">{money(entry.debit)}</td>
                        <td className="right">{money(entry.credit)}</td>
                        <td className="right"><strong>{money(Math.abs(balance))}</strong> {balance > 0 ? "Dr" : balance < 0 ? "Cr" : ""}</td>
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
      </div>
  );
}
