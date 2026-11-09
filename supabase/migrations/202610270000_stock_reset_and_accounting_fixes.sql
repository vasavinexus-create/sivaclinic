-- ============================================================================
-- MASTER SUPABASE SQL UPDATE:
-- 1. Negative Stock Billing & Auto-Fill Support (drop >= 0 stock constraints)
-- 2. Pack/Unit & Sale Return Columns (stock_unit_qty, returned_quantity)
-- 3. Historical Journal Ledger Name Standardization
-- 4. Updated Bill Cancellation Trigger (syncs stock_unit_qty & allows negative stock)
-- ============================================================================

begin;

-- 1. Drop non-negative check constraints on medicine_batches and stock_movements
alter table public.medicine_batches
  drop constraint if exists medicine_batches_current_stock_check;

alter table public.stock_movements
  drop constraint if exists stock_movements_balance_quantity_check;

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'medicine_batches'
      and con.contype = 'c'
      and (
        pg_get_constraintdef(con.oid) ilike '%current_stock%>=%0%'
        or pg_get_constraintdef(con.oid) ilike '%stock_unit_qty%>=%0%'
      )
  loop
    execute format('alter table public.medicine_batches drop constraint if exists %I', r.conname);
  end loop;

  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'stock_movements'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%balance_quantity%>=%0%'
  loop
    execute format('alter table public.stock_movements drop constraint if exists %I', r.conname);
  end loop;
end $$;

-- 2. Ensure required columns exist for Pack/Unit, Sale Returns, and Stock Reset
alter table public.sale_items
  add column if not exists returned_quantity numeric(14,2) not null default 0;

alter table public.medicine_batches
  add column if not exists stock_unit_qty numeric(14,2),
  add column if not exists purchase_unit text default 'unit',
  add column if not exists sale_unit text default 'unit',
  add column if not exists units_per_purchase_unit numeric(14,2) default 1,
  add column if not exists purchase_pack_qty numeric(14,3),
  add column if not exists free_pack_qty numeric(14,3) default 0,
  add column if not exists sales_discount_percent numeric(6,2) default 0;

alter table public.purchase_items
  add column if not exists purchase_unit text default 'unit',
  add column if not exists sale_unit text default 'unit',
  add column if not exists units_per_purchase_unit numeric(14,2) default 1,
  add column if not exists purchase_pack_qty numeric(14,3),
  add column if not exists free_pack_qty numeric(14,3) default 0,
  add column if not exists stock_unit_qty numeric(14,2),
  add column if not exists purchase_rate_per_unit numeric(14,4);

-- Sync stock_unit_qty with current_stock where null or out of sync
update public.medicine_batches
set stock_unit_qty = current_stock
where stock_unit_qty is distinct from current_stock;

create index if not exists medicine_batches_negative_stock_idx
  on public.medicine_batches (organization_id, product_id, created_at asc)
  where current_stock < 0;

-- 3. Standardize historical journal_lines ledger names for accurate Financial Reports
do $$
begin
  if to_regclass('public.journal_lines') is not null then
    update public.journal_lines set ledger_name = 'Purchase' where ledger_name = 'Purchases';
    update public.journal_lines set ledger_name = 'Supplier Payable' where ledger_name = 'Accounts Payable';
    update public.journal_lines set ledger_name = 'Patient Receivable' where ledger_name = 'Accounts Receivable';
  end if;
end $$;

-- 4. Update cancel_bill_effects() so Sale & Purchase cancellations sync both
--    current_stock and stock_unit_qty and support negative stock batches.
create or replace function public.cancel_bill_effects()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_profile public.profiles%rowtype;
  v_kind text := case when tg_table_name='sales' then 'sale' else 'purchase' end;
  v_date date;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_number text;
  v_snapshot jsonb;
  v_balance numeric;
  v_cash_delta numeric := 0;
  r record;
begin
  select * into v_profile from public.profiles where id=auth.uid() and active;
  if not found or v_profile.organization_id <> old.organization_id or new.organization_id <> old.organization_id then
    raise exception 'Active clinic user required';
  end if;
  v_date := case when v_kind='sale' then ((to_jsonb(old)->>'sold_at')::timestamptz at time zone 'Asia/Kolkata')::date else (to_jsonb(old)->>'invoice_date')::date end;
  if old.status::text='cancelled' then
    if new is distinct from old then raise exception 'Cancelled bills cannot be changed'; end if;
    return new;
  end if;
  if v_profile.role::text <> 'admin' then
    if (to_jsonb(new)->>'sold_at') is distinct from (to_jsonb(old)->>'sold_at') or (to_jsonb(new)->>'invoice_date') is distinct from (to_jsonb(old)->>'invoice_date') then raise exception 'Only admin can change bill dates'; end if;
  end if;
  if new.status::text <> 'cancelled' then return new; end if;
  if v_profile.role::text <> 'admin' and v_date <> v_today then raise exception 'Only admin can delete bills from another day'; end if;
  if (to_jsonb(new)-'status'-'cancellation_reason'-'balance_payable') is distinct from (to_jsonb(old)-'status'-'cancellation_reason'-'balance_payable') then
    raise exception 'Cancel the bill separately from other edits';
  end if;
  if old.status::text not in ('completed','partially_returned','returned') then raise exception 'Only posted bills can be cancelled'; end if;
  v_number := case when v_kind='sale' then to_jsonb(old)->>'invoice_no' else to_jsonb(old)->>'purchase_no' end;
  v_snapshot := to_jsonb(old);

  if v_kind='sale' then
    v_snapshot := v_snapshot || jsonb_build_object('sale_items',coalesce((select jsonb_agg(to_jsonb(i)) from public.sale_items i where sale_id=old.id),'[]'::jsonb),
      'payments',coalesce((select jsonb_agg(to_jsonb(p)) from public.payments p where sale_id=old.id),'[]'::jsonb));
    insert into public.deleted_sales_audit(organization_id,sale_id,invoice_no,bill_date,deleted_reason,bill_snapshot,deleted_by)
      values(old.organization_id,old.id,v_number,old.sold_at,new.cancellation_reason,v_snapshot,auth.uid());

    for r in select batch_id,product_id,sum(quantity - coalesce(returned_quantity, 0)) qty from public.sale_items
      where sale_id=old.id and organization_id=old.organization_id group by batch_id,product_id order by batch_id
    loop
      if r.qty <= 0 then continue; end if;
      update public.medicine_batches
        set current_stock = current_stock + r.qty,
            stock_unit_qty = current_stock + r.qty
        where id=r.batch_id and organization_id=old.organization_id returning current_stock into v_balance;
      if not found then raise exception 'Bill stock batch is missing'; end if;
      insert into public.stock_movements(organization_id,product_id,batch_id,movement_type,reference_type,reference_id,reference_number,in_quantity,balance_quantity,created_by)
        values(old.organization_id,r.product_id,r.batch_id,'adjustment_in','sale_delete',old.id,v_number,r.qty,v_balance,auth.uid());
    end loop;

    for r in select mode,sum(amount) amount from public.payments where sale_id=old.id and organization_id=old.organization_id group by mode
    loop
      insert into public.cash_ledger(organization_id,entry_type,category,reference_type,reference_id,amount,payment_mode,created_by)
        values(old.organization_id,'payment','Cancelled bill '||v_number,'sale_delete',old.id,r.amount,r.mode,auth.uid());
      if r.mode='cash' then v_cash_delta := v_cash_delta-r.amount; end if;
    end loop;
    update public.consultations set doctor_fee_collected=false,doctor_fee_collected_bill_id=null,updated_at=now()
      where organization_id=old.organization_id and doctor_fee_collected_bill_id=old.id;
    if to_regclass('public.patient_ledger') is not null then
      execute 'insert into public.patient_ledger(organization_id,patient_id,occurred_on,particulars,reference_type,reference_id,reference_number,debit,credit,created_by)
        select organization_id,patient_id,$3,''Cancelled bill ''||$4,''sale_delete'',$2,$4,credit,debit,$5
        from public.patient_ledger where organization_id=$1 and reference_id=$2 and reference_type in (''inpatient_bill'',''sale'',''sale_return'')'
        using old.organization_id,old.id,v_today,v_number,auth.uid();
    end if;
  else
    v_snapshot := v_snapshot || jsonb_build_object('purchase_items',coalesce((select jsonb_agg(to_jsonb(i)) from public.purchase_items i where purchase_id=old.id),'[]'::jsonb));
    insert into public.deleted_purchases_audit(organization_id,purchase_id,purchase_no,supplier_invoice_no,bill_date,deleted_reason,bill_snapshot,deleted_by)
      values(old.organization_id,old.id,v_number,old.supplier_invoice_no,old.invoice_date,new.cancellation_reason,v_snapshot,auth.uid());
    for r in select i.batch_id,i.product_id,sum(coalesce(i.stock_unit_qty, i.quantity + i.free_quantity)) - coalesce((select sum(m.out_quantity-m.in_quantity) from public.stock_movements m
        where m.organization_id=old.organization_id and m.batch_id=i.batch_id and m.reference_id=old.id and m.movement_type='purchase_return'),0) qty
      from public.purchase_items i where i.purchase_id=old.id and i.organization_id=old.organization_id group by i.batch_id,i.product_id order by i.batch_id
    loop
      if r.qty <= 0 then continue; end if;
      update public.medicine_batches
        set current_stock = current_stock - r.qty,
            stock_unit_qty = current_stock - r.qty
        where id=r.batch_id and organization_id=old.organization_id returning current_stock into v_balance;
      if not found then raise exception 'Bill stock batch is missing'; end if;
      insert into public.stock_movements(organization_id,product_id,batch_id,movement_type,reference_type,reference_id,reference_number,out_quantity,balance_quantity,created_by)
        values(old.organization_id,r.product_id,r.batch_id,'adjustment_out','purchase_delete',old.id,v_number,r.qty,v_balance,auth.uid());
    end loop;
    insert into public.supplier_ledger(organization_id,supplier_id,occurred_on,particulars,reference_type,reference_id,reference_number,debit,credit,created_by)
      select organization_id,supplier_id,v_today,'Cancelled purchase '||v_number,'purchase_delete',old.id,v_number,credit,debit,auth.uid()
      from public.supplier_ledger where organization_id=old.organization_id and reference_id=old.id and reference_type in ('purchase','purchase_return');
  end if;

  for r in select entry_type,payment_mode,sum(amount) amount from public.cash_ledger
    where organization_id=old.organization_id and reference_id=old.id
      and reference_type=any(case when v_kind='sale' then array['sale','inpatient_bill','sale_return'] else array['purchase','purchase_return'] end)
    group by entry_type,payment_mode
  loop
    if v_kind='sale' and r.entry_type='receipt' and r.amount=(select coalesce(sum(amount),0) from public.payments
      where organization_id=old.organization_id and sale_id=old.id and mode=r.payment_mode) then
      continue;
    end if;
    insert into public.cash_ledger(organization_id,entry_type,category,reference_type,reference_id,amount,payment_mode,created_by)
      values(old.organization_id,case when r.entry_type='receipt' then 'payment' else 'receipt' end,'Cancelled bill '||v_number,v_kind||'_delete',old.id,r.amount,r.payment_mode,auth.uid());
    if r.payment_mode='cash' then v_cash_delta := v_cash_delta + case when r.entry_type='receipt' then -r.amount else r.amount end; end if;
  end loop;
  perform public.reverse_bill_journals(old.organization_id,old.id,v_kind,v_number);
  if v_cash_delta <> 0 then
    update public.daily_closings set refunds=refunds+greatest(-v_cash_delta,0),other_income=other_income+greatest(v_cash_delta,0),expected_cash=expected_cash+v_cash_delta
      where organization_id=old.organization_id and closing_date=v_today;
  end if;
  return new;
end $$;

commit;

select pg_notify('pgrst', 'reload schema');
