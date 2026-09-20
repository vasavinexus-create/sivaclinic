-- Migration: 202609200000_purchase_bill_import.sql

-- 1. Add gemini_api_key to organizations if not present
alter table public.organizations add column if not exists gemini_api_key text;

-- 2. Supplier Product Mappings Table
create table if not exists public.supplier_product_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  supplier_description text not null,
  normalized_description text not null,
  supplier_product_code text,
  supplier_manufacturer text,
  supplier_pack text,
  supplier_hsn text,
  times_used integer not null default 1,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  mapping_status text not null default 'confirmed',
  unique (organization_id, supplier_id, normalized_description)
);

-- 3. Staging Header: Purchase Imports
create table if not exists public.purchase_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid references public.suppliers(id),
  file_url text not null,
  file_name text,
  invoice_number text,
  invoice_date date,
  invoice_type text,
  payment_terms text,
  due_date date,
  subtotal numeric(14,2),
  tax_total numeric(14,2),
  invoice_total numeric(14,2),
  round_off numeric(14,2),
  gross_amount numeric(14,2),
  total_discount numeric(14,2),
  printed_grand_total numeric(14,2),
  status text not null default 'draft' check (status in ('draft','extracting','mapped','reviewed','approved','failed')),
  requires_review boolean not null default true,
  warnings jsonb not null default '[]'::jsonb,
  raw_json jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  purchase_id uuid references public.purchases(id)
);

-- 4. Staging Items: Purchase Import Items
create table if not exists public.purchase_import_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_import_id uuid not null references public.purchase_imports(id) on delete cascade,
  line_no int,
  supplier_description text not null,
  normalized_description text not null,
  product_code text,
  barcode text,
  manufacturer text,
  pack text,
  unit text,
  hsn text,
  batch_no text,
  expiry_month int,
  expiry_year int,
  expiry_date date,
  manufacturing_date date,
  quantity numeric(12,3) not null default 0,
  free_quantity numeric(12,3) not null default 0,
  rate numeric(12,2) not null default 0,
  mrp numeric(12,2) not null default 0,
  selling_rate numeric(12,2) not null default 0,
  discount_percent numeric(5,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  gst_percent numeric(5,2) not null default 0,
  cgst_percent numeric(5,2),
  cgst_amount numeric(12,2),
  sgst_percent numeric(5,2),
  sgst_amount numeric(12,2),
  igst_percent numeric(5,2),
  igst_amount numeric(12,2),
  line_total numeric(14,2) not null default 0,
  mapped_product_id uuid references public.products(id),
  mapping_source text default 'unmapped' check (mapping_source in ('saved_mapping','exact_barcode','suggested','manual','new_product','unmapped')),
  suggestion_score numeric(5,2),
  mapping_status text default 'unmapped' check (mapping_status in ('auto_mapped','suggested','manual','new_product','unmapped')),
  requires_review boolean not null default false,
  review_reason text,
  extra_fields jsonb
);

-- 5. Audit Log for Raw Extractions
create table if not exists public.purchase_invoice_extractions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_import_id uuid references public.purchase_imports(id) on delete cascade,
  raw_json jsonb not null,
  model_name text not null,
  extraction_success boolean not null default true,
  error_message text,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists spm_lookup_idx on public.supplier_product_mappings (organization_id, supplier_id, normalized_description);
create index if not exists spm_product_idx on public.supplier_product_mappings (organization_id, product_id);
create index if not exists pi_status_idx on public.purchase_imports (organization_id, status, created_at desc);
create index if not exists pii_import_idx on public.purchase_import_items (organization_id, purchase_import_id);

-- Enable RLS
alter table public.supplier_product_mappings enable row level security;
alter table public.purchase_imports enable row level security;
alter table public.purchase_import_items enable row level security;
alter table public.purchase_invoice_extractions enable row level security;

-- Create RLS Policies
create policy spm_org_policy on public.supplier_product_mappings for all using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id());
create policy pi_org_policy on public.purchase_imports for all using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id());
create policy pii_org_policy on public.purchase_import_items for all using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id());
create policy pie_org_policy on public.purchase_invoice_extractions for all using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id());
