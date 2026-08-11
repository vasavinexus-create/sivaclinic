create extension if not exists pgcrypto;

create type public.app_role as enum ('admin','doctor','receptionist','pharmacist','accountant','store_manager');
create type public.stock_movement_type as enum ('opening','purchase','purchase_return','sale','sale_return','adjustment_in','adjustment_out','damaged','expired','transfer');
create type public.sale_status as enum ('completed','cancelled','returned','partially_returned');
create type public.payment_mode as enum ('cash','upi','card','credit','mixed','bank');

create table public.organizations (
  id uuid primary key default gen_random_uuid(), name text not null, clinic_name text not null,
  pharmacy_name text, address text, phone text, gst_number text, drug_license_number text,
  patient_prefix text not null default 'PAT', invoice_prefix text not null default 'MED',
  purchase_prefix text not null default 'PUR', currency text not null default 'INR',
  expiry_alert_days int not null default 90, active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade, organization_id uuid not null references public.organizations(id),
  full_name text not null, role public.app_role not null default 'receptionist', mobile text,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.patients (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  patient_no bigint generated always as identity, patient_id text not null, name text not null, mobile text not null,
  alternate_mobile text, gender text, date_of_birth date, address text not null, city text, pincode text,
  blood_group text, allergies text, medical_notes text, emergency_contact_name text, emergency_contact_mobile text,
  last_visit_at timestamptz, active boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique (organization_id, patient_id)
);

create table public.doctors (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  doctor_id text not null, profile_id uuid references public.profiles(id), name text not null, qualification text,
  specialization text, registration_number text, mobile text, email text, default_fee numeric(12,2) not null default 0,
  address text, available_days text[], available_timings jsonb, active boolean not null default true,
  created_at timestamptz not null default now(), unique (organization_id, doctor_id)
);

create table public.consultations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  patient_id uuid not null references public.patients(id), doctor_id uuid not null references public.doctors(id),
  visited_at timestamptz not null default now(), symptoms text, diagnosis text, clinical_notes text,
  vitals jsonb not null default '{}'::jsonb, prescription_notes text, follow_up_date date,
  doctor_fee numeric(12,2) not null check (doctor_fee >= 0), doctor_fee_collected boolean not null default false,
  doctor_fee_collected_bill_id uuid, created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.prescription_attachments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  patient_id uuid not null references public.patients(id), consultation_id uuid not null references public.consultations(id),
  storage_path text not null, file_name text not null, content_type text not null,
  size_bytes bigint check (size_bytes >= 0), uploaded_by uuid references public.profiles(id), created_at timestamptz not null default now(),
  unique (organization_id, storage_path)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  supplier_id text not null, name text not null, gst_number text, drug_license_details text, mobile text, email text,
  address text, contact_person text, opening_balance numeric(14,2) not null default 0, credit_period_days int not null default 0,
  active boolean not null default true, created_at timestamptz not null default now(), unique (organization_id, supplier_id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  product_id text not null, barcode text, name text not null, generic_name text, brand text, manufacturer text,
  category text, composition text, dosage_form text, strength text, pack_size text, unit text, hsn_code text,
  gst_percent numeric(5,2) not null default 0, purchase_rate numeric(12,2) not null default 0,
  selling_rate numeric(12,2) not null default 0, mrp numeric(12,2) not null default 0,
  minimum_stock numeric(12,3) not null default 0, reorder_level numeric(12,3) not null default 0,
  prescription_required boolean not null default false, active boolean not null default true, created_at timestamptz not null default now(),
  unique (organization_id, product_id), unique (organization_id, barcode)
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  purchase_no text not null, supplier_id uuid not null references public.suppliers(id), supplier_invoice_no text not null,
  invoice_date date not null, due_date date, subtotal numeric(14,2) not null, tax_total numeric(14,2) not null default 0,
  invoice_total numeric(14,2) not null, amount_paid numeric(14,2) not null default 0,
  balance_payable numeric(14,2) generated always as (invoice_total - amount_paid) stored,
  status text not null default 'completed' check (status in ('draft','completed','cancelled','returned','partially_returned')),
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
  unique (organization_id, purchase_no), unique (organization_id, supplier_id, supplier_invoice_no)
);

create table public.medicine_batches (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  product_id uuid not null references public.products(id), batch_number text not null, manufacturing_date date, expiry_date date not null,
  supplier_id uuid references public.suppliers(id), purchase_id uuid references public.purchases(id),
  quantity_received numeric(12,3) not null default 0, free_quantity numeric(12,3) not null default 0,
  current_stock numeric(12,3) not null default 0 check (current_stock >= 0), purchase_rate numeric(12,2) not null,
  mrp numeric(12,2) not null, selling_rate numeric(12,2) not null, gst_percent numeric(5,2) not null default 0,
  rack_location text, created_at timestamptz not null default now(), unique (organization_id, product_id, batch_number)
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  purchase_id uuid not null references public.purchases(id), product_id uuid not null references public.products(id),
  batch_id uuid not null references public.medicine_batches(id), quantity numeric(12,3) not null check (quantity > 0),
  free_quantity numeric(12,3) not null default 0, rate numeric(12,2) not null, gst_percent numeric(5,2) not null default 0,
  discount numeric(12,2) not null default 0, line_total numeric(14,2) not null, created_at timestamptz not null default now()
);

create table public.sales (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  invoice_no text not null, patient_id uuid references public.patients(id), consultation_id uuid references public.consultations(id),
  sold_at timestamptz not null default now(), medicine_subtotal numeric(14,2) not null default 0,
  medicine_tax numeric(14,2) not null default 0, medicine_discount numeric(14,2) not null default 0,
  pharmacy_revenue numeric(14,2) not null default 0, doctor_fee numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null, payment_mode public.payment_mode not null, status public.sale_status not null default 'completed',
  cancellation_reason text, created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
  unique (organization_id, invoice_no)
);

alter table public.consultations add constraint consultations_fee_bill_fk foreign key (doctor_fee_collected_bill_id) references public.sales(id);
create unique index one_fee_collection_per_consultation on public.sales(consultation_id) where doctor_fee > 0 and status = 'completed';

create table public.sale_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  sale_id uuid not null references public.sales(id), product_id uuid not null references public.products(id),
  batch_id uuid not null references public.medicine_batches(id), quantity numeric(12,3) not null check (quantity > 0),
  unit_rate numeric(12,2) not null, mrp numeric(12,2) not null, discount numeric(12,2) not null default 0,
  gst_percent numeric(5,2) not null default 0, line_total numeric(14,2) not null, returned_quantity numeric(12,3) not null default 0,
  check (returned_quantity between 0 and quantity)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  product_id uuid not null references public.products(id), batch_id uuid not null references public.medicine_batches(id),
  occurred_at timestamptz not null default now(), movement_type public.stock_movement_type not null,
  reference_type text not null, reference_id uuid, reference_number text, in_quantity numeric(12,3) not null default 0,
  out_quantity numeric(12,3) not null default 0, balance_quantity numeric(12,3) not null check (balance_quantity >= 0),
  created_by uuid references public.profiles(id), check ((in_quantity > 0 and out_quantity = 0) or (out_quantity > 0 and in_quantity = 0))
);

create table public.payments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  sale_id uuid references public.sales(id), patient_id uuid references public.patients(id), paid_at timestamptz not null default now(),
  amount numeric(14,2) not null check (amount > 0), mode public.payment_mode not null, reference_number text,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);

create table public.supplier_ledger (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  supplier_id uuid not null references public.suppliers(id), occurred_on date not null, particulars text not null,
  reference_type text not null, reference_id uuid, reference_number text, debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0, created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);

create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  supplier_id uuid not null references public.suppliers(id), paid_on date not null, amount numeric(14,2) not null check (amount > 0),
  payment_mode public.payment_mode not null, account_name text, reference_number text, remarks text,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);

create table public.cash_ledger (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  occurred_at timestamptz not null default now(), entry_type text not null check (entry_type in ('receipt','payment')),
  category text not null, reference_type text not null, reference_id uuid, amount numeric(14,2) not null check (amount > 0),
  payment_mode public.payment_mode not null, created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  expense_date date not null, category text not null, amount numeric(14,2) not null check (amount > 0),
  payment_mode public.payment_mode not null, description text, attachment_path text, created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.daily_closings (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  closing_date date not null, opening_cash numeric(14,2) not null, doctor_fee_cash numeric(14,2) not null default 0,
  pharmacy_cash_sales numeric(14,2) not null default 0, other_income numeric(14,2) not null default 0,
  supplier_payments numeric(14,2) not null default 0, expenses numeric(14,2) not null default 0,
  refunds numeric(14,2) not null default 0, expected_cash numeric(14,2) not null, actual_cash numeric(14,2) not null,
  difference numeric(14,2) generated always as (actual_cash - expected_cash) stored,
  closed_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), unique (organization_id, closing_date)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  user_id uuid references public.profiles(id), kind text not null, title text not null, body text,
  reference_type text, reference_id uuid, read_at timestamptz, created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key, organization_id uuid not null references public.organizations(id),
  user_id uuid references public.profiles(id), action text not null, module text not null, record_id text,
  old_value jsonb, new_value jsonb, created_at timestamptz not null default now()
);

create index patients_search_idx on public.patients (organization_id, lower(name));
create index patients_mobile_idx on public.patients (organization_id, mobile);
create index consultations_patient_date_idx on public.consultations (organization_id, patient_id, visited_at desc);
create index consultations_followup_idx on public.consultations (organization_id, follow_up_date) where follow_up_date is not null;
create index products_name_idx on public.products (organization_id, lower(name));
create index products_barcode_idx on public.products (organization_id, barcode) where barcode is not null;
create index batches_fefo_idx on public.medicine_batches (organization_id, product_id, expiry_date, current_stock) where current_stock > 0;
create index batches_expiry_idx on public.medicine_batches (organization_id, expiry_date) where current_stock > 0;
create index sales_date_idx on public.sales (organization_id, sold_at desc);
create index stock_movements_product_idx on public.stock_movements (organization_id, product_id, occurred_at desc);
create index supplier_ledger_lookup_idx on public.supplier_ledger (organization_id, supplier_id, occurred_on desc);
create index audit_log_lookup_idx on public.audit_logs (organization_id, created_at desc);

create or replace function public.current_organization_id() returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from public.profiles where id = auth.uid() and active = true
$$;
create or replace function public.current_role() returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active = true
$$;

create or replace function public.select_fefo_batch(p_product_id uuid, p_quantity numeric)
returns table(batch_id uuid, batch_number text, expiry_date date, available_stock numeric) language sql stable security invoker as $$
  select id, medicine_batches.batch_number, medicine_batches.expiry_date, current_stock
  from public.medicine_batches where organization_id = public.current_organization_id() and product_id = p_product_id
    and current_stock >= p_quantity and expiry_date >= current_date order by expiry_date asc, created_at asc limit 1
$$;

create or replace function public.collect_consultation_fee(p_consultation_id uuid, p_sale_id uuid)
returns void language plpgsql security invoker as $$
begin
  update public.consultations set doctor_fee_collected = true, doctor_fee_collected_bill_id = p_sale_id, updated_at = now()
  where id = p_consultation_id and organization_id = public.current_organization_id() and doctor_fee_collected = false;
  if not found then raise exception 'Doctor fee has already been collected or consultation is unavailable'; end if;
end $$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.doctors enable row level security;
alter table public.consultations enable row level security;
alter table public.prescription_attachments enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.purchases enable row level security;
alter table public.medicine_batches enable row level security;
alter table public.purchase_items enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.payments enable row level security;
alter table public.supplier_ledger enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.cash_ledger enable row level security;
alter table public.expenses enable row level security;
alter table public.daily_closings enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy organizations_tenant_select on public.organizations for select using (id = public.current_organization_id());
create policy profiles_tenant_select on public.profiles for select using (organization_id = public.current_organization_id());
create policy profiles_admin_write on public.profiles for all using (organization_id = public.current_organization_id() and public.current_role() = 'admin') with check (organization_id = public.current_organization_id() and public.current_role() = 'admin');

do $$ declare t text; begin
  foreach t in array array['patients','doctors','consultations','prescription_attachments','suppliers','products','purchases','medicine_batches','purchase_items','sales','sale_items','stock_movements','payments','supplier_ledger','supplier_payments','cash_ledger','expenses','daily_closings','notifications'] loop
    execute format('create policy %I on public.%I for select using (organization_id = public.current_organization_id())', t || '_tenant_select', t);
    execute format('create policy %I on public.%I for insert with check (organization_id = public.current_organization_id())', t || '_tenant_insert', t);
    execute format('create policy %I on public.%I for update using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id())', t || '_tenant_update', t);
  end loop;
end $$;
create policy audit_logs_tenant_select on public.audit_logs for select using (organization_id = public.current_organization_id() and public.current_role() = 'admin');
create policy audit_logs_tenant_insert on public.audit_logs for insert with check (organization_id = public.current_organization_id());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prescriptions','prescriptions',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy prescriptions_read on storage.objects for select to authenticated using (
  bucket_id = 'prescriptions' and (storage.foldername(name))[1] = public.current_organization_id()::text
);
create policy prescriptions_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'prescriptions' and (storage.foldername(name))[1] = public.current_organization_id()::text
);
