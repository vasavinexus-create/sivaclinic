"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { postJournal } from "../lib/accounting";
import { Profile, Row } from "../lib/types";
import { AsyncSelect, Field, FormPanel } from "./controls";

function supplierText(row: Row) {
  return `${row.supplier_id || ""} - ${row.name || ""}`;
}

function patientText(row: Row) {
  return `${row.patient_id || ""} - ${row.name || ""}${row.mobile ? ` - ${row.mobile}` : ""}`;
}

export function SupplierPaymentWorkflow({ profile, notify }: { profile: Profile; notify: (message: string) => void }) {
  const [supplierId, setSupplierId] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !supplierId) return;
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount") || 0);
    const paidOn = String(form.get("paid_on"));
    const paymentMode = String(form.get("payment_mode") || "cash");
    setSaving(true);
    const { data, error } = await supabase.from("supplier_payments").insert({ organization_id: profile.organization_id, supplier_id: supplierId, paid_on: paidOn, amount, payment_mode: paymentMode, reference_number: form.get("reference_number") || null, remarks: form.get("remarks") || null, created_by: profile.id }).select("id").single();
    if (!error && data) {
      await supabase.from("supplier_ledger").insert({ organization_id: profile.organization_id, supplier_id: supplierId, occurred_on: paidOn, particulars: form.get("remarks") || "Supplier payment", reference_type: "supplier_payment", reference_id: data.id, reference_number: form.get("reference_number") || null, debit: 0, credit: amount, created_by: profile.id });
      if (paymentMode === "cash") await supabase.from("cash_ledger").insert({ organization_id: profile.organization_id, occurred_at: `${paidOn}T00:00:00`, entry_type: "payment", category: "Supplier payment", reference_type: "supplier_payment", reference_id: data.id, amount, payment_mode: "cash", created_by: profile.id });
      try { await postJournal(profile, { voucherType: "supplier_payment", entryDate: paidOn, referenceType: "supplier_payment", referenceId: data.id, referenceNumber: String(form.get("reference_number") || ""), narration: String(form.get("remarks") || "Supplier payment"), lines: [{ ledger: "Supplier Payable", debit: amount }, { ledger: paymentMode === "cash" ? "Cash" : "Bank", credit: amount }] }); } catch {}
    }
    setSaving(false);
    notify(error?.message || "Supplier payment saved");
    if (!error) event.currentTarget.reset();
  };
  return <FormPanel title="Supplier Payments" subtitle="Native V2 supplier payment workflow" onSubmit={save}><div className="form-grid"><AsyncSelect table="suppliers" select="id,supplier_id,name,mobile" searchColumns={["supplier_id", "name", "mobile"]} label="Supplier" value={supplierId} onChange={setSupplierId} render={supplierText}/><Field name="paid_on" label="Date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)}/><Field name="amount" label="Amount" type="number" required/><label className="field"><span>Payment mode <b>*</b></span><select name="payment_mode" required defaultValue="cash"><option value="cash">Cash</option><option value="bank">Bank</option><option value="upi">UPI</option><option value="card">Card</option></select></label><Field name="reference_number" label="Reference number"/><Field name="remarks" label="Remarks"/></div><div className="form-actions"><button className="primary" disabled={saving}>{saving ? <LoaderCircle className="spin"/> : <CheckCircle2 size={16}/>} Save payment</button></div></FormPanel>;
}

export function InpatientPaymentWorkflow({ profile, notify }: { profile: Profile; notify: (message: string) => void }) {
  const [patientId, setPatientId] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !patientId) return;
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount") || 0);
    const paidOn = String(form.get("paid_on"));
    const mode = String(form.get("payment_mode") || "cash");
    setSaving(true);
    const { data, error } = await supabase.from("payments").insert({ organization_id: profile.organization_id, patient_id: patientId, paid_at: `${paidOn}T00:00:00`, amount, mode, reference_number: form.get("reference_number") || null, created_by: profile.id }).select("id").single();
    if (!error && data) {
      await supabase.from("patient_ledger").insert({ organization_id: profile.organization_id, patient_id: patientId, occurred_on: paidOn, particulars: "Inpatient payment", reference_type: "inpatient_payment", reference_id: data.id, reference_number: form.get("reference_number") || null, debit: 0, credit: amount, created_by: profile.id });
      if (mode === "cash") await supabase.from("cash_ledger").insert({ organization_id: profile.organization_id, occurred_at: `${paidOn}T00:00:00`, entry_type: "receipt", category: "Inpatient payment", reference_type: "inpatient_payment", reference_id: data.id, amount, payment_mode: "cash", created_by: profile.id });
      try { await postJournal(profile, { voucherType: "inpatient_payment", entryDate: paidOn, referenceType: "inpatient_payment", referenceId: data.id, referenceNumber: String(form.get("reference_number") || ""), narration: "Inpatient payment", lines: [{ ledger: mode === "cash" ? "Cash" : "Bank", debit: amount }, { ledger: "Patient Receivable", credit: amount }] }); } catch {}
    }
    setSaving(false);
    notify(error?.message || "Inpatient payment saved");
    if (!error) event.currentTarget.reset();
  };
  return <FormPanel title="Inpatient Payment" subtitle="Native V2 patient payment workflow" onSubmit={save}><div className="form-grid"><AsyncSelect table="patients" select="id,patient_id,name,mobile" searchColumns={["patient_id", "name", "mobile"]} label="Patient" value={patientId} onChange={setPatientId} render={patientText}/><Field name="paid_on" label="Date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)}/><Field name="amount" label="Amount" type="number" required/><label className="field"><span>Payment mode <b>*</b></span><select name="payment_mode" required defaultValue="cash"><option value="cash">Cash</option><option value="bank">Bank</option><option value="upi">UPI</option><option value="card">Card</option></select></label><Field name="reference_number" label="Reference number"/></div><div className="form-actions"><button className="primary" disabled={saving}>{saving ? <LoaderCircle className="spin"/> : <CheckCircle2 size={16}/>} Save payment</button></div></FormPanel>;
}
