create table if not exists public.software_owner_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

insert into public.software_owner_emails(email)
values ('vasavinexus@gmail.com')
on conflict (email) do nothing;

create table if not exists public.user_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  full_name text not null,
  role public.app_role not null,
  doctor_id uuid references public.doctors(id),
  active boolean not null default true,
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table if not exists public.page_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  page_key text not null,
  allowed boolean not null default true,
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (organization_id, profile_id, page_key)
);

alter table public.user_invites enable row level security;
alter table public.page_permissions enable row level security;

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

create or replace function public.current_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(auth.jwt()->>'email')
$$;

drop policy if exists organizations_tenant_select on public.organizations;
create policy organizations_tenant_select on public.organizations for select using (
  id = public.current_organization_id() or public.is_software_owner()
);
drop policy if exists organizations_owner_insert on public.organizations;
create policy organizations_owner_insert on public.organizations for insert with check (public.is_software_owner());
drop policy if exists organizations_owner_update on public.organizations;
create policy organizations_owner_update on public.organizations for update using (public.is_software_owner()) with check (public.is_software_owner());

drop policy if exists profiles_tenant_select on public.profiles;
create policy profiles_tenant_select on public.profiles for select using (
  organization_id = public.current_organization_id() or public.is_software_owner()
);

drop policy if exists user_invites_select on public.user_invites;
create policy user_invites_select on public.user_invites for select using (
  organization_id = public.current_organization_id() or public.is_software_owner()
);
drop policy if exists user_invites_insert on public.user_invites;
create policy user_invites_insert on public.user_invites for insert with check (
  public.is_software_owner()
  or (organization_id = public.current_organization_id() and public.current_role() = 'admin'::public.app_role)
);
drop policy if exists user_invites_update on public.user_invites;
create policy user_invites_update on public.user_invites for update using (
  public.is_software_owner()
  or (organization_id = public.current_organization_id() and public.current_role() = 'admin'::public.app_role)
) with check (
  public.is_software_owner()
  or (organization_id = public.current_organization_id() and public.current_role() = 'admin'::public.app_role)
);

drop policy if exists page_permissions_select on public.page_permissions;
create policy page_permissions_select on public.page_permissions for select using (
  organization_id = public.current_organization_id() or public.is_software_owner()
);
drop policy if exists page_permissions_write on public.page_permissions;
create policy page_permissions_write on public.page_permissions for all using (
  public.is_software_owner()
  or (organization_id = public.current_organization_id() and public.current_role() = 'admin'::public.app_role)
) with check (
  public.is_software_owner()
  or (organization_id = public.current_organization_id() and public.current_role() = 'admin'::public.app_role)
);

create or replace function public.create_clinic_with_admin(
  p_clinic_name text,
  p_admin_email text,
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
begin
  if not public.is_software_owner() then raise exception 'Only the software owner can create clinics'; end if;

  insert into public.organizations(name, clinic_name, pharmacy_name, phone)
  values (trim(p_clinic_name), trim(p_clinic_name), trim(p_clinic_name) || ' Pharmacy', nullif(trim(p_phone), ''))
  returning id into v_org_id;

  insert into public.user_invites(organization_id, email, full_name, role, created_by)
  values (v_org_id, lower(trim(p_admin_email)), coalesce(nullif(trim(p_admin_name), ''), lower(trim(p_admin_email))), 'admin', auth.uid());

  return v_org_id;
end;
$$;

revoke all on function public.create_clinic_with_admin(text,text,text,text) from public;
grant execute on function public.create_clinic_with_admin(text,text,text,text) to authenticated;

create or replace function public.upsert_user_invite(
  p_email text,
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
begin
  if public.current_role() <> 'admin'::public.app_role and not public.is_software_owner() then
    raise exception 'Only clinic admins can create logins';
  end if;

  insert into public.user_invites(organization_id, email, full_name, role, doctor_id, created_by)
  values (public.current_organization_id(), lower(trim(p_email)), trim(p_full_name), p_role, p_doctor_id, auth.uid())
  on conflict (organization_id, email) do update set
    full_name = excluded.full_name,
    role = excluded.role,
    doctor_id = excluded.doctor_id,
    active = true
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.upsert_user_invite(text,text,public.app_role,uuid) from public;
grant execute on function public.upsert_user_invite(text,text,public.app_role,uuid) to authenticated;

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

revoke all on function public.set_page_permissions(uuid,text[]) from public;
grant execute on function public.set_page_permissions(uuid,text[]) to authenticated;

create or replace function public.bootstrap_current_user(p_organization_name text, p_full_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Clinic creation is owner controlled. Ask the software owner or clinic admin to create your login.';
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(new.email);
  v_invite public.user_invites%rowtype;
  v_owner_org_id uuid;
begin
  if exists (select 1 from public.software_owner_emails where email = v_email) then
    select id into v_owner_org_id from public.organizations where name = 'SivaCare Software Owner' limit 1;
    if v_owner_org_id is null then
      insert into public.organizations(name, clinic_name, pharmacy_name)
      values ('SivaCare Software Owner', 'SivaCare Software Owner', 'SivaCare Platform')
      returning id into v_owner_org_id;
    end if;
    insert into public.profiles(id, organization_id, full_name, role, active)
    values (new.id, v_owner_org_id, coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), new.email), 'software_owner', true);
    return new;
  end if;

  select * into v_invite
  from public.user_invites
  where email = v_email and active = true and accepted_by is null
  order by created_at desc
  limit 1;

  if v_invite.id is null then return new; end if;

  insert into public.profiles(id, organization_id, full_name, role, active)
  values (new.id, v_invite.organization_id, v_invite.full_name, v_invite.role, true);

  if v_invite.doctor_id is not null then
    update public.doctors set profile_id = new.id where id = v_invite.doctor_id;
  end if;

  update public.user_invites set accepted_by = new.id, accepted_at = now()
  where id = v_invite.id;

  return new;
end;
$$;
