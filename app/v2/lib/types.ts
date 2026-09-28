// ─── Generic fallback (for legacy/gradually-typed code) ──────────────────
export type Row = Record<string, any>;

// ─── Auth & Access ────────────────────────────────────────────────────────
export type Profile = {
  id: string;
  organization_id: string;
  full_name: string;
  role: string;
  active: boolean;
};

export type Organization = {
  id: string;
  clinic_name: string | null;
  pharmacy_name: string | null;
  phone?: string | null;
  address?: string | null;
  gst_number?: string | null;
  drug_license_number?: string | null;
  sales_gst_mode?: string | null;
  sales_discount_percent?: number | null;
  gemini_api_key?: string | null;
  groq_api_key?: string | null;
  gemini_model?: string | null;
};

// ─── Clinical ─────────────────────────────────────────────────────────────
export interface Patient {
  id: string;
  patient_id: string;
  name: string;
  age: number | null;
  gender: string | null;
  mobile: string | null;
  address: string | null;
  blood_group: string | null;
  allergies: string | null;
  organization_id: string;
  last_visit_at: string | null;
  created_at: string;
}

export interface Doctor {
  id: string;
  doctor_id: string;
  name: string;
  qualification: string | null;
  specialization: string | null;
  registration_number: string | null;
  mobile: string | null;
  email: string | null;
  default_fee: number;
  active: boolean;
  organization_id: string;
  created_at: string;
}

export interface Consultation {
  id: string;
  patient_id: string;
  doctor_id: string | null;
  visited_at: string;
  symptoms: string | null;
  diagnosis: string | null;
  clinical_notes: string | null;
  prescription_notes: string | null;
  follow_up_date: string | null;
  doctor_fee: number;
  doctor_fee_collected: boolean;
  organization_id: string;
  created_at: string;
  patient?: Pick<Patient, "patient_id" | "name" | "mobile">;
  doctor?: Pick<Doctor, "doctor_id" | "name" | "mobile" | "specialization">;
}

// ─── Pharmacy / Inventory ─────────────────────────────────────────────────
export interface Product {
  id: string;
  product_id: string;
  name: string;
  barcode: string | null;
  generic_name: string | null;
  category: string | null;
  sale_unit: string;
  purchase_unit: string;
  default_units_per_purchase_unit: number;
  selling_rate: number;
  mrp: number;
  minimum_stock: number | null;
  active: boolean;
  organization_id: string;
  created_at: string;
}

export interface MedicineBatch {
  id: string;
  product_id: string;
  batch_number: string;
  expiry_date: string;
  quantity_received: number;
  current_stock: number;
  purchase_rate: number;
  mrp: number;
  selling_rate: number;
  gst_percent: number;
  rack_location: string | null;
  organization_id: string;
  created_at: string;
  product?: Pick<Product, "name" | "product_id">;
}

// ─── Sales ────────────────────────────────────────────────────────────────
export interface Sale {
  id: string;
  invoice_no: string;
  patient_id: string | null;
  sold_at: string;
  medicine_subtotal: number;
  medicine_tax: number;
  pharmacy_revenue: number;
  doctor_fee: number;
  grand_total: number;
  payment_mode: string;
  status: "completed" | "cancelled";
  rate_edit_verified: boolean | null;
  rate_edit_verified_at: string | null;
  organization_id: string;
  created_at: string;
  patient?: Pick<Patient, "patient_id" | "name" | "mobile">;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  batch_id: string;
  quantity: number;
  sale_rate: number;
  gst_percent: number;
  line_total: number;
  product?: Pick<Product, "product_id" | "name">;
}

// ─── Purchases ────────────────────────────────────────────────────────────
export interface Supplier {
  id: string;
  supplier_id: string;
  name: string;
  mobile: string | null;
  gst_number: string | null;
  drug_license_details: string | null;
  email: string | null;
  address: string | null;
  credit_period_days: number | null;
  organization_id: string;
  created_at: string;
}

export interface Purchase {
  id: string;
  purchase_no: string;
  supplier_id: string | null;
  supplier_invoice_no: string | null;
  invoice_date: string;
  invoice_total: number;
  amount_paid: number;
  balance_payable: number;
  status: "pending" | "completed" | "cancelled";
  organization_id: string;
  created_at: string;
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string;
  batch_number: string;
  expiry_date: string;
  purchase_pack_qty: number;
  free_pack_qty: number;
  units_per_purchase_unit: number;
  stock_unit_qty: number;
  purchase_rate: number;
  purchase_rate_per_unit: number;
  mrp: number;
  selling_rate: number;
  gst_percent: number;
  line_total: number;
}

// ─── Payments ─────────────────────────────────────────────────────────────
export interface SupplierPayment {
  id: string;
  supplier_id: string;
  paid_on: string;
  amount: number;
  payment_mode: string;
  reference_number: string | null;
  remarks: string | null;
  organization_id: string;
  created_at: string;
}

export interface SupplierLedgerEntry {
  id: string;
  supplier_id: string;
  occurred_on: string;
  particulars: string;
  reference_type: string | null;
  reference_number: string | null;
  debit: number;
  credit: number;
  organization_id: string;
  created_at: string;
}

export interface PatientLedgerEntry {
  id: string;
  patient_id: string;
  occurred_on: string;
  particulars: string;
  reference_type: string | null;
  reference_number: string | null;
  debit: number;
  credit: number;
  organization_id: string;
  created_at: string;
}

// ─── Accounting ───────────────────────────────────────────────────────────
export interface Expense {
  id: string;
  expense_date: string;
  category: string;
  amount: number;
  payment_mode: string;
  description: string | null;
  organization_id: string;
  created_at: string;
}

export interface JournalEntry {
  id: string;
  voucher_no: string;
  voucher_type: string;
  entry_date: string;
  narration: string;
  reference_type: string | null;
  reference_id: string | null;
  reference_number: string | null;
  organization_id: string;
  created_at: string;
}

export interface JournalLine {
  id: string;
  journal_entry_id: string;
  account_ledger_id: string | null;
  ledger_name: string;
  debit: number;
  credit: number;
  line_order: number;
}

export interface AccountLedger {
  id: string;
  name: string;
  opening_balance: number;
  opening_type: "debit" | "credit";
  active: boolean;
  organization_id: string;
  created_at: string;
}

export interface LedgerGroup {
  id: string;
  name: string;
  group_type: "asset" | "liability" | "income" | "expense" | "equity";
  organization_id: string;
  created_at: string;
}

export interface CashLedgerEntry {
  id: string;
  occurred_at: string;
  entry_type: string;
  category: string;
  reference_type: string | null;
  amount: number;
  payment_mode: string;
  organization_id: string;
  created_at: string;
}

// ─── Audit ────────────────────────────────────────────────────────────────
export interface DeletedSalesAudit {
  id: string;
  invoice_no: string;
  deleted_at: string;
  deleted_by_name: string | null;
  reason: string | null;
  grand_total: number;
  organization_id: string;
  created_at: string;
}

// ─── Module config ─────────────────────────────────────────────────────────
export type FieldConfig = {
  key: string;
  label: string;
  type?: "text" | "number" | "email" | "date" | "select";
  required?: boolean;
  options?: string[];
  defaultValue?: string | number;
  readonlyOnCreate?: boolean;
};

export type ListFilter = {
  key: string;
  label: string;
  type: "select";
  options: Array<{ label: string; value: string }>;
};

export type ModuleConfig = {
  key: string;
  navLabel: string;
  title: string;
  subtitle: string;
  table: string;
  select: string;
  idPrefix?: string;
  orderBy: string;
  ascending?: boolean;
  searchColumns: string[];
  columns: Array<[string, string]>;
  fields: FieldConfig[];
  filters?: ListFilter[];
  editable?: boolean;
  organizationColumn?: string | null;
};
