"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Camera as NativeCamera, CameraDirection, CameraResultType, CameraSource } from "@capacitor/camera";
import { CheckCircle2, LoaderCircle, Camera, Paperclip, Printer, X } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { fmtDate, money } from "../lib/format";
import { Organization, Profile, Row } from "../lib/types";
import { AsyncSelect, Field, FormPanel, QuickPatientModal } from "./controls";

function patientText(row: Row) {
  return `${row.patient_id || ""} - ${row.name || ""}${row.mobile ? ` - ${row.mobile}` : ""}`;
}

function doctorText(row: Row) {
  return `${row.doctor_id || ""} - ${row.name || ""}`;
}

function HistoryList({ patientId, patientLabel, organization }: { patientId: string; patientLabel?: string; organization?: Organization | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [viewer, setViewer] = useState<{ images: Array<{ src: string; name: string }>; index: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const [printRow, setPrintRow] = useState<Row | null>(null);

  useEffect(() => {
    if (!patientId || !supabase) {
      setRows([]);
      setUrls({});
      return;
    }
    setLoading(true);
    supabase.from("consultations").select("id,visited_at,symptoms,diagnosis,clinical_notes,prescription_notes,follow_up_date,doctor_fee,doctor:doctors(name,specialization),prescription_attachments(id,storage_path,file_name,content_type)").eq("patient_id", patientId).order("visited_at", { ascending: false }).limit(100).then(async ({ data }) => {
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

  const triggerPrintPrescription = (row: Row) => {
    setPrintRow(row);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  return (
    <>
      {printRow && (
        <div className="print-only" style={{ padding: "24px", fontFamily: "sans-serif", color: "#000" }}>
          <div style={{ borderBottom: "2px solid #000", paddingBottom: "12px", marginBottom: "16px", display: "flex", justifyContent: "space-between" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "20px" }}>{organization?.clinic_name || organization?.pharmacy_name || "Siva Clinic"}</h2>
              {organization?.address && <div style={{ fontSize: "12px" }}>{organization.address}</div>}
              {organization?.phone && <div style={{ fontSize: "12px" }}>Phone: {organization.phone}</div>}
            </div>
            <div style={{ textAlign: "right", fontSize: "13px" }}>
              <strong>PRESCRIPTION</strong>
              <div>Date: {fmtDate(printRow.visited_at)}</div>
              <div>Doctor: {printRow.doctor?.name || "Doctor"}{printRow.doctor?.specialization ? ` (${printRow.doctor.specialization})` : ""}</div>
            </div>
          </div>
          <div style={{ marginBottom: "16px", fontSize: "14px" }}>
            <strong>Patient:</strong> {patientLabel || patientId}
          </div>
          {printRow.symptoms && <p style={{ fontSize: "14px" }}><strong>Symptoms:</strong> {printRow.symptoms}</p>}
          {printRow.diagnosis && <p style={{ fontSize: "14px" }}><strong>Diagnosis:</strong> {printRow.diagnosis}</p>}
          {printRow.clinical_notes && <p style={{ fontSize: "14px" }}><strong>Clinical Notes:</strong> {printRow.clinical_notes}</p>}
          <div style={{ marginTop: "20px", padding: "14px", border: "1px solid #cbd5e1", borderRadius: "6px", minHeight: "180px" }}>
            <strong style={{ fontSize: "16px", display: "block", marginBottom: "8px" }}>Rx (Prescription):</strong>
            <div style={{ whiteSpace: "pre-wrap", fontSize: "14px", lineHeight: 1.6 }}>{printRow.prescription_notes || "-"}</div>
          </div>
          {printRow.follow_up_date && (
            <div style={{ marginTop: "16px", fontSize: "13px" }}>
              <strong>Next Follow-up Date:</strong> {fmtDate(printRow.follow_up_date)}
            </div>
          )}
          <div style={{ marginTop: "48px", textAlign: "right", fontSize: "13px" }}>
            <div>___________________________</div>
            <div>Doctor&apos;s Signature</div>
          </div>
        </div>
      )}
      <div className="panel history-list no-print">
        <h2 className="panel-title">Patient history</h2>
        {loading ? (
          <div className="loading-panel"><LoaderCircle className="spin"/> Loading history...</div>
        ) : rows.length ? (
          <div className="timeline">
            {rows.map((row) => (
              <div className="timeline-item" key={row.id}>
                <span>{fmtDate(row.visited_at)}</span>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <h3 style={{ margin: 0 }}>{row.doctor?.name || "Doctor"} · {money(row.doctor_fee)}</h3>
                    <button type="button" className="table-edit" onClick={() => triggerPrintPrescription(row)}>
                      <Printer size={14}/> Print Rx
                    </button>
                  </div>
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

export function ConsultationWorkflow({ profile, organization, notify, title = "Consultation", subtitle = "Native V2 consultation workflow with database patient and doctor search", hideNotes = false }: { profile: Profile; organization?: Organization | null; notify: (message: string) => void; title?: string; subtitle?: string; hideNotes?: boolean }) {
  const [patientId, setPatientId] = useState("");
  const [patientLabel, setPatientLabel] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [doctorFee, setDoctorFee] = useState("");
  const [doctors, setDoctors] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedImageFiles, setSelectedImageFiles] = useState<File[]>([]);
  const browserCameraInput = useRef<HTMLInputElement>(null);
  const assignedDoctor = doctors.find((doctor) => doctor.profile_id === profile.id) || doctors.find((doctor) => String(doctor.name || "").trim().toLowerCase() === String(profile.full_name || "").trim().toLowerCase());
  const doctorLocked = profile.role === "doctor" && Boolean(assignedDoctor);
  useEffect(() => {
    if (!supabase) return;
    supabase.from("doctors").select("id,doctor_id,name,mobile,specialization,profile_id,default_fee").eq("organization_id", profile.organization_id).order("name").limit(500).then(({ data }) => setDoctors(data || []));
  }, [profile.organization_id]);
  useEffect(() => {
    if (assignedDoctor) setDoctorId(assignedDoctor.id);
  }, [assignedDoctor]);
  useEffect(() => {
    const selected = doctors.find((doctor) => doctor.id === doctorId);
    if (selected) setDoctorFee(String(Number(selected.default_fee || 0)));
  }, [doctorId, doctors]);

  const takePhoto = async () => {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("Camera")) {
      browserCameraInput.current?.click();
      return;
    }
    try {
      const photo = await NativeCamera.getPhoto({
        source: CameraSource.Camera,
        direction: CameraDirection.Rear,
        resultType: CameraResultType.Uri,
        quality: 90,
        correctOrientation: true,
        saveToGallery: false,
      });
      if (!photo.webPath) throw new Error("Camera did not return a photo");
      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      const extension = photo.format || blob.type.split("/")[1] || "jpeg";
      const file = new File([blob], `camera-${Date.now()}.${extension}`, { type: blob.type || `image/${extension}` });
      setSelectedImageFiles((current) => [...current, file]);
    } catch (error: any) {
      const message = String(error?.message || error || "");
      if (!/cancel/i.test(message)) notify(`Camera failed: ${message || "Unable to take photo"}`);
    }
  };
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

      const safePayload = {
        ...payload,
        organization_id: profile.organization_id,
        created_by: profile.id,
        doctor_fee_collected: false,
      };
      const res = await supabase!.from("consultations").insert(safePayload).select("id").single();
      if (res.error) throw new Error(res.error.message || "Failed to save consultation");
      const result = { data: res.data };
      
      // Update patient last visit silently
      await supabase!.from("patients").update({ last_visit_at: new Date().toISOString() }).eq("id", patientId).eq("organization_id", profile.organization_id);

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
      <div className="no-print">
        <FormPanel title={title} subtitle={subtitle} onSubmit={save}>
          <div className="form-grid">
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <AsyncSelect table="patients" select="id,patient_id,name,mobile" searchColumns={["patient_id", "name", "mobile"]} label="Patient" value={patientId} displayValue={patientLabel} onChange={(id, row) => { setPatientId(id); setPatientLabel(row ? patientText(row) : ""); }} render={patientText}/>
              </div>
              <QuickPatientModal profile={profile} notify={notify} onCreated={(row) => { setPatientId(row.id); setPatientLabel(patientText(row)); }} />
            </div>
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
            <button type="button" className="prescription-action" onClick={takePhoto} style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px', background: '#f8faf9', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', textAlign: 'center' }}>
              <Camera size={22} style={{ margin: '0 auto 8px' }}/>
              <strong>Take photo</strong>
              <span style={{ fontSize: '12px', color: '#64748b' }}>Press to add camera photo</span>
            </button>
            <input ref={browserCameraInput} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e=>{const added=Array.from(e.target.files||[]);setSelectedImageFiles(current=>[...current,...added]);e.target.value=""}}/>
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
      </div>
      {patientId && <HistoryList patientId={patientId} patientLabel={patientLabel} organization={organization}/>}
    </>
  );
}

export function PatientHistoryWorkflow({ profile, organization, notify }: { profile: Profile; organization?: Organization | null; notify: (message: string) => void }) {
  return <ConsultationWorkflow profile={profile} organization={organization} notify={notify} title="Patient History" subtitle="Review patient timeline, print prescriptions, and attach images" hideNotes={true}/>;
}

export function FollowUpWorkflow({ profile }: { profile?: Profile }) {
  const today = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    if (!supabase) return;
    let query = supabase.from("consultations").select("id,visited_at,follow_up_date,symptoms,diagnosis,patient:patients(patient_id,name,mobile),doctor:doctors(name)").gte("follow_up_date", fromDate).lte("follow_up_date", toDate);
    if (profile?.organization_id) query = query.eq("organization_id", profile.organization_id);
    query.order("follow_up_date", { ascending: true }).limit(200).then(({ data }) => setRows(data || []));
  }, [fromDate, toDate, profile?.organization_id]);
  return <div className="follow-up-page"><div className="page-head"><div><h1>Follow-up Alerts</h1><p>Follow-ups due in the selected date range</p></div></div><div className="panel"><div className="followup-date-range"><label className="field"><span>From</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.currentTarget.value)}/></label><label className="field"><span>To</span><input type="date" value={toDate} min={fromDate} onChange={(event) => setToDate(event.currentTarget.value)}/></label></div>{rows.length ? <div className="data-wrap"><table className="data-table"><thead><tr><th>Follow-up</th><th>Patient</th><th>Doctor</th><th>Visit</th><th>Symptoms</th><th>Diagnosis</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td data-label="Follow-up">{fmtDate(row.follow_up_date)}</td><td data-label="Patient">{row.patient?.name}</td><td data-label="Doctor">{row.doctor?.name}</td><td data-label="Visit">{fmtDate(row.visited_at)}</td><td data-label="Symptoms">{row.symptoms || "-"}</td><td data-label="Diagnosis">{row.diagnosis || "-"}</td></tr>)}</tbody></table></div> : <div className="empty"><h3>No follow-ups found.</h3><p>Change the date range to search.</p></div>}</div></div>;
}

