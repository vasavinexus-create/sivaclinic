create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  voucher_no text not null,
  voucher_type text not null,
  entry_date date not null,
  narration text,
  reference_type text,
  reference_id uuid,
  reference_number text,
  status text not null default 'posted' check (status in ('posted','reversed','cancelled')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (organization_id, voucher_no)
);

create table if not exists public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_ledger_id uuid references public.account_ledgers(id),
  ledger_name text not null,
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  line_order integer not null default 0,
  created_at timestamptz not null default now(),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create index if not exists journal_entries_org_date_idx on public.journal_entries (organization_id, entry_date desc, voucher_type);
create index if not exists journal_lines_org_ledger_idx on public.journal_lines (organization_id, ledger_name);
create index if not exists journal_lines_account_ledger_idx on public.journal_lines (organization_id, account_ledger_id);

alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;

create policy journal_entries_tenant_select on public.journal_entries for select using (organization_id = public.current_organization_id());
create policy journal_entries_tenant_insert on public.journal_entries for insert with check (organization_id = public.current_organization_id());
create policy journal_entries_tenant_update on public.journal_entries for update using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id());

create policy journal_lines_tenant_select on public.journal_lines for select using (organization_id = public.current_organization_id());
create policy journal_lines_tenant_insert on public.journal_lines for insert with check (organization_id = public.current_organization_id());
create policy journal_lines_tenant_update on public.journal_lines for update using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id());
