do $`$ 
begin
  if to_regclass('public.organizations') is not null then
    alter table public.organizations
      add column if not exists groq_api_key text;
  end if;
end $`$;