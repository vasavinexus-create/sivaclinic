-- SivaCare / MediFlow fix for editing clinic logins without false username collision errors.

create or replace function public.update_profile_login_json(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := nullif(p_payload->>'profile_id', '')::uuid;
  v_username text := public.normalize_username(p_payload->>'username');
  v_password text := coalesce(p_payload->>'password', '');
  v_full_name text := p_payload->>'full_name';
  v_role public.app_role := coalesce(nullif(p_payload->>'role', ''), 'admin')::public.app_role;
  v_active boolean := coalesce((p_payload->>'active')::boolean, true);
  v_org_id uuid;
  v_invite_id uuid;
begin
  select organization_id into v_org_id from public.profiles where id = v_profile_id;
  if v_org_id is null then raise exception 'User profile not found'; end if;
  if not public.is_software_owner() and (v_org_id <> public.current_organization_id() or public.current_role() <> 'admin'::public.app_role) then
    raise exception 'Only clinic admins can edit logins';
  end if;
  if v_username = '' then raise exception 'Username is required'; end if;
  if v_password <> '' and length(v_password) < 6 then raise exception 'Password must be at least 6 characters'; end if;

  select id into v_invite_id
  from public.user_invites
  where accepted_by = v_profile_id
     or (organization_id = v_org_id and role = v_role and lower(full_name) = lower(coalesce(nullif(trim(v_full_name), ''), full_name)))
  order by accepted_at desc nulls last, created_at desc
  limit 1;

  if not public.username_available_for_user(v_username, v_profile_id, v_invite_id) then
    raise exception 'Username already exists';
  end if;

  update public.profiles
  set username = v_username,
      full_name = coalesce(nullif(trim(v_full_name), ''), full_name),
      role = v_role,
      active = v_active,
      updated_at = now()
  where id = v_profile_id;

  if v_invite_id is not null then
    update public.user_invites
    set username = v_username,
        email = public.login_email_for_username(v_username),
        login_email = public.login_email_for_username(v_username),
        password_hash = case when v_password = '' then password_hash else extensions.crypt(v_password, extensions.gen_salt('bf')) end,
        full_name = coalesce(nullif(trim(v_full_name), ''), full_name),
        role = v_role,
        active = v_active,
        accepted_by = v_profile_id,
        accepted_at = coalesce(accepted_at, now())
    where id = v_invite_id;
  else
    insert into public.user_invites(organization_id, email, username, login_email, password_hash, full_name, role, active, accepted_by, accepted_at, created_by)
    values (
      v_org_id,
      public.login_email_for_username(v_username),
      v_username,
      public.login_email_for_username(v_username),
      case when v_password = '' then null else extensions.crypt(v_password, extensions.gen_salt('bf')) end,
      coalesce(nullif(trim(v_full_name), ''), v_username),
      v_role,
      v_active,
      v_profile_id,
      now(),
      auth.uid()
    );
  end if;
end;
$$;

create or replace function public.update_invite_login_json(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite_id uuid := nullif(p_payload->>'invite_id', '')::uuid;
  v_username text := public.normalize_username(p_payload->>'username');
  v_password text := coalesce(p_payload->>'password', '');
  v_full_name text := p_payload->>'full_name';
  v_role public.app_role := coalesce(nullif(p_payload->>'role', ''), 'admin')::public.app_role;
  v_active boolean := coalesce((p_payload->>'active')::boolean, true);
  v_invite public.user_invites%rowtype;
begin
  select * into v_invite from public.user_invites where id = v_invite_id;
  if v_invite.id is null then raise exception 'Login record not found'; end if;
  if not public.is_software_owner() and (v_invite.organization_id <> public.current_organization_id() or public.current_role() <> 'admin'::public.app_role) then
    raise exception 'Only clinic admins can edit logins';
  end if;
  if v_username = '' then raise exception 'Username is required'; end if;
  if v_password <> '' and length(v_password) < 6 then raise exception 'Password must be at least 6 characters'; end if;
  
  if not public.username_available_for_user(v_username, v_invite.accepted_by, v_invite_id) then
    raise exception 'Username already exists';
  end if;

  update public.user_invites
  set username = v_username,
      email = public.login_email_for_username(v_username),
      login_email = public.login_email_for_username(v_username),
      password_hash = case when v_password = '' then password_hash else extensions.crypt(v_password, extensions.gen_salt('bf')) end,
      full_name = coalesce(nullif(trim(v_full_name), ''), full_name),
      role = v_role,
      active = v_active
  where id = v_invite_id;
end;
$$;

grant execute on function public.update_profile_login_json(jsonb) to anon, authenticated;
grant execute on function public.update_invite_login_json(jsonb) to anon, authenticated;
