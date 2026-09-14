-- Siva Clinic pack/unit conversion upgrade.
-- Run this directly in Supabase SQL Editor before using pack-aware purchases.

alter table public.products
  add column if not exists sale_unit text not null default 'unit',
  add column if not exists purchase_unit text not null default 'unit',
  add column if not exists default_units_per_purchase_unit numeric(12,3) not null default 1;

alter table public.medicine_batches
  add column if not exists sale_unit text not null default 'unit',
  add column if not exists purchase_unit text not null default 'unit',
  add column if not exists units_per_purchase_unit numeric(12,3) not null default 1,
  add column if not exists purchase_pack_qty numeric(12,3) not null default 0,
  add column if not exists free_pack_qty numeric(12,3) not null default 0,
  add column if not exists stock_unit_qty numeric(12,3);

alter table public.purchase_items
  add column if not exists sale_unit text not null default 'unit',
  add column if not exists purchase_unit text not null default 'unit',
  add column if not exists units_per_purchase_unit numeric(12,3) not null default 1,
  add column if not exists purchase_pack_qty numeric(12,3) not null default 0,
  add column if not exists free_pack_qty numeric(12,3) not null default 0,
  add column if not exists stock_unit_qty numeric(12,3),
  add column if not exists purchase_rate_per_unit numeric(12,4);

update public.products
set
  sale_unit = coalesce(nullif(sale_unit, ''), 'unit'),
  purchase_unit = coalesce(nullif(purchase_unit, ''), 'unit'),
  default_units_per_purchase_unit = greatest(coalesce(default_units_per_purchase_unit, 1), 1);

update public.medicine_batches
set
  sale_unit = coalesce(nullif(sale_unit, ''), 'unit'),
  purchase_unit = coalesce(nullif(purchase_unit, ''), 'unit'),
  units_per_purchase_unit = greatest(coalesce(units_per_purchase_unit, 1), 1),
  purchase_pack_qty = case when coalesce(purchase_pack_qty, 0) = 0 then coalesce(quantity_received, 0) else purchase_pack_qty end,
  stock_unit_qty = coalesce(stock_unit_qty, current_stock);

update public.purchase_items
set
  sale_unit = coalesce(nullif(sale_unit, ''), 'unit'),
  purchase_unit = coalesce(nullif(purchase_unit, ''), 'unit'),
  units_per_purchase_unit = greatest(coalesce(units_per_purchase_unit, 1), 1),
  purchase_pack_qty = case when coalesce(purchase_pack_qty, 0) = 0 then coalesce(quantity, 0) else purchase_pack_qty end,
  stock_unit_qty = coalesce(stock_unit_qty, coalesce(quantity, 0) + coalesce(free_quantity, 0)),
  purchase_rate_per_unit = coalesce(purchase_rate_per_unit, rate);

create index if not exists medicine_batches_product_expiry_stock_idx
  on public.medicine_batches (product_id, expiry_date, created_at)
  where current_stock > 0;

select pg_notify('pgrst', 'reload schema');
