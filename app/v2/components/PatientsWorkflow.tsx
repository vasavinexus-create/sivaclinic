"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Stethoscope,
  Trash2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { fmtDate, money, nextCode } from "../lib/format";
import { Organization, Profile, Row } from "../lib/types";

interface PatientsWorkflowProps {
  profile: Profile;
  organization: Organization | null;
  notify: (msg: string) => void;
  onOrganizationChange?: (org: Organization | null) => void;
}

interface PatientStats {
  consultationsCount: number;
  consultations: any[];
  prescriptionsCount: number;
  prescriptionFiles: string[];
  salesCount: number;
  salesTotal: number;
  sales: any[];
  paymentsCount: number;
  paymentsTotal: number;
  ledgerCount: number;
  ledgerBalance: number;
}

export function PatientsWorkflow({ profile, organization, notify }: PatientsWorkflowProps) {
  // Navigation / Tabs: 'directory' | 'delete'
  const [activeTab, setActiveTab] = useState<"directory" | "delete">("directory");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "delete" || window.location.pathname.includes("delete")) {
        setActiveTab("delete");
      }
    }
  }, []);

  // Patients Directory State
  const [patients, setPatients] = useState<Row[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState("");

  // Add / Edit Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);

  // Form Fields
  const [formName, setFormName] = useState("");
  const [formAge, setFormAge] = useState("");
  const [formGender, setFormGender] = useState("Male");
  const [formMobile, setFormMobile] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formBloodGroup, setFormBloodGroup] = useState("");
  const [formAllergies, setFormAllergies] = useState("");

  // Delete State & Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Row | null>(null);
  const [deleteStats, setDeleteStats] = useState<PatientStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Search input for Delete tab
  const [deleteSearchQuery, setDeleteSearchQuery] = useState("");
  const [deleteSearchResults, setDeleteSearchResults] = useState<Row[]>([]);
  const [searchingDelete, setSearchingDelete] = useState(false);

  // Load patients list for directory
  const loadPatients = useCallback(async () => {
    if (!supabase || !profile.organization_id) return;
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("patients")
        .select("id,patient_id,name,age,gender,mobile,address,blood_group,allergies,last_visit_at,created_at", { count: "exact" })
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (search.trim()) {
        const s = search.trim();
        query = query.or(`name.ilike.%${s}%,patient_id.ilike.%${s}%,mobile.ilike.%${s}%`);
      }

      if (genderFilter) {
        query = query.eq("gender", genderFilter);
      }

      const { data, count, error } = await query;
      if (error) throw error;

      setPatients(data || []);
      setTotalCount(count || 0);
    } catch (err: any) {
      notify(err.message || "Failed to load patients");
    } finally {
      setLoading(false);
    }
  }, [profile.organization_id, page, pageSize, search, genderFilter, notify]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  // Handle search submission
  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setSearch("");
    setPage(1);
  };

  // Open Add Modal
  const openAddModal = () => {
    setEditingPatient(null);
    setFormName("");
    setFormAge("");
    setFormGender("Male");
    setFormMobile("");
    setFormAddress("");
    setFormBloodGroup("");
    setFormAllergies("");
    setModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (p: Row) => {
    setEditingPatient(p);
    setFormName(String(p.name || ""));
    setFormAge(p.age !== null && p.age !== undefined ? String(p.age) : "");
    setFormGender(String(p.gender || "Male"));
    setFormMobile(String(p.mobile || ""));
    setFormAddress(String(p.address || ""));
    setFormBloodGroup(String(p.blood_group || ""));
    setFormAllergies(String(p.allergies || ""));
    setModalOpen(true);
  };

  // Save Add/Edit
  const handleSavePatient = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase || !profile.organization_id) return;
    if (!formName.trim()) {
      notify("Please enter a patient name");
      return;
    }

    setSaving(true);
    try {
      if (editingPatient) {
        const { error } = await supabase
          .from("patients")
          .update({
            name: formName.trim(),
            age: formAge ? Number(formAge) : null,
            gender: formGender || null,
            mobile: formMobile.trim() || null,
            address: formAddress.trim() || "",
            blood_group: formBloodGroup.trim() || null,
            allergies: formAllergies.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingPatient.id)
          .eq("organization_id", profile.organization_id);

        if (error) throw error;
        notify(`Patient ${formName.trim()} updated successfully`);
      } else {
        const newCode = nextCode("PAT");
        const { error } = await supabase.from("patients").insert({
          organization_id: profile.organization_id,
          patient_id: newCode,
          name: formName.trim(),
          age: formAge ? Number(formAge) : null,
          gender: formGender || null,
          mobile: formMobile.trim() || null,
          address: formAddress.trim() || "",
          blood_group: formBloodGroup.trim() || null,
          allergies: formAllergies.trim() || null,
        });

        if (error) throw error;
        notify(`Patient ${formName.trim()} (${newCode}) created successfully`);
      }

      setModalOpen(false);
      loadPatients();
    } catch (err: any) {
      notify(err.message || "Failed to save patient");
    } finally {
      setSaving(false);
    }
  };

  // Fetch Preview Stats for Patient Deletion
  const fetchDeletePreview = async (patient: Row) => {
    setSelectedForDelete(patient);
    setDeleteStats(null);
    setLoadingStats(true);
    setConfirmInput("");

    try {
      const { data: sessionData } = await supabase!.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch(`/api/v2/patients?id=${patient.id}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const json = await res.json();
      setDeleteStats(json.stats || null);
    } catch (err: any) {
      notify(err.message || "Failed to load patient records preview");
    } finally {
      setLoadingStats(false);
    }
  };

  // Open Delete Modal directly
  const openDeleteModal = (patient: Row) => {
    setDeleteModalOpen(true);
    fetchDeletePreview(patient);
  };

  // Execute Cascade Deletion
  const handleExecuteDelete = async () => {
    if (!selectedForDelete || !supabase) return;
    setDeleting(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await fetch(`/api/v2/patients?id=${selectedForDelete.id}`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || `Deletion failed with HTTP ${res.status}`);
      }

      notify(
        json.message ||
          `Patient ${selectedForDelete.name} (${selectedForDelete.patient_id}) and clinical records permanently removed. Sales, cash, and stock remain preserved.`
      );

      // Reset delete modals & reload
      setDeleteModalOpen(false);
      setSelectedForDelete(null);
      setDeleteStats(null);
      setConfirmInput("");
      setDeleteSearchResults((prev) => prev.filter((p) => p.id !== selectedForDelete.id));

      loadPatients();
    } catch (err: any) {
      notify(err.message || "Failed to delete patient");
    } finally {
      setDeleting(false);
    }
  };

  // Autocomplete search on Delete Tab
  useEffect(() => {
    if (activeTab !== "delete" || !deleteSearchQuery.trim()) {
      setDeleteSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingDelete(true);
      try {
        const { data: sessionData } = await supabase!.auth.getSession();
        const token = sessionData?.session?.access_token;
        const res = await fetch(`/api/v2/patients?search=${encodeURIComponent(deleteSearchQuery.trim())}`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const json = await res.json().catch(() => ({}));
        setDeleteSearchResults(json.patients || []);
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setSearchingDelete(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [activeTab, deleteSearchQuery]);

  // Total pages
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeLabel = useMemo(() => {
    if (!totalCount) return "0 records";
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, totalCount);
    return `${start}-${end} of ${totalCount}`;
  }, [page, pageSize, totalCount]);

  // Is delete confirmation valid
  const isDeleteConfirmed = useMemo(() => {
    if (!selectedForDelete) return false;
    const expected = String(selectedForDelete.name || "").trim().toLowerCase();
    const expectedId = String(selectedForDelete.patient_id || "").trim().toLowerCase();
    const typed = confirmInput.trim().toLowerCase();
    return typed === expected || typed === expectedId || typed === "delete";
  }, [selectedForDelete, confirmInput]);

  return (
    <div className="patients-workflow-container">
      {/* Page Header */}
      <div className="page-head">
        <div>
          <h1>Patients</h1>
          <p>Patient master records, clinical history, and clinical deletion (preserves sales, cash, & stock)</p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            type="button"
            className={activeTab === "directory" ? "primary" : "secondary"}
            onClick={() => setActiveTab("directory")}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <Users size={16} /> Patient Directory
          </button>
          <button
            type="button"
            className={activeTab === "delete" ? "primary danger-action" : "secondary"}
            onClick={() => setActiveTab("delete")}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <Trash2 size={16} /> Delete Patient (Clinical Only)
          </button>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* TAB 1: PATIENT DIRECTORY                                                */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === "directory" && (
        <div className="panel">
          {/* Toolbar */}
          <div className="v2-toolbar" style={{ flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
            <form onSubmit={handleSearchSubmit} className="v2-search" style={{ flex: 1, minWidth: "260px" }}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search by Patient ID, Name, Mobile..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              {searchInput && (
                <button type="button" onClick={handleClearSearch} style={{ background: "none", border: "none", cursor: "pointer", padding: "0 6px" }}>
                  <X size={15} />
                </button>
              )}
            </form>

            <div className="v2-toolbar-controls" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <label className="v2-filter">
                <span>Gender</span>
                <select
                  value={genderFilter}
                  onChange={(e) => {
                    setGenderFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </label>

              <label className="v2-filter">
                <span>Rows</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </label>

              <button type="button" className="secondary toolbar-refresh" onClick={loadPatients}>
                <RefreshCw size={15} /> Refresh
              </button>

              <button type="button" className="primary" onClick={openAddModal} style={{ whiteSpace: "nowrap" }}>
                <Plus size={16} /> Add Patient
              </button>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="loading-panel">
              <LoaderCircle className="spin" size={24} /> Loading patients...
            </div>
          ) : patients.length === 0 ? (
            <div className="empty">
              <h3>No matching patient records found.</h3>
              <p>Try searching with another keyword or add a new patient.</p>
            </div>
          ) : (
            <>
              <div className="data-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: "120px" }}>Patient ID</th>
                      <th>Patient Name</th>
                      <th style={{ width: "70px" }}>Age</th>
                      <th style={{ width: "90px" }}>Gender</th>
                      <th>Mobile</th>
                      <th>Last Visit</th>
                      <th>Registered</th>
                      <th className="no-print" style={{ width: "170px" }}>
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {patients.map((row) => (
                      <tr key={row.id}>
                        <td data-label="Patient ID">
                          <strong style={{ color: "#0c5749", fontFamily: "monospace", fontSize: "13px" }}>
                            {row.patient_id}
                          </strong>
                        </td>
                        <td data-label="Patient Name">
                          <strong style={{ fontSize: "14px" }}>{row.name}</strong>
                          {row.blood_group && (
                            <span
                              style={{
                                display: "inline-block",
                                marginLeft: "8px",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                background: "#fef2f2",
                                color: "#b91c1c",
                                fontSize: "11px",
                                fontWeight: 600,
                              }}
                            >
                              {row.blood_group}
                            </span>
                          )}
                          {row.allergies && (
                            <small style={{ display: "block", color: "#b91c1c" }}>Allergies: {row.allergies}</small>
                          )}
                        </td>
                        <td data-label="Age">{row.age ?? "-"}</td>
                        <td data-label="Gender">{row.gender || "-"}</td>
                        <td data-label="Mobile">{row.mobile || "-"}</td>
                        <td data-label="Last Visit">{fmtDate(row.last_visit_at)}</td>
                        <td data-label="Registered">{fmtDate(row.created_at)}</td>
                        <td className="no-print" data-label="Action">
                          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            <button
                              type="button"
                              className="table-edit"
                              onClick={() => openEditModal(row)}
                              title="Edit patient details"
                            >
                              <Pencil size={13} /> Edit
                            </button>
                            <button
                              type="button"
                              className="table-edit danger-btn"
                              onClick={() => openDeleteModal(row)}
                              title="Delete patient and clinical records (preserves sales, cash, & stock)"
                              style={{ color: "#c53030", borderColor: "#fecaca", background: "#fef2f2" }}
                            >
                              <Trash2 size={13} /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="pagination-bar">
                <span>{rangeLabel}</span>
                <div>
                  <button className="secondary" disabled={page <= 1} onClick={() => setPage((v) => Math.max(1, v - 1))}>
                    Prev
                  </button>
                  <span>
                    Page {page} / {pageCount}
                  </span>
                  <button
                    className="secondary"
                    disabled={page >= pageCount}
                    onClick={() => setPage((v) => Math.min(pageCount, v + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* TAB 2: DEDICATED DELETE PATIENT PAGE                                     */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === "delete" && (
        <div className="panel" style={{ maxWidth: "960px", margin: "0 auto" }}>
          {/* Header Banner */}
          <div
            style={{
              padding: "16px 20px",
              borderRadius: "10px",
              background: "#fff5f5",
              border: "1px solid #fed7d7",
              marginBottom: "24px",
              display: "flex",
              alignItems: "flex-start",
              gap: "14px",
            }}
          >
            <ShieldAlert size={32} style={{ color: "#c53030", flexShrink: 0, marginTop: "2px" }} />
            <div>
              <h2 style={{ margin: "0 0 6px", fontSize: "19px", color: "#9b2c2c" }}>
                Patient Delete & Purge Management
              </h2>
              <p style={{ margin: 0, fontSize: "14px", color: "#742a2a", lineHeight: 1.5 }}>
                When a patient is deleted from here, <strong>all patient records are automatically removed</strong>:
                consultations, pre-examinations, prescription attachments & stored photos, pharmacy/inpatient sales,
                payments, and patient ledger entries.
              </p>
            </div>
          </div>

          {/* Search to select patient */}
          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: 700, fontSize: "14px" }}>
              Search & Select Patient to Delete:
            </label>
            <div style={{ position: "relative" }}>
              <div className="v2-search" style={{ width: "100%" }}>
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Type Patient Name, Mobile, or ID (e.g. PAT-123)..."
                  value={deleteSearchQuery}
                  onChange={(e) => setDeleteSearchQuery(e.target.value)}
                />
                {deleteSearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteSearchQuery("");
                      setDeleteSearchResults([]);
                    }}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "0 6px" }}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              {/* Autocomplete Results Dropdown */}
              {deleteSearchResults.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    background: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
                    marginTop: "4px",
                    maxHeight: "320px",
                    overflowY: "auto",
                  }}
                >
                  {deleteSearchResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        fetchDeletePreview(p);
                        setDeleteSearchResults([]);
                        setDeleteSearchQuery(`${p.patient_id} — ${p.name}`);
                      }}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        width: "100%",
                        padding: "12px 16px",
                        textAlign: "left",
                        border: "none",
                        borderBottom: "1px solid #f1f5f9",
                        background: selectedForDelete?.id === p.id ? "#fef2f2" : "#ffffff",
                        cursor: "pointer",
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: "14px", color: "#1e293b" }}>{p.name}</strong>
                        <span style={{ marginLeft: "10px", color: "#64748b", fontSize: "13px" }}>
                          ({p.patient_id})
                        </span>
                      </div>
                      <div style={{ color: "#64748b", fontSize: "13px" }}>
                        {p.mobile || "No mobile"} {p.age ? `• Age ${p.age}` : ""} {p.gender ? `• ${p.gender}` : ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {searchingDelete && (
              <small style={{ color: "#64748b", marginTop: "4px", display: "block" }}>Searching patients...</small>
            )}
          </div>

          {/* Patient Details & Dependency Summary */}
          {selectedForDelete ? (
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                background: "#fafafa",
                padding: "20px",
                marginBottom: "24px",
              }}
            >
              {/* Patient Basic Info */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  borderBottom: "1px solid #e2e8f0",
                  paddingBottom: "16px",
                  marginBottom: "18px",
                }}
              >
                <div>
                  <h3 style={{ margin: "0 0 4px", fontSize: "20px", color: "#1e293b" }}>
                    {selectedForDelete.name}
                  </h3>
                  <div style={{ display: "flex", gap: "12px", color: "#64748b", fontSize: "14px", flexWrap: "wrap" }}>
                    <span>
                      ID: <strong>{selectedForDelete.patient_id}</strong>
                    </span>
                    <span>
                      Mobile: <strong>{selectedForDelete.mobile || "N/A"}</strong>
                    </span>
                    <span>
                      Age: <strong>{selectedForDelete.age || "N/A"}</strong>
                    </span>
                    <span>
                      Gender: <strong>{selectedForDelete.gender || "N/A"}</strong>
                    </span>
                    {selectedForDelete.address && (
                      <span>
                        Address: <strong>{selectedForDelete.address}</strong>
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setSelectedForDelete(null);
                    setDeleteStats(null);
                    setDeleteSearchQuery("");
                  }}
                  style={{ fontSize: "12px" }}
                >
                  Change Patient
                </button>
              </div>

              {/* Records Breakdown Grid */}
              <div style={{ marginBottom: "20px" }}>
                <h4 style={{ margin: "0 0 10px", fontSize: "15px", color: "#b91c1c", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Trash2 size={16} /> Clinical & Patient Records to be Removed:
                </h4>

                {loadingStats ? (
                  <div style={{ padding: "20px", textAlign: "center", color: "#64748b" }}>
                    <LoaderCircle className="spin" size={20} style={{ verticalAlign: "middle", marginRight: "8px" }} />
                    Analyzing clinical records...
                  </div>
                ) : deleteStats ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                      gap: "12px",
                      marginBottom: "16px",
                    }}
                  >
                    <div
                      style={{
                        background: "#fff",
                        border: "1px solid #fed7d7",
                        borderRadius: "8px",
                        padding: "14px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#c53030", marginBottom: "6px" }}>
                        <Stethoscope size={18} />
                        <span style={{ fontSize: "13px", fontWeight: 600 }}>Consultations</span>
                      </div>
                      <strong style={{ fontSize: "22px", color: "#9b2c2c" }}>{deleteStats.consultationsCount}</strong>
                      <small style={{ display: "block", color: "#64748b", fontSize: "11px", marginTop: "2px" }}>
                        visits, vitals, symptoms
                      </small>
                    </div>

                    <div
                      style={{
                        background: "#fff",
                        border: "1px solid #fed7d7",
                        borderRadius: "8px",
                        padding: "14px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#c53030", marginBottom: "6px" }}>
                        <FileText size={18} />
                        <span style={{ fontSize: "13px", fontWeight: 600 }}>Prescriptions</span>
                      </div>
                      <strong style={{ fontSize: "22px", color: "#9b2c2c" }}>{deleteStats.prescriptionsCount}</strong>
                      <small style={{ display: "block", color: "#64748b", fontSize: "11px", marginTop: "2px" }}>
                        attached prescription files
                      </small>
                    </div>

                    <div
                      style={{
                        background: "#fff",
                        border: "1px solid #fed7d7",
                        borderRadius: "8px",
                        padding: "14px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#c53030", marginBottom: "6px" }}>
                        <Users size={18} />
                        <span style={{ fontSize: "13px", fontWeight: 600 }}>Patient Ledger</span>
                      </div>
                      <strong style={{ fontSize: "22px", color: "#9b2c2c" }}>{deleteStats.ledgerCount}</strong>
                      <small style={{ display: "block", color: "#64748b", fontSize: "11px", marginTop: "2px" }}>
                        personal clinic credit/debit
                      </small>
                    </div>

                    <div
                      style={{
                        background: "#fff",
                        border: "1px solid #fed7d7",
                        borderRadius: "8px",
                        padding: "14px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#c53030", marginBottom: "6px" }}>
                        <Trash2 size={18} />
                        <span style={{ fontSize: "13px", fontWeight: 600 }}>Patient Profile</span>
                      </div>
                      <strong style={{ fontSize: "14px", color: "#9b2c2c" }}>1 Master Record</strong>
                      <small style={{ display: "block", color: "#64748b", fontSize: "11px", marginTop: "2px" }}>
                        ID: {selectedForDelete.patient_id}
                      </small>
                    </div>
                  </div>
                ) : null}

                {/* Preserved Data Card */}
                {deleteStats && (
                  <div
                    style={{
                      background: "#f0fdf4",
                      border: "1px solid #86efac",
                      borderRadius: "8px",
                      padding: "14px 18px",
                      marginTop: "14px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#166534", marginBottom: "8px", fontWeight: 700, fontSize: "14px" }}>
                      <ShieldCheck size={20} color="#16a34a" /> Protected & Preserved Records (Will NOT Be Deleted or Changed)
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", fontSize: "13px", color: "#15803d" }}>
                      <div>
                        <strong>Pharmacy Sales:</strong> {deleteStats.salesCount} bills ({money(deleteStats.salesTotal)}) preserved safely
                      </div>
                      <div>
                        <strong>Cash Ledger:</strong> Receipts and payments remain intact in register
                      </div>
                      <div>
                        <strong>Medicine Stock:</strong> No stock rollback or batch changes
                      </div>
                      <div>
                        <strong>Accounts:</strong> Journal entries and financial ledgers untouched
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirmation & Deletion Section */}
              <div
                style={{
                  borderTop: "2px solid #fed7d7",
                  paddingTop: "20px",
                  background: "#fff5f5",
                  margin: "0 -20px -20px -20px",
                  padding: "20px",
                  borderBottomLeftRadius: "10px",
                  borderBottomRightRadius: "10px",
                }}
              >
                <p style={{ margin: "0 0 14px", color: "#9b2c2c", fontSize: "14px", fontWeight: 600 }}>
                  To confirm permanent deletion of <strong>{selectedForDelete.name}</strong> and all linked records,
                  please type <span style={{ background: "#fed7d7", padding: "2px 6px", borderRadius: "4px" }}>DELETE</span> or the patient name below:
                </p>

                <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    placeholder={`Type DELETE or ${selectedForDelete.name}`}
                    style={{
                      flex: 1,
                      minWidth: "220px",
                      borderColor: isDeleteConfirmed ? "#c53030" : "#e2e8f0",
                      background: "#ffffff",
                    }}
                  />

                  <button
                    type="button"
                    className="primary danger-action"
                    disabled={!isDeleteConfirmed || deleting}
                    onClick={handleExecuteDelete}
                    style={{
                      padding: "10px 20px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "14px",
                      fontWeight: 700,
                    }}
                  >
                    {deleting ? (
                      <>
                        <LoaderCircle className="spin" size={16} /> Deleting All Records...
                      </>
                    ) : (
                      <>
                        <Trash2 size={16} /> Permanently Delete Patient & All Records
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                textAlign: "center",
                padding: "48px 24px",
                border: "2px dashed #cbd5e1",
                borderRadius: "10px",
                color: "#64748b",
              }}
            >
              <Users size={40} style={{ opacity: 0.4, marginBottom: "12px" }} />
              <h3 style={{ margin: "0 0 6px", color: "#334155" }}>No Patient Selected</h3>
              <p style={{ margin: 0, fontSize: "14px" }}>
                Search for a patient above or click "Delete" on any row in the Patient Directory tab to inspect and delete.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* QUICK DELETE MODAL (From Directory Table Row)                            */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {deleteModalOpen && selectedForDelete && (
        <div className="modal-wrap print-hide">
          <div className="modal" style={{ maxWidth: "680px" }}>
            <div className="modal-head" style={{ borderBottom: "2px solid #fed7d7" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <AlertTriangle size={24} style={{ color: "#c53030" }} />
                <div>
                  <h2 style={{ margin: 0, color: "#9b2c2c" }}>Delete Patient & Clinical Records</h2>
                  <p style={{ margin: "2px 0 0", color: "#742a2a" }}>
                    Removes patient profile & clinical history only. Sales, cash, and stock remain safe.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setSelectedForDelete(null);
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "18px 0" }}>
              {/* Patient Banner */}
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  marginBottom: "16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong style={{ fontSize: "16px", color: "#0f172a" }}>{selectedForDelete.name}</strong>
                  <span style={{ marginLeft: "10px", color: "#0c5749", fontFamily: "monospace", fontWeight: 700 }}>
                    {selectedForDelete.patient_id}
                  </span>
                </div>
                <div style={{ fontSize: "13px", color: "#64748b" }}>
                  {selectedForDelete.mobile || "No mobile"} {selectedForDelete.age ? `• Age ${selectedForDelete.age}` : ""}
                </div>
              </div>

              {/* Records Breakdown */}
              <p style={{ margin: "0 0 10px", fontWeight: 600, fontSize: "14px", color: "#b91c1c" }}>
                The following clinical records will be permanently removed:
              </p>

              {loadingStats ? (
                <div style={{ padding: "20px", textAlign: "center", color: "#64748b" }}>
                  <LoaderCircle className="spin" size={20} style={{ verticalAlign: "middle", marginRight: "8px" }} />
                  Loading record counts...
                </div>
              ) : deleteStats ? (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: "10px",
                      marginBottom: "14px",
                    }}
                  >
                    <div style={{ background: "#fff", border: "1px solid #fed7d7", borderRadius: "6px", padding: "10px" }}>
                      <small style={{ color: "#9b2c2c", display: "block" }}>Consultations</small>
                      <strong style={{ fontSize: "16px", color: "#9b2c2c" }}>{deleteStats.consultationsCount} visits</strong>
                    </div>
                    <div style={{ background: "#fff", border: "1px solid #fed7d7", borderRadius: "6px", padding: "10px" }}>
                      <small style={{ color: "#9b2c2c", display: "block" }}>Prescriptions</small>
                      <strong style={{ fontSize: "16px", color: "#9b2c2c" }}>{deleteStats.prescriptionsCount} files</strong>
                    </div>
                    <div style={{ background: "#fff", border: "1px solid #fed7d7", borderRadius: "6px", padding: "10px" }}>
                      <small style={{ color: "#9b2c2c", display: "block" }}>Patient Ledger</small>
                      <strong style={{ fontSize: "16px", color: "#9b2c2c" }}>{deleteStats.ledgerCount} entries</strong>
                    </div>
                  </div>

                  {/* Preserved Status */}
                  <div
                    style={{
                      background: "#f0fdf4",
                      border: "1px solid #86efac",
                      borderRadius: "6px",
                      padding: "10px 12px",
                      marginBottom: "14px",
                      fontSize: "13px",
                      color: "#166534",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <ShieldCheck size={18} color="#16a34a" />
                    <span>
                      <strong>Protected:</strong> {deleteStats.salesCount} sales bills ({money(deleteStats.salesTotal)}), cash receipts, and stock inventory are completely safe and will not be touched.
                    </span>
                  </div>
                </>
              ) : null}

              {/* Confirmation Input */}
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: 600 }}>
                  Type <span style={{ color: "#b91c1c" }}>DELETE</span> or patient name to confirm:
                </label>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder="DELETE"
                  style={{ width: "100%" }}
                  autoFocus
                />
              </div>
            </div>

            <div className="form-actions" style={{ justifyContent: "space-between" }}>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setSelectedForDelete(null);
                }}
                disabled={deleting}
              >
                Cancel
              </button>

              <button
                type="button"
                className="primary danger-action"
                disabled={!isDeleteConfirmed || deleting}
                onClick={handleExecuteDelete}
              >
                {deleting ? (
                  <>
                    <LoaderCircle className="spin" size={16} /> Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} /> Confirm Delete (Clinical Data Only)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* ADD / EDIT PATIENT MODAL                                                 */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="modal-wrap print-hide">
          <div className="modal" style={{ maxWidth: "600px" }}>
            <div className="modal-head">
              <div>
                <h2>{editingPatient ? "Edit Patient" : "Add New Patient"}</h2>
                <p>{editingPatient ? `Updating records for ${editingPatient.patient_id}` : "Register a new patient master"}</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePatient}>
              <div className="form-grid">
                <label className="field">
                  <span>Patient ID</span>
                  <input
                    type="text"
                    value={editingPatient ? editingPatient.patient_id : "Auto generated on save"}
                    readOnly
                    disabled
                  />
                </label>

                <label className="field">
                  <span>
                    Patient Name<b> *</b>
                  </span>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Enter patient full name"
                    autoFocus
                  />
                </label>

                <label className="field">
                  <span>Age</span>
                  <input
                    type="number"
                    min="0"
                    max="150"
                    value={formAge}
                    onChange={(e) => setFormAge(e.target.value)}
                    placeholder="e.g. 35"
                  />
                </label>

                <label className="field">
                  <span>Gender</span>
                  <select value={formGender} onChange={(e) => setFormGender(e.target.value)}>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </label>

                <label className="field">
                  <span>Mobile Number</span>
                  <input
                    type="tel"
                    value={formMobile}
                    onChange={(e) => setFormMobile(e.target.value)}
                    placeholder="10-digit mobile"
                  />
                </label>

                <label className="field">
                  <span>Blood Group</span>
                  <select value={formBloodGroup} onChange={(e) => setFormBloodGroup(e.target.value)}>
                    <option value="">Select blood group</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                  </select>
                </label>

                <label className="field" style={{ gridColumn: "1 / -1" }}>
                  <span>Address</span>
                  <input
                    type="text"
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    placeholder="Street, City, Pincode"
                  />
                </label>

                <label className="field" style={{ gridColumn: "1 / -1" }}>
                  <span>Allergies / Special Notes</span>
                  <input
                    type="text"
                    value={formAllergies}
                    onChange={(e) => setFormAllergies(e.target.value)}
                    placeholder="e.g. Penicillin allergy, diabetic"
                  />
                </label>
              </div>

              <div className="form-actions" style={{ justifyContent: "space-between", marginTop: "20px" }}>
                {editingPatient ? (
                  <button
                    type="button"
                    className="table-edit danger-btn"
                    onClick={() => {
                      setModalOpen(false);
                      openDeleteModal(editingPatient);
                    }}
                    style={{ color: "#c53030", borderColor: "#fecaca", background: "#fef2f2" }}
                  >
                    <Trash2 size={14} /> Delete Patient (Clinical Only)
                  </button>
                ) : (
                  <div />
                )}

                <div style={{ display: "flex", gap: "10px" }}>
                  <button type="button" className="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
                    Cancel
                  </button>
                  <button type="submit" className="primary" disabled={saving}>
                    {saving ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <CheckCircle2 size={16} />
                    )}{" "}
                    {editingPatient ? "Update Patient" : "Save Patient"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
