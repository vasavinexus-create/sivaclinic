-- 202611110002_safe_patient_clinical_delete.sql
-- Updates public.delete_patient_cascade to ONLY delete patient master records and clinical data.
-- SALES, CASH LEDGER, MEDICINE STOCK, STOCK MOVEMENTS, PAYMENTS, AND JOURNALS REMAIN 100% PRESERVED.

create or replace function public.delete_patient_cascade(
  p_org_id uuid,
  p_patient_id uuid,
  p_restore_stock boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_patient record;
  v_consultation_ids uuid[];
  v_deleted_consultations int := 0;
  v_deleted_attachments int := 0;
  v_detached_sales int := 0;
  v_detached_payments int := 0;
begin
  select * into v_patient from public.patients where id = p_patient_id and organization_id = p_org_id;
  if not found then
    raise exception 'Patient not found or already removed';
  end if;

  -- 1. Gather all consultations for this patient
  select coalesce(array_agg(id), array[]::uuid[]) into v_consultation_ids
  from public.consultations
  where patient_id = p_patient_id and organization_id = p_org_id;

  -- 2. Break circular doctor fee reference between consultations and sales
  update public.consultations
  set doctor_fee_collected_bill_id = null
  where organization_id = p_org_id and patient_id = p_patient_id;

  -- 3. Detach sales from patient and consultations (SALES REMAIN INTACT)
  update public.sales
  set patient_id = null,
      consultation_id = null
  where organization_id = p_org_id
    and (patient_id = p_patient_id or (consultation_id is not null and consultation_id = any(v_consultation_ids)));
  get diagnostics v_detached_sales = row_count;

  -- 4. Detach payments from patient (PAYMENTS & CASH REMAIN INTACT)
  update public.payments
  set patient_id = null
  where organization_id = p_org_id and patient_id = p_patient_id;
  get diagnostics v_detached_payments = row_count;

  -- 5. Delete patient ledger (personal credit/debit account for patient)
  delete from public.patient_ledger where patient_id = p_patient_id and organization_id = p_org_id;

  -- 6. Delete prescription attachments (clinical data)
  delete from public.prescription_attachments
  where organization_id = p_org_id and (patient_id = p_patient_id or consultation_id = any(v_consultation_ids));
  get diagnostics v_deleted_attachments = row_count;

  -- 7. Delete consultations (clinical data: visits, vitals, symptoms, diagnosis, prescriptions)
  delete from public.consultations where patient_id = p_patient_id and organization_id = p_org_id;
  v_deleted_consultations := coalesce(array_length(v_consultation_ids, 1), 0);

  -- 8. Delete the patient master record
  delete from public.patients where id = p_patient_id and organization_id = p_org_id;

  -- 9. Insert audit log
  insert into public.audit_logs(organization_id, user_id, action, module, record_id, new_value)
  values (p_org_id, auth.uid(), 'delete_patient_clinical_only', 'patients', p_patient_id::text, jsonb_build_object(
    'patient_id', v_patient.patient_id,
    'patient_name', v_patient.name,
    'deleted_consultations', v_deleted_consultations,
    'deleted_attachments', v_deleted_attachments,
    'detached_sales', v_detached_sales,
    'detached_payments', v_detached_payments,
    'sales_preserved', true,
    'cash_ledger_preserved', true,
    'stock_preserved', true,
    'journals_preserved', true
  ));

  return jsonb_build_object(
    'success', true,
    'message', 'Patient record and clinical data removed successfully. Sales, cash, stock, and accounting records remain completely preserved.',
    'patient_name', v_patient.name,
    'deleted_consultations', v_deleted_consultations,
    'deleted_attachments', v_deleted_attachments,
    'detached_sales', v_detached_sales,
    'detached_payments', v_detached_payments
  );
end;
$$;
