-- SivaCare inpatient billing and patient ledger upgrade.
-- Run this directly in Supabase SQL Editor.

alter table public.sales
  add column if not exists sale_type text not null default 'outpatient'
  check (sale_type in ('outpatient','inpatient'));

create index if not exists sales_org_type_date_idx
  on public.sales (organization_id, sale_type, sold_at desc);

create table if not exists public.patient_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  occurred_on date not null default current_date,
  particulars text not null,
  reference_type text not null,
  reference_id uuid,
  reference_number text,
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (debit >= 0 and credit >= 0),
  check (debit > 0 or credit > 0)
);

create index if not exists patient_ledger_patient_date_idx
  on public.patient_ledger (organization_id, patient_id, occurred_on desc, created_at desc);

alter table public.patient_ledger enable row level security;

drop policy if exists patient_ledger_tenant_select on public.patient_ledger;
create policy patient_ledger_tenant_select on public.patient_ledger
for select using (organization_id = public.current_organization_id());

drop policy if exists patient_ledger_tenant_insert on public.patient_ledger;
create policy patient_ledger_tenant_insert on public.patient_ledger
for insert with check (organization_id = public.current_organization_id());

drop policy if exists patient_ledger_tenant_update on public.patient_ledger;
create policy patient_ledger_tenant_update on public.patient_ledger
for update using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

insert into public.ledger_groups (organization_id, name, group_type)
select id, 'Patient Receivables', 'asset'
from public.organizations
on conflict (organization_id, name) do nothing;

insert into public.account_ledgers (organization_id, ledger_group_id, name, opening_balance, opening_type, active)
select o.id, lg.id, 'Patient Receivable', 0, 'debit', true
from public.organizations o
join public.ledger_groups lg on lg.organization_id = o.id and lg.name = 'Patient Receivables'
on conflict (organization_id, name) do nothing;
