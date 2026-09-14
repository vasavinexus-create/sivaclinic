-- Fix GoTrue 500 "Database error querying schema" on signInWithPassword
-- Root cause: GoTrue Go scanner fails when string fields are NULL instead of ''
-- Run this ONCE in Supabase SQL Editor

update auth.users
set
  confirmation_token     = coalesce(confirmation_token, ''),
  recovery_token         = coalesce(recovery_token, ''),
  email_change           = coalesce(email_change, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change           = coalesce(phone_change, ''),
  phone_change_token     = coalesce(phone_change_token, ''),
  reauthentication_token = coalesce(reauthentication_token, ''),
  email_change_confirm_status = coalesce(email_change_confirm_status, 0),
  is_sso_user            = coalesce(is_sso_user, false),
  raw_app_meta_data      = coalesce(raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb),
  email_confirmed_at     = coalesce(email_confirmed_at, now()),
  updated_at             = now()
where lower(email) like '%.sivacare@gmail.com';

-- Confirm the fix
select id, email, confirmation_token, recovery_token, email_change, email_change_token_new
from auth.users
where lower(email) like '%.sivacare@gmail.com';
