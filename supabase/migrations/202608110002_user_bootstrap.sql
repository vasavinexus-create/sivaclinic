create or replace function public.bootstrap_current_user(p_organization_name text, p_full_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select organization_id into v_org_id from public.profiles where id = auth.uid();
  if v_org_id is not null then return v_org_id; end if;

  insert into public.organizations(name, clinic_name, pharmacy_name)
  values (trim(p_organization_name), trim(p_organization_name), trim(p_organization_name) || ' Medicals')
  returning id into v_org_id;

  insert into public.profiles(id, organization_id, full_name, role, active)
  values (auth.uid(), v_org_id, coalesce(nullif(trim(p_full_name), ''), auth.jwt()->>'email'), 'admin', true);

  return v_org_id;
end;
$$;

revoke all on function public.bootstrap_current_user(text,text) from public;
grant execute on function public.bootstrap_current_user(text,text) to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_name text := nullif(trim(new.raw_user_meta_data->>'organization_name'), '');
  v_org_id uuid;
begin
  if v_org_name is null then return new; end if;
  insert into public.organizations(name, clinic_name, pharmacy_name)
  values (v_org_name, v_org_name, v_org_name || ' Medicals') returning id into v_org_id;
  insert into public.profiles(id, organization_id, full_name, role, active)
  values (new.id, v_org_id, coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), new.email), 'admin', true);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_auth_user();
