-- SivaCare final username-login repair.
-- Fixes duplicate admin login rows and lets accepted users login by username
-- using their real Supabase Auth email.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.prepare_username_login(
  p_username text,
  p_password text
)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_username text := public.normalize_username(p_username);
  v_invite public.user_invites%rowtype;
  v_auth_email text;
begin
  if v_username = '' then raise exception 'Username is required'; end if;

  select u.email into v_auth_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.active = true
    and lower(p.username) = v_username
  order by p.updated_at desc nulls last, p.created_at desc
  limit 1;

  if v_auth_email is not null then
    return lower(v_auth_email);
  end if;

  select * into v_invite
  from public.user_invites
  where active = true
    and lower(username) = v_username
  order by accepted_at desc nulls last, created_at desc
  limit 1;

  if v_invite.id is null then
    raise exception 'Invalid username or password';
  end if;

  if v_invite.password_hash is null or v_invite.password_hash <> extensions.crypt(p_password, v_invite.password_hash) then
    raise exception 'Invalid username or password';
  end if;

  return lower(coalesce(v_invite.login_email, public.login_email_for_username(v_username)));
end;
$$;

grant execute on function public.prepare_username_login(text,text) to anon, authenticated;

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
  if not public.username_available_for_user(v_username, v_profile_id, null) then raise exception 'Username already exists'; end if;

  select id into v_invite_id
  from public.user_invites
  where accepted_by = v_profile_id
     or (organization_id = v_org_id and role = v_role and lower(full_name) = lower(coalesce(nullif(trim(v_full_name), ''), full_name)))
  order by accepted_at desc nulls last, created_at desc
  limit 1;

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

grant execute on function public.update_profile_login_json(jsonb) to anon, authenticated;

-- Remove duplicate accepted admin login rows per clinic, keeping the newest row.
with ranked as (
  select id,
         row_number() over (
           partition by organization_id, role, lower(coalesce(full_name, ''))
           order by accepted_at desc nulls last, created_at desc
         ) as rn
  from public.user_invites
  where role = 'admin'::public.app_role
    and accepted_at is not null
)
delete from public.user_invites ui
using ranked r
where ui.id = r.id
  and r.rn > 1;

select pg_notify('pgrst', 'reload schema');
