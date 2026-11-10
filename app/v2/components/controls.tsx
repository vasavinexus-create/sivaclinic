"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, Plus, Search, X } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { nextCode } from "../lib/format";
import { Row } from "../lib/types";
import { usePowerSync } from "@powersync/react";

export function focusNextFormField(target: HTMLElement) {
  const container = target.closest("form, .modal, .billing-panel, .panel") as HTMLElement | null;
  if (!container) return;

  const isTableInput = target.classList.contains("table-qty-input");
  const allCandidates = Array.from(
    container.querySelectorAll<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), select:not([disabled]), button:not([disabled])'
    )
  );

  const fields = allCandidates.filter((el) => {
    if (el.offsetWidth <= 0 || el.offsetHeight <= 0) return false;
    if (el.closest(".async-options, .patient-listbox, .v2-toolbar, .table-toolbar, .row-actions, .user-row-actions, .modal-head, .print-hide")) {
      return false;
    }
    if (!isTableInput && el.classList.contains("table-qty-input")) {
      return false;
    }
    if (el instanceof HTMLButtonElement) {
      const type = el.getAttribute("type");
      const isActionBtn =
        type === "submit" ||
        el.classList.contains("primary") ||
        el.classList.contains("add-purchase-item");
      return isActionBtn;
    }
    return true;
  });

  const index = fields.indexOf(target);
  if (index < 0) return;

  // If the current field is inside .purchase-single-row-grid, and the next element is the add button, focus it
  const next = fields[index + 1];
  if (next) {
    next.focus();
    if (next instanceof HTMLInputElement && typeof next.select === "function") {
      next.select();
    }
    return;
  }

  const submit = fields.find(
    (el) =>
      el instanceof HTMLButtonElement &&
      (el.getAttribute("type") === "submit" || el.classList.contains("primary"))
  );
  submit?.focus();
}

export function handleFormEnterKey(e: React.KeyboardEvent<HTMLElement>) {
  if (e.defaultPrevented || e.key !== "Enter" || e.altKey || e.ctrlKey || e.metaKey) return;
  const target = e.target as HTMLElement;
  if (!target) return;
  if (target.tagName === "BUTTON" || target.tagName === "A") return;
  if (target.tagName === "TEXTAREA" && !e.shiftKey) return;
  // Do not hijack toolbar search boxes that aren't part of data entry forms
  if (target.closest(".v2-toolbar, .table-toolbar")) return;
  if (!target.closest("form, .modal, .billing-panel, .panel")) return;

  e.preventDefault();
  focusNextFormField(target);
}

export function Field({ name, label, type = "text", required, textarea, defaultValue, value, onChange, readOnly, placeholder }: { name: string; label: string; type?: string; required?: boolean; textarea?: boolean; defaultValue?: string | number | null; value?: string | number; onChange?: (event: any) => void; readOnly?: boolean; placeholder?: string }) {
  return <label className="field"><span>{label}{required && <b> *</b>}</span>{textarea ? <textarea name={name} required={required} defaultValue={defaultValue ?? undefined} value={value} onChange={onChange} readOnly={readOnly} placeholder={placeholder}/> : <input name={name} type={type} required={required} defaultValue={defaultValue ?? undefined} value={value} onChange={onChange} readOnly={readOnly} placeholder={placeholder} step={type === "number" ? "0.01" : undefined}/>}</label>;
}

export function FormPanel({ title, subtitle, children, onSubmit }: { title: string; subtitle: string; children: React.ReactNode; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div><div className="page-head"><div><h1>{title}</h1><p>{subtitle}</p></div></div><div className="panel form-panel"><form onSubmit={onSubmit}>{children}</form></div></div>;
}

export function AsyncSelect({ table, select, searchColumns, label, value, onChange, render, placeholder = "Search", orderBy = "name", displayValue, inputRef: externalInputRef }: { table: string; select: string; searchColumns: string[]; label: string; value: string; onChange: (id: string, row?: Row) => void; render: (row: Row) => string; placeholder?: string; orderBy?: string; displayValue?: string; inputRef?: React.RefObject<HTMLInputElement | null> }) {
  const powerSync = usePowerSync();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [refreshKey, setRefreshKey] = useState(0);
  const internalInputRef = useRef<HTMLInputElement | null>(null);
  const optionsRef = useRef<HTMLDivElement | null>(null);
  const isNavigatingRef = useRef(false);

  const setInputEl = (el: HTMLInputElement | null) => {
    internalInputRef.current = el;
    if (externalInputRef) {
      (externalInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
    }
  };

  useEffect(() => {
    if (isNavigatingRef.current) return;
    if (!value) setQuery("");
    else if (displayValue) setQuery(displayValue);
  }, [value, displayValue]);

  useEffect(() => {
    if (isNavigatingRef.current) {
      isNavigatingRef.current = false;
      return;
    }
    let alive = true;
    const rawTrimmed = query.trim();
    // If an item is already selected, do not filter options by its formatted display text
    const normalizedSearch = value
      ? ""
      : rawTrimmed.includes(" - ")
      ? rawTrimmed.split(" - ").map((s) => s.trim()).filter(Boolean)[0] || ""
      : rawTrimmed;
    const term = normalizedSearch.length > 0 ? `%${normalizedSearch}%` : null;

    const fetchFromSupabase = () => {
      if (!supabase) return;
      const client = supabase;
      if (!term) {
        client.from(table).select(select).limit(20).then(({ data }) => {
          if (alive && data) {
            setRows(data as Row[]);
            setActiveIndex(-1);
          }
        });
      } else {
        Promise.all(searchColumns.map((column) => client.from(table).select(select).ilike(column, term).limit(20))).then((results) => {
          if (!alive) return;
          const byId = new Map<string, Row>();
          results.flatMap((result) => result.data || []).forEach((row: Row) => byId.set(row.id, row));
          const matched = Array.from(byId.values());
          if (matched.length === 0 && rawTrimmed.includes(" - ")) {
            client.from(table).select(select).limit(20).then(({ data }) => {
              if (alive && data) {
                setRows(data as Row[]);
                setActiveIndex(-1);
              }
            });
          } else {
            setRows(matched);
            setActiveIndex(-1);
          }
        });
      }
    };
    
    // Offline fast path for PowerSync synced tables, with automatic fallback to Supabase
    if (["patients", "products", "suppliers"].includes(table) && powerSync?.currentStatus?.hasSynced) {
      const sqlPromise = !term
        ? powerSync.getAll(`SELECT * FROM ${table} ORDER BY ${orderBy} ASC LIMIT 20`)
        : (() => {
            const condition = searchColumns.map(col => `${col} LIKE ?`).join(" OR ");
            const params = searchColumns.map(() => term);
            return powerSync.getAll(
              `SELECT * FROM ${table} WHERE ${condition} ORDER BY CASE WHEN ${orderBy} LIKE ? THEN 0 ELSE 1 END, ${orderBy} ASC LIMIT 20`,
              [...params, `${normalizedSearch}%`]
            );
          })();

      sqlPromise
        .then(data => {
          if (!alive) return;
          if (data && data.length > 0) {
            setRows(data as Row[]);
            setActiveIndex(-1);
          } else {
            fetchFromSupabase();
          }
        })
        .catch(() => {
          if (alive) fetchFromSupabase();
        });

      return () => { alive = false; };
    }

    fetchFromSupabase();
    return () => { alive = false; };
  }, [query, value, refreshKey, table, select, searchColumns.join("|"), powerSync, orderBy]);

  useEffect(() => {
    if (activeIndex >= 0 && optionsRef.current) {
      const activeEl = optionsRef.current.children[activeIndex] as HTMLElement | undefined;
      activeEl?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  const clearSelection = () => {
    isNavigatingRef.current = false;
    setActiveIndex(-1);
    setQuery("");
    onChange("", undefined);
    setOpen(true);
    setRefreshKey((k) => k + 1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Backspace" || e.key === "Delete") && value) {
      e.preventDefault();
      clearSelection();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
      }
      if (rows.length > 0) {
        const nextIdx = activeIndex < rows.length - 1 ? activeIndex + 1 : 0;
        const chosen = rows[nextIdx];
        setActiveIndex(nextIdx);
        isNavigatingRef.current = true;
        setQuery(render(chosen));
        onChange(chosen.id, chosen);
        setTimeout(() => { isNavigatingRef.current = false; }, 0);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
      }
      if (rows.length > 0) {
        const prevIdx = activeIndex > 0 ? activeIndex - 1 : rows.length - 1;
        const chosen = rows[prevIdx];
        setActiveIndex(prevIdx);
        isNavigatingRef.current = true;
        setQuery(render(chosen));
        onChange(chosen.id, chosen);
        setTimeout(() => { isNavigatingRef.current = false; }, 0);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (open && rows.length > 0) {
        const chosen = rows[activeIndex >= 0 && activeIndex < rows.length ? activeIndex : 0];
        if (chosen && (!value || activeIndex >= 0)) {
          isNavigatingRef.current = true;
          onChange(chosen.id, chosen);
          setQuery(render(chosen));
          setTimeout(() => { isNavigatingRef.current = false; }, 0);
        }
        setOpen(false);
        setActiveIndex(-1);
      }
      setTimeout(() => {
        if (internalInputRef.current) {
          focusNextFormField(internalInputRef.current);
        }
      }, 20);
    }
  };

  const hasSelectedDisplay = Boolean(value && query);

  return (
    <label className="field async-select" style={{ position: "relative" }} onBlur={(e) => {
      // If the new focused element is not inside this label, close the dropdown
      if (!e.currentTarget.contains(e.relatedTarget)) {
        setTimeout(() => setOpen(false), 150);
      }
    }}>
      <span>{label}<b> *</b></span>
      <div
        className="search-box"
        style={{
          position: "relative",
          height: "auto",
          minHeight: "56px",
          padding: "8px 14px",
          alignItems: "center",
        }}
      >
        <Search size={16} style={{ flexShrink: 0 }} />
        {hasSelectedDisplay && (
          <div
            className="async-selected-display"
            style={{
              flex: 1,
              minWidth: 0,
              whiteSpace: "normal",
              wordBreak: "break-word",
              overflowWrap: "anywhere",
              lineHeight: 1.4,
              padding: "2px 4px",
              color: "#0f172a",
              fontWeight: 500,
            }}
          >
            {query}
          </div>
        )}
        <input 
          ref={setInputEl}
          value={hasSelectedDisplay ? "" : query} 
          onChange={(event) => {
            const nextVal = event.currentTarget.value;
            isNavigatingRef.current = false;
            setActiveIndex(-1);
            setOpen(true);
            setQuery(nextVal);
            if (value) onChange("", undefined);
            if (!nextVal.trim()) setRefreshKey((k) => k + 1);
          }} 
          onFocus={() => {
            setOpen(true);
            if (rows.length === 0) setRefreshKey((k) => k + 1);
          }} 
          onClick={() => {
            setOpen(true);
            if (rows.length === 0) setRefreshKey((k) => k + 1);
          }}
          onKeyDown={handleKeyDown}
          placeholder={hasSelectedDisplay ? "" : placeholder} 
          autoComplete="off"
          style={
            hasSelectedDisplay
              ? {
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  opacity: 0,
                  cursor: "pointer",
                  margin: 0,
                }
              : {
                  flex: 1,
                  minWidth: 0,
                  width: "100%",
                }
          }
        />
        {(query || value) && (
          <button
            type="button"
            className="async-clear-btn"
            tabIndex={-1}
            title="Clear selection"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              clearSelection();
              internalInputRef.current?.focus();
            }}
            style={{
              position: "relative",
              zIndex: 2,
              background: "transparent",
              border: "none",
              padding: "2px 4px",
              cursor: "pointer",
              color: "#64748b",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>
      <input type="hidden" value={value} required readOnly />
      {open && rows.length > 0 && (
        <div ref={optionsRef} className="async-options" style={{
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          minWidth: "260px",
          maxHeight: "300px",
          overflowY: "auto",
          background: "#fff",
          border: "1px solid #cbd5e1",
          borderRadius: "8px",
          boxShadow: "0 12px 28px -5px rgba(0,0,0,0.16)",
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          marginTop: "4px"
        }}>
          {rows.map((row, index) => {
            const isActive = index === activeIndex || (activeIndex === -1 && value === row.id);
            return (
              <button 
                type="button" 
                key={row.id} 
                onMouseDown={(e) => {
                  e.preventDefault();
                  isNavigatingRef.current = true;
                  onChange(row.id, row);
                  setQuery(render(row));
                  setOpen(false);
                  setActiveIndex(index);
                  setTimeout(() => {
                    isNavigatingRef.current = false;
                    if (internalInputRef.current) focusNextFormField(internalInputRef.current);
                  }, 20);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                style={{
                  padding: "10px 14px",
                  textAlign: "left",
                  background: isActive ? "#e6f4f1" : "none",
                  color: isActive ? "#0f5144" : "#1e293b",
                  fontWeight: isActive ? 600 : 400,
                  border: "none",
                  borderLeft: isActive ? "3px solid #126b5a" : "3px solid transparent",
                  borderBottom: "1px solid #f1f5f9",
                  cursor: "pointer",
                  fontSize: "inherit",
                  whiteSpace: "normal",
                  wordBreak: "break-word",
                  overflowWrap: "anywhere",
                  height: "auto",
                  minHeight: "44px",
                  lineHeight: 1.4,
                }}
              >
                {render(row)}
              </button>
            );
          })}
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
