-- SivaCare username/password login upgrade.
-- Run this directly in Supabase SQL Editor.
--
-- Important Supabase Auth setting:
-- Authentication > Providers > Email > turn OFF "Confirm email"
-- so first username/password login does not require email confirmation.

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists username text;

alter table public.user_invites
  add column if not exists username text,
  add column if not exists login_email text,
  add column if not exists password_hash text;

create unique index if not exists profiles_username_unique_idx
  on public.profiles (lower(username))
  where username is not null;

create unique index if not exists user_invites_username_unique_idx
  on public.user_invites (lower(username))
  where username is not null and active = true;

create unique index if not exists user_invites_login_email_unique_idx
  on public.user_invites (lower(login_email))
  where login_email is not null and active = true;

create or replace function public.normalize_username(p_username text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(trim(coalesce(p_username, '')), '[^a-zA-Z0-9_.-]+', '', 'g'))
$$;

create or replace function public.login_email_for_username(p_username text)
returns text
language sql
immutable
set search_path = public
as $$
  select public.normalize_username(p_username) || '@sivacare.local'
$$;

create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.normalize_username(p_username) <> ''
    and not exists (select 1 from public.profiles where lower(username) = public.normalize_username(p_username))
    and not exists (select 1 from public.user_invites where active = true and lower(username) = public.normalize_username(p_username));
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

create or replace function public.username_available_for_user(p_username text, p_profile_id uuid default null, p_invite_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.normalize_username(p_username) <> ''
    and not exists (
      select 1 from public.profiles
      where lower(username) = public.normalize_username(p_username)
        and (p_profile_id is null or id <> p_profile_id)
    )
    and not exists (
      select 1 from public.user_invites
      where active = true
        and lower(username) = public.normalize_username(p_username)
        and (p_invite_id is null or id <> p_invite_id)
    );
$$;

revoke all on function public.username_available_for_user(text,uuid,uuid) from public;
grant execute on function public.username_available_for_user(text,uuid,uuid) to anon, authenticated;

create or replace function public.create_clinic_with_admin_username(
  p_clinic_name text,
  p_admin_username text,
  p_admin_password text,
  p_admin_name text,
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_username text := public.normalize_username(p_admin_username);
begin
  if not public.is_software_owner() then raise exception 'Only the software owner can create clinics'; end if;
  if v_username = '' then raise exception 'Username is required'; end if;
  if length(coalesce(p_admin_password, '')) < 6 then raise exception 'Password must be at least 6 characters'; end if;
  if not public.username_available(v_username) then raise exception 'Username already exists'; end if;

  insert into public.organizations(name, clinic_name, pharmacy_name, phone)
  values (trim(p_clinic_name), trim(p_clinic_name), trim(p_clinic_name) || ' Pharmacy', nullif(trim(p_phone), ''))
  returning id into v_org_id;

  insert into public.user_invites(organization_id, email, username, login_email, password_hash, full_name, role, created_by)
  values (
    v_org_id,
    public.login_email_for_username(v_username),
    v_username,
    public.login_email_for_username(v_username),
    crypt(p_admin_password, gen_salt('bf')),
    coalesce(nullif(trim(p_admin_name), ''), v_username),
    'admin',
    auth.uid()
  );

  return v_org_id;
end;
$$;

revoke all on function public.create_clinic_with_admin_username(text,text,text,text,text) from public;
grant execute on function public.create_clinic_with_admin_username(text,text,text,text,text) to authenticated;

create or replace function public.upsert_user_invite_username(
  p_username text,
  p_password text,
  p_full_name text,
  p_role public.app_role,
  p_doctor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_username text := public.normalize_username(p_username);
  v_existing uuid;
begin
  if public.current_role() <> 'admin'::public.app_role and not public.is_software_owner() then
    raise exception 'Only clinic admins can create logins';
  end if;
  if v_username = '' then raise exception 'Username is required'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'Password must be at least 6 characters'; end if;

  select id into v_existing
  from public.profiles
  where lower(username) = v_username
  limit 1;
  if v_existing is not null then raise exception 'Username already exists'; end if;

  insert into public.user_invites(organization_id, email, username, login_email, password_hash, full_name, role, doctor_id, created_by)
  values (
    public.current_organization_id(),
    public.login_email_for_username(v_username),
    v_username,
    public.login_email_for_username(v_username),
    crypt(p_password, gen_salt('bf')),
    trim(p_full_name),
    p_role,
    p_doctor_id,
    auth.uid()
  )
  on conflict (organization_id, email) do update set
    username = excluded.username,
    login_email = excluded.login_email,
    password_hash = excluded.password_hash,
    full_name = excluded.full_name,
    role = excluded.role,
    doctor_id = excluded.doctor_id,
    active = true
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.upsert_user_invite_username(text,text,text,public.app_role,uuid) from public;
grant execute on function public.upsert_user_invite_username(text,text,text,public.app_role,uuid) to authenticated;

create or replace function public.update_profile_login_username(
  p_profile_id uuid,
  p_username text,
  p_password text default null,
  p_full_name text default null,
  p_role public.app_role default null,
  p_active boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_username text := public.normalize_username(p_username);
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
      role = coalesce(p_role, role),
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
         coalesce(p_role, role),
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

revoke all on function public.update_profile_login_username(uuid,text,text,text,public.app_role,boolean) from public;
grant execute on function public.update_profile_login_username(uuid,text,text,text,public.app_role,boolean) to authenticated;

create or replace function public.update_invite_login_username(
  p_invite_id uuid,
  p_username text,
  p_password text default null,
  p_full_name text default null,
  p_role public.app_role default null,
  p_active boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.user_invites%rowtype;
  v_username text := public.normalize_username(p_username);
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
      role = coalesce(p_role, role),
      active = coalesce(p_active, active)
  where id = p_invite_id;
end;
$$;

revoke all on function public.update_invite_login_username(uuid,text,text,text,public.app_role,boolean) from public;
grant execute on function public.update_invite_login_username(uuid,text,text,text,public.app_role,boolean) to authenticated;

create or replace function public.prepare_username_login(
  p_username text,
  p_password text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := public.normalize_username(p_username);
  v_invite public.user_invites%rowtype;
begin
  if v_username = '' then raise exception 'Username is required'; end if;

  select * into v_invite
  from public.user_invites
  where active = true
    and lower(username) = v_username
    and accepted_by is null
  order by created_at desc
  limit 1;

  if v_invite.id is null then
    return public.login_email_for_username(v_username);
  end if;

  if v_invite.password_hash is null or v_invite.password_hash <> crypt(p_password, v_invite.password_hash) then
    raise exception 'Invalid username or password';
  end if;

  return coalesce(v_invite.login_email, public.login_email_for_username(v_username));
end;
$$;

revoke all on function public.prepare_username_login(text,text) from public;
grant execute on function public.prepare_username_login(text,text) to anon, authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(new.email);
  v_username text := public.normalize_username(split_part(v_email, '@', 1));
  v_invite public.user_invites%rowtype;
  v_owner_org_id uuid;
begin
  if exists (select 1 from public.software_owner_emails where email = v_email)
     or v_username = 'vasavinexus' then
    select id into v_owner_org_id from public.organizations where name = 'SivaCare Software Owner' limit 1;
    if v_owner_org_id is null then
      insert into public.organizations(name, clinic_name, pharmacy_name)
      values ('SivaCare Software Owner', 'SivaCare Software Owner', 'SivaCare Platform')
      returning id into v_owner_org_id;
    end if;
    insert into public.profiles(id, organization_id, full_name, role, username, active)
    values (new.id, v_owner_org_id, coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), v_username), 'software_owner', v_username, true)
    on conflict (id) do nothing;
    return new;
  end if;

  select * into v_invite
  from public.user_invites
  where active = true
    and accepted_by is null
    and (lower(login_email) = v_email or lower(email) = v_email or lower(username) = v_username)
  order by created_at desc
  limit 1;

  if v_invite.id is null then return new; end if;

  insert into public.profiles(id, organization_id, full_name, role, username, active)
  values (new.id, v_invite.organization_id, v_invite.full_name, v_invite.role, v_invite.username, true)
  on conflict (id) do nothing;

  if v_invite.doctor_id is not null then
    update public.doctors set profile_id = new.id where id = v_invite.doctor_id;
  end if;

  update public.user_invites set accepted_by = new.id, accepted_at = now()
  where id = v_invite.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();
