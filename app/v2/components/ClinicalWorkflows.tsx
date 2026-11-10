"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Camera as NativeCamera, CameraDirection, CameraResultType, CameraSource } from "@capacitor/camera";
import { CheckCircle2, LoaderCircle, Camera, Paperclip, Printer, X, Plus, Trash2, Stethoscope, History, ClipboardList, Search, RotateCw } from "lucide-react";
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

function productText(row: Row) {
  const details: string[] = [];
  if (row.product_id) details.push(String(row.product_id));
  if (row.generic_name) details.push(String(row.generic_name));
  if (row.category) details.push(String(row.category));
  if (row.sale_unit) details.push(`Unit: ${row.sale_unit}`);
  const rate = Number(row.selling_rate || row.mrp || 0);
  if (rate > 0) details.push(`Rate: ${money(rate)}`);
  return `${row.name || ""}${details.length > 0 ? ` (${details.join(" • ")})` : ""}`;
}

const todayDateString = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};

export type PrescriptionItem = {
  product_id: string;
  product_code?: string;
  name: string;
  qty: number;
  morning: boolean;
  afternoon: boolean;
  evening: boolean;
  night: boolean;
  food: string;
  days: string;
};

export function formatTimingText(item: Partial<PrescriptionItem>) {
  const parts: string[] = [];
  if (item.morning) parts.push("Morning");
  if (item.afternoon) parts.push("Afternoon");
  if (item.evening) parts.push("Evening");
  if (item.night) parts.push("Night");
  const code = `${item.morning ? 1 : 0}-${item.afternoon ? 1 : 0}-${item.evening ? 1 : 0}-${item.night ? 1 : 0}`;
  return parts.length > 0 ? `${parts.join(", ")} (${code})` : code;
}

function formatPrescriptionSummary(items: PrescriptionItem[], extraNotes: string) {
  const lines = items.map((item, idx) => {
    const timing = formatTimingText(item);
    const daysPart = item.days ? ` x ${item.days} days` : "";
    const foodPart = item.food ? ` [${item.food}]` : "";
    return `${idx + 1}. ${item.name} — Qty: ${item.qty} — ${timing}${foodPart}${daysPart}`;
  });
  if (extraNotes.trim()) {
    lines.push(lines.length > 0 ? `\nNotes: ${extraNotes.trim()}` : extraNotes.trim());
  }
  return lines.join("\n");
}

function HistoryList({ patientId, patientLabel, organization, onCountChange }: { patientId: string; patientLabel?: string; organization?: Organization | null; onCountChange?: (count: number) => void }) {
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
      onCountChange?.(0);
      return;
    }
    setLoading(true);
    supabase
      .from("consultations")
      .select("id,visited_at,symptoms,diagnosis,clinical_notes,prescription_notes,vitals,follow_up_date,doctor_fee,patient:patients(id,patient_id,name,mobile),doctor:doctors(name,specialization),prescription_attachments(id,storage_path,file_name,content_type)")
      .eq("patient_id", patientId)
      .order("visited_at", { ascending: false })
      .limit(100)
      .then(async ({ data }) => {
        const records = data || [];
        setRows(records);
        onCountChange?.(records.length);
        const attachments = records.flatMap((r) => r.prescription_attachments || []);
        const pairs = await Promise.all(
          attachments.map(async (a: Row) => {
            const { data: signed } = await supabase!.storage.from("prescriptions").createSignedUrl(a.storage_path, 3600);
            return [a.id, signed?.signedUrl || ""];
          })
        );
        setUrls(Object.fromEntries(pairs));
        setLoading(false);
      });
  }, [patientId]);

  const historyImages = rows
    .flatMap((r) =>
      (r.prescription_attachments || [])
        .filter((a: Row) => a.content_type?.startsWith("image/"))
        .map((a: Row) => ({ id: a.id, src: urls[a.id], name: a.file_name }))
    )
    .filter((x) => x.src);

  const resetViewerMotion = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDrag(null);
  };
  const openViewer = (id: string) => {
    const index = Math.max(0, historyImages.findIndex((x) => x.id === id));
    setViewer({ images: historyImages, index });
    resetViewerMotion();
  };
  const closeViewer = () => {
    setViewer(null);
    setDrag(null);
  };
  const moveViewer = (dir: number) => {
    if (!viewer) return;
    const next = viewer.index + dir;
    if (next >= 0 && next < viewer.images.length) {
      setViewer({ ...viewer, index: next });
      resetViewerMotion();
    }
  };
  const changeZoom = (newZoom: number) => {
    setZoom(Math.max(0.5, Math.min(newZoom, 4)));
    if (newZoom <= 1) setPan({ x: 0, y: 0 });
  };
  const activeImage = viewer ? viewer.images[viewer.index] : null;

  const triggerPrintPrescription = (row: Row) => {
    setPrintRow(row);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  return (
    <>
      {printRow && (() => {
        const pv = printRow.vitals || {};
        const prRxItems: PrescriptionItem[] = Array.isArray(pv.prescription_items) ? pv.prescription_items : [];
        const hasVitals = pv.bp || pv.sugar || pv.weight || pv.temperature || pv.pulse || pv.spo2;
        const patObj = printRow.patient;
        return (
          <div className="print-only printable-prescription" style={{ padding: "24px", fontFamily: "Arial, sans-serif", color: "#000", maxWidth: "800px", margin: "0 auto" }}>
            <div style={{ borderBottom: "2px solid #000", paddingBottom: "12px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h2 style={{ margin: "0 0 4px 0", fontSize: "20px", textTransform: "uppercase" }}>{organization?.clinic_name || organization?.pharmacy_name || "Siva Clinic"}</h2>
                {organization?.address && <div style={{ fontSize: "12px" }}>{organization.address}</div>}
                {organization?.phone && <div style={{ fontSize: "12px" }}>Phone: {organization.phone}</div>}
                {organization?.email && <div style={{ fontSize: "12px" }}>Email: {organization.email}</div>}
              </div>
              <div style={{ textAlign: "right", fontSize: "12px", lineHeight: 1.4 }}>
                <div style={{ fontSize: "16px", fontWeight: "bold", textDecoration: "underline", marginBottom: "4px" }}>PRESCRIPTION</div>
                <div><strong>Date:</strong> {fmtDate(printRow.visited_at)}</div>
                {pv.token_no && <div><strong>Token No:</strong> #{pv.token_no}</div>}
                {printRow.doctor?.name && (
                  <div>
                    <strong>Doctor:</strong> {printRow.doctor.name}
                    {printRow.doctor?.specialization ? ` (${printRow.doctor.specialization})` : ""}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed #aaa", paddingBottom: "10px", marginBottom: "14px", fontSize: "13px" }}>
              <div>
                <strong>Patient:</strong> {patObj?.name || patientLabel || printRow.patient_id}
                {patObj?.patient_id ? <div><small>ID: {patObj.patient_id}</small></div> : null}
              </div>
              <div style={{ textAlign: "right" }}>
                {patObj?.mobile && <div><strong>Mobile:</strong> {patObj.mobile}</div>}
              </div>
            </div>

            {hasVitals && (
              <div style={{ marginBottom: "14px", fontSize: "12px", padding: "8px 12px", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "6px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
                {pv.bp && <span><strong>BP:</strong> {pv.bp} mmHg</span>}
                {pv.sugar && <span><strong>Sugar:</strong> {pv.sugar} mg/dL</span>}
                {pv.weight && <span><strong>Weight:</strong> {pv.weight} kg</span>}
                {pv.temperature && <span><strong>Temp:</strong> {pv.temperature} °F</span>}
                {pv.pulse && <span><strong>Pulse:</strong> {pv.pulse} bpm</span>}
                {pv.spo2 && <span><strong>SpO2:</strong> {pv.spo2}%</span>}
              </div>
            )}

            {(printRow.symptoms || printRow.diagnosis || printRow.clinical_notes) && (
              <div style={{ marginBottom: "16px", fontSize: "13px", lineHeight: 1.5 }}>
                {printRow.symptoms && <div><strong>Symptoms:</strong> {printRow.symptoms}</div>}
                {printRow.diagnosis && <div><strong>Past History:</strong> {printRow.diagnosis}</div>}
                {printRow.clinical_notes && <div><strong>Advice:</strong> {printRow.clinical_notes}</div>}
              </div>
            )}

            <div style={{ fontWeight: 800, fontSize: "15px", marginBottom: "8px" }}>℞ Prescribed Medicines</div>
            {prRxItems.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", marginBottom: "12px", border: "1px solid #cbd5e1" }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1" }}>
                    <th style={{ padding: "6px 8px", textAlign: "left", width: "40px", borderRight: "1px solid #cbd5e1" }}>#</th>
                    <th style={{ padding: "6px 8px", textAlign: "left", borderRight: "1px solid #cbd5e1" }}>Medicine Name</th>
                    <th style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #cbd5e1" }}>Morning</th>
                    <th style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #cbd5e1" }}>Afternoon</th>
                    <th style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #cbd5e1" }}>Evening</th>
                    <th style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #cbd5e1" }}>Night</th>
                    <th style={{ padding: "6px 8px", textAlign: "left", borderRight: "1px solid #cbd5e1" }}>Instruction</th>
                    <th style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #cbd5e1" }}>Duration</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {prRxItems.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "6px 8px", borderRight: "1px solid #cbd5e1" }}>{idx + 1}</td>
                      <td style={{ padding: "6px 8px", borderRight: "1px solid #cbd5e1" }}><strong>{item.name}</strong></td>
                      <td style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #cbd5e1" }}>{item.morning ? "✓" : "-"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #cbd5e1" }}>{item.afternoon ? "✓" : "-"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #cbd5e1" }}>{item.evening ? "✓" : "-"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #cbd5e1" }}>{item.night ? "✓" : "-"}</td>
                      <td style={{ padding: "6px 8px", borderRight: "1px solid #cbd5e1" }}>{item.food || "-"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #cbd5e1" }}>{item.days ? `${item.days} d` : "-"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}><strong>{item.qty}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ marginTop: "10px", padding: "12px", border: "1px solid #cbd5e1", borderRadius: "6px", minHeight: "100px" }}>
                <div style={{ whiteSpace: "pre-wrap", fontSize: "13px", lineHeight: 1.6 }}>{printRow.prescription_notes || "No medicines prescribed"}</div>
              </div>
            )}

            {(prRxItems.length > 0 && (pv.extra_prescription_notes || printRow.prescription_notes)) && (
              <div style={{ marginBottom: "16px", fontSize: "13px" }}>
                <strong>Rx Notes:</strong> {pv.extra_prescription_notes || printRow.prescription_notes}
              </div>
            )}

            {printRow.follow_up_date && (
              <div style={{ marginTop: "16px", fontSize: "13px" }}>
                <strong>Next Follow-up Date:</strong> {fmtDate(printRow.follow_up_date)}
              </div>
            )}

            <div style={{ marginTop: "40px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: "12px", borderTop: "1px dashed #ccc", paddingTop: "12px" }}>
              <div style={{ color: "#64748b" }}>Generated by {organization?.clinic_name || "Siva Clinic Software"}</div>
              <div style={{ textAlign: "right" }}>
                <div>___________________________</div>
                <strong>{printRow.doctor?.name || "Doctor's Signature"}</strong>
                {printRow.doctor?.specialization ? <div>{printRow.doctor.specialization}</div> : null}
              </div>
            </div>
          </div>
        );
      })()}
      <div className="panel history-list no-print">
        <h2 className="panel-title">Patient history {patientLabel ? `— ${patientLabel}` : ""}</h2>
        {loading ? (
          <div className="loading-panel"><LoaderCircle className="spin" /> Loading history...</div>
        ) : rows.length ? (
          <div className="timeline">
            {rows.map((row) => {
              const v = row.vitals || {};
              const rxItems: PrescriptionItem[] = Array.isArray(v.prescription_items) ? v.prescription_items : [];
              return (
                <div className="timeline-item" key={row.id}>
                  <span>
                    {fmtDate(row.visited_at)}
                    {v.token_no ? <b style={{ display: "block", color: "#0f766e", marginTop: "4px" }}>Token #{v.token_no}</b> : null}
                  </span>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <h3 style={{ margin: 0 }}>{row.doctor?.name || "Doctor"} · {money(row.doctor_fee)}</h3>
                      <button type="button" className="table-edit" onClick={() => triggerPrintPrescription(row)}>
                        <Printer size={14} /> Print Rx
                      </button>
                    </div>
                    {(v.bp || v.sugar || v.weight || v.temperature || v.pulse || v.spo2) && (
                      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", margin: "8px 0", padding: "6px 10px", background: "#f0fdf4", borderRadius: "6px", fontSize: "13px", color: "#14532d" }}>
                        {v.bp && <span><b>BP:</b> {v.bp}</span>}
                        {v.sugar && <span><b>Sugar:</b> {v.sugar}</span>}
                        {v.weight && <span><b>Weight:</b> {v.weight}</span>}
                        {v.temperature && <span><b>Temp:</b> {v.temperature}</span>}
                        {v.pulse && <span><b>Pulse:</b> {v.pulse}</span>}
                        {v.spo2 && <span><b>SpO2:</b> {v.spo2}%</span>}
                      </div>
                    )}
                    <p><b>Symptoms:</b> {row.symptoms || "-"}</p>
                    <p><b>Past History:</b> {row.diagnosis || "-"}</p>
                    <p><b>Advice:</b> {row.clinical_notes || "-"}</p>
                    {rxItems.length > 0 ? (
                      <div style={{ marginTop: "8px" }}>
                        <b>Prescribed Medicines:</b>
                        <div className="data-wrap" style={{ marginTop: "6px" }}>
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Medicine</th>
                                <th>Morning</th>
                                <th>Afternoon</th>
                                <th>Evening</th>
                                <th>Night</th>
                                <th>Food</th>
                                <th>Qty</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rxItems.map((item, idx) => (
                                <tr key={`${item.product_id}-${idx}`}>
                                  <td><strong>{item.name}</strong></td>
                                  <td>{item.morning ? "✓" : "-"}</td>
                                  <td>{item.afternoon ? "✓" : "-"}</td>
                                  <td>{item.evening ? "✓" : "-"}</td>
                                  <td>{item.night ? "✓" : "-"}</td>
                                  <td>{item.food || "-"}</td>
                                  <td><b>{item.qty}</b></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <p style={{ whiteSpace: "pre-wrap" }}><b>Prescription:</b> {row.prescription_notes || "-"}</p>
                    )}

                    {row.prescription_attachments?.length > 0 && (
                      <div className="prescription-gallery full-images">
                        {row.prescription_attachments.map((a: Row) =>
                          a.content_type?.startsWith("image/") ? (
                            <button type="button" className="prescription-image-full image-open" key={a.id} onClick={() => openViewer(a.id)}>
                              <img src={urls[a.id]} alt={a.file_name} />
                              <span>{a.file_name}</span>
                            </button>
                          ) : (
                            <a className="prescription-file" key={a.id} href={urls[a.id]} target="_blank" rel="noreferrer">
                              <Paperclip />
                              <span>{a.file_name}</span>
                            </a>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
              <button type="button" onClick={closeViewer}><X size={18} /></button>
            </div>
          </div>
          <div
            className="image-stage"
            onDoubleClick={() => changeZoom(zoom === 1 ? 2 : 1)}
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              setDrag({ x: e.clientX, y: e.clientY, startX: pan.x, startY: pan.y });
            }}
            onPointerMove={(e) => {
              if (drag && zoom > 1) setPan({ x: drag.startX + e.clientX - drag.x, y: drag.startY + e.clientY - drag.y });
            }}
            onPointerUp={(e) => {
              if (drag && zoom === 1) {
                const dx = e.clientX - drag.x;
                if (Math.abs(dx) > 60) moveViewer(dx < 0 ? 1 : -1);
              }
              setDrag(null);
            }}
            onPointerCancel={() => setDrag(null)}
          >
            <button type="button" className="image-nav prev" onClick={() => moveViewer(-1)}>←</button>
            <img src={activeImage.src} alt={activeImage.name} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} draggable={false} />
            <button type="button" className="image-nav next" onClick={() => moveViewer(1)}>→</button>
          </div>
          <div className="image-viewer-help">Swipe left/right for next image. Double tap to zoom. Drag image after zoom.</div>
        </div>
      )}
    </>
  );
}

// ─── PRE-EXAMINATION WORKFLOW (Nurse / Receptionist Token & Vitals Entry) ────
export function PreExaminationWorkflow({ profile, notify }: { profile: Profile; organization?: Organization | null; notify: (message: string) => void }) {
  const [activeTab, setActiveTab] = useState<"entry" | "queue">("entry");
  const [patientId, setPatientId] = useState("");
  const [patientLabel, setPatientLabel] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [doctorFee, setDoctorFee] = useState("0");
  const [doctors, setDoctors] = useState<Row[]>([]);
  const [tokenNo, setTokenNo] = useState("1");
  const [bp, setBp] = useState("");
  const [sugar, setSugar] = useState("");
  const [weight, setWeight] = useState("");
  const [temperature, setTemperature] = useState("");
  const [pulse, setPulse] = useState("");
  const [spo2, setSpo2] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [saving, setSaving] = useState(false);
  const [todayQueue, setTodayQueue] = useState<Row[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadTodayQueue = async () => {
    if (!supabase) return;
    const todayStr = todayDateString();
    const { data } = await supabase
      .from("consultations")
      .select("id,patient_id,doctor_id,visited_at,symptoms,diagnosis,vitals,doctor_fee,patient:patients(id,patient_id,name,mobile),doctor:doctors(id,doctor_id,name)")
      .eq("organization_id", profile.organization_id)
      .gte("visited_at", `${todayStr}T00:00:00`)
      .order("visited_at", { ascending: false })
      .limit(200);

    const rows = data || [];
    setTodayQueue(rows);
    if (!editingId) {
      const maxToken = rows.reduce((max, r) => {
        const raw = String(r.vitals?.token_no || "").replace(/[^0-9]/g, "");
        const num = Number(raw);
        return Number.isFinite(num) && num > max ? num : max;
      }, 0);
      setTokenNo(String(maxToken + 1));
    }
  };

  const handleRemoveToken = async (row: Row) => {
    const tNo = row.vitals?.token_no || "";
    const pName = row.patient?.name || "Patient";
    if (!window.confirm(`Are you sure you want to remove Token #${tNo} for ${pName}?`)) return;
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from("consultations")
        .delete()
        .eq("id", row.id)
        .eq("organization_id", profile.organization_id);
      if (error) throw error;
      notify(`Token #${tNo} removed successfully`);
      if (editingId === row.id) {
        setEditingId(null);
        setPatientId("");
        setPatientLabel("");
        setBp("");
        setSugar("");
        setWeight("");
        setTemperature("");
        setPulse("");
        setSpo2("");
        setSymptoms("");
      }
      await loadTodayQueue();
    } catch (err: any) {
      notify(err.message || "Failed to remove token");
    }
  };

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("doctors")
      .select("id,doctor_id,name,mobile,specialization,default_fee")
      .eq("organization_id", profile.organization_id)
      .eq("active", true)
      .order("name")
      .limit(200)
      .then(({ data }) => {
        const list = data || [];
        setDoctors(list);
        if (list.length > 0 && !doctorId) {
          setDoctorId(list[0].id);
          setDoctorFee(String(Number(list[0].default_fee || 0)));
        }
      });
    loadTodayQueue();
    const interval = setInterval(() => {
      loadTodayQueue();
    }, 12000);
    return () => clearInterval(interval);
  }, [profile.organization_id]);

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!supabase) return;
    if (!patientId) {
      notify("Please select a patient");
      return;
    }
    const targetDoctorId = doctorId || doctors[0]?.id;
    if (!targetDoctorId) {
      notify("Please select or add an active Doctor first");
      return;
    }
    if (!tokenNo.trim()) {
      notify("Please enter a Token Number");
      return;
    }

    setSaving(true);
    try {
      const todayStr = todayDateString();
      const vitalsPayload = {
        token_no: tokenNo.trim(),
        token_date: todayStr,
        status: "pre_examined",
        bp: bp.trim(),
        sugar: sugar.trim(),
        weight: weight.trim(),
        temperature: temperature.trim(),
        pulse: pulse.trim(),
        spo2: spo2.trim(),
        pre_examined_at: new Date().toISOString(),
        pre_examined_by: profile.full_name || profile.id,
      };

      if (editingId) {
        const existing = todayQueue.find((r) => r.id === editingId);
        const mergedVitals = { ...(existing?.vitals || {}), ...vitalsPayload };
        const { error } = await supabase
          .from("consultations")
          .update({
            patient_id: patientId,
            doctor_id: targetDoctorId,
            symptoms: symptoms.trim() || null,
            vitals: mergedVitals,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingId)
          .eq("organization_id", profile.organization_id);
        if (error) throw error;
        notify(`Updated Pre-Examination for Token #${tokenNo.trim()}`);
      } else {
        const { error } = await supabase.from("consultations").insert({
          organization_id: profile.organization_id,
          patient_id: patientId,
          doctor_id: targetDoctorId,
          symptoms: symptoms.trim() || null,
          vitals: vitalsPayload,
          doctor_fee: Number(doctorFee || 0),
          doctor_fee_collected: false,
          created_by: profile.id,
        });
        if (error) throw error;
        notify(`Token #${tokenNo.trim()} generated and Pre-Examination saved`);
      }

      setEditingId(null);
      setPatientId("");
      setPatientLabel("");
      setBp("");
      setSugar("");
      setWeight("");
      setTemperature("");
      setPulse("");
      setSpo2("");
      setSymptoms("");
      await loadTodayQueue();
    } catch (err: any) {
      notify(err.message || "Failed to save pre-examination");
    } finally {
      setSaving(false);
    }
  };

  const editRow = (row: Row) => {
    setEditingId(row.id);
    setPatientId(row.patient_id);
    setPatientLabel(row.patient ? patientText(row.patient) : "");
    setDoctorId(row.doctor_id);
    setTokenNo(String(row.vitals?.token_no || ""));
    setBp(String(row.vitals?.bp || ""));
    setSugar(String(row.vitals?.sugar || ""));
    setWeight(String(row.vitals?.weight || ""));
    setTemperature(String(row.vitals?.temperature || ""));
    setPulse(String(row.vitals?.pulse || ""));
    setSpo2(String(row.vitals?.spo2 || ""));
    setSymptoms(String(row.symptoms || ""));
    setActiveTab("entry");
    notify(`Editing Token #${row.vitals?.token_no || ""}`);
  };

  return (
    <div>
      {/* Top Tab Navigation inside Pre-Examination Page */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
        <div style={{ display: "inline-flex", background: "#e2e8f0", padding: "4px", borderRadius: "10px", gap: "4px" }}>
          <button
            type="button"
            onClick={() => setActiveTab("entry")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "9px 18px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "14px",
              background: activeTab === "entry" ? "#126b5a" : "transparent",
              color: activeTab === "entry" ? "#fff" : "#334155",
            }}
          >
            <Stethoscope size={16} /> Pre-Examination &amp; Token Entry
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("queue")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "9px 18px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "14px",
              background: activeTab === "queue" ? "#126b5a" : "transparent",
              color: activeTab === "queue" ? "#fff" : "#334155",
            }}
          >
            <ClipboardList size={16} /> Today&apos;s Pre-Examination Token Queue ({todayQueue.length})
          </button>
        </div>
        {activeTab === "queue" && (
          <button type="button" className="secondary" onClick={() => setActiveTab("entry")}>
            ← Back to Pre-Examination Form
          </button>
        )}
      </div>

      {/* TAB 1: PRE-EXAMINATION ENTRY FORM (With Save Button at Top) */}
      <div style={{ display: activeTab === "entry" ? "block" : "none" }}>
        <form onSubmit={handleSave}>
          <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "14px" }}>
            <div>
              <h1>Pre-Examination &amp; Token Generation</h1>
              <p>Nurse pre-examination: record BP, Sugar, Weight, Symptoms and generate patient token for doctor consultation</p>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <QuickPatientModal
                profile={profile}
                notify={notify}
                onCreated={(row) => {
                  setPatientId(row.id);
                  setPatientLabel(patientText(row));
                }}
              />
              {editingId && (
                <>
                  <button
                    type="button"
                    className="secondary danger-btn"
                    onClick={() => {
                      const row = todayQueue.find((r) => r.id === editingId);
                      if (row) handleRemoveToken(row);
                    }}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <Trash2 size={14} /> Remove Token
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setEditingId(null);
                      setPatientId("");
                      setPatientLabel("");
                      setBp("");
                      setSugar("");
                      setWeight("");
                      setTemperature("");
                      setPulse("");
                      setSpo2("");
                      setSymptoms("");
                      loadTodayQueue();
                    }}
                  >
                    Cancel Edit
                  </button>
                </>
              )}
              <button type="submit" className="primary" disabled={saving}>
                {saving ? <LoaderCircle className="spin" /> : <CheckCircle2 size={16} />}
                {editingId ? `Update Token #${tokenNo}` : `Save Pre-Examination & Issue Token #${tokenNo}`}
              </button>
            </div>
          </div>

          <div className="panel form-panel">
            <div className="form-grid preexam-top-grid">
              <label className="field">
                <span>Token Number <b>*</b></span>
                <input
                  value={tokenNo}
                  onChange={(e) => setTokenNo(e.currentTarget.value)}
                  placeholder="e.g. 1"
                  required
                  style={{ fontWeight: 700, fontSize: "16px", color: "#0f766e", background: "#f0fdf4" }}
                />
              </label>

              <AsyncSelect
                table="patients"
                select="id,patient_id,name,mobile"
                searchColumns={["patient_id", "name", "mobile"]}
                label="Patient"
                value={patientId}
                displayValue={patientLabel}
                onChange={(id, row) => {
                  setPatientId(id);
                  setPatientLabel(row ? patientText(row) : "");
                }}
                render={patientText}
              />

              <AsyncSelect
                table="doctors"
                select="id,doctor_id,name,mobile,specialization,default_fee"
                searchColumns={["doctor_id", "name", "mobile", "specialization"]}
                label="Consulting Doctor"
                value={doctorId}
                displayValue={doctors.find((d) => d.id === doctorId) ? doctorText(doctors.find((d) => d.id === doctorId)!) : undefined}
                onChange={(id, row) => {
                  setDoctorId(id);
                  if (row) setDoctorFee(String(Number(row.default_fee || 0)));
                }}
                render={doctorText}
              />
            </div>

            <div className="form-grid consultation-vitals-grid" style={{ marginTop: "6px" }}>
              <label className="field">
                <span>BP (Blood Pressure)</span>
                <input value={bp} onChange={(e) => setBp(e.currentTarget.value)} placeholder="e.g. 120/80 mmHg" />
              </label>

              <label className="field">
                <span>Sugar (Blood Glucose)</span>
                <input value={sugar} onChange={(e) => setSugar(e.currentTarget.value)} placeholder="e.g. 110 mg/dL" />
              </label>

              <label className="field">
                <span>Weight (kg)</span>
                <input value={weight} onChange={(e) => setWeight(e.currentTarget.value)} placeholder="e.g. 65 kg" />
              </label>

              <label className="field">
                <span>Temperature (°F)</span>
                <input value={temperature} onChange={(e) => setTemperature(e.currentTarget.value)} placeholder="e.g. 98.6 °F" />
              </label>

              <label className="field">
                <span>Pulse (bpm)</span>
                <input value={pulse} onChange={(e) => setPulse(e.currentTarget.value)} placeholder="e.g. 72 bpm" />
              </label>

              <label className="field">
                <span>SpO2 (%)</span>
                <input value={spo2} onChange={(e) => setSpo2(e.currentTarget.value)} placeholder="e.g. 99%" />
              </label>
            </div>

            <label className="field">
              <span>Symptoms / Chief Complaints</span>
              <textarea
                value={symptoms}
                onChange={(e) => setSymptoms(e.currentTarget.value)}
                placeholder="Enter patient symptoms, fever duration, complaints..."
                rows={3}
              />
            </label>
          </div>
        </form>
      </div>

      {/* TAB 2: TODAY'S PRE-EXAMINATION TOKEN QUEUE (Click Token # to Edit) */}
      <div style={{ display: activeTab === "queue" ? "block" : "none" }}>
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
            <div>
              <h2 className="panel-title" style={{ margin: 0 }}>Today&apos;s Pre-Examination Token Queue ({todayQueue.length})</h2>
              <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#64748b" }}>Click on any Token Number below to edit that pre-examination record.</p>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() => { loadTodayQueue(); notify("Token queue refreshed"); }}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", minHeight: "34px" }}
              title="Refresh queue"
            >
              <RotateCw size={14} /> Refresh Queue
            </button>
          </div>
          {todayQueue.length > 0 ? (
            <div className="data-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Token #</th>
                    <th>Patient</th>
                    <th>Doctor</th>
                    <th>BP</th>
                    <th>Sugar</th>
                    <th>Weight</th>
                    <th>Symptoms</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {todayQueue.map((row) => {
                    const v = row.vitals || {};
                    const isCompleted = v.status === "completed" || Boolean(v.consulted_at);
                    return (
                      <tr key={row.id}>
                        <td>
                          <button
                            type="button"
                            onClick={() => editRow(row)}
                            title="Click to edit this record"
                            style={{
                              background: "#f0fdf4",
                              border: "1px solid #86efac",
                              borderRadius: "8px",
                              padding: "6px 14px",
                              color: "#0f766e",
                              fontWeight: 800,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              textDecoration: "underline",
                            }}
                          >
                            #{v.token_no || "-"}
                          </button>
                        </td>
                        <td>
                          <strong>{row.patient?.name || "-"}</strong>
                          <div style={{ fontSize: "12px", color: "#64748b" }}>{row.patient?.patient_id} {row.patient?.mobile ? `· ${row.patient.mobile}` : ""}</div>
                        </td>
                        <td>{row.doctor?.name || "-"}</td>
                        <td>{v.bp || "-"}</td>
                        <td>{v.sugar || "-"}</td>
                        <td>{v.weight || "-"}</td>
                        <td>{row.symptoms || "-"}</td>
                        <td>
                          <span style={{
                            padding: "3px 8px",
                            borderRadius: "999px",
                            fontSize: "12px",
                            fontWeight: 600,
                            background: isCompleted ? "#dcfce7" : "#fef3c7",
                            color: isCompleted ? "#166534" : "#92400e",
                          }}>
                            {isCompleted ? "Consulted" : "Waiting for Doctor"}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="table-edit danger-btn"
                            onClick={() => handleRemoveToken(row)}
                            title="Remove / Delete this token"
                            style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", fontSize: "12px" }}
                          >
                            <Trash2 size={13} /> Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">
              <h3>No tokens generated today yet.</h3>
              <p>Switch to the Pre-Examination Entry tab to issue the first token of the day.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CONSULTATION & PRESCRIPTION WORKFLOW (With Token Lookup, History Tab & Rx Builder) ───
export function ConsultationWorkflow({
  profile,
  organization,
  notify,
  title = "Consultation",
  subtitle = "Enter Token Number to auto-load Nurse Pre-Examination, view Patient History tab, and prescribe medicines for Billing",
  hideNotes = false,
}: {
  profile: Profile;
  organization?: Organization | null;
  notify: (message: string) => void;
  title?: string;
  subtitle?: string;
  hideNotes?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"consultation" | "history">("consultation");
  const [historyCount, setHistoryCount] = useState(0);

  // Token & Pre-exam state
  const [tokenLookupInput, setTokenLookupInput] = useState("");
  const [activeConsultationId, setActiveConsultationId] = useState<string | null>(null);
  const [todayTokens, setTodayTokens] = useState<Row[]>([]);
  const [bp, setBp] = useState("");
  const [sugar, setSugar] = useState("");
  const [weight, setWeight] = useState("");
  const [temperature, setTemperature] = useState("");
  const [pulse, setPulse] = useState("");
  const [spo2, setSpo2] = useState("");

  // Clinical form controlled state
  const [patientId, setPatientId] = useState("");
  const [patientLabel, setPatientLabel] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [doctorFee, setDoctorFee] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [prescriptionNotes, setPrescriptionNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");

  // Structured Prescription Entry State
  const [rxItems, setRxItems] = useState<PrescriptionItem[]>([]);
  const [rxProductId, setRxProductId] = useState("");
  const [rxProductRow, setRxProductRow] = useState<Row | null>(null);
  const [rxMorning, setRxMorning] = useState(true);
  const [rxAfternoon, setRxAfternoon] = useState(false);
  const [rxEvening, setRxEvening] = useState(false);
  const [rxNight, setRxNight] = useState(true);
  const [rxFood, setRxFood] = useState("After Food");
  const [rxDays, setRxDays] = useState("");
  const [rxQty, setRxQty] = useState("10");

  const [doctors, setDoctors] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [currentPrintRow, setCurrentPrintRow] = useState<Row | null>(null);
  const [selectedImageFiles, setSelectedImageFiles] = useState<File[]>([]);
  const browserCameraInput = useRef<HTMLInputElement>(null);

  const assignedDoctor =
    doctors.find((doctor) => doctor.profile_id === profile.id) ||
    doctors.find((doctor) => String(doctor.name || "").trim().toLowerCase() === String(profile.full_name || "").trim().toLowerCase());
  const doctorLocked = profile.role === "doctor" && Boolean(assignedDoctor);

  const fetchTodayTokens = async () => {
    if (!supabase) return;
    const todayStr = todayDateString();
    const { data } = await supabase
      .from("consultations")
      .select("id,patient_id,doctor_id,visited_at,symptoms,diagnosis,clinical_notes,prescription_notes,follow_up_date,doctor_fee,vitals,patient:patients(id,patient_id,name,mobile,medical_notes),doctor:doctors(id,doctor_id,name,default_fee)")
      .eq("organization_id", profile.organization_id)
      .gte("visited_at", `${todayStr}T00:00:00`)
      .order("visited_at", { ascending: false })
      .limit(200);
    setTodayTokens(data || []);
  };

  const loadPatientPastHistory = async (patientIdToLoad: string, existingPastHistory?: string | null) => {
    if (existingPastHistory && existingPastHistory.trim()) {
      setDiagnosis(existingPastHistory.trim());
      return;
    }
    if (!supabase || !patientIdToLoad) return;
    try {
      const { data: patData } = await supabase
        .from("patients")
        .select("medical_notes")
        .eq("id", patientIdToLoad)
        .maybeSingle();

      if (patData?.medical_notes && patData.medical_notes.trim()) {
        setDiagnosis(patData.medical_notes.trim());
        return;
      }

      const { data: pastCons } = await supabase
        .from("consultations")
        .select("diagnosis")
        .eq("patient_id", patientIdToLoad)
        .not("diagnosis", "is", null)
        .order("visited_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pastCons?.diagnosis && pastCons.diagnosis.trim()) {
        setDiagnosis(pastCons.diagnosis.trim());
      } else {
        setDiagnosis("");
      }
    } catch (err) {
      console.error("Failed to load patient past history:", err);
    }
  };

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("doctors")
      .select("id,doctor_id,name,mobile,specialization,profile_id,default_fee")
      .eq("organization_id", profile.organization_id)
      .order("name")
      .limit(500)
      .then(({ data }) => setDoctors(data || []));
    fetchTodayTokens();
    const interval = setInterval(() => {
      fetchTodayTokens();
    }, 12000);
    return () => clearInterval(interval);
  }, [profile.organization_id]);

  useEffect(() => {
    if (assignedDoctor) setDoctorId(assignedDoctor.id);
  }, [assignedDoctor]);

  useEffect(() => {
    const selected = doctors.find((doctor) => doctor.id === doctorId);
    if (selected && !activeConsultationId) setDoctorFee(String(Number(selected.default_fee || 0)));
  }, [doctorId, doctors, activeConsultationId]);

  // Auto-calculate quantity when days or timings change (if days is filled)
  const recalcRxQty = (daysVal: string, m: boolean, a: boolean, e: boolean, n: boolean) => {
    const d = Number(daysVal);
    if (d > 0) {
      const perDay = (m ? 1 : 0) + (a ? 1 : 0) + (e ? 1 : 0) + (n ? 1 : 0);
      if (perDay > 0) setRxQty(String(d * perDay));
    }
  };

  const applyPreExamConsultation = (row: Row) => {
    const v = row.vitals || {};
    setActiveConsultationId(row.id);
    setTokenLookupInput(String(v.token_no || ""));
    setPatientId(row.patient_id);
    setPatientLabel(row.patient ? patientText(row.patient) : "");
    if (!doctorLocked && row.doctor_id) {
      setDoctorId(row.doctor_id);
    }
    setDoctorFee(String(Number(row.doctor_fee || row.doctor?.default_fee || 0)));
    setBp(String(v.bp || ""));
    setSugar(String(v.sugar || ""));
    setWeight(String(v.weight || ""));
    setTemperature(String(v.temperature || ""));
    setPulse(String(v.pulse || ""));
    setSpo2(String(v.spo2 || ""));
    setSymptoms(String(row.symptoms || ""));

    const initialHistory = row.diagnosis || row.patient?.medical_notes || "";
    setDiagnosis(String(initialHistory || ""));
    if (!initialHistory && row.patient_id) {
      loadPatientPastHistory(row.patient_id);
    }

    setClinicalNotes(String(row.clinical_notes || ""));
    setFollowUpDate(row.follow_up_date ? String(row.follow_up_date).slice(0, 10) : "");
    if (Array.isArray(v.prescription_items)) {
      setRxItems(v.prescription_items);
      setPrescriptionNotes(String(v.extra_prescription_notes || ""));
    } else {
      setRxItems([]);
      setPrescriptionNotes(String(row.prescription_notes || ""));
    }
    notify(`Loaded Token #${v.token_no || ""} — ${row.patient?.name || "Patient"}`);
  };

  const lookupTokenNumber = async (rawToken: string) => {
    const clean = rawToken.trim().replace(/^#|^T-/i, "");
    if (!clean) {
      notify("Enter a token number to search");
      return;
    }
    // Search in todayTokens first
    const foundLocal = todayTokens.find((r) => {
      const t = String(r.vitals?.token_no || "").trim().replace(/^#|^T-/i, "");
      return t.toLowerCase() === clean.toLowerCase() || (Number(t) > 0 && Number(t) === Number(clean));
    });
    if (foundLocal) {
      applyPreExamConsultation(foundLocal);
      return;
    }

    if (!supabase) return;
    const { data } = await supabase
      .from("consultations")
      .select("id,patient_id,doctor_id,visited_at,symptoms,diagnosis,clinical_notes,prescription_notes,follow_up_date,doctor_fee,vitals,patient:patients(id,patient_id,name,mobile,medical_notes),doctor:doctors(id,doctor_id,name,default_fee)")
      .eq("organization_id", profile.organization_id)
      .order("visited_at", { ascending: false })
      .limit(100);

    const matched = (data || []).find((r: Row) => {
      const t = String(r.vitals?.token_no || "").trim().replace(/^#|^T-/i, "");
      return t.toLowerCase() === clean.toLowerCase() || (Number(t) > 0 && Number(t) === Number(clean));
    });

    if (matched) {
      applyPreExamConsultation(matched);
    } else {
      notify(`No pre-examination record found for Token #${rawToken}`);
    }
  };

  const printCurrentConsultation = () => {
    if (!patientId) {
      notify("Please select a patient to print prescription");
      return;
    }
    const currentDoc = doctors.find((d) => d.id === doctorId) || assignedDoctor;
    const finalRxItems = [...rxItems];
    if (rxProductId && rxProductRow && Number(rxQty) > 0) {
      finalRxItems.push({
        product_id: rxProductId,
        product_code: rxProductRow.product_id || "",
        name: rxProductRow.name || "",
        qty: Number(rxQty),
        morning: rxMorning,
        afternoon: rxAfternoon,
        evening: rxEvening,
        night: rxNight,
        food: rxFood,
        days: rxDays,
      });
    }
    const formattedRxNotes = formatPrescriptionSummary(finalRxItems, prescriptionNotes);
    const rowToPrint: Row = {
      id: activeConsultationId || "temp",
      visited_at: new Date().toISOString(),
      patient_id: patientId,
      doctor_id: doctorId,
      symptoms: symptoms.trim(),
      diagnosis: diagnosis.trim(),
      clinical_notes: clinicalNotes.trim(),
      prescription_notes: formattedRxNotes,
      follow_up_date: followUpDate || null,
      vitals: {
        token_no: tokenLookupInput.trim() || undefined,
        bp: bp.trim(),
        sugar: sugar.trim(),
        weight: weight.trim(),
        temperature: temperature.trim(),
        pulse: pulse.trim(),
        spo2: spo2.trim(),
        prescription_items: finalRxItems,
        extra_prescription_notes: prescriptionNotes.trim(),
      },
      doctor: currentDoc,
      patient: {
        id: patientId,
        patient_id: patientLabel.split(" - ")[0] || undefined,
        name: patientLabel.split(" - ")[1] || patientLabel,
        mobile: patientLabel.split(" - ")[2] || undefined,
      },
    };
    setCurrentPrintRow(rowToPrint);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const addPrescriptionMedicine = () => {
    if (!rxProductId || !rxProductRow) {
      notify("Select a medicine to add to prescription");
      return;
    }
    const qtyNum = Number(rxQty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      notify("Enter a valid quantity");
      return;
    }
    const newItem: PrescriptionItem = {
      product_id: rxProductId,
      product_code: rxProductRow.product_id || "",
      name: rxProductRow.name || "",
      qty: qtyNum,
      morning: rxMorning,
      afternoon: rxAfternoon,
      evening: rxEvening,
      night: rxNight,
      food: rxFood,
      days: rxDays,
    };
    setRxItems((prev) => [...prev, newItem]);
    setRxProductId("");
    setRxProductRow(null);
    setRxMorning(true);
    setRxAfternoon(false);
    setRxEvening(false);
    setRxNight(true);
    setRxDays("");
    setRxQty("10");
  };

  const updateRxItem = (idx: number, patch: Partial<PrescriptionItem>) => {
    setRxItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };

  const removeRxItem = (idx: number) => {
    setRxItems((prev) => prev.filter((_, i) => i !== idx));
  };

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
    if (!patientId || !doctorId) {
      notify("Please select Patient and Doctor");
      return;
    }
    setSaving(true);
    try {
      // Include pending medicine in the entry line if doctor selected a product and forgot to click Add
      const finalRxItems = [...rxItems];
      if (rxProductId && rxProductRow && Number(rxQty) > 0) {
        finalRxItems.push({
          product_id: rxProductId,
          product_code: rxProductRow.product_id || "",
          name: rxProductRow.name || "",
          qty: Number(rxQty),
          morning: rxMorning,
          afternoon: rxAfternoon,
          evening: rxEvening,
          night: rxNight,
          food: rxFood,
          days: rxDays,
        });
      }

      const formattedRxNotes = formatPrescriptionSummary(finalRxItems, prescriptionNotes);
      const existingRow = todayTokens.find((r) => r.id === activeConsultationId);
      const vitalsPayload = {
        ...(existingRow?.vitals || {}),
        token_no: tokenLookupInput.trim() || existingRow?.vitals?.token_no || undefined,
        token_date: existingRow?.vitals?.token_date || todayDateString(),
        status: "completed",
        bp: bp.trim(),
        sugar: sugar.trim(),
        weight: weight.trim(),
        temperature: temperature.trim(),
        pulse: pulse.trim(),
        spo2: spo2.trim(),
        prescription_items: finalRxItems,
        extra_prescription_notes: prescriptionNotes.trim(),
        rx_billed: false,
        consulted_at: new Date().toISOString(),
      };

      let savedId = activeConsultationId;

      if (activeConsultationId) {
        const { error } = await supabase!
          .from("consultations")
          .update({
            patient_id: patientId,
            doctor_id: doctorId,
            symptoms: symptoms.trim() || null,
            diagnosis: diagnosis.trim() || null,
            clinical_notes: clinicalNotes.trim() || null,
            prescription_notes: formattedRxNotes || null,
            follow_up_date: followUpDate || null,
            doctor_fee: Number(doctorFee || 0),
            vitals: vitalsPayload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", activeConsultationId)
          .eq("organization_id", profile.organization_id);
        if (error) throw new Error(error.message || "Failed to update consultation");
      } else {
        const res = await supabase!
          .from("consultations")
          .insert({
            organization_id: profile.organization_id,
            patient_id: patientId,
            doctor_id: doctorId,
            symptoms: symptoms.trim() || null,
            diagnosis: diagnosis.trim() || null,
            clinical_notes: clinicalNotes.trim() || null,
            prescription_notes: formattedRxNotes || null,
            follow_up_date: followUpDate || null,
            doctor_fee: Number(doctorFee || 0),
            doctor_fee_collected: false,
            vitals: vitalsPayload,
            created_by: profile.id,
          })
          .select("id")
          .single();
        if (res.error) throw new Error(res.error.message || "Failed to save consultation");
        savedId = res.data.id;
      }

      // Update patient medical_notes and last visit
      await supabase!
        .from("patients")
        .update({
          medical_notes: diagnosis.trim() || null,
          last_visit_at: new Date().toISOString(),
        })
        .eq("id", patientId)
        .eq("organization_id", profile.organization_id);

      let uploaded = 0;
      if (selectedImageFiles.length > 0 && savedId) {
        notify(`Consultation saved. Uploading ${selectedImageFiles.length} images...`);
        for (const file of selectedImageFiles) {
          const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
          const path = `${profile.organization_id}/${patientId}/${savedId}/${Date.now()}-${safe}`;
          const { error: uploadError } = await supabase!.storage.from("prescriptions").upload(path, file, { contentType: file.type, upsert: false });
          if (uploadError) {
            notify(`Failed to upload ${file.name}: ${uploadError.message}`);
            continue;
          }
          const { error: metaError } = await supabase!.from("prescription_attachments").insert({
            organization_id: profile.organization_id,
            patient_id: patientId,
            consultation_id: savedId,
            storage_path: path,
            file_name: file.name,
            content_type: file.type,
            size_bytes: file.size,
            uploaded_by: profile.id,
          });
          if (!metaError) uploaded++;
        }
      }

      notify(
        `Consultation & Prescription saved${finalRxItems.length ? ` (${finalRxItems.length} medicines synced to Billing)` : ""}${uploaded > 0 ? ` with ${uploaded} images` : ""}`
      );
      setActiveConsultationId(null);
      setTokenLookupInput("");
      setBp("");
      setSugar("");
      setWeight("");
      setTemperature("");
      setPulse("");
      setSpo2("");
      setSymptoms("");
      setDiagnosis("");
      setClinicalNotes("");
      setPrescriptionNotes("");
      setFollowUpDate("");
      setRxItems([]);
      setRxProductId("");
      setRxProductRow(null);
      setSelectedImageFiles([]);
      fetchTodayTokens();
    } catch (e: any) {
      notify(e.message || "An error occurred");
    } finally {
      setSaving(false);
    }
  };

  const waitingTokens = todayTokens.filter((r) => r.vitals?.token_no && r.vitals?.status !== "completed");

  if (hideNotes) {
    return (
      <>
        <div className="no-print">
          <FormPanel title={title} subtitle={subtitle} onSubmit={save}>
            <div className="form-grid">
              <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <AsyncSelect
                    table="patients"
                    select="id,patient_id,name,mobile,medical_notes"
                    searchColumns={["patient_id", "name", "mobile"]}
                    label="Patient"
                    value={patientId}
                    displayValue={patientLabel}
                    onChange={(id, row) => {
                      setPatientId(id);
                      setPatientLabel(row ? patientText(row) : "");
                    }}
                    render={patientText}
                  />
                </div>
                <QuickPatientModal
                  profile={profile}
                  notify={notify}
                  onCreated={(row) => {
                    setPatientId(row.id);
                    setPatientLabel(patientText(row));
                  }}
                />
              </div>
            </div>
          </FormPanel>
        </div>
        {patientId && <HistoryList patientId={patientId} patientLabel={patientLabel} organization={organization} />}
      </>
    );
  }

  return (
    <>
      {currentPrintRow && (() => {
        const pv = currentPrintRow.vitals || {};
        const prRxItems: PrescriptionItem[] = Array.isArray(pv.prescription_items) ? pv.prescription_items : [];
        const hasVitals = pv.bp || pv.sugar || pv.weight || pv.temperature || pv.pulse || pv.spo2;
        const patObj = currentPrintRow.patient;
        return (
          <div className="print-only printable-prescription" style={{ padding: "24px", fontFamily: "Arial, sans-serif", color: "#000", maxWidth: "800px", margin: "0 auto" }}>
            <div style={{ borderBottom: "2px solid #000", paddingBottom: "12px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h2 style={{ margin: "0 0 4px 0", fontSize: "20px", textTransform: "uppercase" }}>{organization?.clinic_name || organization?.pharmacy_name || "Siva Clinic"}</h2>
                {organization?.address && <div style={{ fontSize: "12px" }}>{organization.address}</div>}
                {organization?.phone && <div style={{ fontSize: "12px" }}>Phone: {organization.phone}</div>}
                {organization?.email && <div style={{ fontSize: "12px" }}>Email: {organization.email}</div>}
              </div>
              <div style={{ textAlign: "right", fontSize: "12px", lineHeight: 1.4 }}>
                <div style={{ fontSize: "16px", fontWeight: "bold", textDecoration: "underline", marginBottom: "4px" }}>PRESCRIPTION</div>
                <div><strong>Date:</strong> {fmtDate(currentPrintRow.visited_at)}</div>
                {pv.token_no && <div><strong>Token No:</strong> #{pv.token_no}</div>}
                {currentPrintRow.doctor?.name && (
                  <div>
                    <strong>Doctor:</strong> {currentPrintRow.doctor.name}
                    {currentPrintRow.doctor?.specialization ? ` (${currentPrintRow.doctor.specialization})` : ""}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed #aaa", paddingBottom: "10px", marginBottom: "14px", fontSize: "13px" }}>
              <div>
                <strong>Patient:</strong> {patObj?.name || patientLabel || currentPrintRow.patient_id}
                {patObj?.patient_id ? <div><small>ID: {patObj.patient_id}</small></div> : null}
              </div>
              <div style={{ textAlign: "right" }}>
                {patObj?.mobile && <div><strong>Mobile:</strong> {patObj.mobile}</div>}
              </div>
            </div>

            {hasVitals && (
              <div style={{ marginBottom: "14px", fontSize: "12px", padding: "8px 12px", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "6px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
                {pv.bp && <span><strong>BP:</strong> {pv.bp} mmHg</span>}
                {pv.sugar && <span><strong>Sugar:</strong> {pv.sugar} mg/dL</span>}
                {pv.weight && <span><strong>Weight:</strong> {pv.weight} kg</span>}
                {pv.temperature && <span><strong>Temp:</strong> {pv.temperature} °F</span>}
                {pv.pulse && <span><strong>Pulse:</strong> {pv.pulse} bpm</span>}
                {pv.spo2 && <span><strong>SpO2:</strong> {pv.spo2}%</span>}
              </div>
            )}

            {(currentPrintRow.symptoms || currentPrintRow.diagnosis || currentPrintRow.clinical_notes) && (
              <div style={{ marginBottom: "16px", fontSize: "13px", lineHeight: 1.5 }}>
                {currentPrintRow.symptoms && <div><strong>Symptoms:</strong> {currentPrintRow.symptoms}</div>}
                {currentPrintRow.diagnosis && <div><strong>Past History:</strong> {currentPrintRow.diagnosis}</div>}
                {currentPrintRow.clinical_notes && <div><strong>Advice:</strong> {currentPrintRow.clinical_notes}</div>}
              </div>
            )}

            <div style={{ fontWeight: 800, fontSize: "15px", marginBottom: "8px" }}>℞ Prescribed Medicines</div>
            {prRxItems.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", marginBottom: "12px", border: "1px solid #cbd5e1" }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1" }}>
                    <th style={{ padding: "6px 8px", textAlign: "left", width: "40px", borderRight: "1px solid #cbd5e1" }}>#</th>
                    <th style={{ padding: "6px 8px", textAlign: "left", borderRight: "1px solid #cbd5e1" }}>Medicine Name</th>
                    <th style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #cbd5e1" }}>Morning</th>
                    <th style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #cbd5e1" }}>Afternoon</th>
                    <th style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #cbd5e1" }}>Evening</th>
                    <th style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #cbd5e1" }}>Night</th>
                    <th style={{ padding: "6px 8px", textAlign: "left", borderRight: "1px solid #cbd5e1" }}>Instruction</th>
                    <th style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #cbd5e1" }}>Duration</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {prRxItems.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "6px 8px", borderRight: "1px solid #cbd5e1" }}>{idx + 1}</td>
                      <td style={{ padding: "6px 8px", borderRight: "1px solid #cbd5e1" }}><strong>{item.name}</strong></td>
                      <td style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #cbd5e1" }}>{item.morning ? "✓" : "-"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #cbd5e1" }}>{item.afternoon ? "✓" : "-"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #cbd5e1" }}>{item.evening ? "✓" : "-"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #cbd5e1" }}>{item.night ? "✓" : "-"}</td>
                      <td style={{ padding: "6px 8px", borderRight: "1px solid #cbd5e1" }}>{item.food || "-"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #cbd5e1" }}>{item.days ? `${item.days} d` : "-"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}><strong>{item.qty}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ marginTop: "10px", padding: "12px", border: "1px solid #cbd5e1", borderRadius: "6px", minHeight: "100px" }}>
                <div style={{ whiteSpace: "pre-wrap", fontSize: "13px", lineHeight: 1.6 }}>{currentPrintRow.prescription_notes || "No medicines prescribed"}</div>
              </div>
            )}

            {(prRxItems.length > 0 && (pv.extra_prescription_notes || currentPrintRow.prescription_notes)) && (
              <div style={{ marginBottom: "16px", fontSize: "13px" }}>
                <strong>Rx Notes:</strong> {pv.extra_prescription_notes || currentPrintRow.prescription_notes}
              </div>
            )}

            {currentPrintRow.follow_up_date && (
              <div style={{ marginTop: "16px", fontSize: "13px" }}>
                <strong>Next Follow-up Date:</strong> {fmtDate(currentPrintRow.follow_up_date)}
              </div>
            )}

            <div style={{ marginTop: "40px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: "12px", borderTop: "1px dashed #ccc", paddingTop: "12px" }}>
              <div style={{ color: "#64748b" }}>Generated by {organization?.clinic_name || "Siva Clinic Software"}</div>
              <div style={{ textAlign: "right" }}>
                <div>___________________________</div>
                <strong>{currentPrintRow.doctor?.name || "Doctor's Signature"}</strong>
                {currentPrintRow.doctor?.specialization ? <div>{currentPrintRow.doctor.specialization}</div> : null}
              </div>
            </div>
          </div>
        );
      })()}
      <div className="no-print">
        {/* Top Tab Navigation inside Consultation Page */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ display: "inline-flex", background: "#e2e8f0", padding: "4px", borderRadius: "10px", gap: "4px" }}>
              <button
                type="button"
                onClick={() => setActiveTab("consultation")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "9px 18px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: "14px",
                  background: activeTab === "consultation" ? "#126b5a" : "transparent",
                  color: activeTab === "consultation" ? "#fff" : "#334155",
                }}
              >
                <Stethoscope size={16} /> Consultation &amp; Prescription
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("history")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "9px 18px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: "14px",
                  background: activeTab === "history" ? "#126b5a" : "transparent",
                  color: activeTab === "history" ? "#fff" : "#334155",
                }}
              >
                <History size={16} /> Patient History {patientId ? `(${historyCount})` : ""}
              </button>
            </div>
            <QuickPatientModal
              profile={profile}
              notify={notify}
              onCreated={(row) => {
                setPatientId(row.id);
                setPatientLabel(patientText(row));
              }}
            />
          </div>
          {activeTab === "history" && (
            <button type="button" className="secondary" onClick={() => setActiveTab("consultation")}>
              ← Back to Consultation Form
            </button>
          )}
        </div>

        {/* TAB 1: CONSULTATION & PRESCRIPTION */}
        <div style={{ display: activeTab === "consultation" ? "block" : "none" }}>
          {/* Token Lookup Bar */}
          <div className="panel" style={{ marginBottom: "16px", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "14px 18px" }}>
            <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
              <label className="field" style={{ flex: "0 1 200px", margin: 0 }}>
                <span style={{ color: "#166534", fontWeight: 700 }}>Enter Token Number</span>
                <div className="search-box" style={{ background: "#fff" }}>
                  <Search size={15} />
                  <input
                    value={tokenLookupInput}
                    onChange={(e) => setTokenLookupInput(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        lookupTokenNumber(tokenLookupInput);
                      }
                    }}
                    placeholder="Type Token # & press Enter"
                    style={{ fontWeight: 700 }}
                  />
                </div>
              </label>
              <button type="button" className="primary" onClick={() => lookupTokenNumber(tokenLookupInput)} style={{ minHeight: "38px" }}>
                Load Token Details
              </button>
              {activeConsultationId && (
                <button
                  type="button"
                  className="secondary danger-btn"
                  onClick={() => {
                    setActiveConsultationId(null);
                    setTokenLookupInput("");
                    notify("Token detached from consultation");
                  }}
                  style={{ minHeight: "38px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  title="Clear / detach current token"
                >
                  <X size={14} /> Detach Token
                </button>
              )}
              <button
                type="button"
                className="secondary"
                onClick={async () => {
                  setActiveConsultationId(null);
                  setTokenLookupInput("");
                  setBp("");
                  setSugar("");
                  setWeight("");
                  setTemperature("");
                  setPulse("");
                  setSpo2("");
                  setSymptoms("");
                  setDiagnosis("");
                  setClinicalNotes("");
                  setPrescriptionNotes("");
                  setFollowUpDate("");
                  setRxItems([]);
                  setRxProductId("");
                  setRxProductRow(null);
                  setSelectedImageFiles([]);
                  setPatientId("");
                  setPatientLabel("");
                  await fetchTodayTokens();
                  notify("Tokens refreshed & consultation form cleared");
                }}
                style={{ minHeight: "38px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                title="Refresh waiting tokens and clear all filled data"
              >
                <RotateCw size={14} /> Refresh &amp; Clear
              </button>

              {waitingTokens.length > 0 && (
                <div style={{ flex: 1, display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#166534" }}>Waiting Tokens:</span>
                  {waitingTokens.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        background: activeConsultationId === t.id ? "#0f766e" : "#fff",
                        border: activeConsultationId === t.id ? "2px solid #0f766e" : "1px solid #86efac",
                        borderRadius: "999px",
                        padding: "2px 4px 2px 10px",
                        gap: "4px",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => applyPreExamConsultation(t)}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: activeConsultationId === t.id ? "#fff" : "#14532d",
                          fontWeight: 600,
                          fontSize: "13px",
                          cursor: "pointer",
                          padding: "4px 0",
                        }}
                      >
                        #{t.vitals?.token_no} · {t.patient?.name}
                        {t.vitals?.bp ? ` (BP: ${t.vitals.bp})` : ""}
                      </button>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!window.confirm(`Are you sure you want to remove waiting Token #${t.vitals?.token_no} for ${t.patient?.name || "Patient"}?`)) return;
                          if (!supabase) return;
                          const { error } = await supabase.from("consultations").delete().eq("id", t.id).eq("organization_id", profile.organization_id);
                          if (!error) {
                            notify(`Token #${t.vitals?.token_no} removed`);
                            if (activeConsultationId === t.id) {
                              setActiveConsultationId(null);
                              setTokenLookupInput("");
                            }
                            fetchTodayTokens();
                          }
                        }}
                        title="Remove / Cancel this waiting token"
                        style={{
                          border: "none",
                          background: "transparent",
                          color: activeConsultationId === t.id ? "#fecaca" : "#991b1b",
                          cursor: "pointer",
                          padding: "2px 5px",
                          display: "inline-flex",
                          alignItems: "center",
                          borderRadius: "50%",
                        }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <FormPanel title={title} subtitle={subtitle} onSubmit={save}>
            {/* Patient in a Single Full-Width Row */}
            <div style={{ width: "100%", marginBottom: "14px" }}>
              <AsyncSelect
                table="patients"
                select="id,patient_id,name,mobile,medical_notes"
                searchColumns={["patient_id", "name", "mobile"]}
                label="Patient"
                value={patientId}
                displayValue={patientLabel}
                onChange={(id, row) => {
                  setPatientId(id);
                  setPatientLabel(row ? patientText(row) : "");
                  if (!id) {
                    setActiveConsultationId(null);
                    setDiagnosis("");
                  } else {
                    const match = todayTokens.find((t) => t.patient_id === id && t.vitals?.token_no && t.vitals?.status !== "completed");
                    if (match) {
                      applyPreExamConsultation(match);
                    } else {
                      setActiveConsultationId(null);
                      loadPatientPastHistory(id, row?.medical_notes);
                    }
                  }
                }}
                render={patientText}
              />
            </div>

            <div className="form-grid consultation-top-grid">
              {doctorLocked ? (
                <Field name="doctor_display" label="Doctor" value={doctorText(assignedDoctor!)} readOnly />
              ) : (
                <AsyncSelect
                  table="doctors"
                  select="id,doctor_id,name,mobile,specialization,default_fee"
                  searchColumns={["doctor_id", "name", "mobile", "specialization"]}
                  label="Doctor"
                  value={doctorId}
                  displayValue={doctors.find((d) => d.id === doctorId) ? doctorText(doctors.find((d) => d.id === doctorId)!) : undefined}
                  onChange={(id, row) => {
                    setDoctorId(id);
                    if (row) setDoctorFee(String(Number(row.default_fee || 0)));
                  }}
                  render={doctorText}
                />
              )}
              <Field name="doctor_fee" label="Doctor fee" type="number" required value={doctorFee} onChange={(event) => setDoctorFee(event.currentTarget.value)} />
              <Field name="follow_up_date" label="Follow-up date" type="date" value={followUpDate} onChange={(event) => setFollowUpDate(event.currentTarget.value)} />
            </div>

            {/* Pre-Examination Vitals Box (Auto-populated from Nurse Token or editable directly) */}
            <div style={{ margin: "14px 0", padding: "14px", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "8px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f5144", marginBottom: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Pre-Examination Vitals (BP, Sugar, Weight, Temp, Pulse, SpO2)</span>
                {tokenLookupInput && <span style={{ color: "#0f766e" }}>Token #{tokenLookupInput}</span>}
              </div>
              <div className="form-grid consultation-vitals-grid" style={{ gap: "10px" }}>
                <label className="field" style={{ margin: 0 }}>
                  <span>BP</span>
                  <input value={bp} onChange={(e) => setBp(e.currentTarget.value)} placeholder="120/80" />
                </label>
                <label className="field" style={{ margin: 0 }}>
                  <span>Sugar</span>
                  <input value={sugar} onChange={(e) => setSugar(e.currentTarget.value)} placeholder="mg/dL" />
                </label>
                <label className="field" style={{ margin: 0 }}>
                  <span>Weight</span>
                  <input value={weight} onChange={(e) => setWeight(e.currentTarget.value)} placeholder="kg" />
                </label>
                <label className="field" style={{ margin: 0 }}>
                  <span>Temperature</span>
                  <input value={temperature} onChange={(e) => setTemperature(e.currentTarget.value)} placeholder="°F" />
                </label>
                <label className="field" style={{ margin: 0 }}>
                  <span>Pulse</span>
                  <input value={pulse} onChange={(e) => setPulse(e.currentTarget.value)} placeholder="bpm" />
                </label>
                <label className="field" style={{ margin: 0 }}>
                  <span>SpO2</span>
                  <input value={spo2} onChange={(e) => setSpo2(e.currentTarget.value)} placeholder="%" />
                </label>
              </div>
            </div>

            <div className="form-grid">
              <Field name="symptoms" label="Symptoms" value={symptoms} onChange={(e) => setSymptoms(e.currentTarget.value)} placeholder="Patient symptoms..." />
              <Field name="diagnosis" label="Past History" value={diagnosis} onChange={(e) => setDiagnosis(e.currentTarget.value)} placeholder="Known conditions, allergies, past illnesses..." />
            </div>

            <Field name="clinical_notes" label="Advice" textarea value={clinicalNotes} onChange={(e) => setClinicalNotes(e.currentTarget.value)} placeholder="General advice, dietary instructions, precautions..." />

            {/* STRUCTURED PRESCRIPTION BUILDER (Product, Quantity, Morning / Afternoon / Evening / Night) */}
            <div style={{ margin: "18px 0", padding: "16px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", color: "#0f5144", display: "flex", alignItems: "center", gap: "6px" }}>
                    <ClipboardList size={18} /> Prescription Medicines (Auto-Syncs to Pharmacy Billing)
                  </h3>
                  <span style={{ fontSize: "12px", color: "#475569" }}>
                    Select product, choose timing (Morning / Afternoon / Evening / Night), and enter quantity. Or skip if writing on paper.
                  </span>
                </div>
              </div>

              {/* Row 1: Full-width Medicine Search Box */}
              <div style={{ width: "100%", marginBottom: "12px" }}>
                <AsyncSelect
                  table="products"
                  select="id,product_id,name,generic_name,category,sale_unit,mrp,selling_rate"
                  searchColumns={["product_id", "name", "generic_name", "category", "barcode"]}
                  label="Select Product / Medicine"
                  value={rxProductId}
                  displayValue={rxProductRow ? productText(rxProductRow) : undefined}
                  onChange={(id, row) => {
                    setRxProductId(id);
                    setRxProductRow(row || null);
                  }}
                  render={productText}
                />
              </div>

              {/* Row 2: Timing, Food, Days, Quantity in a clean responsive grid */}
              <div className="rx-details-grid">
                <div className="field" style={{ margin: 0, minWidth: 0 }}>
                  <span style={{ whiteSpace: "nowrap" }}>Timing (M - A - E - N)</span>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", minHeight: "56px", alignItems: "center", background: "#fff", padding: "6px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", width: "100%" }}>
                    {[
                      { label: "Morning", val: rxMorning, set: (v: boolean) => { setRxMorning(v); recalcRxQty(rxDays, v, rxAfternoon, rxEvening, rxNight); } },
                      { label: "Afternoon", val: rxAfternoon, set: (v: boolean) => { setRxAfternoon(v); recalcRxQty(rxDays, rxMorning, v, rxEvening, rxNight); } },
                      { label: "Evening", val: rxEvening, set: (v: boolean) => { setRxEvening(v); recalcRxQty(rxDays, rxMorning, rxAfternoon, v, rxNight); } },
                      { label: "Night", val: rxNight, set: (v: boolean) => { setRxNight(v); recalcRxQty(rxDays, rxMorning, rxAfternoon, rxEvening, v); } },
                    ].map((t) => (
                      <label
                        key={t.label}
                        className="rx-timing-chip"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "4px",
                          padding: "6px 12px",
                          borderRadius: "6px",
                          fontSize: "14px",
                          fontWeight: 600,
                          cursor: "pointer",
                          background: t.val ? "#126b5a" : "#f1f5f9",
                          color: t.val ? "#fff" : "#334155",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={t.val}
                          onChange={(e) => t.set(e.currentTarget.checked)}
                          style={{ display: "none" }}
                        />
                        {t.label}
                      </label>
                    ))}
                  </div>
                </div>

                <label className="field" style={{ margin: 0, minWidth: 0 }}>
                  <span style={{ whiteSpace: "nowrap" }}>Before/After Food</span>
                  <select value={rxFood} onChange={(e) => setRxFood(e.currentTarget.value)}>
                    <option value="After Food">After Food</option>
                    <option value="Before Food">Before Food</option>
                    <option value="With Food">With Food</option>
                    <option value="Anytime">Anytime</option>
                  </select>
                </label>

                <label className="field" style={{ margin: 0, minWidth: 0 }}>
                  <span style={{ whiteSpace: "nowrap" }}>Days</span>
                  <input
                    type="number"
                    min="1"
                    value={rxDays}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      setRxDays(v);
                      recalcRxQty(v, rxMorning, rxAfternoon, rxEvening, rxNight);
                    }}
                    placeholder="Days"
                  />
                </label>

                <label className="field" style={{ margin: 0, minWidth: 0 }}>
                  <span style={{ whiteSpace: "nowrap" }}>Quantity <b>*</b></span>
                  <input
                    type="number"
                    min="1"
                    value={rxQty}
                    onChange={(e) => setRxQty(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        addPrescriptionMedicine();
                      }
                    }}
                    placeholder="Qty"
                  />
                </label>
              </div>

              {/* Row 3: Bottom Add Medicine Button */}
              <div className="rx-add-btn-row" style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end" }}>
                <button type="button" className="primary" onClick={addPrescriptionMedicine} style={{ minHeight: "48px", padding: "0 24px" }}>
                  <Plus size={18} /> Add Medicine
                </button>
              </div>

              {rxItems.length > 0 && (
                <div className="data-wrap" style={{ marginTop: "14px", background: "#fff", borderRadius: "8px" }}>
                  <table className="data-table rx-med-table">
                    <thead>
                      <tr>
                        <th>Medicine</th>
                        <th>Timing</th>
                        <th>Food</th>
                        <th>Days</th>
                        <th>Quantity</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rxItems.map((item, idx) => {
                        const toggleTiming = (field: "morning" | "afternoon" | "evening" | "night") => {
                          const nextVal = !item[field];
                          const nextM = field === "morning" ? nextVal : item.morning;
                          const nextA = field === "afternoon" ? nextVal : item.afternoon;
                          const nextE = field === "evening" ? nextVal : item.evening;
                          const nextN = field === "night" ? nextVal : item.night;
                          const d = Number(item.days);
                          const perDay = (nextM ? 1 : 0) + (nextA ? 1 : 0) + (nextE ? 1 : 0) + (nextN ? 1 : 0);
                          const patch: Partial<PrescriptionItem> = { [field]: nextVal };
                          if (d > 0 && perDay > 0) {
                            patch.qty = d * perDay;
                          }
                          updateRxItem(idx, patch);
                        };
                        return (
                          <tr key={`${item.product_id}-${idx}`}>
                            <td className="rx-cell-full rx-cell-med" style={{ whiteSpace: "normal", wordBreak: "break-word", overflowWrap: "anywhere", minWidth: "200px" }}>
                              <strong>{item.name}</strong>
                            </td>
                            <td className="rx-cell-full rx-cell-timing">
                              <div className="rx-table-timing-row">
                                {[
                                  { key: "morning" as const, short: "M", title: "Morning", active: item.morning },
                                  { key: "afternoon" as const, short: "A", title: "Afternoon", active: item.afternoon },
                                  { key: "evening" as const, short: "E", title: "Evening", active: item.evening },
                                  { key: "night" as const, short: "N", title: "Night", active: item.night },
                                ].map((btn) => (
                                  <button
                                    key={btn.key}
                                    type="button"
                                    title={btn.title}
                                    className="rx-table-timing-btn"
                                    onClick={() => toggleTiming(btn.key)}
                                    style={{
                                      background: btn.active ? "#126b5a" : "#f1f5f9",
                                      color: btn.active ? "#fff" : "#334155",
                                      border: btn.active ? "1px solid #0f5144" : "1px solid #cbd5e1",
                                    }}
                                  >
                                    {btn.short}
                                  </button>
                                ))}
                              </div>
                            </td>
                            <td data-label="Food">
                              <select value={item.food} onChange={(e) => updateRxItem(idx, { food: e.currentTarget.value })} style={{ padding: "4px 6px", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                                <option value="After Food">After Food</option>
                                <option value="Before Food">Before Food</option>
                                <option value="With Food">With Food</option>
                                <option value="Anytime">Anytime</option>
                              </select>
                            </td>
                            <td data-label="Days">
                              <input
                                className="table-qty-input"
                                type="number"
                                min="1"
                                value={item.days}
                                onChange={(e) => {
                                  const nextDays = e.currentTarget.value;
                                  const d = Number(nextDays);
                                  const perDay = (item.morning ? 1 : 0) + (item.afternoon ? 1 : 0) + (item.evening ? 1 : 0) + (item.night ? 1 : 0);
                                  const patch: Partial<PrescriptionItem> = { days: nextDays };
                                  if (d > 0 && perDay > 0) {
                                    patch.qty = d * perDay;
                                  }
                                  updateRxItem(idx, patch);
                                }}
                                style={{ width: "65px" }}
                              />
                            </td>
                            <td data-label="Quantity">
                              <input
                                className="table-qty-input"
                                type="number"
                                min="1"
                                value={item.qty}
                                onChange={(e) => updateRxItem(idx, { qty: Number(e.currentTarget.value) || 1 })}
                                style={{ width: "75px", fontWeight: 700 }}
                              />
                            </td>
                            <td className="rx-cell-full rx-cell-action">
                              <button type="button" className="table-edit danger-btn" onClick={() => removeRxItem(idx)}>
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <Field
              name="prescription_notes"
              label="Additional Prescription Notes (or paper prescription remarks)"
              textarea
              value={prescriptionNotes}
              onChange={(e) => setPrescriptionNotes(e.currentTarget.value)}
            />

            <div className="prescription-actions" style={{ display: "flex", gap: "16px", marginBottom: "20px" }}>
              <button
                type="button"
                className="prescription-action"
                onClick={takePhoto}
                style={{ flex: 1, display: "flex", flexDirection: "column", padding: "16px", background: "#f8faf9", border: "1px solid #e2e8f0", borderRadius: "8px", cursor: "pointer", textAlign: "center" }}
              >
                <Camera size={22} style={{ margin: "0 auto 8px" }} />
                <strong>Take photo</strong>
                <span style={{ fontSize: "12px", color: "#64748b" }}>Press to add camera photo</span>
              </button>
              <input
                ref={browserCameraInput}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={(e) => {
                  const added = Array.from(e.target.files || []);
                  setSelectedImageFiles((current) => [...current, ...added]);
                  e.target.value = "";
                }}
              />
              <label
                className="prescription-action"
                style={{ flex: 1, display: "flex", flexDirection: "column", padding: "16px", background: "#f8faf9", border: "1px solid #e2e8f0", borderRadius: "8px", cursor: "pointer", textAlign: "center" }}
              >
                <Paperclip size={22} style={{ margin: "0 auto 8px" }} />
                <strong>Choose images</strong>
                <span style={{ fontSize: "12px", color: "#64748b" }}>Select multiple images</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const added = Array.from(e.target.files || []);
                    setSelectedImageFiles((current) => [...current, ...added]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>

            {selectedImageFiles.length > 0 && (
              <div className="selected-images" style={{ marginBottom: "20px", padding: "12px", background: "#eef2ff", borderRadius: "8px" }}>
                <strong>
                  {selectedImageFiles.length} image{selectedImageFiles.length === 1 ? "" : "s"} ready to upload
                </strong>
                <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {selectedImageFiles.map((file, index) => (
                    <span key={`${file.name}-${file.lastModified}-${index}`} style={{ fontSize: "14px" }}>
                      {index + 1}. {file.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="form-actions" style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <button className="primary" disabled={saving}>
                {saving ? <LoaderCircle className="spin" /> : <CheckCircle2 size={16} />} Save consultation &amp; prescription
              </button>
              <button
                type="button"
                className="secondary"
                disabled={saving}
                onClick={printCurrentConsultation}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <Printer size={16} /> Print Prescription
              </button>
            </div>
          </FormPanel>
        </div>

        {/* TAB 2: PATIENT HISTORY TAB (Inside Consultation Page) */}
        <div style={{ display: activeTab === "history" ? "block" : "none" }}>
          {patientId ? (
            <HistoryList
              patientId={patientId}
              patientLabel={patientLabel}
              organization={organization}
              onCountChange={setHistoryCount}
            />
          ) : (
            <div className="panel">
              <div className="empty">
                <h3>No patient selected</h3>
                <p>Select a patient or enter a Token Number in the Consultation tab to view their medical history.</p>
                <button type="button" className="primary" onClick={() => setActiveTab("consultation")} style={{ marginTop: "10px" }}>
                  Go to Consultation Tab
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function PatientHistoryWorkflow({ profile, organization, notify }: { profile: Profile; organization?: Organization | null; notify: (message: string) => void }) {
  return <ConsultationWorkflow profile={profile} organization={organization} notify={notify} title="Patient History" subtitle="Review patient timeline, print prescriptions, and attach images" hideNotes={true} />;
}

export function FollowUpWorkflow({ profile }: { profile?: Profile }) {
  const today = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    if (!supabase) return;
    let query = supabase
      .from("consultations")
      .select("id,visited_at,follow_up_date,symptoms,diagnosis,patient:patients(patient_id,name,mobile),doctor:doctors(name)")
      .gte("follow_up_date", fromDate)
      .lte("follow_up_date", toDate);
    if (profile?.organization_id) query = query.eq("organization_id", profile.organization_id);
    query.order("follow_up_date", { ascending: true }).limit(200).then(({ data }) => setRows(data || []));
  }, [fromDate, toDate, profile?.organization_id]);
  return (
    <div className="follow-up-page">
      <div className="page-head">
        <div>
          <h1>Follow-up Alerts</h1>
          <p>Follow-ups due in the selected date range</p>
        </div>
      </div>
      <div className="panel">
        <div className="followup-date-range">
          <label className="field">
            <span>From</span>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.currentTarget.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={toDate} min={fromDate} onChange={(event) => setToDate(event.currentTarget.value)} />
          </label>
        </div>
        {rows.length ? (
          <div className="data-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Follow-up</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Visit</th>
                  <th>Symptoms</th>
                  <th>Diagnosis</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Follow-up">{fmtDate(row.follow_up_date)}</td>
                    <td data-label="Patient">{row.patient?.name}</td>
                    <td data-label="Doctor">{row.doctor?.name}</td>
                    <td data-label="Visit">{fmtDate(row.visited_at)}</td>
                    <td data-label="Symptoms">{row.symptoms || "-"}</td>
                    <td data-label="Diagnosis">{row.diagnosis || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h3>No follow-ups found.</h3>
            <p>Change the date range to search.</p>
          </div>
        )}
      </div>
    </div>
  );
}


