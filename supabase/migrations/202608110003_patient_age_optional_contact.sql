alter table public.patients
  add column if not exists age integer;

alter table public.patients
  alter column mobile drop not null,
  alter column address drop not null;

alter table public.patients
  drop constraint if exists patients_age_check;

alter table public.patients
  add constraint patients_age_check check (age is null or age between 0 and 150);

comment on column public.patients.age is 'Patient age in completed years when date of birth is not collected';
