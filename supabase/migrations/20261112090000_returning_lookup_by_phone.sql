-- ------------------------------------------------------------
-- Returning visitors look up their record by mobile number
-- ------------------------------------------------------------
-- The name search listed masked records of other visitors. A
-- returning visitor now enters their mobile number and first name;
-- the server finds the profile by phone and returns it only when the
-- first name matches. The name search and the record-id check it
-- fed are removed.

begin;

create or replace function public.find_returning_visitor_by_phone(
  p_phone text
)
returns table (
  visitor_id uuid,
  full_name text,
  email text,
  organization text
)
language sql
security definer
stable
set search_path = ''
as $function$
  select
    profile.id,
    profile.full_name,
    profile.email,
    profile.organization
  from public.visitor_profiles as profile
  where profile.phone = p_phone
  limit 1;
$function$;

revoke execute
  on function public.find_returning_visitor_by_phone(text)
  from public, anon, authenticated;

grant execute
  on function public.find_returning_visitor_by_phone(text)
  to service_role;

drop function if exists public.search_returning_visitors(text, integer);
drop function if exists public.verify_returning_visitor(uuid, text);

notify pgrst, 'reload schema';

commit;
