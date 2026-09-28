import { column, Schema, Table } from '@powersync/web';

export const patients = new Table({
  organization_id: column.text,
  patient_id: column.text,
  name: column.text,
  age: column.integer,
  gender: column.text,
  mobile: column.text,
  address: column.text,
  blood_group: column.text,
  allergies: column.text,
  last_visit_at: column.text,
  created_at: column.text,
  updated_at: column.text,
});

export const products = new Table({
  organization_id: column.text,
  product_id: column.text,
  name: column.text,
  barcode: column.text,
  generic_name: column.text,
  category: column.text,
  sale_unit: column.text,
  purchase_unit: column.text,
  default_units_per_purchase_unit: column.integer,
  selling_rate: column.real,
  mrp: column.real,
  minimum_stock: column.integer,
  created_at: column.text,
});

export const sales = new Table({
  organization_id: column.text,
  patient_id: column.text,
  doctor_id: column.text,
  status: column.text,
  pharmacy_revenue: column.real,
  doctor_fee: column.real,
  grand_total: column.real,
  payment_mode: column.text,
  sold_at: column.text,
  created_by: column.text,
});

export const AppSchema = new Schema({
  patients,
  products,
  sales
});
