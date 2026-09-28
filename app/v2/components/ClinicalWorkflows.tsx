"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, Camera, Paperclip, X } from "lucide-react";
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
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [viewer, setViewer] = useState<{ images: Array<{ src: string; name: string }>; index: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number; startX: number; startY: number } | null>(null);

  useEffect(() => {
    if (!patientId || !supabase) {
      setRows([]);
      setUrls({});
      return;
    }
    setLoading(true);
    supabase.from("consultations").select("id,visited_at,symptoms,diagnosis,clinical_notes,prescription_notes,follow_up_date,doctor_fee,doctor:doctors(name),prescription_attachments(id,storage_path,file_name,content_type)").eq("patient_id", patientId).order("visited_at", { ascending: false }).limit(100).then(async ({ data }) => {
      const records = data || [];
      setRows(records);
      const attachments = records.flatMap((r) => r.prescription_attachments || []);
      const pairs = await Promise.all(attachments.map(async (a: Row) => {
        const { data: signed } = await supabase!.storage.from("prescriptions").createSignedUrl(a.storage_path, 3600);
        return [a.id, signed?.signedUrl || ""];
      }));
      setUrls(Object.fromEntries(pairs));
      setLoading(false);
    });
  }, [patientId]);

  const historyImages = rows.flatMap((r) => (r.prescription_attachments || []).filter((a: Row) => a.content_type?.startsWith("image/")).map((a: Row) => ({ id: a.id, src: urls[a.id], name: a.file_name }))).filter((x) => x.src);
  
  const resetViewerMotion = () => { setZoom(1); setPan({ x: 0, y: 0 }); setDrag(null); };
  const openViewer = (id: string) => { const index = Math.max(0, historyImages.findIndex((x) => x.id === id)); setViewer({ images: historyImages, index }); resetViewerMotion(); };
  const closeViewer = () => { setViewer(null); setDrag(null); };
  const moveViewer = (dir: number) => { if (!viewer) return; const next = viewer.index + dir; if (next >= 0 && next < viewer.images.length) { setViewer({ ...viewer, index: next }); resetViewerMotion(); } };
  const changeZoom = (newZoom: number) => { setZoom(Math.max(0.5, Math.min(newZoom, 4))); if (newZoom <= 1) setPan({ x: 0, y: 0 }); };
  const activeImage = viewer ? viewer.images[viewer.index] : null;

  return (
    <>
      <div className="panel history-list">
        <h2 className="panel-title">Patient history</h2>
        {loading ? (
          <div className="loading-panel"><LoaderCircle className="spin"/> Loading history...</div>
        ) : rows.length ? (
          <div className="timeline">
            {rows.map((row) => (
              <div className="timeline-item" key={row.id}>
                <span>{fmtDate(row.visited_at)}</span>
                <div>
                  <h3>{row.doctor?.name || "Doctor"} · {money(row.doctor_fee)}</h3>
                  <p><b>Symptoms:</b> {row.symptoms || "-"}</p>
                  <p><b>Diagnosis:</b> {row.diagnosis || "-"}</p>
                  <p><b>Notes:</b> {row.clinical_notes || "-"}</p>
                  <p><b>Prescription:</b> {row.prescription_notes || "-"}</p>
                  
                  {row.prescription_attachments?.length > 0 && (
                    <div className="prescription-gallery full-images">
                      {row.prescription_attachments.map((a: Row) => a.content_type?.startsWith("image/") ? (
                        <button type="button" className="prescription-image-full image-open" key={a.id} onClick={() => openViewer(a.id)}>
                          <img src={urls[a.id]} alt={a.file_name}/>
                          <span>{a.file_name}</span>
                        </button>
                      ) : (
                        <a className="prescription-file" key={a.id} href={urls[a.id]} target="_blank" rel="noreferrer">
                          <Paperclip/>
                          <span>{a.file_name}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <h3>No history found.</h3>
            <p>Select a patient or add a consultation.</p>
          </div>
        )}
      </div>

      {viewer && activeImage && (
        <div className="image-viewer" role="dialog" aria-modal="true" aria-label={activeImage.name}>
          <div className="image-viewer-bar">
            <strong>{activeImage.name}</strong>
            <div>
              <button type="button" onClick={() => moveViewer(-1)}>←</button>
              <span>{viewer.index + 1}/{viewer.images.length}</span>
              <button type="button" onClick={() => moveViewer(1)}>→</button>
              <button type="button" onClick={() => changeZoom(zoom - 0.5)}>-</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => changeZoom(zoom + 0.5)}>+</button>
              <button type="button" onClick={closeViewer}><X size={18}/></button>
            </div>
          </div>
          <div className="image-stage" onDoubleClick={() => changeZoom(zoom === 1 ? 2 : 1)} onPointerDown={e => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setDrag({ x: e.clientX, y: e.clientY, startX: pan.x, startY: pan.y }); }} onPointerMove={e => { if (drag && zoom > 1) setPan({ x: drag.startX + e.clientX - drag.x, y: drag.startY + e.clientY - drag.y }); }} onPointerUp={e => { if (drag && zoom === 1) { const dx = e.clientX - drag.x; if (Math.abs(dx) > 60) moveViewer(dx < 0 ? 1 : -1); } setDrag(null); }} onPointerCancel={() => setDrag(null)}>
            <button type="button" className="image-nav prev" onClick={() => moveViewer(-1)}>←</button>
            <img src={activeImage.src} alt={activeImage.name} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} draggable={false}/>
            <button type="button" className="image-nav next" onClick={() => moveViewer(1)}>→</button>
          </div>
          <div className="image-viewer-help">Swipe left/right for next image. Double tap to zoom. Drag image after zoom.</div>
        </div>
      )}
    </>
  );
}

export function ConsultationWorkflow({ profile, notify, title = "Consultation", subtitle = "Native V2 consultation workflow with database patient and doctor search", hideNotes = false }: { profile: Profile; notify: (message: string) => void; title?: string; subtitle?: string; hideNotes?: boolean }) {
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [doctorFee, setDoctorFee] = useState("");
  const [doctors, setDoctors] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedImageFiles, setSelectedImageFiles] = useState<File[]>([]);
  const assignedDoctor = doctors.find((doctor) => doctor.profile_id === profile.id) || doctors.find((doctor) => String(doctor.name || "").trim().toLowerCase() === String(profile.full_name || "").trim().toLowerCase());
  const doctorLocked = profile.role === "doctor" && Boolean(assignedDoctor);
  useEffect(() => {
    if (!supabase) return;
    supabase.from("doctors").select("id,doctor_id,name,mobile,specialization,profile_id,default_fee").order("name").limit(500).then(({ data }) => setDoctors(data || []));
  }, []);
  useEffect(() => {
    if (assignedDoctor) setDoctorId(assignedDoctor.id);
  }, [assignedDoctor]);
  useEffect(() => {
    const selected = doctors.find((doctor) => doctor.id === doctorId);
    if (selected) setDoctorFee(String(Number(selected.default_fee || 0)));
  }, [doctorId, doctors]);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!patientId || !doctorId) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    try {
      const payload = {
        patient_id: patientId,
        doctor_id: doctorId,
        symptoms: form.get("symptoms") || null,
        diagnosis: form.get("diagnosis") || null,
        clinical_notes: form.get("clinical_notes") || null,
        prescription_notes: form.get("prescription_notes") || null,
        follow_up_date: form.get("follow_up_date") || null,
        doctor_fee: Number(doctorFee || 0),
      };

      const { data: { session } } = await supabase!.auth.getSession();
      const res = await fetch("/api/v2/consultations", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(session ? { "Authorization": `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to save consultation");

      let uploaded = 0;
      if (selectedImageFiles.length > 0) {
        notify(`Consultation saved. Uploading ${selectedImageFiles.length} images...`);
        for (const file of selectedImageFiles) {
          const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
          const path = `${profile.organization_id}/${patientId}/${result.data.id}/${Date.now()}-${safe}`;
          const { error: uploadError } = await supabase!.storage.from("prescriptions").upload(path, file, { contentType: file.type, upsert: false });
          if (uploadError) { notify(`Failed to upload ${file.name}: ${uploadError.message}`); continue; }
          const { error: metaError } = await supabase!.from("prescription_attachments").insert({
            organization_id: profile.organization_id,
            patient_id: patientId,
            consultation_id: result.data.id,
            storage_path: path,
            file_name: file.name,
            content_type: file.type,
            size_bytes: file.size,
            uploaded_by: profile.id
          });
          if (!metaError) uploaded++;
        }
      }

      notify(`Consultation saved${uploaded > 0 ? ` with ${uploaded} images` : ""}`);
      formElement.reset();
      setSelectedImageFiles([]);
    } catch (e: any) {
      notify(e.message || "An error occurred");
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <FormPanel title={title} subtitle={subtitle} onSubmit={save}>
        <div className="form-grid">
          <AsyncSelect table="patients" select="id,patient_id,name,mobile" searchColumns={["patient_id", "name", "mobile"]} label="Patient" value={patientId} onChange={setPatientId} render={patientText}/>
          {doctorLocked ? (
            <Field name="doctor_display" label="Doctor" value={doctorText(assignedDoctor!)} readOnly/>
          ) : (
            <AsyncSelect table="doctors" select="id,doctor_id,name,mobile,specialization,default_fee" searchColumns={["doctor_id", "name", "mobile", "specialization"]} label="Doctor" value={doctorId} onChange={(id, row) => { setDoctorId(id); if (row) setDoctorFee(String(Number(row.default_fee || 0))); }} render={doctorText}/>
          )}
          <Field name="doctor_fee" label="Doctor fee" type="number" required value={doctorFee} onChange={(event) => setDoctorFee(event.currentTarget.value)}/>
          <Field name="follow_up_date" label="Follow-up date" type="date"/>
          {!hideNotes && (
            <>
              <Field name="symptoms" label="Symptoms"/>
              <Field name="diagnosis" label="Diagnosis"/>
            </>
          )}
        </div>
        
        {!hideNotes && (
          <>
            <Field name="clinical_notes" label="Clinical notes" textarea/>
            <Field name="prescription_notes" label="Prescription notes" textarea/>
          </>
        )}

        <div className="prescription-actions" style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
          <label className="prescription-action" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px', background: '#f8faf9', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', textAlign: 'center' }}>
            <Camera size={22} style={{ margin: '0 auto 8px' }}/>
            <strong>Take photo</strong>
            <span style={{ fontSize: '12px', color: '#64748b' }}>Press to add camera photo</span>
            <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e=>{const added=Array.from(e.target.files||[]);setSelectedImageFiles(current=>[...current,...added]);e.target.value=""}}/>
          </label>
          <label className="prescription-action" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px', background: '#f8faf9', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', textAlign: 'center' }}>
            <Paperclip size={22} style={{ margin: '0 auto 8px' }}/>
            <strong>Choose images</strong>
            <span style={{ fontSize: '12px', color: '#64748b' }}>Select multiple images</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: 'none' }} onChange={e=>{const added=Array.from(e.target.files||[]);setSelectedImageFiles(current=>[...current,...added]);e.target.value=""}}/>
          </label>
        </div>
        
        {selectedImageFiles.length > 0 && (
          <div className="selected-images" style={{ marginBottom: '20px', padding: '12px', background: '#eef2ff', borderRadius: '8px' }}>
            <strong>{selectedImageFiles.length} image{selectedImageFiles.length===1?"":"s"} ready to upload</strong>
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {selectedImageFiles.map((file,index)=><span key={`${file.name}-${file.lastModified}-${index}`} style={{ fontSize: '14px' }}>{index+1}. {file.name}</span>)}
            </div>
          </div>
        )}

        <div className="form-actions">
          <button className="primary" disabled={saving}>{saving ? <LoaderCircle className="spin"/> : <CheckCircle2 size={16}/>} Save consultation</button>
        </div>
      </FormPanel>
      {patientId && <HistoryList patientId={patientId}/>}
    </>
  );
}

export function PatientHistoryWorkflow({ profile, notify }: { profile: Profile; notify: (message: string) => void }) {
  return <ConsultationWorkflow profile={profile} notify={notify} title="Patient History" subtitle="Review patient timeline and attach images" hideNotes={true}/>;
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
