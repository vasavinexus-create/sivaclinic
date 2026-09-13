create table if not exists public.deleted_sales_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  sale_id uuid not null references public.sales(id),
  invoice_no text not null,
  bill_date timestamptz not null,
  deleted_reason text,
  bill_snapshot jsonb not null,
  deleted_by uuid references public.profiles(id),
  deleted_at timestamptz not null default now(),
  audited boolean not null default false,
  audited_by uuid references public.profiles(id),
  audited_at timestamptz
);

create table if not exists public.deleted_purchases_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  purchase_id uuid not null references public.purchases(id),
  purchase_no text not null,
  supplier_invoice_no text not null,
  bill_date date not null,
  deleted_reason text,
  bill_snapshot jsonb not null,
  deleted_by uuid references public.profiles(id),
  deleted_at timestamptz not null default now(),
  audited boolean not null default false,
  audited_by uuid references public.profiles(id),
  audited_at timestamptz
);

create index if not exists deleted_sales_audit_org_date_idx on public.deleted_sales_audit (organization_id, deleted_at desc);
create index if not exists deleted_purchases_audit_org_date_idx on public.deleted_purchases_audit (organization_id, deleted_at desc);

alter table public.deleted_sales_audit enable row level security;
alter table public.deleted_purchases_audit enable row level security;

create policy deleted_sales_audit_tenant_select on public.deleted_sales_audit for select using (organization_id = public.current_organization_id());
create policy deleted_sales_audit_tenant_insert on public.deleted_sales_audit for insert with check (organization_id = public.current_organization_id());
create policy deleted_sales_audit_tenant_update on public.deleted_sales_audit for update using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id());

create policy deleted_purchases_audit_tenant_select on public.deleted_purchases_audit for select using (organization_id = public.current_organization_id());
create policy deleted_purchases_audit_tenant_insert on public.deleted_purchases_audit for insert with check (organization_id = public.current_organization_id());
create policy deleted_purchases_audit_tenant_update on public.deleted_purchases_audit for update using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id());
