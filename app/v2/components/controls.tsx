"use client";

import { FormEvent, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { Row } from "../lib/types";

export function Field({ name, label, type = "text", required, textarea, defaultValue, value, onChange, readOnly }: { name: string; label: string; type?: string; required?: boolean; textarea?: boolean; defaultValue?: string | number | null; value?: string | number; onChange?: (event: any) => void; readOnly?: boolean }) {
  return <label className="field"><span>{label}{required && <b> *</b>}</span>{textarea ? <textarea name={name} required={required} defaultValue={defaultValue ?? undefined} value={value} onChange={onChange} readOnly={readOnly}/> : <input name={name} type={type} required={required} defaultValue={defaultValue ?? undefined} value={value} onChange={onChange} readOnly={readOnly} step={type === "number" ? "0.01" : undefined}/>}</label>;
}

export function FormPanel({ title, subtitle, children, onSubmit }: { title: string; subtitle: string; children: React.ReactNode; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div><div className="page-head"><div><h1>{title}</h1><p>{subtitle}</p></div></div><div className="panel form-panel"><form onSubmit={onSubmit}>{children}</form></div></div>;
}

export function AsyncSelect({ table, select, searchColumns, label, value, onChange, render, placeholder = "Search" }: { table: string; select: string; searchColumns: string[]; label: string; value: string; onChange: (id: string, row?: Row) => void; render: (row: Row) => string; placeholder?: string }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!supabase || query.trim().length < 1) {
      setRows([]);
      return;
    }
    const client = supabase;
    let alive = true;
    const term = `%${query.trim()}%`;
    Promise.all(searchColumns.map((column) => client.from(table).select(select).ilike(column, term).limit(20))).then((results) => {
      if (!alive) return;
      const byId = new Map<string, Row>();
      results.flatMap((result) => result.data || []).forEach((row: Row) => byId.set(row.id, row));
      setRows(Array.from(byId.values()));
      setOpen(true);
    });
    return () => { alive = false; };
  }, [query, table, select, searchColumns.join("|")]);

  return <label className="field async-select"><span>{label}<b> *</b></span><div className="search-box"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.currentTarget.value)} onFocus={() => setOpen(true)} placeholder={placeholder}/></div><input type="hidden" value={value} required readOnly/>{open && rows.length > 0 && <div className="async-options">{rows.map((row) => <button type="button" key={row.id} onClick={() => { onChange(row.id, row); setQuery(render(row)); setOpen(false); }}>{render(row)}</button>)}</div>}</label>;
}
