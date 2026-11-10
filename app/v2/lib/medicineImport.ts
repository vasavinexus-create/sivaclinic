import { SupabaseClient } from "@supabase/supabase-js";
import { formatCategoryName, saveNewMedicineCategory } from "./categories";
import { insertStockMovementSafe } from "../../../lib/inventory-stock";
import { Profile, Row } from "./types";

export interface ParsedMedicineRow {
  rawIndex: number;
  medicine: string;
  generic_name: string;
  category: string;
  sale_unit: string;
  purchase_unit: string;
  units_per_pack: number;
  mrp: number;
  gst_percent: number;
  discount_percent: number;
  minimum_stock: number;
  stock: number;
  batch: string;
  expiry_date: string;
}

export interface RowValidationIssue {
  type: "error" | "warning" | "info";
  field?: string;
  message: string;
}

export interface AnalyzedMedicineRow extends ParsedMedicineRow {
  status: "valid" | "warning" | "error";
  issues: RowValidationIssue[];
  computedSellingRate: number;
  formattedExpiryDate: string;
  isDuplicateInFile: boolean;
  isDuplicateInDb: boolean;
  isNewCategory: boolean;
}

export interface AnalysisSummary {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  newCategories: string[];
  duplicateCount: number;
  hasErrors: boolean;
}

export const VALID_SALE_UNITS = [
  "tablet",
  "capsule",
  "bottle",
  "vial",
  "ampoule",
  "ml",
  "gm",
  "tube",
  "sachet",
  "piece",
  "unit",
];

export const VALID_PURCHASE_UNITS = [
  "strip",
  "box",
  "bottle",
  "vial",
  "ampoule",
  "tube",
  "sachet",
  "piece",
  "pack",
  "unit",
];

// Helper to normalize header text (removes special chars, extra whitespace)
function cleanHeader(h: string): string {
  return String(h || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9%]/g, " ")
    .replace(/\s+/g, " ");
}

// Map user header to our field name
function mapHeaderToField(header: string): string | null {
  const c = cleanHeader(header);
  if (c === "MEDICINE" || c === "MEDICINE NAME" || c === "NAME" || c === "PRODUCT" || c === "PRODUCT NAME") {
    return "medicine";
  }
  if (c === "GENIRIC" || c === "GENERIC" || c === "GENERIC NAME" || c === "COMPOSITION") {
    return "generic_name";
  }
  if (c === "CATEGORY") {
    return "category";
  }
  if (c === "SALE UNIT" || c === "SALEUNIT" || c === "SALES UNIT") {
    return "sale_unit";
  }
  if (c === "PURCHASE UNIT" || c === "PURCHASEUNIT") {
    return "purchase_unit";
  }
  if (c === "UNITS PACK" || c === "UNITS PER PACK" || c === "UNIT PACK" || c === "PACK SIZE" || c === "CONVERSION") {
    return "units_per_pack";
  }
  if (c === "MRP") {
    return "mrp";
  }
  if (c === "GST" || c === "GST %" || c === "GST PERCENT" || c === "TAX") {
    return "gst_percent";
  }
  if (c === "DISCOUNT %" || c === "DISCOUNT" || c === "DISCOUNT PERCENT" || c === "SALES DISCOUNT") {
    return "discount_percent";
  }
  if (c === "MINIMUM STOCK" || c === "MIN STOCK" || c === "REORDER LEVEL") {
    return "minimum_stock";
  }
  if (c === "STOCK" || c === "OPENING STOCK" || c === "QTY" || c === "QUANTITY") {
    return "stock";
  }
  if (c === "BATCH" || c === "BATCH NUMBER" || c === "BATCH NO") {
    return "batch";
  }
  if (c === "EXPIRY DATE" || c === "EXPIRY" || c === "EXP DATE" || c === "EXP") {
    return "expiry_date";
  }
  return null;
}

// Robust CSV parser supporting quotes, commas, tabs
export function parseCsvOrTsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Determine delimiter: tab or comma
  const firstLine = lines[0];
  const delimiter = firstLine.includes("\t") ? "\t" : ",";

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        if (inQuotes && line[i + 1] === char) {
          cur += char;
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(cur.trim());
        cur = "";
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const rawHeaders = parseLine(lines[0]);
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (cols.every((c) => !c)) continue; // skip blank rows
    const rowObj: Record<string, string> = {};
    rawHeaders.forEach((h, idx) => {
      rowObj[h] = cols[idx] || "";
    });
    rows.push(rowObj);
  }

  return rows;
}

// Normalize various date formats to YYYY-MM-DD
export function normalizeDate(raw: any): string {
  if (!raw) return "";
  const s = String(raw).trim();
  if (!s) return "";

  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // If Excel serial number (e.g. 45600)
  if (/^\d{5}$/.test(s)) {
    const serial = parseInt(s, 10);
    const date = new Date((serial - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, "0");
    const month = ddmmyyyy[2].padStart(2, "0");
    const year = ddmmyyyy[3];
    return `${year}-${month}-${day}`;
  }

  // MM/YYYY or MM-YYYY (Expiry format) -> default to last day of month
  const mmyyyy = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (mmyyyy) {
    const month = parseInt(mmyyyy[1], 10);
    const year = parseInt(mmyyyy[2], 10);
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }

  // Try standard Date parse
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return s;
}

// Convert raw row objects into structured ParsedMedicineRow
export function mapRawRowsToParsed(rawRows: Array<Record<string, any>>): ParsedMedicineRow[] {
  return rawRows.map((raw, idx) => {
    const mapped: Record<string, any> = {};
    Object.keys(raw).forEach((key) => {
      const field = mapHeaderToField(key);
      if (field) {
        mapped[field] = raw[key];
      }
    });

    const medicine = String(mapped.medicine || "").trim();
    const generic_name = String(mapped.generic_name || "").trim();
    const category = formatCategoryName(String(mapped.category || "").trim() || "Tablet");
    const sale_unit = String(mapped.sale_unit || "tablet").trim().toLowerCase();
    const purchase_unit = String(mapped.purchase_unit || "strip").trim().toLowerCase();
    const units_per_pack = Math.max(1, parseInt(String(mapped.units_per_pack || "10"), 10) || 10);
    const mrp = Math.max(0, parseFloat(String(mapped.mrp || "0")) || 0);
    const gst_percent = Math.max(0, Math.min(100, parseFloat(String(mapped.gst_percent || "12")) || 12));
    const discount_percent = Math.max(0, Math.min(100, parseFloat(String(mapped.discount_percent || "0")) || 0));
    const minimum_stock = Math.max(0, parseInt(String(mapped.minimum_stock || "0"), 10) || 0);
    const stock = Math.max(0, parseFloat(String(mapped.stock || "0")) || 0);
    const batch = String(mapped.batch || "").trim();
    const expiry_date = normalizeDate(mapped.expiry_date);

    return {
      rawIndex: idx + 1,
      medicine,
      generic_name,
      category,
      sale_unit,
      purchase_unit,
      units_per_pack,
      mrp,
      gst_percent,
      discount_percent,
      minimum_stock,
      stock,
      batch,
      expiry_date,
    };
  });
}

// Parse Excel file or CSV in browser
export async function parseExcelOrCsvFile(file: File): Promise<ParsedMedicineRow[]> {
  const fileName = file.name.toLowerCase();

  // If CSV or text file:
  if (fileName.endsWith(".csv") || fileName.endsWith(".tsv") || fileName.endsWith(".txt")) {
    const text = await file.text();
    const rawRows = parseCsvOrTsv(text);
    return mapRawRowsToParsed(rawRows);
  }

  // If XLSX / XLS:
  const arrayBuffer = await file.arrayBuffer();
  let xlsxLib = (window as any).XLSX;

  if (!xlsxLib) {
    // Load local vendor xlsx
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/vendor/xlsx.full.min.js";
      script.onload = () => resolve();
      script.onerror = () => {
        // Fallback to CDN if vendor file is unavailable
        const cdnScript = document.createElement("script");
        cdnScript.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
        cdnScript.onload = () => resolve();
        cdnScript.onerror = () => reject(new Error("Unable to load Excel reader. Please save your file as CSV and upload."));
        document.head.appendChild(cdnScript);
      };
      document.head.appendChild(script);
    });
    xlsxLib = (window as any).XLSX;
  }

  if (!xlsxLib) {
    throw new Error("Excel reader library is not available.");
  }

  const workbook = xlsxLib.read(arrayBuffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = xlsxLib.utils.sheet_to_json(sheet, { defval: "" });

  return mapRawRowsToParsed(rawRows);
}

// Analyze parsed rows for errors, duplicates, and selectable options
export function analyzeMedicineRows(
  rows: ParsedMedicineRow[],
  existingProducts: Row[] = [],
  knownCategories: string[] = []
): { analyzedRows: AnalyzedMedicineRow[]; summary: AnalysisSummary } {
  const existingNamesMap = new Map<string, Row>();
  existingProducts.forEach((p) => {
    if (p.name) existingNamesMap.set(String(p.name).trim().toLowerCase(), p);
  });

  const knownCatSet = new Set(knownCategories.map((c) => c.toLowerCase()));
  const fileSeenNames = new Map<string, number>();
  const today = new Date().toISOString().slice(0, 10);
  const newCategoriesFound = new Set<string>();

  // Count occurrences within file to detect duplicates
  rows.forEach((r) => {
    const nameKey = r.medicine.trim().toLowerCase();
    if (nameKey) {
      fileSeenNames.set(nameKey, (fileSeenNames.get(nameKey) || 0) + 1);
    }
  });

  let validCount = 0;
  let warningCount = 0;
  let errorCount = 0;
  let duplicateCount = 0;

  const analyzedRows: AnalyzedMedicineRow[] = rows.map((row) => {
    const issues: RowValidationIssue[] = [];
    const nameKey = row.medicine.trim().toLowerCase();

    // 1. Medicine Name Check
    if (!nameKey) {
      issues.push({ type: "error", field: "medicine", message: "Medicine name is required" });
    }

    // 2. Duplicate Check inside the file
    const inCount = fileSeenNames.get(nameKey) || 0;
    const isDuplicateInFile = inCount > 1;
    if (isDuplicateInFile) {
      duplicateCount++;
      issues.push({
        type: "error",
        field: "medicine",
        message: `Duplicate in file (name "${row.medicine}" appears ${inCount} times)`,
      });
    }

    // 3. Duplicate Check against database
    const existingDb = existingNamesMap.get(nameKey);
    const isDuplicateInDb = Boolean(existingDb);
    if (isDuplicateInDb) {
      issues.push({
        type: "warning",
        field: "medicine",
        message: `Already exists in database (${existingDb?.product_id || "MED"}). Will be skipped or updated.`,
      });
    }

    // 4. Category Check
    const catKey = (row.category || "").trim().toLowerCase();
    const isNewCategory = catKey !== "" && !knownCatSet.has(catKey);
    if (isNewCategory) {
      newCategoriesFound.add(row.category);
      issues.push({
        type: "info",
        field: "category",
        message: `New category "${row.category}" will be added to categories list`,
      });
    }

    // 5. Units Check
    if (!VALID_SALE_UNITS.includes(row.sale_unit)) {
      issues.push({
        type: "warning",
        field: "sale_unit",
        message: `Sale unit "${row.sale_unit}" is non-standard (standard: ${VALID_SALE_UNITS.slice(0, 5).join(", ")})`,
      });
    }

    if (!VALID_PURCHASE_UNITS.includes(row.purchase_unit)) {
      issues.push({
        type: "warning",
        field: "purchase_unit",
        message: `Purchase unit "${row.purchase_unit}" is non-standard (standard: ${VALID_PURCHASE_UNITS.slice(0, 5).join(", ")})`,
      });
    }

    // 6. Number Checks
    if (row.units_per_pack <= 0 || isNaN(row.units_per_pack)) {
      issues.push({ type: "error", field: "units_per_pack", message: "Units / pack must be at least 1" });
    }

    if (isNaN(row.mrp) || row.mrp < 0) {
      issues.push({ type: "error", field: "mrp", message: "MRP must be a positive number" });
    }

    if (isNaN(row.gst_percent) || row.gst_percent < 0 || row.gst_percent > 100) {
      issues.push({ type: "error", field: "gst_percent", message: "GST % must be between 0 and 100" });
    }

    if (isNaN(row.discount_percent) || row.discount_percent < 0 || row.discount_percent > 100) {
      issues.push({ type: "error", field: "discount_percent", message: "Discount % must be between 0 and 100" });
    }

    // 7. Stock & Expiry Check
    if (isNaN(row.stock) || row.stock < 0) {
      issues.push({ type: "error", field: "stock", message: "Stock cannot be negative" });
    }

    let formattedExpiry = row.expiry_date;
    if (row.stock > 0) {
      if (!row.batch) {
        issues.push({
          type: "info",
          field: "batch",
          message: 'Batch is empty; will default to "OPENING"',
        });
      }

      if (!formattedExpiry) {
        // default 2 years in future
        const future = new Date();
        future.setFullYear(future.getFullYear() + 2);
        formattedExpiry = future.toISOString().slice(0, 10);
        issues.push({
          type: "info",
          field: "expiry_date",
          message: `Expiry missing; defaulted to ${formattedExpiry}`,
        });
      } else if (formattedExpiry < today) {
        issues.push({
          type: "warning",
          field: "expiry_date",
          message: `Expiry date (${formattedExpiry}) is already expired in the past`,
        });
      }
    }

    // Compute status
    const hasErr = issues.some((i) => i.type === "error");
    const hasWarn = issues.some((i) => i.type === "warning");
    const status: "valid" | "warning" | "error" = hasErr ? "error" : hasWarn ? "warning" : "valid";

    if (hasErr) errorCount++;
    else if (hasWarn) warningCount++;
    else validCount++;

    // Compute retail rate per unit
    const units = Math.max(1, row.units_per_pack);
    const unitMrp = row.mrp / units;
    const computedSellingRate = Math.max(0, Number((unitMrp * (1 - row.discount_percent / 100)).toFixed(2)));

    return {
      ...row,
      status,
      issues,
      computedSellingRate,
      formattedExpiryDate: formattedExpiry,
      isDuplicateInFile,
      isDuplicateInDb,
      isNewCategory,
    };
  });

  return {
    analyzedRows,
    summary: {
      totalRows: rows.length,
      validRows: validCount,
      warningRows: warningCount,
      errorRows: errorCount,
      newCategories: Array.from(newCategoriesFound),
      duplicateCount,
      hasErrors: errorCount > 0,
    },
  };
}

// Execute the database import
export async function executeMedicineImport(
  rowsToImport: AnalyzedMedicineRow[],
  profile: Profile,
  supabase: SupabaseClient,
  onProgress?: (done: number, total: number) => void,
  stockMode: "sale_unit" | "purchase_unit" = "sale_unit"
): Promise<{ successCount: number; errors: string[] }> {
  let successCount = 0;
  const errors: string[] = [];
  const total = rowsToImport.length;

  for (let i = 0; i < total; i++) {
    const row = rowsToImport[i];
    try {
      // 1. Generate unique medicine ID: MED-XXXXXX
      const uniqueSuffix = `${Date.now().toString().slice(-4)}${i.toString().padStart(3, "0")}`;
      const productId = `MED-${uniqueSuffix}`;

      // 2. Insert into products
      const productPayload = {
        organization_id: profile.organization_id,
        product_id: productId,
        name: row.medicine.trim(),
        generic_name: row.generic_name.trim() || null,
        category: row.category || "Tablet",
        sale_unit: row.sale_unit || "tablet",
        purchase_unit: row.purchase_unit || "strip",
        default_units_per_purchase_unit: row.units_per_pack,
        mrp: row.mrp,
        selling_rate: row.computedSellingRate,
        gst_percent: row.gst_percent,
        minimum_stock: row.minimum_stock,
        active: true,
      };

      const { data: createdProduct, error: prodErr } = await supabase
        .from("products")
        .insert(productPayload)
        .select("id, product_id, name")
        .single();

      if (prodErr || !createdProduct) {
        throw new Error(prodErr?.message || `Failed to insert product "${row.medicine}"`);
      }

      // 3. If stock > 0, create opening batch in medicine_batches
      if (row.stock > 0) {
        const batchNum = row.batch ? row.batch.trim() : "OPENING";
        const expiry = row.formattedExpiryDate || new Date(Date.now() + 730 * 86400000).toISOString().slice(0, 10);
        
        const isPurchaseUnit = stockMode === "purchase_unit";
        const retailStock = isPurchaseUnit ? Math.round(row.stock * row.units_per_pack) : row.stock;
        const packQty = isPurchaseUnit ? row.stock : Math.floor(row.stock / row.units_per_pack);

        const batchPayload = {
          organization_id: profile.organization_id,
          product_id: createdProduct.id,
          batch_number: batchNum,
          expiry_date: expiry,
          quantity_received: retailStock,
          current_stock: retailStock,
          stock_unit_qty: retailStock,
          purchase_rate: Number((row.mrp * 0.7).toFixed(2)),
          mrp: row.mrp,
          selling_rate: row.computedSellingRate,
          gst_percent: row.gst_percent,
          sales_discount_percent: row.discount_percent,
          purchase_unit: row.purchase_unit,
          sale_unit: row.sale_unit,
          units_per_purchase_unit: row.units_per_pack,
          purchase_pack_qty: packQty,
        };

        const { data: createdBatch, error: batchErr } = await supabase
          .from("medicine_batches")
          .insert(batchPayload)
          .select("id")
          .single();

        if (batchErr || !createdBatch) {
          throw new Error(batchErr?.message || `Failed to create batch for "${row.medicine}"`);
        }

        // Record opening stock movement
        await insertStockMovementSafe(supabase, {
          organization_id: profile.organization_id,
          product_id: createdProduct.id,
          batch_id: createdBatch.id,
          movement_type: "initial",
          reference_type: "opening_stock",
          reference_number: batchNum,
          in_quantity: retailStock,
          balance_quantity: retailStock,
          created_by: profile.id,
        });
      }

      // 4. Save new category if needed
      if (row.category && profile.organization_id) {
        saveNewMedicineCategory(profile.organization_id, row.category).catch(() => {});
      }

      successCount++;
    } catch (err: any) {
      errors.push(`Row ${row.rawIndex} (${row.medicine}): ${err?.message || "Import failed"}`);
    }

    if (onProgress) {
      onProgress(i + 1, total);
    }
  }

  return { successCount, errors };
}

// Generate sample CSV content matching exact format requested by user
export function generateSampleCsv(): string {
  const header = "MEDICINE,GENIRIC,CATEGORY,SALE UNIT,PURCHASE UNIT,UNITS/PACK,MRP,GST,DISCOUNT %,MINIMUM STOCK,STOCK,BATCH,EXPIRY DATE";
  const samples = [
    'Paracetamol 500mg,Paracetamol,Tablet,tablet,strip,10,25.00,12,0,50,100,B-PAR01,2027-12-31',
    'Amoxicillin 500mg,Amoxicillin,Capsule,capsule,strip,10,85.50,12,5,30,50,B-AMX02,2028-06-30',
    'Cough Relief Syrup 100ml,Diphenhydramine,Syrup,bottle,bottle,1,110.00,12,10,15,25,B-CGH03,2027-10-31',
    'Betadine Ointment 20g,Povidone Iodine,Ointment,tube,tube,1,95.00,12,0,20,30,B-BET04,2028-03-31',
  ];
  return [header, ...samples].join("\n");
}

// Download sample template file directly to browser
export function downloadSampleCsvTemplate(): void {
  const content = generateSampleCsv();
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "medicine_opening_stock_template.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
