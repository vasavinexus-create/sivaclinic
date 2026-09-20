"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, Pencil, Plus, RefreshCw, Search, X } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { fmtDate, money, nextCode } from "../lib/format";
import { pageSizeOptions } from "../lib/modules";
import { usePagedQuery } from "../lib/usePagedQuery";
import { FieldConfig, ModuleConfig, Profile, Row } from "../lib/types";

function isMoneyColumn(key: string) {
  return key.includes("fee") || key.includes("rate") || key.includes("amount") || key.includes("balance") || key === "mrp";
}

function valueAt(row: Row, key: string) {
  return key.split(".").reduce((value: any, part) => value?.[part], row);
}

function renderCell(row: Row, key: string) {
  const value = valueAt(row, key);
  if (key.includes("date") || key.includes("_at")) return fmtDate(value);
  if (isMoneyColumn(key)) return money(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value ?? "-");
}

function formValue(field: FieldConfig, form: FormData) {
  const raw = form.get(field.key);
  if (field.type === "number") return raw !== null && String(raw) !== "" ? Number(raw) : null;
  return raw ? String(raw) : null;
}

export default function PagedCrud({ module, profile, notify }: { module: ModuleConfig; profile: Profile; notify: (message: string) => void }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const editable = module.editable !== false && module.fields.length > 0;
  const state = usePagedQuery({ module, page, pageSize, search, filters, organizationId: profile.organization_id });
  const pageCount = Math.max(1, Math.ceil(state.count / pageSize));

  useEffect(() => {
    const id = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput);
    }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
    setSearchInput("");
    setSearch("");
    setFilters({});
    setOpen(false);
    setEditing(null);
  }, [module.key]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const rangeLabel = useMemo(() => {
    if (!state.count) return "0 records";
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, state.count);
    return `${start}-${end} of ${state.count}`;
  }, [page, pageSize, state.count]);

  const close = () => {
    setOpen(false);
    setEditing(null);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const payload: Row = { organization_id: profile.organization_id };
    module.fields.forEach((field) => {
      if (field.readonlyOnCreate && !editing) return;
      payload[field.key] = formValue(field, form);
    });
    if (!editing && module.idPrefix) {
      const idField = module.fields.find((field) => field.key.endsWith("_id"))?.key;
      if (idField) payload[idField] = nextCode(module.idPrefix);
    }
    const result = editing
      ? await supabase.from(module.table).update(payload).eq("id", editing.id).select("id").single()
      : await supabase.from(module.table).insert(payload).select("id").single();
    setSaving(false);
    if (result.error || !result.data) {
      notify(result.error?.message || "Save failed");
      return;
    }
    notify(`${module.title} ${editing ? "updated" : "saved"}`);
    close();
    state.reload();
  };

  return <div>
    <div className="page-head">
      <div><h1>{module.title}</h1><p>{module.subtitle}</p></div>
      {editable && <button className="primary" onClick={() => { setEditing(null); setOpen(true); }}><Plus size={17}/> Add {module.title}</button>}
    </div>
    <div className="panel">
      <div className="v2-toolbar">
        <div className="search-box"><Search/><input placeholder={`Search ${module.title.toLowerCase()} in database`} value={searchInput} onChange={(event) => setSearchInput(event.currentTarget.value)}/></div>
        {module.filters?.map((filter) => <label className="v2-filter" key={filter.key}><span>{filter.label}</span><select value={filters[filter.key] || ""} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, [filter.key]: event.currentTarget.value })); }}><option value="">All</option>{filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}
        <label className="v2-filter"><span>Rows</span><select value={pageSize} onChange={(event) => { setPage(1); setPageSize(Number(event.currentTarget.value)); }}>{pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
        <button className="secondary" onClick={state.reload}><RefreshCw size={15}/> Refresh</button>
      </div>
      {state.error ? <div className="error-box">{state.error}</div> : state.loading ? <div className="loading-panel"><LoaderCircle className="spin"/> Loading from database...</div> : state.rows.length ? <>
        <div className="data-wrap"><table className="data-table"><thead><tr>{module.columns.map(([key, label]) => <th key={key}>{label}</th>)}{editable && <th>Action</th>}</tr></thead><tbody>{state.rows.map((row) => <tr key={row.id}>{module.columns.map(([key]) => <td key={key}>{renderCell(row, key)}</td>)}{editable && <td><button className="table-edit" onClick={() => { setEditing(row); setOpen(true); }}><Pencil size={14}/> Edit</button></td>}</tr>)}</tbody></table></div>
        <div className="pagination-bar"><span>{rangeLabel}</span><div><button className="secondary" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Prev</button><span>Page {page} / {pageCount}</span><button className="secondary" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button></div></div>
      </> : <div className="empty"><h3>No matching records found.</h3><p>Try another search or clear filters.</p></div>}
    </div>
    {editable && open && <div className="modal-wrap"><div className="modal"><div className="modal-head"><div><h2>{editing ? "Edit" : "Add"} {module.title}</h2><p>{editing ? "Update only this record" : "New record uses generated code where required"}</p></div><button className="icon-btn" onClick={close}><X size={18}/></button></div><form onSubmit={save}><div className="form-grid">{module.fields.map((field) => {
      const value = editing?.[field.key] ?? field.defaultValue ?? "";
      if (field.readonlyOnCreate && !editing) return <label className="field" key={field.key}><span>{field.label}</span><input value="Auto generated" readOnly/></label>;
      if (field.type === "select") return <label className="field" key={field.key}><span>{field.label}{field.required && <b> *</b>}</span><select name={field.key} required={field.required} defaultValue={value}>{!field.required && <option value="">Select {field.label}</option>}{field.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
      return <label className="field" key={field.key}><span>{field.label}{field.required && <b> *</b>}</span><input name={field.key} type={field.type || "text"} required={field.required} defaultValue={value} step={field.type === "number" ? "0.01" : undefined}/></label>;
    })}</div><div className="form-actions"><button type="button" className="secondary" onClick={close}>Cancel</button><button className="primary" disabled={saving}>{saving ? <LoaderCircle className="spin"/> : <CheckCircle2 size={16}/>} {editing ? "Update" : "Save"}</button></div></form></div></div>}
  </div>;
}
