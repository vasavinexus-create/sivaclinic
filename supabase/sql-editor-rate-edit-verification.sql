-- SivaCare edited-rate sale verification.
-- Run this in Supabase SQL Editor before using Rate Edit Verification page.

alter table public.sales
  add column if not exists has_rate_edit boolean not null default false,
  add column if not exists rate_edit_verified boolean not null default false,
  add column if not exists rate_edit_verified_by uuid references public.profiles(id),
  add column if not exists rate_edit_verified_at timestamptz;

alter table public.sale_items
  add column if not exists original_unit_rate numeric(12,2),
  add column if not exists rate_edited boolean not null default false;

create index if not exists sales_rate_edit_verify_idx
  on public.sales (organization_id, has_rate_edit, rate_edit_verified, sold_at desc);

select pg_notify('pgrst', 'reload schema');
