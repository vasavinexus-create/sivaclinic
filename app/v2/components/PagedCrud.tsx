"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileSpreadsheet, LoaderCircle, Pencil, Plus, RefreshCw, Search, X } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { getEffectiveStock, insertStockMovementSafe } from "../../../lib/inventory-stock";
import { fmtDate, money, nextCode } from "../lib/format";
import { pageSizeOptions } from "../lib/modules";
import { usePagedQuery } from "../lib/usePagedQuery";
import { FieldConfig, ModuleConfig, Profile, Row } from "../lib/types";
import { Capacitor } from "@capacitor/core";
import { fetchMedicineCategories, saveNewMedicineCategory } from "../lib/categories";
import MedicineImportModal from "./MedicineImportModal";

function isMoneyColumn(key: string) {
  return key.includes("fee") || key.includes("rate") || key.includes("amount") || key.includes("balance") || key === "mrp";
}

function valueAt(row: Row, key: string) {
  return key.split(".").reduce((value: any, part) => value?.[part], row);
}

function formatPackStock(row: Row) {
  const val = getEffectiveStock(row);
  const conv = Math.max(1, Number(row.product?.default_units_per_purchase_unit || 1));
  const unit = row.product?.purchase_unit || "Pack";
  if (val < 0) {
    const absVal = Math.abs(val);
    const packs = Math.floor(absVal / conv);
    const rem = absVal % conv;
    if (packs === 0) return `${val} units (Neg)`;
    return rem > 0 ? `-${packs} ${unit} - ${rem} (${val} Neg)` : `-${packs} ${unit} (${val} Neg)`;
  }
  const packs = Math.floor(val / conv);
  const rem = val % conv;
  return rem > 0 ? `${packs} ${unit} + ${rem}` : `${packs} ${unit}`;
}

function renderCell(row: Row, key: string, moduleKey?: string) {
  if (key === "current_stock" && (moduleKey === "low-stock" || moduleKey === "expiry-alerts")) {
    return formatPackStock(row);
  }
  if (key === "current_stock" && moduleKey === "inventory") {
    const val = getEffectiveStock(row);
    return val < 0 ? `${val} (Neg)` : String(val);
  }
  const value = valueAt(row, key);
  if (key.includes("date") || key.includes("_at")) return fmtDate(value);
  if (isMoneyColumn(key)) return money(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value ?? "-");
}

function formValue(field: FieldConfig, form: FormData) {
  const raw = form.get(field.key);
  if (field.type === "number") return raw !== null && String(raw) !== "" ? Number(raw) : 0;
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showLetterModal, setShowLetterModal] = useState(false);
  const [orderSupplierName, setOrderSupplierName] = useState("");
  const [orderQuantities, setOrderQuantities] = useState<Record<string, number>>({});
  const [suppliers, setSuppliers] = useState<Row[]>([]);
  const [org, setOrg] = useState<any>(null);
  const [isPrintingCustom, setIsPrintingCustom] = useState(false);
  const [activeRowIndex, setActiveRowIndex] = useState(-1);
  const editable = module.editable !== false && module.fields.length > 0;
  const state = usePagedQuery({ module, page, pageSize, search, filters, organizationId: profile.organization_id });

  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => {
    if ((module.key === "medicine" || module.table === "products") && profile.organization_id) {
      fetchMedicineCategories(profile.organization_id).then((cats) => {
        setCategoryOptions(cats);
      });
    }
  }, [module.key, module.table, profile.organization_id]);

  useEffect(() => {
    if (open) {
      if (editing) {
        const cat = editing.category ? String(editing.category).trim() : "";
        setSelectedCategory(cat);
        if (cat) {
          setCategoryOptions((prev) => {
            if (!prev.some((c) => c.toLowerCase() === cat.toLowerCase())) {
              return [...prev, cat].sort((a, b) => a.localeCompare(b));
            }
            return prev;
          });
        }
      } else {
        setSelectedCategory("");
      }
      setIsAddingCategory(false);
      setNewCategoryInput("");
    }
  }, [open, editing]);

  useEffect(() => {
    if (module.key === 'low-stock') {
      supabase?.from('suppliers').select('id,name,address,email,mobile,gst_number,supplier_id').eq('organization_id', profile.organization_id!).order('name').then(({data}) => {
         if (data) setSuppliers(data);
      });
      supabase?.from('organizations').select('*').eq('id', profile.organization_id!).single().then(({data}) => {
         if (data) setOrg(data);
      });
    }
    if (module.key === 'doctors' && supabase && profile.organization_id) {
      (async () => {
        const [{ data: profs }, { data: invs }, { data: docs }] = await Promise.all([
          supabase.from('profiles').select('id,username,full_name,mobile,active,role').eq('organization_id', profile.organization_id).eq('role', 'doctor'),
          supabase.from('user_invites').select('id,username,full_name,role,doctor_id,accepted_by,active').eq('organization_id', profile.organization_id).eq('role', 'doctor'),
          supabase.from('doctors').select('id,profile_id,name').eq('organization_id', profile.organization_id),
        ]);
        const existingDocs = docs || [];
        let changed = false;

        for (const p of profs || []) {
          const linked = existingDocs.find((d: any) => d.profile_id === p.id);
          if (!linked) {
            const unlinkedMatch = existingDocs.find((d: any) => !d.profile_id && String(d.name || '').trim().toLowerCase() === String(p.full_name || '').trim().toLowerCase());
            if (unlinkedMatch) {
              await supabase.from('doctors').update({ profile_id: p.id }).eq('id', unlinkedMatch.id);
              unlinkedMatch.profile_id = p.id;
              changed = true;
            } else {
              const { data: created } = await supabase.from('doctors').insert({
                organization_id: profile.organization_id,
                profile_id: p.id,
                doctor_id: `DOC-${Date.now().toString().slice(-6)}-${p.id.slice(0, 4)}`,
                name: p.full_name,
                mobile: p.mobile || null,
                default_fee: 0,
                active: p.active !== false,
              }).select('id,profile_id,name').single();
              if (created) {
                existingDocs.push(created);
                changed = true;
              }
            }
          }
        }

        for (const inv of invs || []) {
          const hasDoc = (inv.doctor_id && existingDocs.some((d: any) => d.id === inv.doctor_id)) ||
            (inv.accepted_by && existingDocs.some((d: any) => d.profile_id === inv.accepted_by));
          if (!hasDoc) {
            const { data: created } = await supabase.from('doctors').insert({
              organization_id: profile.organization_id,
              profile_id: inv.accepted_by || null,
              doctor_id: `DOC-${Date.now().toString().slice(-6)}-${inv.id.slice(0, 4)}`,
              name: inv.full_name,
              default_fee: 0,
              active: inv.active !== false,
            }).select('id,profile_id,name').single();
            if (created) {
              existingDocs.push(created);
              await supabase.from('user_invites').update({ doctor_id: created.id }).eq('id', inv.id);
              changed = true;
            }
          }
        }

        if (changed) state.reload();
      })();
    }
  }, [module.key, profile.organization_id]);
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
    setShowOrderModal(false);
    setShowLetterModal(false);
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
    setIsAddingCategory(false);
    setNewCategoryInput("");
    setSelectedCategory("");
  };

  const handleAddNewCategory = async () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed) {
      notify("Please enter a category name");
      return;
    }
    const existing = categoryOptions.find((c) => c.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setSelectedCategory(existing);
      setIsAddingCategory(false);
      setNewCategoryInput("");
      notify(`Category "${existing}" selected`);
      return;
    }

    const saved = await saveNewMedicineCategory(profile.organization_id, trimmed);
    const updated = [...categoryOptions, saved].sort((a, b) => a.localeCompare(b));
    setCategoryOptions(updated);
    setSelectedCategory(saved);
    setIsAddingCategory(false);
    setNewCategoryInput("");
    notify(`Category "${saved}" added and selected`);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const payload: Record<string, any> = {};
    module.fields.forEach((field) => {
      if (field.readonlyOnCreate && !editing) return;
      payload[field.key] = formValue(field, form);
    });
    if (!editing && module.idPrefix) {
      const idField = module.fields.find((field) => field.key.endsWith("_id"))?.key;
      if (idField) payload[idField] = nextCode(module.idPrefix);
    }

    let initialStock = 0;
    let stockUnitType = "Sale unit (Tablets / Pieces)";
    let batchNumber = "";
    let expiryDate = "";
    let discountPercent = 0;

    if (module.key === "medicine" || module.table === "products") {
      let finalCat = selectedCategory;
      if (isAddingCategory && newCategoryInput.trim()) {
        const added = await saveNewMedicineCategory(profile.organization_id, newCategoryInput.trim());
        if (added) finalCat = added;
      }
      payload.category = finalCat || null;

      initialStock = Number(payload.initial_stock || 0);
      stockUnitType = String(payload.initial_stock_unit || "Sale unit (Tablets / Pieces)");
      batchNumber = String(payload.batch_number || "").trim();
      expiryDate = String(payload.expiry_date || "").trim();
      discountPercent = Number(payload.sales_discount_percent || 0);

      delete payload.initial_stock;
      delete payload.initial_stock_unit;
      delete payload.batch_number;
      delete payload.expiry_date;
      delete payload.sales_discount_percent;

      const unitsPerPack = Math.max(1, Number(payload.default_units_per_purchase_unit || 1));
      const mrpVal = Number(payload.mrp || 0);
      if (!payload.selling_rate || Number(payload.selling_rate) <= 0) {
        payload.selling_rate = Number(((mrpVal / unitsPerPack) * (1 - discountPercent / 100)).toFixed(2));
      }
    }
    
    try {
      const safePayload = { ...payload, organization_id: profile.organization_id };
      let res;
      if (editing) {
        res = await supabase!.from(module.table).update(safePayload).eq("id", editing.id).eq("organization_id", profile.organization_id).select("id").single();
      } else {
        res = await supabase!.from(module.table).insert(safePayload).select("id, product_id, name").single();
      }

      if (res.error) throw new Error(res.error.message || "Save failed");

      if (!editing && (module.key === "medicine" || module.table === "products") && (initialStock > 0 || batchNumber) && res.data?.id) {
        const batchNum = batchNumber || "OPENING";
        const expDate = expiryDate || new Date(Date.now() + 730 * 86400000).toISOString().slice(0, 10);
        const unitsPerPack = Math.max(1, Number(payload.default_units_per_purchase_unit || 1));
        
        const isPurchaseUnit = stockUnitType.toLowerCase().includes("purchase") || stockUnitType.toLowerCase().includes("strip");
        const retailStock = isPurchaseUnit ? Math.round(initialStock * unitsPerPack) : initialStock;
        const packQty = isPurchaseUnit ? initialStock : Math.floor(initialStock / unitsPerPack);
        
        const mrpVal = Number(payload.mrp || 0);
        const sellRate = Number(payload.selling_rate || ((mrpVal / unitsPerPack) * (1 - discountPercent / 100)).toFixed(2));

        const { data: createdBatch } = await supabase!.from("medicine_batches").insert({
          organization_id: profile.organization_id,
          product_id: res.data.id,
          batch_number: batchNum,
          expiry_date: expDate,
          quantity_received: retailStock,
          current_stock: retailStock,
          stock_unit_qty: retailStock,
          purchase_rate: Number((mrpVal * 0.7).toFixed(2)),
          mrp: mrpVal,
          selling_rate: sellRate,
          gst_percent: Number(payload.gst_percent || 0),
          sales_discount_percent: discountPercent,
          purchase_unit: payload.purchase_unit || "strip",
          sale_unit: payload.sale_unit || "tablet",
          units_per_purchase_unit: unitsPerPack,
          purchase_pack_qty: packQty,
        }).select("id").single();

        if (createdBatch) {
          await insertStockMovementSafe(supabase!, {
            organization_id: profile.organization_id,
            product_id: res.data.id,
            batch_id: createdBatch.id,
            movement_type: "initial",
            reference_type: "opening_stock",
            reference_number: batchNum,
            in_quantity: retailStock,
            balance_quantity: retailStock,
            created_by: profile.id,
          });
        }
      }

      notify(`${module.title} ${editing ? "updated" : "saved"}${!editing && initialStock > 0 ? ` with opening stock (${initialStock} ${payload.purchase_unit || "packs"} / ${payload.sale_unit || "units"})` : ""}`);
      close();
      state.reload();
    } catch (e: any) {
      notify(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return <div className={`paged-crud page-${module.key}`}>
    <div className={`page-head ${isPrintingCustom ? "print-hide" : ""}`}>
      <div><h1>{module.title}</h1><p>{module.subtitle}</p></div>
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        {module.key === "medicine" && (
          <button
            type="button"
            className="secondary"
            onClick={() => setShowImportModal(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <FileSpreadsheet size={16} /> Import Excel / CSV
          </button>
        )}
        {editable && <button className="primary" onClick={() => { setEditing(null); setOpen(true); }}><Plus size={17}/> Add {module.title}</button>}
      </div>
    </div>
    <div className={`panel ${isPrintingCustom ? "print-hide" : ""}`}>
      <div className="v2-toolbar">
        <div className="search-box"><Search/><input placeholder={`Search ${module.title.toLowerCase()} in database`} value={searchInput} onChange={(event) => { setSearchInput(event.currentTarget.value); setActiveRowIndex(-1); }} onKeyDown={(e) => {
          if (!state.rows.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveRowIndex((prev) => (prev < state.rows.length - 1 ? prev + 1 : 0));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveRowIndex((prev) => (prev > 0 ? prev - 1 : state.rows.length - 1));
          } else if (e.key === "Enter" && activeRowIndex >= 0 && activeRowIndex < state.rows.length) {
            e.preventDefault();
            const row = state.rows[activeRowIndex];
            if (editable) {
              setEditing(row);
              setOpen(true);
            } else if (module.selectable) {
              const next = new Set(selected);
              if (next.has(row.id)) next.delete(row.id);
              else next.add(row.id);
              setSelected(next);
            }
          }
        }}/></div>
        <div className="v2-toolbar-controls">
          {module.filters?.map((filter) => <label className="v2-filter" key={filter.key}><span>{filter.label}</span><select value={filters[filter.key] || ""} onChange={(event) => { const val = event.currentTarget.value; setPage(1); setFilters((current) => ({ ...current, [filter.key]: val })); }}><option value="">All</option>{filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}
          <label className="v2-filter"><span>Rows</span><select value={pageSize} onChange={(event) => { setPage(1); setPageSize(Number(event.currentTarget.value)); }}>{pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
          <button className="secondary toolbar-refresh" onClick={state.reload}><RefreshCw size={15}/> Refresh</button>
        </div>
        {module.selectable && selected.size > 0 && (
          module.key === 'low-stock' ? (
            <button className="secondary primary-text" onClick={() => setShowOrderModal(true)}>Generate Purchase Order ({selected.size})</button>
          ) : module.key === 'expiry-alerts' ? (
            <button className="secondary primary-text" onClick={() => setShowLetterModal(true)}>Generate Replacement Letter ({selected.size})</button>
          ) : (
            <button className="secondary primary-text" onClick={() => (Capacitor.isNativePlatform() ? alert("Printing is not supported in the mobile app. Please use the desktop version.") : window.print())}>Print / Save PDF ({selected.size} selected)</button>
          )
        )}
      </div>
      {state.error ? <div className="error-box">{state.error}</div> : state.loading ? <div className="loading-panel"><LoaderCircle className="spin"/> Loading from database...</div> : state.rows.length ? <>
        <div className="data-wrap"><table className="data-table"><thead><tr>
{module.selectable && <th className="no-print" style={{width: 40}}><input type="checkbox" checked={selected.size === state.rows.length && state.rows.length > 0} onChange={e => {
  if (e.target.checked) {
    setSelected(new Set(state.rows.map(r => r.id)));
  } else {
    setSelected(new Set());
  }
}} /></th>}
{module.columns.map(([key, label]) => <th key={key}>{label}</th>)}{editable && <th className="no-print">Action</th>}</tr></thead><tbody>{state.rows.map((row, idx) => <tr key={row.id} style={idx === activeRowIndex ? { background: "#e6f4f1" } : undefined} className={module.selectable && selected.size > 0 && !selected.has(row.id) ? "no-print" : ""}>
{module.selectable && <td className="no-print"><input type="checkbox" checked={selected.has(row.id)} onChange={e => {
  const next = new Set(selected);
  if (e.target.checked) next.add(row.id);
  else next.delete(row.id);
  setSelected(next);
}} /></td>}
{module.columns.map(([key, label]) => <td key={key} data-label={label}>{renderCell(row, key, module.key)}</td>)}
{editable && <td className="no-print"><button className="table-edit" onClick={() => { setEditing(row); setOpen(true); }}><Pencil size={14}/> Edit</button></td>}
</tr>)}</tbody></table></div>
        <div className="pagination-bar"><span>{rangeLabel}</span><div><button className="secondary" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Prev</button><span>Page {page} / {pageCount}</span><button className="secondary" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button></div></div>
      </> : <div className="empty"><h3>No matching records found.</h3><p>Try another search or clear filters.</p></div>}
    </div>
    {editable && open && <div className="modal-wrap"><div className="modal"><div className="modal-head"><div><h2>{editing ? "Edit" : "Add"} {module.title}</h2><p>{editing ? "Update only this record" : "New record uses generated code where required"}</p></div><button className="icon-btn" onClick={close}><X size={18}/></button></div><form onSubmit={save}><div className="form-grid">{module.fields.map((field) => {
      const value = editing?.[field.key] ?? field.defaultValue ?? "";
      if (field.readonlyOnCreate && !editing) return <label className="field" key={field.key}><span>{field.label}</span><input value="Auto generated" readOnly/></label>;

      if ((module.key === "medicine" || module.table === "products") && field.key === "category") {
        return (
          <div className="field category-field" key={field.key}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span>{field.label}{field.required && <b> *</b>}</span>
              {!isAddingCategory ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingCategory(true);
                    setNewCategoryInput("");
                  }}
                  style={{
                    background: "#e6f4f1",
                    color: "#0c5749",
                    border: "1px solid #b2ded6",
                    borderRadius: "7px",
                    padding: "5px 12px",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                  title="Add new category"
                >
                  <Plus size={15} /> Add Category
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingCategory(false);
                    setNewCategoryInput("");
                  }}
                  style={{
                    background: "transparent",
                    color: "#68736f",
                    border: "none",
                    fontSize: "13px",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Cancel
                </button>
              )}
            </div>

            {isAddingCategory ? (
              <div style={{ display: "flex", gap: "8px", alignItems: "stretch", width: "100%" }}>
                <input
                  type="text"
                  placeholder="Type new category (e.g. Antibiotic, Drops)"
                  value={newCategoryInput}
                  onChange={(e) => setNewCategoryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddNewCategory();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setIsAddingCategory(false);
                    }
                  }}
                  autoFocus
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button
                  type="button"
                  className="primary"
                  onClick={handleAddNewCategory}
                  style={{ padding: "0 18px", fontSize: "15px", whiteSpace: "nowrap" }}
                >
                  Add
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setIsAddingCategory(false);
                    setNewCategoryInput("");
                  }}
                  style={{ padding: "0 14px", fontSize: "15px" }}
                >
                  Cancel
                </button>
                {/* Hidden field so formData captures category even if typing */}
                <input type="hidden" name={field.key} value={selectedCategory} />
              </div>
            ) : (
              <select
                name={field.key}
                value={selectedCategory}
                onChange={(e) => {
                  if (e.target.value === "__ADD_NEW__") {
                    setIsAddingCategory(true);
                    setNewCategoryInput("");
                  } else {
                    setSelectedCategory(e.target.value);
                  }
                }}
                required={field.required}
                style={{ width: "100%" }}
              >
                <option value="">Select Category</option>
                <option value="__ADD_NEW__" style={{ fontWeight: 700, color: "#0c5749", backgroundColor: "#e6f4f1" }}>
                  + Add New Category...
                </option>
                {selectedCategory && !categoryOptions.some((c) => c.toLowerCase() === selectedCategory.toLowerCase()) && (
                  <option value={selectedCategory}>{selectedCategory}</option>
                )}
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      }

      if (field.type === "select") return <label className="field" key={field.key}><span>{field.label}{field.required && <b> *</b>}</span><select name={field.key} required={field.required} defaultValue={value}>{!field.required && <option value="">Select {field.label}</option>}{field.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
      return <label className="field" key={field.key}><span>{field.label}{field.required && <b> *</b>}</span><input name={field.key} type={field.type || "text"} required={field.required} defaultValue={value} step={field.type === "number" ? "0.01" : undefined}/></label>;
    })}</div><div className="form-actions"><button type="button" className="secondary" onClick={close}>Cancel</button><button className="primary" disabled={saving}>{saving ? <LoaderCircle className="spin"/> : <CheckCircle2 size={16}/>} {editing ? "Update" : "Save"}</button></div></form></div></div>}
    {showOrderModal && (
      <div className="modal-wrap print-hide">
        <div className="modal" style={{ maxWidth: 800 }}>
          <div className="modal-head">
            <div><h2>Generate Purchase Order</h2><p>Print a purchase order for selected low-stock items.</p></div>
            <button className="icon-btn" onClick={() => setShowOrderModal(false)}><X size={18}/></button>
          </div>
          <div className="form-grid" style={{ marginBottom: 20 }}>
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <span>Supplier Name</span>
              <select value={orderSupplierName} onChange={e => setOrderSupplierName(e.target.value)}>
                  <option value="">Select a supplier...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} {s.supplier_id ? `(${s.supplier_id})` : ''}</option>)}
                </select>
            </label>
          </div>
          <div className="data-wrap" style={{ maxHeight: 300, overflowY: "auto", marginBottom: 20 }}>
            <table className="data-table">
              <thead><tr><th>Medicine</th><th>Batch</th><th>Current Stock</th><th>Order Quantity</th></tr></thead>
              <tbody>
                {state.rows.filter(r => selected.has(r.id)).map(r => (
                  <tr key={r.id}>
                    <td>{valueAt(r, "product.name")}</td>
                    <td>{valueAt(r, "batch_number")}</td>
                    <td>{formatPackStock(r)}</td>
                    <td>
                      <input type="number" min="1" value={orderQuantities[r.id] || ""} onChange={e => setOrderQuantities({...orderQuantities, [r.id]: parseInt(e.target.value) || 0})} style={{ width: 100, padding: 4 }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setShowOrderModal(false)}>Cancel</button>
            <button className="primary" onClick={() => { setIsPrintingCustom(true); setTimeout(() => { (Capacitor.isNativePlatform() ? alert("Printing is not supported in the mobile app. Please use the desktop version.") : window.print()); setTimeout(() => { setIsPrintingCustom(false); setShowOrderModal(false); }, 500); }, 500); }}>Print Order</button>
          </div>
        </div>
      </div>
    )}

    {showLetterModal && (
      <div className="modal-wrap print-hide">
        <div className="modal">
          <div className="modal-head">
            <div><h2>Generate Replacement Letter</h2><p>Print a request to replace expiring medicines.</p></div>
            <button className="icon-btn" onClick={() => setShowLetterModal(false)}><X size={18}/></button>
          </div>
          <div className="form-actions" style={{ marginTop: 20 }}>
            <button type="button" className="secondary" onClick={() => setShowLetterModal(false)}>Cancel</button>
            <button className="primary" onClick={() => { setIsPrintingCustom(true); setTimeout(() => { (Capacitor.isNativePlatform() ? alert("Printing is not supported in the mobile app. Please use the desktop version.") : window.print()); setTimeout(() => { setIsPrintingCustom(false); setShowLetterModal(false); }, 500); }, 500); }}>Print Letter</button>
          </div>
        </div>
      </div>
    )}

              {/* Print Layouts */}
      {module.key === 'low-stock' && (() => {
        const selectedSupplier = suppliers.find(s => s.id === orderSupplierName);
        return (
          <div className="print-only" style={{ padding: "40px", fontFamily: "sans-serif", backgroundColor: "#fff", color: "#000", minHeight: "100vh" }}>
            
            {/* Letterhead */}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '3px solid #126b5a', paddingBottom: 20, marginBottom: 30 }}>
              <div>
                 <h1 style={{ color: '#126b5a', margin: '0 0 5px 0', fontSize: '32px', fontWeight: 800 }}>{org?.clinic_name || (profile as any).organization_name || 'CLINIC NAME'}</h1>
                 {org?.pharmacy_name && <h2 style={{ margin: '0 0 10px 0', fontSize: '18px', color: '#555' }}>{org.pharmacy_name}</h2>}
                 <p style={{ margin: 0, fontSize: '14px', color: '#666', lineHeight: 1.5 }}>
                   {org?.address}<br/>
                   {org?.phone && <>Phone: {org.phone}<br/></>}
                   {org?.gst_number && <>GSTIN: {org.gst_number}</>}
                 </p>
              </div>
            </div>

            <div style={{ textAlign: "center", marginBottom: 30 }}>
               <h2 style={{ margin: 0, fontSize: 24, letterSpacing: 2, textTransform: 'uppercase' }}>Purchase Order</h2>
            </div>
            
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 30 }}>
              <div style={{ flex: 1 }}>
                 <h4 style={{ margin: "0 0 8px 0", color: "#666", textTransform: 'uppercase', fontSize: 12 }}>To Supplier:</h4>
                 <div style={{ padding: 15, backgroundColor: "#f9f9f9", borderRadius: 4, minHeight: 100 }}>
                   {selectedSupplier ? <>
                     <strong style={{ fontSize: 16 }}>{selectedSupplier.name}</strong><br/>
                     <div style={{ marginTop: 8, fontSize: 14, color: '#444', lineHeight: 1.5 }}>
                       {selectedSupplier.address && <>{selectedSupplier.address}<br/></>}
                       {selectedSupplier.mobile && <>Phone: {selectedSupplier.mobile}<br/></>}
                       {selectedSupplier.gst_number && <>GSTIN: {selectedSupplier.gst_number}</>}
                     </div>
                   </> : <em style={{ color: '#999' }}>No supplier selected</em>}
                 </div>
              </div>
              <div style={{ flex: 1, marginLeft: 30 }}>
                 <h4 style={{ margin: "0 0 8px 0", color: "#666", textTransform: 'uppercase', fontSize: 12 }}>Order Details:</h4>
                 <div style={{ padding: 15, border: "1px solid #eee", borderRadius: 4, minHeight: 100, fontSize: 14, lineHeight: 1.8 }}>
                   <strong>PO Number:</strong> PO-{Date.now().toString().slice(-6)}<br/>
                   <strong>Date:</strong> {new Date().toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})}<br/>
                   <strong>Status:</strong> New Order
                 </div>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 20 }}>
              <thead>
                 <tr>
                    <th style={{ backgroundColor: '#126b5a', color: '#fff', padding: 12, textAlign: 'left', border: '1px solid #126b5a' }}>S.No</th>
                    <th style={{ backgroundColor: '#126b5a', color: '#fff', padding: 12, textAlign: 'left', border: '1px solid #126b5a' }}>Description of Goods</th>
                    <th style={{ backgroundColor: '#126b5a', color: '#fff', padding: 12, textAlign: 'center', border: '1px solid #126b5a' }}>Order Qty</th>
                 </tr>
              </thead>
              <tbody>
                 {state.rows.filter(r => selected.has(r.id)).map((r, i) => (
                   <tr key={r.id}>
                     <td style={{ padding: 12, border: '1px solid #eee', borderBottom: '1px solid #ccc' }}>{i + 1}</td>
                     <td style={{ padding: 12, border: '1px solid #eee', borderBottom: '1px solid #ccc' }}>
                       <strong style={{ fontSize: 15 }}>{valueAt(r, "product.name")}</strong>
                       <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>Unit: {r.product?.purchase_unit || 'Pack'}</div>
                     </td>
                     <td style={{ padding: 12, border: '1px solid #eee', borderBottom: '1px solid #ccc', textAlign: 'center', fontSize: 16, fontWeight: 'bold' }}>{orderQuantities[r.id] || "0"}</td>
                   </tr>
                 ))}
              </tbody>
            </table>

            <div style={{ marginTop: 80, display: "flex", justifyContent: "space-between" }}>
              <div style={{ textAlign: 'center' }}>
                 <div style={{ borderTop: '1px solid #000', width: 200, paddingTop: 10, fontWeight: 'bold' }}>Authorized Signatory</div>
                 <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>For {org?.clinic_name || (profile as any).organization_name}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                 <div style={{ borderTop: '1px solid #000', width: 200, paddingTop: 10, fontWeight: 'bold' }}>Supplier Acceptance</div>
                 <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>Signature & Seal</div>
              </div>
            </div>
          </div>
        );
      })()}

      {module.key === 'expiry-alerts' && (() => {
        const selectedRows = state.rows.filter(r => selected.has(r.id));
        const bySupplier = new Map<string, Row[]>();
        selectedRows.forEach(r => {
          const sName = valueAt(r, "supplier.name") || "Unknown Supplier";
          bySupplier.set(sName, [...(bySupplier.get(sName) || []), r]);
        });
        
        return (
          <div className="print-only">
            {[...bySupplier.entries()].map(([supplierName, rows], index) => (
              <div key={supplierName} style={{ padding: "40px", fontFamily: "sans-serif", backgroundColor: "#fff", color: "#000", minHeight: "100vh", pageBreakAfter: index < bySupplier.size - 1 ? "always" : "auto" }}>
                
                {/* Letterhead */}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '3px solid #126b5a', paddingBottom: 20, marginBottom: 30 }}>
                  <div>
                     <h1 style={{ color: '#126b5a', margin: '0 0 5px 0', fontSize: '32px', fontWeight: 800 }}>{org?.clinic_name || (profile as any).organization_name || 'CLINIC NAME'}</h1>
                     {org?.pharmacy_name && <h2 style={{ margin: '0 0 10px 0', fontSize: '18px', color: '#555' }}>{org.pharmacy_name}</h2>}
                     <p style={{ margin: 0, fontSize: '14px', color: '#666', lineHeight: 1.5 }}>
                       {org?.address}<br/>
                       {org?.phone && <>Phone: {org.phone}<br/></>}
                       {org?.gst_number && <>GSTIN: {org.gst_number}</>}
                     </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                     <h2 style={{ margin: 0, fontSize: 20, color: '#333' }}>REPLACEMENT REQUEST</h2>
                     <p style={{ margin: "5px 0 0 0" }}>Date: <strong>{new Date().toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})}</strong></p>
                  </div>
                </div>
                
                <p style={{ marginBottom: "20px", fontSize: "15px", lineHeight: "1.5" }}>
                  To,<br/>
                  <strong>{supplierName}</strong><br/><br/>
                  Subject: Request for replacement of near-expiry/expired stock.<br/><br/>
                  Dear Sir/Madam,<br/>
                  Please arrange for the replacement or return of the following medicines which were supplied by you. These items are currently in our inventory and are nearing or have passed their expiry dates.
                </p>
                
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 30, marginBottom: 40 }}>
                  <thead>
                    <tr>
                      <th style={{ backgroundColor: '#f4f4f4', padding: 12, textAlign: 'left', border: '1px solid #ccc' }}>Medicine</th>
                      <th style={{ backgroundColor: '#f4f4f4', padding: 12, textAlign: 'left', border: '1px solid #ccc' }}>Batch No</th>
                      <th style={{ backgroundColor: '#f4f4f4', padding: 12, textAlign: 'left', border: '1px solid #ccc' }}>Expiry Date</th>
                      <th style={{ backgroundColor: '#f4f4f4', padding: 12, textAlign: 'center', border: '1px solid #ccc' }}>Return Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id}>
                        <td style={{ padding: 12, border: '1px solid #ccc', fontWeight: 'bold' }}>{valueAt(r, "product.name")}</td>
                        <td style={{ padding: 12, border: '1px solid #ccc' }}>{valueAt(r, "batch_number")}</td>
                        <td style={{ padding: 12, border: '1px solid #ccc', color: '#d32f2f' }}>{fmtDate(valueAt(r, "expiry_date"))}</td>
                        <td style={{ padding: 12, border: '1px solid #ccc', textAlign: 'center', fontSize: 16, fontWeight: 'bold' }}>{formatPackStock(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                <div style={{ marginTop: 80 }}>
                  <p>Thank you,</p>
                  <div style={{ marginTop: 60, borderTop: '1px solid #000', width: 200, paddingTop: 10, fontWeight: 'bold' }}>Authorized Signatory</div>
                  <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>For {org?.clinic_name || (profile as any).organization_name}</div>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

    {showImportModal && (
      <MedicineImportModal
        profile={profile}
        existingProducts={state.rows}
        knownCategories={categoryOptions}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => {
          state.reload();
          if (profile.organization_id) {
            fetchMedicineCategories(profile.organization_id).then(setCategoryOptions);
          }
        }}
        notify={notify}
      />
    )}

    </div>
;
}
