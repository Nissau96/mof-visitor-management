-- ------------------------------------------------------------
-- Returning check-in can fill in a missing organisation or email
-- ------------------------------------------------------------
-- A returning visitor whose profile has no organisation or email
-- may add them while checking in. Values are only written where the
-- profile is still empty; an existing organisation or email is
-- never replaced. The check-in itself is unchanged and runs in the
-- same transaction.

begin;

create or replace function public.register_return_visit_with_profile(
  p_visitor_id uuid,
  p_verification_token_id uuid,
  p_token_expires_at timestamp with time zone,
  p_destination_agency text,
  p_destination_division text,
  p_person_visiting text,
  p_purpose text,
  p_meeting_id uuid,
  p_custom_meeting_title text,
  p_consent_version text,
  p_organization text,
  p_email text
)
returns table (
  visit_id uuid,
  reference_code text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_organization text :=
    nullif(btrim(coalesce(p_organization, '')), '');

  v_email text :=
    lower(nullif(btrim(coalesce(p_email, '')), ''));
begin
  if v_organization is not null
    and char_length(v_organization) > 160
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid organisation';
  end if;

  if v_email is not null
    and (
      char_length(v_email) > 254
      or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid email address';
  end if;

  return query
  select
    registered.visit_id,
    registered.reference_code
  from public.register_return_visit(
    p_visitor_id,
    p_verification_token_id,
    p_token_expires_at,
    p_destination_agency,
    p_destination_division,
    p_person_visiting,
    p_purpose,
    p_meeting_id,
    p_custom_meeting_title,
    p_consent_version
  ) as registered;

  -- Fill gaps only.
  if v_organization is not null or v_email is not null then
    update public.visitor_profiles as profile
    set
      organization = coalesce(
        nullif(btrim(profile.organization), ''),
        v_organization
      ),
      email = coalesce(
        nullif(btrim(profile.email), ''),
        v_email
      )
    where profile.id = p_visitor_id;
  end if;
end;
$function$;

revoke execute
  on function public.register_return_visit_with_profile(
    uuid, uuid, timestamp with time zone, text, text, text, text,
    uuid, text, text, text, text
  )
  from public, anon, authenticated;

grant execute
  on function public.register_return_visit_with_profile(
    uuid, uuid, timestamp with time zone, text, text, text, text,
    uuid, text, text, text, text
  )
  to service_role;

notify pgrst, 'reload schema';

commit;
