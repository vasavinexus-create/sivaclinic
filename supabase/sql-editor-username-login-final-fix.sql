-- SivaCare / MediFlow COMPLETE Username Login & Clinic Management Master Fix.
-- Run this ONCE directly in Supabase SQL Editor.
-- Fixes GoTrue 500 error ("Database error querying schema"), missing RPC 404 errors, and enables seamless Clinic Creation and User Login.

create extension if not exists pgcrypto with schema extensions;

alter table public.profiles
  add column if not exists username text;

alter table public.user_invites
  add column if not exists username text,
  add column if not exists login_email text,
  add column if not exists password_hash text;

-- Base Helper Functions
create or replace function public.is_software_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'software_owner'::public.app_role and active = true
  )
$$;

grant execute on function public.is_software_owner() to anon, authenticated;

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid() limit 1;
$$;

grant execute on function public.current_organization_id() to anon, authenticated;

create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() limit 1;
$$;

grant execute on function public.current_role() to anon, authenticated;

create or replace function public.normalize_username(p_username text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(trim(coalesce(p_username, '')), '[^a-zA-Z0-9_.-]+', '', 'g'))
$$;

grant execute on function public.normalize_username(text) to anon, authenticated;

create or replace function public.login_email_for_username(p_username text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when public.normalize_username(p_username) = 'vasavinexus' then 'vasavinexus@gmail.com'
    else public.normalize_username(p_username) || '.sivacare@gmail.com'
  end
$$;

grant execute on function public.login_email_for_username(text) to anon, authenticated;

-- Fix existing user invites email formats to .sivacare@gmail.com
update public.user_invites
set email = public.login_email_for_username(username),
    login_email = public.login_email_for_username(username)
where username is not null;

-- Fix existing auth.users: match GoTrue Go struct scanner expectations (empty strings instead of NULL)
update auth.users u
set email = public.login_email_for_username(ui.username),
    encrypted_password = coalesce(ui.password_hash, u.encrypted_password),
    email_confirmed_at = coalesce(u.email_confirmed_at, now()),
    last_sign_in_at = coalesce(u.last_sign_in_at, now()),
    raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
    raw_user_meta_data = jsonb_build_object('sub', u.id::text, 'email', lower(public.login_email_for_username(ui.username)), 'full_name', coalesce(ui.full_name, p.full_name, split_part(u.email, '@', 1)), 'username', coalesce(ui.username, p.username, split_part(u.email, '@', 1)), 'email_verified', true, 'phone_verified', false),
    phone_change = '',
    phone_change_token = '',
    email_change_token_current = '',
    reauthentication_token = '',
    email_change_confirm_status = 0,
    is_sso_user = false,
    updated_at = now()
from public.user_invites ui
left join public.profiles p on p.id = ui.accepted_by
where ui.accepted_by = u.id;

-- Re-create clean 100% GoTrue-compliant identities for all users
delete from auth.identities i
using auth.users u
where i.user_id = u.id;

insert into auth.identities(id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  extensions.gen_random_uuid(),
  u.id,
  u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', lower(u.email), 'email_verified', true, 'phone_verified', false),
  'email',
  now(),
  u.created_at,
  now()
from auth.users u;

-- Username availability checks
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

grant execute on function public.username_available(text) to anon, authenticated;

create or replace function public.username_available_for_user(
  p_username text,
  p_profile_id uuid default null,
  p_invite_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.normalize_username(p_username) <> ''
    and not exists (
      select 1
      from public.profiles
      where lower(username) = public.normalize_username(p_username)
        and (p_profile_id is null or id <> p_profile_id)
    )
    and not exists (
      select 1
      from public.user_invites
      where active = true
        and lower(username) = public.normalize_username(p_username)
        and (p_invite_id is null or id <> p_invite_id)
    );
$$;

grant execute on function public.username_available_for_user(text,uuid,uuid) to anon, authenticated;

-- Clinic Creation RPC
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
set search_path = public, extensions
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
    extensions.crypt(p_admin_password, extensions.gen_salt('bf', 10)),
    coalesce(nullif(trim(p_admin_name), ''), v_username),
    'admin',
    auth.uid()
  );

  return v_org_id;
end;
$$;

grant execute on function public.create_clinic_with_admin_username(text,text,text,text,text) to anon, authenticated;

-- Clinic Details Edit RPC
create or replace function public.update_clinic_details(
  p_organization_id uuid,
  p_clinic_name text,
  p_phone text default null,
  p_pharmacy_name text default null,
  p_address text default null,
  p_gst_number text default null,
  p_drug_license_number text default null,
  p_active boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_software_owner() then
    raise exception 'Only the software owner can edit clinics';
  end if;
  if p_organization_id is null then raise exception 'Clinic is required'; end if;
  if nullif(trim(coalesce(p_clinic_name, '')), '') is null then raise exception 'Clinic name is required'; end if;

  update public.organizations
  set name = trim(p_clinic_name),
      clinic_name = trim(p_clinic_name),
      pharmacy_name = coalesce(nullif(trim(p_pharmacy_name), ''), pharmacy_name, trim(p_clinic_name) || ' Pharmacy'),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      address = nullif(trim(coalesce(p_address, '')), ''),
      gst_number = nullif(trim(coalesce(p_gst_number, '')), ''),
      drug_license_number = nullif(trim(coalesce(p_drug_license_number, '')), ''),
      active = coalesce(p_active, true)
  where id = p_organization_id;

  if not found then raise exception 'Clinic not found'; end if;
end;
$$;

grant execute on function public.update_clinic_details(uuid,text,text,text,text,text,text,boolean) to anon, authenticated;

-- User Invite / User Creation RPC
create or replace function public.upsert_user_invite_username(
  p_username text,
  p_password text,
  p_full_name text,
  p_role text,
  p_doctor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_username text := public.normalize_username(p_username);
  v_org_id uuid := public.current_organization_id();
  v_existing_profile uuid;
  v_existing_invite uuid;
begin
  if public.current_role() <> 'admin'::public.app_role and not public.is_software_owner() then
    raise exception 'Only clinic admins can create logins';
  end if;
  if v_org_id is null then raise exception 'Clinic organization not found for this user'; end if;
  if v_username = '' then raise exception 'Username is required'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'Password must be at least 6 characters'; end if;
  if nullif(trim(coalesce(p_full_name, '')), '') is null then raise exception 'Full name is required'; end if;

  select id into v_existing_profile
  from public.profiles
  where lower(username) = v_username
  limit 1;
  if v_existing_profile is not null then raise exception 'Username already exists'; end if;

  select id into v_existing_invite
  from public.user_invites
  where organization_id = v_org_id
    and lower(username) = v_username
  order by created_at desc
  limit 1;

  if v_existing_invite is not null then
    update public.user_invites
    set email = public.login_email_for_username(v_username),
        login_email = public.login_email_for_username(v_username),
        password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
        full_name = trim(p_full_name),
        role = p_role::public.app_role,
        doctor_id = p_doctor_id,
        active = true
    where id = v_existing_invite
    returning id into v_id;
  else
    insert into public.user_invites(organization_id, email, username, login_email, password_hash, full_name, role, doctor_id, active, created_by)
    values (
      v_org_id,
      public.login_email_for_username(v_username),
      v_username,
      public.login_email_for_username(v_username),
      extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
      trim(p_full_name),
      p_role::public.app_role,
      p_doctor_id,
      true,
      auth.uid()
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

drop function if exists public.upsert_user_invite_username(text,text,text,text);
grant execute on function public.upsert_user_invite_username(text,text,text,text,uuid) to anon, authenticated;

-- User Provisioning & Authentication RPC
create or replace function public.create_pending_username_auth_user(
  p_username text,
  p_password text
)
returns text
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_username text := public.normalize_username(p_username);
  v_invite public.user_invites%rowtype;
  v_user_id uuid;
  v_email text;
begin
  if v_username = '' then raise exception 'Username is required'; end if;

  select * into v_invite
  from public.user_invites
  where active = true
    and lower(username) = v_username
  order by accepted_at desc nulls last, created_at desc
  limit 1;

  if v_invite.id is null
     or v_invite.password_hash is null
     or v_invite.password_hash <> extensions.crypt(p_password, v_invite.password_hash) then
    raise exception 'Invalid username or password';
  end if;

  v_email := lower(coalesce(v_invite.login_email, public.login_email_for_username(v_username)));

  -- Check if user already exists in auth.users by email or invite accepted_by
  select id into v_user_id
  from auth.users
  where lower(email) = v_email
     or (v_invite.accepted_by is not null and id = v_invite.accepted_by)
  limit 1;

  -- If not in auth.users, check if a profile already exists for this username
  if v_user_id is null then
    select id into v_user_id
    from public.profiles
    where lower(username) = v_username
    limit 1;
  end if;

  if v_user_id is null then
    v_user_id := extensions.gen_random_uuid();

    insert into auth.users(
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change,
      email_change_token_new,
      phone_change,
      phone_change_token,
      reauthentication_token,
      email_change_token_current,
      email_change_confirm_status,
      is_sso_user
    )
    values (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_email,
      extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'full_name', v_invite.full_name, 'username', v_username, 'email_verified', true, 'phone_verified', false),
      false,
      now(),
      now(),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      0,
      false
    );
  else
    update auth.users
    set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        email = v_email,
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'full_name', v_invite.full_name, 'username', v_username, 'email_verified', true, 'phone_verified', false),
        confirmation_token = '',
        recovery_token = '',
        email_change = '',
        email_change_token_new = '',
        phone_change = '',
        phone_change_token = '',
        email_change_token_current = '',
        reauthentication_token = '',
        email_change_confirm_status = 0,
        is_sso_user = false,
        updated_at = now()
    where id = v_user_id;
  end if;

  -- Clean up and insert a 100% GoTrue-compliant identity row
  delete from auth.identities where user_id = v_user_id;

  insert into auth.identities(
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    extensions.gen_random_uuid(),
    v_user_id,
    v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email',
    now(),
    now(),
    now()
  );

  insert into public.profiles(id, organization_id, full_name, role, username, active)
  values (v_user_id, v_invite.organization_id, v_invite.full_name, v_invite.role, v_username, true)
  on conflict (id) do update set
    organization_id = excluded.organization_id,
    full_name = excluded.full_name,
    role = excluded.role,
    username = excluded.username,
    active = true,
    updated_at = now();

  if v_invite.doctor_id is not null then
    update public.doctors
    set profile_id = v_user_id
    where id = v_invite.doctor_id;
  end if;

  update public.user_invites
  set accepted_by = v_user_id,
      accepted_at = coalesce(accepted_at, now()),
      login_email = v_email,
      email = v_email
  where id = v_invite.id;

  return v_email;
end;
$$;

grant execute on function public.create_pending_username_auth_user(text,text) to anon, authenticated;

create or replace function public.prepare_username_login(
  p_username text,
  p_password text
)
returns text
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_username text := public.normalize_username(p_username);
  v_invite public.user_invites%rowtype;
  v_profile public.profiles%rowtype;
  v_auth_email text;
begin
  if v_username = '' then raise exception 'Username is required'; end if;

  -- 0. Software Owner Admin shortcut
  if v_username = 'vasavinexus' then
    return 'vasavinexus@gmail.com';
  end if;

  -- 1. Check if an active user invite exists for this username
  select * into v_invite
  from public.user_invites
  where active = true
    and lower(username) = v_username
  order by accepted_at desc nulls last, created_at desc
  limit 1;

  if v_invite.id is not null then
    if v_invite.password_hash is not null and v_invite.password_hash <> extensions.crypt(p_password, v_invite.password_hash) then
      raise exception 'Invalid username or password';
    end if;

    if v_invite.password_hash is null then
      update public.user_invites
      set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 10))
      where id = v_invite.id;
    end if;

    -- Valid invite! Provision or sync the auth user, profile & identities directly
    return public.create_pending_username_auth_user(v_username, p_password);
  end if;

  -- 2. Check active profiles if user was created directly without invite
  select * into v_profile
  from public.profiles
  where active = true
    and lower(username) = v_username
  order by updated_at desc nulls last, created_at desc
  limit 1;

  if v_profile.id is null then
    raise exception 'Invalid username or password';
  end if;

  -- Sync auth password for existing profile
  v_auth_email := public.login_email_for_username(v_username);

  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      email = v_auth_email,
      raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
      raw_user_meta_data = jsonb_build_object('sub', v_profile.id::text, 'email', v_auth_email, 'full_name', v_profile.full_name, 'username', v_username, 'email_verified', true, 'phone_verified', false),
      phone_change = '',
      phone_change_token = '',
      email_change_token_current = '',
      reauthentication_token = '',
      email_change_confirm_status = 0,
      is_sso_user = false,
      updated_at = now()
  where id = v_profile.id;

  delete from auth.identities where user_id = v_profile.id;
  insert into auth.identities(id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    extensions.gen_random_uuid(),
    v_profile.id,
    v_profile.id::text,
    jsonb_build_object('sub', v_profile.id::text, 'email', v_auth_email, 'email_verified', true, 'phone_verified', false),
    'email',
    now(),
    now(),
    now()
  );

  return v_auth_email;
end;
$$;

grant execute on function public.prepare_username_login(text,text) to anon, authenticated;

create or replace function public.sync_username_auth_password(
  p_username text,
  p_password text
)
returns text
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  return public.prepare_username_login(p_username, p_password);
end;
$$;

grant execute on function public.sync_username_auth_password(text,text) to anon, authenticated;

-- Page Permissions RPC
create or replace function public.set_page_permissions(p_profile_id uuid, p_pages text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_page text;
begin
  select organization_id into v_org_id from public.profiles where id = p_profile_id;
  if v_org_id is null then raise exception 'User profile not found'; end if;
  if not public.is_software_owner() and (v_org_id <> public.current_organization_id() or public.current_role() <> 'admin'::public.app_role) then
    raise exception 'Only clinic admins can change page permissions';
  end if;

  delete from public.page_permissions where organization_id = v_org_id and profile_id = p_profile_id;
  foreach v_page in array coalesce(p_pages, array[]::text[]) loop
    insert into public.page_permissions(organization_id, profile_id, page_key, allowed, created_by)
    values (v_org_id, p_profile_id, v_page, true, auth.uid());
  end loop;
end;
$$;

grant execute on function public.set_page_permissions(uuid,text[]) to anon, authenticated;

-- Debug Verification RPC
create or replace function public.get_auth_user_debug_info()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_res jsonb;
begin
  select jsonb_build_object(
    'users', (
      select jsonb_agg(to_jsonb(u))
      from (
        select id, email, role, aud, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at, email_change_token_current, email_change_confirm_status, banned_until, reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at
        from auth.users
      ) u
    ),
    'identities', (
      select jsonb_agg(to_jsonb(i))
      from (
        select id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
        from auth.identities
      ) i
    )
  ) into v_res;
  return v_res;
end;
$$;

grant execute on function public.get_auth_user_debug_info() to anon, authenticated;

create or replace function public.complete_auth_user_profile(
  p_user_id uuid,
  p_email text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(p_email, ''));
  v_username text := public.normalize_username(split_part(v_email, '@', 1));
  v_invite public.user_invites%rowtype;
  v_owner_org_id uuid;
  v_is_owner boolean := false;
begin
  if v_email = '' then
    return;
  end if;

  if to_regclass('public.software_owner_emails') is not null then
    execute 'select exists (select 1 from public.software_owner_emails where lower(email) = $1)'
      using v_email
      into v_is_owner;
  end if;

  if v_is_owner or v_username = 'vasavinexus' then
    select id into v_owner_org_id
    from public.organizations
    where name = 'SivaCare Software Owner'
    limit 1;

    if v_owner_org_id is null then
      insert into public.organizations(name, clinic_name, pharmacy_name)
      values ('SivaCare Software Owner', 'SivaCare Software Owner', 'SivaCare Platform')
      returning id into v_owner_org_id;
    end if;

    insert into public.profiles(id, organization_id, full_name, role, username, active)
    values (
      p_user_id,
      v_owner_org_id,
      coalesce(nullif(trim(p_metadata->>'full_name'), ''), v_username),
      'software_owner',
      v_username,
      true
    )
    on conflict (id) do update set
      organization_id = excluded.organization_id,
      full_name = excluded.full_name,
      role = excluded.role,
      username = excluded.username,
      active = true,
      updated_at = now();

    return;
  end if;

  select * into v_invite
  from public.user_invites
  where active = true
    and (
      lower(coalesce(login_email, '')) = v_email
      or lower(email) = v_email
      or lower(coalesce(username, '')) = v_username
    )
  order by created_at desc
  limit 1;

  if v_invite.id is null then
    return;
  end if;

  insert into public.profiles(id, organization_id, full_name, role, username, active)
  values (
    p_user_id,
    v_invite.organization_id,
    coalesce(nullif(trim(v_invite.full_name), ''), v_username),
    v_invite.role,
    coalesce(nullif(v_invite.username, ''), v_username),
    true
  )
  on conflict (id) do update set
    organization_id = excluded.organization_id,
    full_name = excluded.full_name,
    role = excluded.role,
    username = excluded.username,
    active = true,
    updated_at = now();

  if v_invite.doctor_id is not null then
    update public.doctors
    set profile_id = p_user_id
    where id = v_invite.doctor_id;
  end if;

  update public.user_invites
  set accepted_by = p_user_id,
      accepted_at = coalesce(accepted_at, now()),
      login_email = v_email,
      email = v_email
  where id = v_invite.id;
end;
$$;

create or replace function public.handle_new_auth_user_safe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.complete_auth_user_profile(new.id, new.email, new.raw_user_meta_data);
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user_safe();

create or replace function public.ensure_current_user_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user auth.users%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_user
  from auth.users
  where id = auth.uid();

  if v_user.id is null then
    raise exception 'Auth user not found';
  end if;

  perform public.complete_auth_user_profile(v_user.id, v_user.email, v_user.raw_user_meta_data);
end;
$$;

grant execute on function public.ensure_current_user_profile() to anon, authenticated;

create or replace function public.update_profile_login_json(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
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

  if v_password <> '' then
    update auth.users
    set encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf', 10)),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        email = public.login_email_for_username(v_username),
        phone_change = '',
        phone_change_token = '',
        email_change_token_current = '',
        reauthentication_token = '',
        updated_at = now()
    where id = v_profile_id;
  end if;

  if v_invite_id is not null then
    update public.user_invites
    set username = v_username,
        email = public.login_email_for_username(v_username),
        login_email = public.login_email_for_username(v_username),
        password_hash = case when v_password = '' then password_hash else extensions.crypt(v_password, extensions.gen_salt('bf', 10)) end,
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
      case when v_password = '' then null else extensions.crypt(v_password, extensions.gen_salt('bf', 10)) end,
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

create or replace function public.update_invite_login_json(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
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
      password_hash = case when v_password = '' then password_hash else extensions.crypt(v_password, extensions.gen_salt('bf', 10)) end,
      full_name = coalesce(nullif(trim(v_full_name), ''), full_name),
      role = v_role,
      active = v_active
  where id = v_invite_id;

  if v_invite.accepted_by is not null and v_password <> '' then
    update auth.users
    set encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf', 10)),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        email = public.login_email_for_username(v_username),
        phone_change = '',
        phone_change_token = '',
        email_change_token_current = '',
        reauthentication_token = '',
        updated_at = now()
    where id = v_invite.accepted_by;
  end if;
end;
$$;

grant execute on function public.update_invite_login_json(jsonb) to anon, authenticated;

-- Run force_sync_vinoth_to_match_vasavinexus to immediately fix vinoth
select public.force_sync_vinoth_to_match_vasavinexus();

select pg_notify('pgrst', 'reload schema');
