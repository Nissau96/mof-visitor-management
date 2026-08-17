create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table public.hosts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 2 and 120),
  department text not null check (char_length(department) between 2 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.visitor_profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text not null unique,
  email text,
  organization text,
  consent_version text not null,
  consented_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger visitor_profiles_set_updated_at
before update on public.visitor_profiles
for each row execute function public.set_updated_at();

create type public.visit_status as enum ('checked_in', 'checked_out', 'cancelled');
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitor_profiles(id) on delete restrict,
  host_id uuid not null references public.hosts(id) on delete restrict,
  purpose text not null check (char_length(purpose) between 2 and 500),
  vehicle_registration text,
  reference_code text not null unique,
  status public.visit_status not null default 'checked_in',
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  created_at timestamptz not null default now(),
  constraint checkout_after_checkin check (checked_out_at is null or checked_out_at >= checked_in_at)
);

create table public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('receptionist', 'admin')),
  active boolean not null default true
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index visitor_profiles_name_idx on public.visitor_profiles using gin (full_name gin_trgm_ops);
create index visits_checked_in_at_idx on public.visits (checked_in_at desc);
create index visits_status_idx on public.visits (status);

alter table public.hosts enable row level security;
alter table public.visitor_profiles enable row level security;
alter table public.visits enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.audit_events enable row level security;

create or replace function public.is_active_staff()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.staff_profiles where user_id = auth.uid() and active); $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.staff_profiles where user_id = auth.uid() and active and role = 'admin'); $$;

create policy "staff read hosts" on public.hosts for select to authenticated using (public.is_active_staff());
create policy "admins manage hosts" on public.hosts for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "staff read visitors" on public.visitor_profiles for select to authenticated using (public.is_active_staff());
create policy "staff read visits" on public.visits for select to authenticated using (public.is_active_staff());
create policy "staff update visits" on public.visits for update to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create policy "staff read own profile" on public.staff_profiles for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "staff read audit" on public.audit_events for select to authenticated using (public.is_admin());

revoke all on public.visitor_profiles, public.visits, public.audit_events from anon;

create or replace function public.register_first_visit(
  p_full_name text,
  p_phone text,
  p_email text,
  p_organization text,
  p_host_id uuid,
  p_purpose text,
  p_vehicle_registration text,
  p_consent_version text
)
returns table (visitor_id uuid, reference_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_visitor_id uuid;
  new_reference text := 'VIS-' || upper(encode(gen_random_bytes(3), 'hex'));
begin
  if not exists (select 1 from public.hosts where id = p_host_id and active) then
    raise exception 'Host is unavailable';
  end if;

  insert into public.visitor_profiles
    (full_name, phone, email, organization, consent_version, consented_at)
  values
    (p_full_name, p_phone, nullif(p_email, ''), nullif(p_organization, ''), p_consent_version, now())
  returning id into new_visitor_id;

  insert into public.visits
    (visitor_id, host_id, purpose, vehicle_registration, reference_code, status)
  values
    (new_visitor_id, p_host_id, p_purpose, nullif(p_vehicle_registration, ''), new_reference, 'checked_in');

  return query select new_visitor_id, new_reference;
end;
$$;

revoke all on function public.register_first_visit(text, text, text, text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.register_first_visit(text, text, text, text, uuid, text, text, text) to service_role;
