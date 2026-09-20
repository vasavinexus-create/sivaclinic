"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { fmtDate, money } from "../lib/format";
import { Profile, Row } from "../lib/types";
import { AsyncSelect, Field, FormPanel } from "./controls";

function patientText(row: Row) {
  return `${row.patient_id || ""} - ${row.name || ""}${row.mobile ? ` - ${row.mobile}` : ""}`;
}

function doctorText(row: Row) {
  return `${row.doctor_id || ""} - ${row.name || ""}`;
}

function HistoryList({ patientId }: { patientId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!patientId || !supabase) {
      setRows([]);
      return;
    }
    setLoading(true);
    supabase.from("consultations").select("id,visited_at,symptoms,diagnosis,clinical_notes,prescription_notes,follow_up_date,doctor_fee,doctor:doctors(name)").eq("patient_id", patientId).order("visited_at", { ascending: false }).limit(100).then(({ data }) => {
      setRows(data || []);
      setLoading(false);
    });
  }, [patientId]);
  return <div className="panel history-list"><h2 className="panel-title">Patient history</h2>{loading ? <div className="loading-panel"><LoaderCircle className="spin"/> Loading history...</div> : rows.length ? <div className="timeline">{rows.map((row) => <div className="timeline-item" key={row.id}><span>{fmtDate(row.visited_at)}</span><div><h3>{row.doctor?.name || "Doctor"} · {money(row.doctor_fee)}</h3><p><b>Symptoms:</b> {row.symptoms || "-"}</p><p><b>Diagnosis:</b> {row.diagnosis || "-"}</p><p><b>Notes:</b> {row.clinical_notes || "-"}</p><p><b>Prescription:</b> {row.prescription_notes || "-"}</p></div></div>)}</div> : <div className="empty"><h3>No history found.</h3><p>Select a patient or add a consultation.</p></div>}</div>;
}

export function ConsultationWorkflow({ profile, notify, title = "Consultation", subtitle = "Native V2 consultation workflow with database patient and doctor search" }: { profile: Profile; notify: (message: string) => void; title?: string; subtitle?: string }) {
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !patientId || !doctorId) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const { error } = await supabase.from("consultations").insert({
      organization_id: profile.organization_id,
      patient_id: patientId,
      doctor_id: doctorId,
      symptoms: form.get("symptoms"),
      diagnosis: form.get("diagnosis"),
      clinical_notes: form.get("clinical_notes"),
      prescription_notes: form.get("prescription_notes"),
      follow_up_date: form.get("follow_up_date") || null,
      doctor_fee: Number(form.get("doctor_fee") || 0),
      created_by: profile.id,
    });
    await supabase.from("patients").update({ last_visit_at: new Date().toISOString() }).eq("id", patientId);
    setSaving(false);
    notify(error?.message || "Consultation saved");
    if (!error) event.currentTarget.reset();
  };
  return <><FormPanel title={title} subtitle={subtitle} onSubmit={save}><div className="form-grid"><AsyncSelect table="patients" select="id,patient_id,name,mobile" searchColumns={["patient_id", "name", "mobile"]} label="Patient" value={patientId} onChange={setPatientId} render={patientText}/><AsyncSelect table="doctors" select="id,doctor_id,name,mobile,specialization" searchColumns={["doctor_id", "name", "mobile", "specialization"]} label="Doctor" value={doctorId} onChange={setDoctorId} render={doctorText}/><Field name="doctor_fee" label="Doctor fee" type="number" required/><Field name="follow_up_date" label="Follow-up date" type="date"/><Field name="symptoms" label="Symptoms"/><Field name="diagnosis" label="Diagnosis"/></div><Field name="clinical_notes" label="Clinical notes" textarea/><Field name="prescription_notes" label="Prescription notes" textarea/><div className="form-actions"><button className="primary" disabled={saving}>{saving ? <LoaderCircle className="spin"/> : <CheckCircle2 size={16}/>} Save consultation</button></div></FormPanel>{patientId && <HistoryList patientId={patientId}/>}</>;
}

export function PatientHistoryWorkflow({ profile, notify }: { profile: Profile; notify: (message: string) => void }) {
  return <ConsultationWorkflow profile={profile} notify={notify} title="Patient History" subtitle="Add consultation details and review the selected patient history"/>;
}

export function FollowUpWorkflow() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    if (!supabase) return;
    supabase.from("consultations").select("id,visited_at,follow_up_date,symptoms,diagnosis,patient:patients(patient_id,name,mobile),doctor:doctors(name)").eq("follow_up_date", date).order("visited_at", { ascending: false }).limit(200).then(({ data }) => setRows(data || []));
  }, [date]);
  return <div><div className="page-head"><div><h1>Follow-up Alerts</h1><p>Native V2 follow-up workflow</p></div></div><div className="panel"><label className="field"><span>Follow-up date</span><input type="date" value={date} onChange={(event) => setDate(event.currentTarget.value)}/></label>{rows.length ? <div className="data-wrap"><table className="data-table"><thead><tr><th>Patient</th><th>Doctor</th><th>Visit</th><th>Symptoms</th><th>Diagnosis</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.patient?.name}</td><td>{row.doctor?.name}</td><td>{fmtDate(row.visited_at)}</td><td>{row.symptoms}</td><td>{row.diagnosis}</td></tr>)}</tbody></table></div> : <div className="empty"><h3>No follow-ups found.</h3><p>Change date to search.</p></div>}</div></div>;
}
