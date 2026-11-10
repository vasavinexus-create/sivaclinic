-- Create medicine_categories table to support selectable and persistent medicine categories
create table if not exists public.medicine_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

-- Enable Row Level Security
alter table public.medicine_categories enable row level security;

-- Policies for organization users
do $$
begin
  if to_regprocedure('public.current_organization_id()') is not null then
    drop policy if exists medicine_categories_select on public.medicine_categories;
    create policy medicine_categories_select on public.medicine_categories
      for select using (organization_id = public.current_organization_id());

    drop policy if exists medicine_categories_insert on public.medicine_categories;
    create policy medicine_categories_insert on public.medicine_categories
      for insert with check (organization_id = public.current_organization_id());

    drop policy if exists medicine_categories_update on public.medicine_categories;
    create policy medicine_categories_update on public.medicine_categories
      for update using (organization_id = public.current_organization_id());
  end if;
end $$;

-- Pre-populate medicine_categories with distinct categories already present in products
insert into public.medicine_categories (organization_id, name)
select distinct organization_id, btrim(category)
from public.products
where category is not null and btrim(category) <> ''
on conflict (organization_id, name) do nothing;
