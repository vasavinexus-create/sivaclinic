"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Package,
  Upload,
  X,
} from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { Profile, Row } from "../lib/types";
import {
  AnalyzedMedicineRow,
  AnalysisSummary,
  analyzeMedicineRows,
  downloadSampleCsvTemplate,
  executeMedicineImport,
  mapRawRowsToParsed,
  parseCsvOrTsv,
  parseExcelOrCsvFile,
} from "../lib/medicineImport";

export default function MedicineImportModal({
  profile,
  existingProducts,
  knownCategories,
  onClose,
  onSuccess,
  notify,
}: {
  profile: Profile;
  existingProducts: Row[];
  knownCategories: string[];
  onClose: () => void;
  onSuccess: () => void;
  notify: (msg: string) => void;
}) {
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [pasteText, setPasteText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [analyzedRows, setAnalyzedRows] = useState<AnalyzedMedicineRow[] | null>(null);
  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const [filterTab, setFilterTab] = useState<"all" | "errors" | "valid">("all");
  const [stockMode, setStockMode] = useState<"sale_unit" | "purchase_unit">("sale_unit");
  const [importResult, setImportResult] = useState<{ successCount: number; errors: string[] } | null>(null);

  // File drop/input handler
  const handleFileChange = async (file: File) => {
    if (!file) return;
    setAnalyzing(true);
    setImportResult(null);
    try {
      const parsed = await parseExcelOrCsvFile(file);
      if (parsed.length === 0) {
        notify("No data rows found in file. Please ensure header matches the format.");
        setAnalyzing(false);
        return;
      }
      const res = analyzeMedicineRows(parsed, existingProducts, knownCategories);
      setAnalyzedRows(res.analyzedRows);
      setSummary(res.summary);
    } catch (err: any) {
      notify(err?.message || "Failed to parse file. Please verify file format.");
    } finally {
      setAnalyzing(false);
    }
  };

  // Paste handler
  const handleAnalyzePaste = () => {
    if (!pasteText.trim()) {
      notify("Please paste data copied from Excel or CSV");
      return;
    }
    setAnalyzing(true);
    setImportResult(null);
    try {
      const rawRows = parseCsvOrTsv(pasteText);
      if (rawRows.length === 0) {
        notify("Could not parse table rows. Ensure header row is present.");
        setAnalyzing(false);
        return;
      }
      const parsed = mapRawRowsToParsed(rawRows);
      const res = analyzeMedicineRows(parsed, existingProducts, knownCategories);
      setAnalyzedRows(res.analyzedRows);
      setSummary(res.summary);
    } catch (err: any) {
      notify(err?.message || "Failed to analyze pasted text.");
    } finally {
      setAnalyzing(false);
    }
  };

  // Filtered rows for the preview table
  const displayedRows = useMemo(() => {
    if (!analyzedRows) return [];
    if (filterTab === "errors") {
      return analyzedRows.filter((r) => r.status === "error" || r.status === "warning");
    }
    if (filterTab === "valid") {
      return analyzedRows.filter((r) => r.status === "valid");
    }
    return analyzedRows;
  }, [analyzedRows, filterTab]);

  // Execute import
  const handleStartImport = async (validOnly: boolean) => {
    if (!supabase || !analyzedRows) return;
    const targetRows = validOnly ? analyzedRows.filter((r) => r.status !== "error") : analyzedRows;
    if (targetRows.length === 0) {
      notify("No valid rows to import.");
      return;
    }

    setImporting(true);
    setProgress({ done: 0, total: targetRows.length });

    try {
      const result = await executeMedicineImport(
        targetRows,
        profile,
        supabase,
        (done, total) => setProgress({ done, total }),
        stockMode
      );

      setImportResult(result);
      if (result.successCount > 0) {
        notify(`Successfully imported ${result.successCount} medicines with opening stock!`);
        onSuccess();
      }
    } catch (err: any) {
      notify(err?.message || "Import execution encountered an error.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="modal-wrap print-hide" style={{ zIndex: 100 }}>
      <div className="modal wide" style={{ maxWidth: 1150, maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        {/* Modal Head */}
        <div className="modal-head" style={{ borderBottom: "1px solid var(--line)", paddingBottom: "16px", marginBottom: "16px" }}>
          <div>
            <h2 style={{ display: "flex", alignItems: "center", gap: "10px", margin: 0, fontSize: "24px" }}>
              <FileSpreadsheet size={26} color="#126b5a" />
              Import Medicines & Opening Stock
            </h2>
            <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "14px" }}>
              Upload Excel (.xlsx, .xls) or CSV with format: <b>MEDICINE, GENIRIC, CATEGORY, SALE UNIT, PURCHASE UNIT, UNITS/PACK, MRP, GST, DISCOUNT %, MINIMUM STOCK, STOCK, BATCH, EXPIRY DATE</b> &nbsp;·&nbsp; <span style={{ color: "#0c5749", fontWeight: 600 }}>STOCK is in Sale Units (Tablets / Capsules / ml)</span>
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              type="button"
              className="secondary"
              onClick={downloadSampleCsvTemplate}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", height: "38px" }}
              title="Download sample template with format header and example rows"
            >
              <Download size={15} /> Download Sample Template
            </button>
            <button className="icon-btn" onClick={onClose} disabled={importing}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingRight: "4px" }}>
          {/* STEP 1: If no analysis yet, show input options */}
          {!analyzedRows ? (
            <div>
              {/* Tab selector: File vs Paste */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                <button
                  type="button"
                  onClick={() => setMode("file")}
                  style={{
                    padding: "8px 18px",
                    borderRadius: "8px",
                    fontWeight: 600,
                    fontSize: "14px",
                    border: mode === "file" ? "2px solid #126b5a" : "1px solid var(--line)",
                    background: mode === "file" ? "#e6f4f1" : "white",
                    color: mode === "file" ? "#0c5749" : "var(--muted)",
                    cursor: "pointer",
                  }}
                >
                  <Upload size={14} style={{ display: "inline", marginRight: "6px" }} /> Upload Excel / CSV File
                </button>
                <button
                  type="button"
                  onClick={() => setMode("paste")}
                  style={{
                    padding: "8px 18px",
                    borderRadius: "8px",
                    fontWeight: 600,
                    fontSize: "14px",
                    border: mode === "paste" ? "2px solid #126b5a" : "1px solid var(--line)",
                    background: mode === "paste" ? "#e6f4f1" : "white",
                    color: mode === "paste" ? "#0c5749" : "var(--muted)",
                    cursor: "pointer",
                  }}
                >
                  <FileSpreadsheet size={14} style={{ display: "inline", marginRight: "6px" }} /> Paste Directly from Excel
                </button>
              </div>

              {mode === "file" ? (
                <div
                  style={{
                    border: "2px dashed #b2ded6",
                    borderRadius: "12px",
                    padding: "40px 20px",
                    textAlign: "center",
                    background: "#f7faf9",
                    cursor: "pointer",
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files?.[0]) handleFileChange(e.dataTransfer.files[0]);
                  }}
                  onClick={() => document.getElementById("medicine-file-input")?.click()}
                >
                  <Upload size={44} color="#126b5a" style={{ margin: "0 auto 12px" }} />
                  <h3 style={{ margin: "0 0 6px", fontSize: "17px", color: "var(--ink)" }}>
                    Choose an Excel (.xlsx, .xls) or CSV file
                  </h3>
                  <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
                    or drag and drop your file right here. Medicine IDs will be generated automatically.
                  </p>
                  <input
                    id="medicine-file-input"
                    type="file"
                    accept=".xlsx,.xls,.csv,.tsv,.txt"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleFileChange(e.target.files[0]);
                    }}
                  />
                  <button
                    type="button"
                    className="primary"
                    style={{ marginTop: "16px", padding: "10px 24px" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      document.getElementById("medicine-file-input")?.click();
                    }}
                  >
                    Select File
                  </button>
                </div>
              ) : (
                <div>
                  <p style={{ margin: "0 0 8px", fontSize: "13px", color: "var(--muted)" }}>
                    Select your medicine rows in Excel (including header), copy (<kbd>Ctrl+C</kbd>), and paste below (<kbd>Ctrl+V</kbd>):
                  </p>
                  <textarea
                    rows={12}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={`MEDICINE\tGENIRIC\tCATEGORY\tSALE UNIT\tPURCHASE UNIT\tUNITS/PACK\tMRP\tGST\tDISCOUNT %\tMINIMUM STOCK\tSTOCK\tBATCH\tEXPIRY DATE\nParacetamol 500mg\tParacetamol\tTablet\ttablet\tstrip\t10\t25.00\t12\t0\t50\t100\tB-01\t2027-12-31`}
                    style={{
                      width: "100%",
                      fontFamily: "monospace",
                      fontSize: "12px",
                      padding: "12px",
                      borderRadius: "8px",
                      border: "1px solid var(--line)",
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
                    <button
                      type="button"
                      className="primary"
                      onClick={handleAnalyzePaste}
                      disabled={analyzing || !pasteText.trim()}
                      style={{ padding: "10px 24px" }}
                    >
                      {analyzing ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />} Analyze Entries
                    </button>
                  </div>
                </div>
              )}

              {analyzing && (
                <div style={{ textAlign: "center", padding: "20px", color: "#0c5749", fontWeight: 600 }}>
                  <LoaderCircle className="spin" size={24} style={{ display: "inline", marginRight: "8px" }} />
                  Analyzing file entries, duplicates, categories, and selectable units...
                </div>
              )}
            </div>
          ) : (
            /* STEP 2: Analysis Results Dashboard & Preview Table */
            <div>
              {/* Summary Metrics */}
              {summary && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px", marginBottom: "16px" }}>
                  <div style={{ background: "#f8faf9", border: "1px solid var(--line)", borderRadius: "8px", padding: "12px 14px" }}>
                    <span style={{ fontSize: "12px", color: "var(--muted)", textTransform: "uppercase" }}>Total Medicines</span>
                    <strong style={{ display: "block", fontSize: "24px", color: "var(--ink)", marginTop: "2px" }}>{summary.totalRows}</strong>
                  </div>

                  <div style={{ background: "#eefaf6", border: "1px solid #b2ded6", borderRadius: "8px", padding: "12px 14px" }}>
                    <span style={{ fontSize: "12px", color: "#0c5749", textTransform: "uppercase", fontWeight: 600 }}>Ready to Import</span>
                    <strong style={{ display: "block", fontSize: "24px", color: "#0c5749", marginTop: "2px" }}>{summary.validRows}</strong>
                  </div>

                  <div style={{ background: summary.errorRows > 0 ? "#fdf2f2" : "#f8faf9", border: summary.errorRows > 0 ? "1px solid #f8b4b4" : "1px solid var(--line)", borderRadius: "8px", padding: "12px 14px" }}>
                    <span style={{ fontSize: "12px", color: summary.errorRows > 0 ? "#9b1c1c" : "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>Problems / Errors</span>
                    <strong style={{ display: "block", fontSize: "24px", color: summary.errorRows > 0 ? "#c81e1e" : "var(--muted)", marginTop: "2px" }}>{summary.errorRows}</strong>
                  </div>

                  <div style={{ background: summary.warningRows > 0 ? "#fffbeb" : "#f8faf9", border: summary.warningRows > 0 ? "1px solid #fde68a" : "1px solid var(--line)", borderRadius: "8px", padding: "12px 14px" }}>
                    <span style={{ fontSize: "12px", color: summary.warningRows > 0 ? "#92400e" : "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>Warnings</span>
                    <strong style={{ display: "block", fontSize: "24px", color: summary.warningRows > 0 ? "#b45309" : "var(--muted)", marginTop: "2px" }}>{summary.warningRows}</strong>
                  </div>

                  {summary.newCategories.length > 0 && (
                    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", padding: "12px 14px" }}>
                      <span style={{ fontSize: "12px", color: "#1e40af", textTransform: "uppercase", fontWeight: 600 }}>New Categories</span>
                      <strong style={{ display: "block", fontSize: "24px", color: "#1d4ed8", marginTop: "2px" }}>{summary.newCategories.length}</strong>
                    </div>
                  )}
                </div>
              )}

              {/* Problem Alert Banner if errors exist */}
              {summary && summary.hasErrors && (
                <div style={{ background: "#fdf2f2", border: "1px solid #f8b4b4", borderRadius: "8px", padding: "12px 16px", marginBottom: "14px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <AlertCircle size={20} color="#c81e1e" style={{ flexShrink: 0, marginTop: "2px" }} />
                  <div style={{ fontSize: "13px", color: "#9b1c1c" }}>
                    <b>Analysis detected {summary.errorRows} row(s) with issues.</b> Please review the highlighted rows below. You can either import only the valid rows (errored rows will be skipped), or cancel and fix your file.
                  </div>
                </div>
              )}

              {/* Stock Unit Mode Selector */}
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  marginBottom: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Package size={18} color="#15803d" />
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#166534" }}>
                    Stock column in your Excel represents:
                  </span>
                </div>
                <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 700, cursor: "pointer", color: "#14532d" }}>
                    <input
                      type="radio"
                      name="stockMode"
                      value="sale_unit"
                      checked={stockMode === "sale_unit"}
                      onChange={() => setStockMode("sale_unit")}
                    />
                    Sale Units (Tablets / Pieces / ml) [Default]
                    <span style={{ fontSize: "11px", fontWeight: 400, color: "#15803d" }}>
                      — e.g. 100 tablets = 10 strips of 10
                    </span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 500, cursor: "pointer", color: "var(--muted)" }}>
                    <input
                      type="radio"
                      name="stockMode"
                      value="purchase_unit"
                      checked={stockMode === "purchase_unit"}
                      onChange={() => setStockMode("purchase_unit")}
                    />
                    Purchase Units (Strips / Packs)
                    <span style={{ fontSize: "11px", fontWeight: 400, color: "#15803d" }}>
                      — e.g. 10 strips × 10 = 100 tablets
                    </span>
                  </label>
                </div>
              </div>

              {/* Filter Tabs */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    type="button"
                    onClick={() => setFilterTab("all")}
                    style={{
                      padding: "5px 12px",
                      borderRadius: "6px",
                      fontSize: "13px",
                      fontWeight: 600,
                      border: "1px solid var(--line)",
                      background: filterTab === "all" ? "#17342f" : "white",
                      color: filterTab === "all" ? "white" : "var(--muted)",
                      cursor: "pointer",
                    }}
                  >
                    All ({analyzedRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab("errors")}
                    style={{
                      padding: "5px 12px",
                      borderRadius: "6px",
                      fontSize: "13px",
                      fontWeight: 600,
                      border: "1px solid var(--line)",
                      background: filterTab === "errors" ? "#c81e1e" : "white",
                      color: filterTab === "errors" ? "white" : "#c81e1e",
                      cursor: "pointer",
                    }}
                  >
                    Issues Only ({(summary?.errorRows || 0) + (summary?.warningRows || 0)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab("valid")}
                    style={{
                      padding: "5px 12px",
                      borderRadius: "6px",
                      fontSize: "13px",
                      fontWeight: 600,
                      border: "1px solid var(--line)",
                      background: filterTab === "valid" ? "#0c5749" : "white",
                      color: filterTab === "valid" ? "white" : "#0c5749",
                      cursor: "pointer",
                    }}
                  >
                    Ready ({summary?.validRows || 0})
                  </button>
                </div>

                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setAnalyzedRows(null);
                    setSummary(null);
                    setPasteText("");
                    setImportResult(null);
                  }}
                  style={{ fontSize: "12px", height: "32px", padding: "0 10px" }}
                  disabled={importing}
                >
                  Choose Another File
                </button>
              </div>

              {/* Data Table */}
              <div className="data-wrap" style={{ maxHeight: "380px", overflowY: "auto", border: "1px solid var(--line)", borderRadius: "8px" }}>
                <table className="data-table" style={{ fontSize: "13px" }}>
                  <thead style={{ position: "sticky", top: 0, background: "#f3f6f4", zIndex: 2 }}>
                    <tr>
                      <th style={{ width: 45 }}>#</th>
                      <th style={{ width: 90 }}>Status</th>
                      <th>Medicine Name</th>
                      <th>Generic</th>
                      <th>Category</th>
                      <th>Units</th>
                      <th>Pack</th>
                      <th>MRP</th>
                      <th>GST</th>
                      <th>Disc %</th>
                      <th style={{ minWidth: 120 }}>Stock ({stockMode === "purchase_unit" ? "Packs" : "Units"})</th>
                      <th>Batch</th>
                      <th>Expiry</th>
                      <th>Analysis / Problems</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedRows.map((row) => (
                      <tr
                        key={row.rawIndex}
                        style={{
                          background:
                            row.status === "error"
                              ? "#fff5f5"
                              : row.status === "warning"
                              ? "#fffdf5"
                              : undefined,
                        }}
                      >
                        <td>{row.rawIndex}</td>
                        <td>
                          {row.status === "error" ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", color: "#c81e1e", fontWeight: 700, fontSize: "11px", background: "#fde8e8", padding: "2px 6px", borderRadius: "4px" }}>
                              <AlertCircle size={12} /> Problem
                            </span>
                          ) : row.status === "warning" ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", color: "#b45309", fontWeight: 700, fontSize: "11px", background: "#fef3c7", padding: "2px 6px", borderRadius: "4px" }}>
                              <AlertTriangle size={12} /> Warning
                            </span>
                          ) : (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", color: "#0c5749", fontWeight: 700, fontSize: "11px", background: "#def7ec", padding: "2px 6px", borderRadius: "4px" }}>
                              <CheckCircle2 size={12} /> Ready
                            </span>
                          )}
                        </td>
                        <td style={{ fontWeight: 600 }}>{row.medicine || <i style={{ color: "#c81e1e" }}>Missing Name</i>}</td>
                        <td>{row.generic_name || "—"}</td>
                        <td>
                          {row.category}
                          {row.isNewCategory && (
                            <span style={{ marginLeft: "4px", fontSize: "10px", background: "#dbeafe", color: "#1e40af", padding: "1px 5px", borderRadius: "3px" }}>
                              New
                            </span>
                          )}
                        </td>
                        <td>{row.sale_unit} / {row.purchase_unit}</td>
                        <td>{row.units_per_pack}</td>
                        <td>₹{row.mrp.toFixed(2)}</td>
                        <td>{row.gst_percent}%</td>
                        <td>{row.discount_percent}%</td>
                        <td style={{ fontWeight: row.stock > 0 ? 700 : 400, color: row.stock > 0 ? "#0c5749" : "inherit" }}>
                          {stockMode === "purchase_unit" ? (
                            <div>
                              <span><b>{row.stock}</b> {row.purchase_unit || "pack"}</span>
                              {row.units_per_pack > 1 && row.stock > 0 && (
                                <div style={{ fontSize: "11px", color: "#166534", fontWeight: 500 }}>
                                  = {row.stock * row.units_per_pack} {row.sale_unit || "tablets"}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <span><b>{row.stock}</b> {row.sale_unit || "unit"}</span>
                              {row.units_per_pack > 1 && row.stock > 0 && (
                                <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 400 }}>
                                  ≈ {Math.floor(row.stock / row.units_per_pack)} {row.purchase_unit || "packs"}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td>{row.batch || (row.stock > 0 ? "OPENING" : "—")}</td>
                        <td>{row.formattedExpiryDate || "—"}</td>
                        <td>
                          {row.issues.length === 0 ? (
                            <span style={{ color: "#0c5749", fontSize: "12px" }}>All good</span>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              {row.issues.map((issue, idx) => (
                                <span
                                  key={idx}
                                  style={{
                                    fontSize: "11px",
                                    color: issue.type === "error" ? "#c81e1e" : issue.type === "warning" ? "#b45309" : "#1e40af",
                                  }}
                                >
                                  • {issue.message}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Progress bar during import */}
              {importing && (
                <div style={{ marginTop: "16px", background: "#e6f4f1", border: "1px solid #b2ded6", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "13px", fontWeight: 600, color: "#0c5749" }}>
                    <span>
                      <LoaderCircle className="spin" size={15} style={{ display: "inline", marginRight: "6px" }} />
                      Generating IDs and saving medicines & opening stock batches...
                    </span>
                    <span>
                      {progress.done} / {progress.total}
                    </span>
                  </div>
                  <div style={{ height: "8px", background: "#d1eae3", borderRadius: "4px", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        background: "#126b5a",
                        width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                        transition: "width 0.2s ease",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Result banner if finished */}
              {importResult && (
                <div style={{ marginTop: "14px", background: "#def7ec", border: "1px solid #84e1bc", borderRadius: "8px", padding: "12px 16px" }}>
                  <b style={{ color: "#0c5749", fontSize: "14px" }}>
                    ✓ Import Complete: {importResult.successCount} medicines successfully added with auto-generated Medicine IDs!
                  </b>
                  {importResult.errors.length > 0 && (
                    <div style={{ marginTop: "6px", color: "#c81e1e", fontSize: "12px" }}>
                      {importResult.errors.length} item(s) had errors during saving.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Foot Actions */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "16px",
            paddingTop: "14px",
            borderTop: "1px solid var(--line)",
          }}
        >
          <button type="button" className="secondary" onClick={onClose} disabled={importing}>
            {importResult ? "Close" : "Cancel"}
          </button>

          {analyzedRows && !importResult && (
            <div style={{ display: "flex", gap: "10px" }}>
              {summary && summary.hasErrors ? (
                <>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setAnalyzedRows(null);
                      setSummary(null);
                    }}
                    disabled={importing}
                  >
                    Fix File & Re-upload
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => handleStartImport(true)}
                    disabled={importing || (summary?.validRows || 0) === 0}
                    style={{ background: "#0c5749" }}
                  >
                    {importing ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />}
                    Import {summary?.validRows || 0} Valid Items (Skip Errored)
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="primary"
                  onClick={() => handleStartImport(false)}
                  disabled={importing || (analyzedRows?.length || 0) === 0}
                  style={{ background: "#0c5749", padding: "10px 22px", fontSize: "15px" }}
                >
                  {importing ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />}
                  Import All {analyzedRows?.length || 0} Medicines & Opening Stock
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
