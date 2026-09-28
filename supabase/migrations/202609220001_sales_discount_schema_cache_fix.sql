do $$
begin
  if to_regclass('public.organizations') is not null then
    alter table public.organizations
      add column if not exists sales_discount_percent numeric(5,2) not null default 0;

    alter table public.organizations
      drop constraint if exists organizations_sales_discount_percent_range;

    alter table public.organizations
      add constraint organizations_sales_discount_percent_range
      check (sales_discount_percent >= 0 and sales_discount_percent <= 100);
  end if;

  if to_regclass('public.medicine_batches') is not null then
    alter table public.medicine_batches
      add column if not exists sales_discount_percent numeric(5,2);

    alter table public.medicine_batches
      drop constraint if exists medicine_batches_sales_discount_percent_range;

    alter table public.medicine_batches
      add constraint medicine_batches_sales_discount_percent_range
      check (sales_discount_percent is null or (sales_discount_percent >= 0 and sales_discount_percent <= 100));
  end if;

  if to_regclass('public.sale_items') is not null then
    alter table public.sale_items
      add column if not exists original_unit_rate numeric(12,2),
      add column if not exists rate_edited boolean not null default false,
      add column if not exists original_sales_discount_percent numeric(5,2),
      add column if not exists sales_discount_percent numeric(5,2),
      add column if not exists mrp_unit_rate numeric(12,2);
  end if;

  if to_regclass('public.sales') is not null then
    alter table public.sales
      add column if not exists gross_total numeric(12,2) not null default 0,
      add column if not exists special_discount_percent numeric(5,2) not null default 0,
      add column if not exists special_discount_amount numeric(12,2) not null default 0,
      add column if not exists has_rate_edit boolean not null default false,
      add column if not exists rate_edit_verified boolean not null default true,
      add column if not exists rate_edit_verified_by uuid references public.profiles(id),
      add column if not exists rate_edit_verified_at timestamptz;

    alter table public.sales
      drop constraint if exists sales_special_discount_percent_range;

    alter table public.sales
      add constraint sales_special_discount_percent_range
      check (special_discount_percent >= 0 and special_discount_percent <= 100);
  end if;
end $$;

notify pgrst, 'reload schema';
