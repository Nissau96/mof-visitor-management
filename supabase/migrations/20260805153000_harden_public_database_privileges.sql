begin;

-- ============================================================
-- Stage 12: Public database privilege hardening
-- ============================================================
-- Application database operations are performed by trusted
-- Vercel Functions using service_role.
--
-- pg_trgm is intentionally not modified because it is owned by
-- Supabase's internal supabase_admin role.
-- ============================================================


-- ============================================================
-- 1. Harden SECURITY DEFINER search paths
-- ============================================================
-- pg_catalog is searched first.
-- public and extensions contain trusted database objects.
-- pg_temp is explicitly placed last to prevent temporary-object
-- shadowing.
--
-- Functions already using an empty search_path remain unchanged.
-- ============================================================

alter function public.checkout_visit(uuid, uuid)
  set search_path = pg_catalog, public, extensions, pg_temp;

alter function public.create_invited_staff_profile(
  uuid,
  uuid,
  text,
  text
)
  set search_path = pg_catalog, public, extensions, pg_temp;

alter function public.get_admin_hosts(
  integer,
  integer,
  text,
  text
)
  set search_path = pg_catalog, public, extensions, pg_temp;

alter function public.get_admin_staff(
  integer,
  integer,
  text,
  text,
  text
)
  set search_path = pg_catalog, public, extensions, pg_temp;

alter function public.get_available_meetings(date)
  set search_path = pg_catalog, public, extensions, pg_temp;

alter function public.get_reception_dashboard(
  integer,
  integer,
  text,
  text,
  text
)
  set search_path = pg_catalog, public, extensions, pg_temp;

alter function public.get_visit_history(
  integer,
  integer,
  text,
  text,
  text,
  text,
  date,
  date
)
  set search_path = pg_catalog, public, extensions, pg_temp;

alter function public.is_active_staff()
  set search_path = pg_catalog, public, extensions, pg_temp;

alter function public.is_admin()
  set search_path = pg_catalog, public, extensions, pg_temp;

alter function public.register_first_visit(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  uuid,
  text,
  text
)
  set search_path = pg_catalog, public, extensions, pg_temp;

alter function public.save_admin_host(
  uuid,
  uuid,
  text,
  text,
  boolean
)
  set search_path = pg_catalog, public, extensions, pg_temp;

alter function public.update_admin_staff(
  uuid,
  uuid,
  text,
  text,
  boolean
)
  set search_path = pg_catalog, public, extensions, pg_temp;


-- ============================================================
-- 2. Remove direct browser-role access to application tables
-- ============================================================

revoke all privileges
  on all tables in schema public
  from anon, authenticated;

revoke all privileges
  on all sequences in schema public
  from anon, authenticated;


-- ============================================================
-- 3. Restrict only postgres-owned application functions
-- ============================================================
-- Do not use:
--
--   REVOKE ... ON ALL FUNCTIONS IN SCHEMA public
--
-- because public also contains pg_trgm functions owned by
-- supabase_admin.
-- ============================================================

revoke execute
  on function
    public.checkout_visit(uuid, uuid),
    public.consume_public_rate_limit(text, integer, integer),
    public.create_invited_staff_profile(uuid, uuid, text, text),
    public.get_admin_hosts(integer, integer, text, text),
    public.get_admin_staff(integer, integer, text, text, text),
    public.get_available_meetings(date),
    public.get_reception_dashboard(
      integer,
      integer,
      text,
      text,
      text
    ),
    public.get_visit_history(
      integer,
      integer,
      text,
      text,
      text,
      text,
      date,
      date
    ),
    public.is_active_staff(),
    public.is_admin(),
    public.register_first_visit(
      text,
      text,
      text,
      text,
      text,
      text,
      text,
      text,
      uuid,
      text,
      text
    ),
    public.register_return_visit(
      uuid,
      uuid,
      timestamp with time zone,
      text,
      text,
      text,
      text,
      uuid,
      text
    ),
    public.save_admin_host(uuid, uuid, text, text, boolean),
    public.search_returning_visitors(text, integer),
    public.set_updated_at(),
    public.update_admin_staff(uuid, uuid, text, text, boolean),
    public.verify_returning_visitor(uuid, text)
  from public, anon, authenticated;


-- ============================================================
-- 4. Preserve trusted server access
-- ============================================================

grant all privileges
  on all tables in schema public
  to service_role;

grant all privileges
  on all sequences in schema public
  to service_role;

grant execute
  on function
    public.checkout_visit(uuid, uuid),
    public.consume_public_rate_limit(text, integer, integer),
    public.create_invited_staff_profile(uuid, uuid, text, text),
    public.get_admin_hosts(integer, integer, text, text),
    public.get_admin_staff(integer, integer, text, text, text),
    public.get_available_meetings(date),
    public.get_reception_dashboard(
      integer,
      integer,
      text,
      text,
      text
    ),
    public.get_visit_history(
      integer,
      integer,
      text,
      text,
      text,
      text,
      date,
      date
    ),
    public.is_active_staff(),
    public.is_admin(),
    public.register_first_visit(
      text,
      text,
      text,
      text,
      text,
      text,
      text,
      text,
      uuid,
      text,
      text
    ),
    public.register_return_visit(
      uuid,
      uuid,
      timestamp with time zone,
      text,
      text,
      text,
      text,
      uuid,
      text
    ),
    public.save_admin_host(uuid, uuid, text, text, boolean),
    public.search_returning_visitors(text, integer),
    public.set_updated_at(),
    public.update_admin_staff(uuid, uuid, text, text, boolean),
    public.verify_returning_visitor(uuid, text)
  to service_role;


-- ============================================================
-- 5. Preserve authenticated RLS helper execution
-- ============================================================
-- Existing RLS policies reference these two authorization
-- helpers. They return authorization-state booleans only.
-- ============================================================

grant execute
  on function public.is_active_staff()
  to authenticated;

grant execute
  on function public.is_admin()
  to authenticated;


-- ============================================================
-- 6. Harden future postgres-owned public objects
-- ============================================================
-- Supabase-managed default privileges belonging to
-- supabase_admin, storage, auth, graphql and realtime are not
-- changed.
-- ============================================================

alter default privileges
  for role postgres
  in schema public
  revoke all privileges
  on tables
  from public, anon, authenticated;

alter default privileges
  for role postgres
  in schema public
  revoke all privileges
  on sequences
  from public, anon, authenticated;

alter default privileges
  for role postgres
  in schema public
  revoke execute
  on functions
  from public, anon, authenticated;

alter default privileges
  for role postgres
  in schema public
  grant all privileges
  on tables
  to service_role;

alter default privileges
  for role postgres
  in schema public
  grant all privileges
  on sequences
  to service_role;

alter default privileges
  for role postgres
  in schema public
  grant execute
  on functions
  to service_role;

commit;