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

    if to_regprocedure('public.current_organization_id()') is not null
       and to_regprocedure('public.current_role()') is not null
       and exists (select 1 from pg_type where typname = 'app_role' and typnamespace = 'public'::regnamespace) then
      drop policy if exists organizations_admin_update_own on public.organizations;
      create policy organizations_admin_update_own on public.organizations
        for update
        using (
          id = public.current_organization_id()
          and public.current_role() = 'admin'::public.app_role
        )
        with check (
          id = public.current_organization_id()
          and public.current_role() = 'admin'::public.app_role
        );
    end if;
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
      add column if not exists original_sales_discount_percent numeric(5,2),
      add column if not exists sales_discount_percent numeric(5,2),
      add column if not exists mrp_unit_rate numeric(12,2);
  end if;

  if to_regclass('public.sales') is not null then
    alter table public.sales
      add column if not exists gross_total numeric(12,2) not null default 0,
      add column if not exists special_discount_percent numeric(5,2) not null default 0,
      add column if not exists special_discount_amount numeric(12,2) not null default 0;

    alter table public.sales
      drop constraint if exists sales_special_discount_percent_range;

    alter table public.sales
      add constraint sales_special_discount_percent_range
      check (special_discount_percent >= 0 and special_discount_percent <= 100);
  end if;
end $$;
