-- Stage 2 verification queries.
-- These queries are read-only.

-- 1. Confirm the five application tables exist and RLS is enabled.
select
  tablename,
  rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public'
  and tablename in (
    'hosts',
    'visitor_profiles',
    'visits',
    'staff_profiles',
    'audit_events'
  )
order by tablename;

-- 2. List all application RLS policies.
select
  tablename,
  policyname,
  roles,
  cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3. Confirm the required indexes exist.
select
  tablename,
  indexname
from pg_indexes
where schemaname = 'public'
  and tablename in ('visitor_profiles', 'visits')
order by tablename, indexname;

-- 4. Confirm the application functions exist.
select
  routine_name,
  routine_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'is_active_staff',
    'is_admin',
    'register_first_visit',
    'set_updated_at'
  )
order by routine_name;

-- 5. Confirm only invented host seed records are present.
select id, full_name, department, active
from public.hosts
order by full_name;

-- 6. Confirm no visitor or visit records have been inserted during setup.
select
  (select count(*) from public.visitor_profiles) as visitor_profile_count,
  (select count(*) from public.visits) as visit_count;
