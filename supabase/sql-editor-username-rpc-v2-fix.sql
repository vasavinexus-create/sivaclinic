-- SivaCare username login RPC v2 fix.
-- Run this in Supabase SQL Editor if username/login edit RPC calls return 404.

create or replace function public.update_profile_login_username_v2(
  p_profile_id uuid,
  p_username text,
  p_password text,
  p_full_name text,
  p_role text,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_username text := public.normalize_username(p_username);
  v_role public.app_role := coalesce(nullif(p_role, ''), 'admin')::public.app_role;
begin
  select organization_id into v_org_id from public.profiles where id = p_profile_id;
  if v_org_id is null then raise exception 'User profile not found'; end if;
  if not public.is_software_owner() and (v_org_id <> public.current_organization_id() or public.current_role() <> 'admin'::public.app_role) then
    raise exception 'Only clinic admins can edit logins';
  end if;
  if v_username = '' then raise exception 'Username is required'; end if;
  if coalesce(p_password, '') <> '' and length(p_password) < 6 then raise exception 'Password must be at least 6 characters'; end if;
  if not public.username_available_for_user(v_username, p_profile_id, null) then raise exception 'Username already exists'; end if;

  update public.profiles
  set username = v_username,
      full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
      role = v_role,
      active = coalesce(p_active, active),
      updated_at = now()
  where id = p_profile_id;

  insert into public.user_invites(organization_id, email, username, login_email, password_hash, full_name, role, active, accepted_by, accepted_at, created_by)
  select organization_id,
         public.login_email_for_username(v_username),
         v_username,
         public.login_email_for_username(v_username),
         case when coalesce(p_password, '') = '' then null else crypt(p_password, gen_salt('bf')) end,
         coalesce(nullif(trim(p_full_name), ''), full_name),
         v_role,
         coalesce(p_active, active),
         id,
         now(),
         auth.uid()
  from public.profiles
  where id = p_profile_id
  on conflict (organization_id, email) do update set
    username = excluded.username,
    login_email = excluded.login_email,
    password_hash = coalesce(excluded.password_hash, public.user_invites.password_hash),
    full_name = excluded.full_name,
    role = excluded.role,
    active = excluded.active,
    accepted_by = excluded.accepted_by,
    accepted_at = coalesce(public.user_invites.accepted_at, now());
end;
$$;

create or replace function public.update_invite_login_username_v2(
  p_invite_id uuid,
  p_username text,
  p_password text,
  p_full_name text,
  p_role text,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.user_invites%rowtype;
  v_username text := public.normalize_username(p_username);
  v_role public.app_role := coalesce(nullif(p_role, ''), 'admin')::public.app_role;
begin
  select * into v_invite from public.user_invites where id = p_invite_id;
  if v_invite.id is null then raise exception 'Login record not found'; end if;
  if not public.is_software_owner() and (v_invite.organization_id <> public.current_organization_id() or public.current_role() <> 'admin'::public.app_role) then
    raise exception 'Only clinic admins can edit logins';
  end if;
  if v_username = '' then raise exception 'Username is required'; end if;
  if coalesce(p_password, '') <> '' and length(p_password) < 6 then raise exception 'Password must be at least 6 characters'; end if;
  if not public.username_available_for_user(v_username, null, p_invite_id) then raise exception 'Username already exists'; end if;

  update public.user_invites
  set username = v_username,
      email = public.login_email_for_username(v_username),
      login_email = public.login_email_for_username(v_username),
      password_hash = case when coalesce(p_password, '') = '' then password_hash else crypt(p_password, gen_salt('bf')) end,
      full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
      role = v_role,
      active = coalesce(p_active, active)
  where id = p_invite_id;
end;
$$;

grant usage on schema public to anon, authenticated;
revoke all on function public.update_profile_login_username_v2(uuid,text,text,text,text,boolean) from public;
revoke all on function public.update_invite_login_username_v2(uuid,text,text,text,text,boolean) from public;
grant execute on function public.update_profile_login_username_v2(uuid,text,text,text,text,boolean) to anon, authenticated;
grant execute on function public.update_invite_login_username_v2(uuid,text,text,text,text,boolean) to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
