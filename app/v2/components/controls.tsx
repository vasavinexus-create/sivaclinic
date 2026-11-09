"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, Plus, Search, X } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { nextCode } from "../lib/format";
import { Row } from "../lib/types";

export function Field({ name, label, type = "text", required, textarea, defaultValue, value, onChange, readOnly }: { name: string; label: string; type?: string; required?: boolean; textarea?: boolean; defaultValue?: string | number | null; value?: string | number; onChange?: (event: any) => void; readOnly?: boolean }) {
  return <label className="field"><span>{label}{required && <b> *</b>}</span>{textarea ? <textarea name={name} required={required} defaultValue={defaultValue ?? undefined} value={value} onChange={onChange} readOnly={readOnly}/> : <input name={name} type={type} required={required} defaultValue={defaultValue ?? undefined} value={value} onChange={onChange} readOnly={readOnly} step={type === "number" ? "0.01" : undefined}/>}</label>;
}

export function FormPanel({ title, subtitle, children, onSubmit }: { title: string; subtitle: string; children: React.ReactNode; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div><div className="page-head"><div><h1>{title}</h1><p>{subtitle}</p></div></div><div className="panel form-panel"><form onSubmit={onSubmit}>{children}</form></div></div>;
}

import { usePowerSync } from "@powersync/react";

export function AsyncSelect({ table, select, searchColumns, label, value, onChange, render, placeholder = "Search", orderBy = "name", displayValue }: { table: string; select: string; searchColumns: string[]; label: string; value: string; onChange: (id: string, row?: Row) => void; render: (row: Row) => string; placeholder?: string; orderBy?: string; displayValue?: string }) {
  const powerSync = usePowerSync();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!value) setQuery("");
    else if (displayValue) setQuery(displayValue);
  }, [value, displayValue]);

  useEffect(() => {
    let alive = true;
    const term = query.trim().length > 0 ? `%${query.trim()}%` : null;
    
    // Offline fast path for PowerSync synced tables
    if (["patients", "products", "suppliers"].includes(table)) {
      if (!term) {
        powerSync.getAll(`SELECT * FROM ${table} ORDER BY ${orderBy} ASC LIMIT 20`).then(data => {
          if (alive) setRows(data as Row[]);
        });
      } else {
        const condition = searchColumns.map(col => `${col} LIKE ?`).join(" OR ");
        const params = searchColumns.map(() => term);
        powerSync.getAll(`SELECT * FROM ${table} WHERE ${condition} ORDER BY CASE WHEN ${orderBy} LIKE ? THEN 0 ELSE 1 END, ${orderBy} ASC LIMIT 20`, [...params, `${query.trim()}%`]).then(data => {
          if (alive) setRows(data as Row[]);
        });
      }
      return () => { alive = false; };
    }

    if (!supabase) return;
    const client = supabase;
    if (!term) {
      client.from(table).select(select).limit(20).then(({ data }) => {
        if (alive && data) setRows(data as Row[]);
      });
    } else {
      Promise.all(searchColumns.map((column) => client.from(table).select(select).ilike(column, term).limit(20))).then((results) => {
        if (!alive) return;
        const byId = new Map<string, Row>();
        results.flatMap((result) => result.data || []).forEach((row: Row) => byId.set(row.id, row));
        setRows(Array.from(byId.values()));
      });
    }
    return () => { alive = false; };
  }, [query, table, select, searchColumns.join("|"), powerSync]);

  return (
    <label className="field async-select" style={{ position: "relative" }} onBlur={(e) => {
      // If the new focused element is not inside this label, close the dropdown
      if (!e.currentTarget.contains(e.relatedTarget)) {
        setTimeout(() => setOpen(false), 150);
      }
    }}>
      <span>{label}<b> *</b></span>
      <div className="search-box">
        <Search size={15} />
        <input 
          value={query} 
          onChange={(event) => { setQuery(event.currentTarget.value); if (value) onChange("", undefined); }} 
          onFocus={() => setOpen(true)} 
          placeholder={placeholder} 
        />
      </div>
      <input type="hidden" value={value} required readOnly />
      {open && !value && rows.length > 0 && (
        <div className="async-options" style={{
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          maxHeight: "250px",
          overflowY: "auto",
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          marginTop: "4px"
        }}>
          {rows.map((row) => (
            <button 
              type="button" 
              key={row.id} 
              onMouseDown={(e) => { e.preventDefault(); onChange(row.id, row); setQuery(render(row)); setOpen(false); }} onClick={() => { onChange(row.id, row); setQuery(render(row)); setOpen(false); }}
              style={{
                padding: "12px 16px",
                textAlign: "left",
                background: "none",
                border: "none",
                borderBottom: "1px solid #f1f5f9",
                cursor: "pointer",
                fontSize: "inherit"
              }}
              onMouseOver={(e) => e.currentTarget.style.background = "#f8faf9"}
              onMouseOut={(e) => e.currentTarget.style.background = "none"}
            >
              {render(row)}
            </button>
          ))}
        </div>
      )}
    </label>
  );
}

export function QuickPatientModal({
  organizationId,
  profile,
  onCreated,
  notify,
}: {
  organizationId?: string;
  profile?: { id?: string; organization_id: string };
  onCreated: (patient: Row) => void;
  notify: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("Male");
  const [mobile, setMobile] = useState("");

  const orgId = organizationId || profile?.organization_id || "";

  const handleSave = async () => {
    if (!supabase || !name.trim()) {
      notify("Enter patient name");
      return;
    }
    setSaving(true);
    try {
      const patientCode = nextCode("PAT");
      const { data: created, error } = await supabase
        .from("patients")
        .insert({
          organization_id: orgId,
          patient_id: patientCode,
          name: name.trim(),
          age: age ? Number(age) : null,
          gender: gender || null,
          mobile: mobile.trim() || null,
        })
        .select("id,patient_id,name,age,gender,mobile")
        .single();

      if (error || !created) throw error || new Error("Failed to create patient");

      notify(`Patient ${created.name} (${created.patient_id}) created`);
      onCreated(created);
      setOpen(false);
      setName("");
      setAge("");
      setMobile("");
    } catch (err: any) {
      notify(err.message || "Could not create patient");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="secondary"
        onClick={() => setOpen(true)}
        style={{ minHeight: "38px", whiteSpace: "nowrap" }}
      >
        <Plus size={15} /> New Patient
      </button>
      {open && (
        <div className="modal-wrap print-hide">
          <div className="modal" style={{ maxWidth: "460px" }}>
            <div className="modal-head">
              <div>
                <h2>Quick Add Patient</h2>
                <p>Register a new patient without leaving this screen.</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="form-grid" style={{ marginTop: "14px" }}>
              <label className="field">
                <span>Patient name <b>*</b></span>
                <input
                  value={name}
                  onChange={(e) => setName(e.currentTarget.value)}
                  placeholder="Full name"
                  autoFocus
                />
              </label>
              <label className="field">
                <span>Age</span>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={age}
                  onChange={(e) => setAge(e.currentTarget.value)}
                  placeholder="Years"
                />
              </label>
              <label className="field">
                <span>Gender</span>
                <select value={gender} onChange={(e) => setGender(e.currentTarget.value)}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              <label className="field">
                <span>Mobile number</span>
                <input
                  value={mobile}
                  onChange={(e) => setMobile(e.currentTarget.value)}
                  placeholder="10-digit mobile"
                />
              </label>
            </div>
            <div className="form-actions" style={{ marginTop: "18px" }}>
              <button type="button" className="secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={handleSave} disabled={saving}>
                {saving ? <LoaderCircle size={15} className="spin" /> : <CheckCircle2 size={15} />} Save &amp; Select
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
