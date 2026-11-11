-- Function to completely delete a patient and cascade-remove all associated records
-- Can be run in Supabase SQL Editor if desired.

create or replace function public.delete_patient_cascade(
  p_org_id uuid,
  p_patient_id uuid,
  p_restore_stock boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_patient record;
  v_consultation_ids uuid[];
  v_sale_ids uuid[];
  v_item record;
  v_journal_ids uuid[];
  v_deleted_consultations int := 0;
  v_deleted_sales int := 0;
  v_deleted_attachments int := 0;
begin
  -- 1. Check patient exists in the organization
  select * into v_patient from public.patients where id = p_patient_id and organization_id = p_org_id;
  if not found then
    raise exception 'Patient not found or already removed';
  end if;

  -- 2. Gather consultation IDs
  select coalesce(array_agg(id), array[]::uuid[]) into v_consultation_ids
  from public.consultations
  where patient_id = p_patient_id and organization_id = p_org_id;

  -- 3. Gather sale IDs
  select coalesce(array_agg(id), array[]::uuid[]) into v_sale_ids
  from public.sales
  where organization_id = p_org_id
    and (patient_id = p_patient_id or (consultation_id is not null and consultation_id = any(v_consultation_ids)));

  -- 4. Break circular & cross foreign keys
  update public.consultations
  set doctor_fee_collected_bill_id = null
  where organization_id = p_org_id and (patient_id = p_patient_id or doctor_fee_collected_bill_id = any(v_sale_ids));

  update public.sales
  set consultation_id = null
  where organization_id = p_org_id and (patient_id = p_patient_id or consultation_id = any(v_consultation_ids));

  -- 5. Process sales and inventory
  if array_length(v_sale_ids, 1) is not null then
    if p_restore_stock then
      for v_item in
        select batch_id, sum(quantity - returned_quantity) as net_qty
        from public.sale_items
        where sale_id = any(v_sale_ids) and organization_id = p_org_id and batch_id is not null
        group by batch_id
      loop
        if v_item.net_qty > 0 then
          update public.medicine_batches
          set current_stock = current_stock + v_item.net_qty
          where id = v_item.batch_id and organization_id = p_org_id;
        end if;
      end loop;
    end if;

    delete from public.stock_movements where reference_id = any(v_sale_ids) and organization_id = p_org_id;
    delete from public.cash_ledger where reference_id = any(v_sale_ids) and organization_id = p_org_id;

    select coalesce(array_agg(id), array[]::uuid[]) into v_journal_ids
    from public.journal_entries
    where reference_id = any(v_sale_ids) and organization_id = p_org_id;

    if array_length(v_journal_ids, 1) is not null then
      update public.journal_entries set reverses_entry_id = null where reverses_entry_id = any(v_journal_ids);
      delete from public.journal_lines where journal_entry_id = any(v_journal_ids);
      delete from public.journal_entries where id = any(v_journal_ids);
    end if;

    delete from public.deleted_sales_audit where sale_id = any(v_sale_ids) and organization_id = p_org_id;
    delete from public.sale_items where sale_id = any(v_sale_ids) and organization_id = p_org_id;
    delete from public.payments where sale_id = any(v_sale_ids) and organization_id = p_org_id;
    delete from public.sales where id = any(v_sale_ids) and organization_id = p_org_id;
    v_deleted_sales := array_length(v_sale_ids, 1);
  end if;

  -- 6. Direct payments
  delete from public.payments where patient_id = p_patient_id and organization_id = p_org_id;

  -- 7. Patient ledger
  delete from public.patient_ledger where patient_id = p_patient_id and organization_id = p_org_id;

  -- 8. Prescription attachments
  delete from public.prescription_attachments
  where organization_id = p_org_id and (patient_id = p_patient_id or consultation_id = any(v_consultation_ids));
  get diagnostics v_deleted_attachments = row_count;

  -- 9. Consultations
  delete from public.consultations where patient_id = p_patient_id and organization_id = p_org_id;
  v_deleted_consultations := coalesce(array_length(v_consultation_ids, 1), 0);

  -- 10. Delete patient
  delete from public.patients where id = p_patient_id and organization_id = p_org_id;

  -- 11. Audit log
  insert into public.audit_logs(organization_id, user_id, action, module, record_id, new_value)
  values (p_org_id, auth.uid(), 'delete_patient_and_records', 'patients', p_patient_id::text, jsonb_build_object(
    'patient_id', v_patient.patient_id,
    'patient_name', v_patient.name,
    'deleted_consultations', v_deleted_consultations,
    'deleted_sales', v_deleted_sales,
    'deleted_attachments', v_deleted_attachments,
    'restored_stock', p_restore_stock
  ));

  return jsonb_build_object(
    'success', true,
    'patient_id', v_patient.patient_id,
    'patient_name', v_patient.name,
    'deleted_consultations', v_deleted_consultations,
    'deleted_sales', v_deleted_sales,
    'deleted_attachments', v_deleted_attachments
  );
end;
$$;

revoke all on function public.delete_patient_cascade(uuid, uuid, boolean) from public;
grant execute on function public.delete_patient_cascade(uuid, uuid, boolean) to authenticated;
