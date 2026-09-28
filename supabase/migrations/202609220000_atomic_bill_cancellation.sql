-- Cancel bills atomically; preserve originals and post explicit reversals.
begin;

alter table public.purchases add column if not exists cancellation_reason text;
alter table public.journal_entries add column if not exists reverses_entry_id uuid references public.journal_entries(id);
create unique index if not exists journal_one_reversal on public.journal_entries(reverses_entry_id) where reverses_entry_id is not null;
create index if not exists pending_deleted_sales on public.deleted_sales_audit(organization_id, deleted_at desc) where not audited;
create index if not exists pending_deleted_purchases on public.deleted_purchases_audit(organization_id, deleted_at desc) where not audited;

create or replace function public.reverse_bill_journals(p_org uuid, p_bill uuid, p_kind text, p_number text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare j record; v_id uuid;
begin
  for j in select * from public.journal_entries
    where organization_id=p_org and reference_id=p_bill and status='posted'
      and reference_type=any(case when p_kind='sale' then array['sale','inpatient_bill','sale_return'] else array['purchase','purchase_return'] end)
      and reverses_entry_id is null order by id for update
  loop
    if exists(select 1 from public.journal_entries where reverses_entry_id=j.id) then continue; end if;
    if (select coalesce(sum(debit-credit),0) from public.journal_lines where journal_entry_id=j.id) <> 0 then
      raise exception 'Bill journal % is unbalanced. Correct it before cancellation.', j.voucher_no;
    end if;
    insert into public.journal_entries(organization_id,voucher_no,voucher_type,entry_date,narration,reference_type,reference_id,reference_number,created_by,reverses_entry_id)
      values(p_org,'REV-'||gen_random_uuid(),p_kind||'_cancel',(now() at time zone 'Asia/Kolkata')::date,
        'Cancellation of '||p_number,p_kind||'_delete',p_bill,p_number,auth.uid(),j.id) returning id into v_id;
    insert into public.journal_lines(organization_id,journal_entry_id,account_ledger_id,ledger_name,debit,credit,line_order)
      select organization_id,v_id,account_ledger_id,ledger_name,credit,debit,line_order from public.journal_lines where journal_entry_id=j.id;
  end loop;
end $$;
revoke all on function public.reverse_bill_journals(uuid,uuid,text,text) from public, anon, authenticated;

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
  -- Stored generated columns are not calculated yet in a BEFORE trigger.
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
    -- Group repeated batch rows and lock in a stable order. Returned units are already back in stock.
    for r in select batch_id,product_id,sum(quantity-returned_quantity) qty from public.sale_items
      where sale_id=old.id and organization_id=old.organization_id group by batch_id,product_id order by batch_id
    loop
      if r.qty <= 0 then continue; end if;
      update public.medicine_batches set current_stock=current_stock+r.qty
        where id=r.batch_id and organization_id=old.organization_id returning current_stock into v_balance;
      if not found then raise exception 'Bill stock batch is missing'; end if;
      insert into public.stock_movements(organization_id,product_id,batch_id,movement_type,reference_type,reference_id,reference_number,in_quantity,balance_quantity,created_by)
        values(old.organization_id,r.product_id,r.batch_id,'adjustment_in','sale_delete',old.id,v_number,r.qty,v_balance,auth.uid());
    end loop;
    -- Preserve receipts for history and offset only actual bill-linked collections.
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
        from public.patient_ledger where organization_id=$1 and reference_id=$2 and reference_type in (''inpatient_bill'',''sale'')'
        using old.organization_id,old.id,v_today,v_number,auth.uid();
    end if;
  else
    v_snapshot := v_snapshot || jsonb_build_object('purchase_items',coalesce((select jsonb_agg(to_jsonb(i)) from public.purchase_items i where purchase_id=old.id),'[]'::jsonb));
    insert into public.deleted_purchases_audit(organization_id,purchase_id,purchase_no,supplier_invoice_no,bill_date,deleted_reason,bill_snapshot,deleted_by)
      values(old.organization_id,old.id,v_number,old.supplier_invoice_no,old.invoice_date,new.cancellation_reason,v_snapshot,auth.uid());
    for r in select i.batch_id,i.product_id,sum(i.quantity+i.free_quantity) - coalesce((select sum(m.out_quantity-m.in_quantity) from public.stock_movements m
        where m.organization_id=old.organization_id and m.batch_id=i.batch_id and m.reference_id=old.id and m.movement_type='purchase_return'),0) qty
      from public.purchase_items i where i.purchase_id=old.id and i.organization_id=old.organization_id group by i.batch_id,i.product_id order by i.batch_id
    loop
      if r.qty <= 0 then continue; end if;
      update public.medicine_batches set current_stock=current_stock-r.qty
        where id=r.batch_id and organization_id=old.organization_id and current_stock>=r.qty returning current_stock into v_balance;
      if not found then raise exception 'Cannot delete purchase: received stock has already been sold or used'; end if;
      insert into public.stock_movements(organization_id,product_id,batch_id,movement_type,reference_type,reference_id,reference_number,out_quantity,balance_quantity,created_by)
        values(old.organization_id,r.product_id,r.batch_id,'adjustment_out','purchase_delete',old.id,v_number,r.qty,v_balance,auth.uid());
    end loop;
    insert into public.supplier_ledger(organization_id,supplier_id,occurred_on,particulars,reference_type,reference_id,reference_number,debit,credit,created_by)
      select organization_id,supplier_id,v_today,'Cancelled purchase '||v_number,'purchase_delete',old.id,v_number,credit,debit,auth.uid()
      from public.supplier_ledger where organization_id=old.organization_id and reference_id=old.id and reference_type in ('purchase','purchase_return');
  end if;

  -- Offset existing cash-book postings, including returns. Never touch unrelated patient/supplier payments.
  for r in select entry_type,payment_mode,sum(amount) amount from public.cash_ledger
    where organization_id=old.organization_id and reference_id=old.id
      and reference_type=any(case when v_kind='sale' then array['sale','inpatient_bill','sale_return'] else array['purchase','purchase_return'] end)
    group by entry_type,payment_mode
  loop
    if v_kind='sale' and r.entry_type='receipt' and r.amount=(select coalesce(sum(amount),0) from public.payments
      where organization_id=old.organization_id and sale_id=old.id and mode=r.payment_mode) then
      continue; -- This collection was already reversed from its payment record.
    end if;
    insert into public.cash_ledger(organization_id,entry_type,category,reference_type,reference_id,amount,payment_mode,created_by)
      values(old.organization_id,case when r.entry_type='receipt' then 'payment' else 'receipt' end,'Cancelled bill '||v_number,v_kind||'_delete',old.id,r.amount,r.payment_mode,auth.uid());
    if r.payment_mode='cash' then v_cash_delta := v_cash_delta + case when r.entry_type='receipt' then -r.amount else r.amount end; end if;
  end loop;
  perform public.reverse_bill_journals(old.organization_id,old.id,v_kind,v_number);
  -- A cancellation changes today's cash; retain actual counted cash and historical closings.
  if v_cash_delta <> 0 then
    update public.daily_closings set refunds=refunds+greatest(-v_cash_delta,0),other_income=other_income+greatest(v_cash_delta,0),expected_cash=expected_cash+v_cash_delta
      where organization_id=old.organization_id and closing_date=v_today;
  end if;
  return new;
end $$;
revoke all on function public.cancel_bill_effects() from public, anon, authenticated;
drop trigger if exists cancel_sale_effects on public.sales;
create trigger cancel_sale_effects before update on public.sales for each row execute function public.cancel_bill_effects();
drop trigger if exists cancel_purchase_effects on public.purchases;
create trigger cancel_purchase_effects before update on public.purchases for each row execute function public.cancel_bill_effects();

create or replace function public.cancel_bill(p_kind text,p_bill_id uuid,p_reason text)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if p_kind='sale' then
    update public.sales set status='cancelled',cancellation_reason=coalesce(nullif(trim(p_reason),''),'Deleted bill') where id=p_bill_id and organization_id=public.current_organization_id() and status<>'cancelled';
  elsif p_kind='purchase' then
    update public.purchases set status='cancelled',cancellation_reason=coalesce(nullif(trim(p_reason),''),'Deleted bill') where id=p_bill_id and organization_id=public.current_organization_id() and status<>'cancelled';
  else raise exception 'Invalid bill type'; end if;
  if not found then raise exception 'Bill not found or already cancelled'; end if;
end $$;
revoke all on function public.cancel_bill(text,uuid,text) from public,anon;
grant execute on function public.cancel_bill(text,uuid,text) to authenticated;

create or replace function public.guard_deleted_bill_audit()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if public.current_role()::text is distinct from 'admin' or old.organization_id is distinct from public.current_organization_id() then
    raise exception 'Only clinic admin can mark bills audited';
  end if;
  if (to_jsonb(new)-'audited'-'audited_by'-'audited_at') is distinct from (to_jsonb(old)-'audited'-'audited_by'-'audited_at') or not new.audited then
    raise exception 'Audit history cannot be modified';
  end if;
  new.audited_by := auth.uid(); new.audited_at := now();
  return new;
end $$;
drop trigger if exists guard_sales_audit on public.deleted_sales_audit;
create trigger guard_sales_audit before update on public.deleted_sales_audit for each row execute function public.guard_deleted_bill_audit();
drop trigger if exists guard_purchases_audit on public.deleted_purchases_audit;
create trigger guard_purchases_audit before update on public.deleted_purchases_audit for each row execute function public.guard_deleted_bill_audit();
drop policy if exists deleted_sales_audit_tenant_insert on public.deleted_sales_audit;
drop policy if exists deleted_purchases_audit_tenant_insert on public.deleted_purchases_audit;
commit;
