create table if not exists public.ledger_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  group_type text not null check (group_type in ('asset','liability','income','expense','equity')),
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.account_ledgers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  ledger_group_id uuid not null references public.ledger_groups(id),
  name text not null,
  opening_balance numeric(14,2) not null default 0,
  opening_type text not null default 'debit' check (opening_type in ('debit','credit')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

alter table public.ledger_groups enable row level security;
alter table public.account_ledgers enable row level security;

create policy ledger_groups_tenant_select on public.ledger_groups for select using (organization_id = public.current_organization_id());
create policy ledger_groups_tenant_insert on public.ledger_groups for insert with check (organization_id = public.current_organization_id());
create policy ledger_groups_tenant_update on public.ledger_groups for update using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id());

create policy account_ledgers_tenant_select on public.account_ledgers for select using (organization_id = public.current_organization_id());
create policy account_ledgers_tenant_insert on public.account_ledgers for insert with check (organization_id = public.current_organization_id());
create policy account_ledgers_tenant_update on public.account_ledgers for update using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id());
