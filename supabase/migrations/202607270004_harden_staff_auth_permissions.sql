begin;

-- Anonymous visitors do not require direct access to staff profiles.
revoke all
on table public.staff_profiles
from public, anon;

-- Authenticated users need SELECT so RLS can return only their
-- authorised profile. Administrative writes will be added during
-- the staff-administration stage.
grant select
on table public.staff_profiles
to authenticated;

-- Trusted Vercel Functions may validate staff authorisation through
-- the server-side Supabase client.
grant select, insert, update, delete
on table public.staff_profiles
to service_role;

-- Staff-role helper functions are required only by authenticated
-- users, RLS policies and trusted server-side operations.
revoke all
on function public.is_active_staff()
from public, anon;

revoke all
on function public.is_admin()
from public, anon;

grant execute
on function public.is_active_staff()
to authenticated, service_role;

grant execute
on function public.is_admin()
to authenticated, service_role;

commit;