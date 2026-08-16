begin;

-- ============================================================
-- Stage 12: Returning-visitor privacy acknowledgement
-- ============================================================
-- Adds a backward-compatible register_return_visit overload
-- accepting the current privacy-notice version.
--
-- The existing nine-parameter function remains temporarily
-- available so the currently deployed API continues to work
-- while the updated application is being deployed.
--
-- After production verification, a subsequent migration will
-- remove the old signature.
-- ============================================================

create or replace function public.register_return_visit(
  p_visitor_id uuid,
  p_verification_token_id uuid,
  p_token_expires_at timestamp with time zone,
  p_destination_agency text,
  p_destination_division text,
  p_person_visiting text,
  p_purpose text,
  p_meeting_id uuid,
  p_custom_meeting_title text,
  p_consent_version text
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
  v_now timestamp with time zone := now();
  v_visit_id uuid;
  v_reference_code text;
  v_consent_version text :=
    btrim(
      coalesce(
        p_consent_version,
        ''
      )
    );
begin
  if v_consent_version <> '2.0' then
    raise exception using
      errcode = '22023',
      message =
        'The current privacy notice must be acknowledged';
  end if;

  select
    registered_visit.visit_id,
    registered_visit.reference_code
  into
    v_visit_id,
    v_reference_code
  from public.register_return_visit(
    p_visitor_id,
    p_verification_token_id,
    p_token_expires_at,
    p_destination_agency,
    p_destination_division,
    p_person_visiting,
    p_purpose,
    p_meeting_id,
    p_custom_meeting_title
  ) as registered_visit;

  if not found
    or v_visit_id is null
    or v_reference_code is null
  then
    raise exception using
      errcode = 'P0001',
      message =
        'RETURN_VISIT_REGISTRATION_FAILED';
  end if;

  update public.visitor_profiles
  set
    consent_version = v_consent_version,
    consented_at = v_now
  where id = p_visitor_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message =
        'PRIVACY_ACKNOWLEDGEMENT_FAILED';
  end if;

  return query
  select
    v_visit_id,
    v_reference_code;
end;
$function$;

revoke execute
  on function public.register_return_visit(
    uuid,
    uuid,
    timestamp with time zone,
    text,
    text,
    text,
    text,
    uuid,
    text,
    text
  )
  from public, anon, authenticated;

grant execute
  on function public.register_return_visit(
    uuid,
    uuid,
    timestamp with time zone,
    text,
    text,
    text,
    text,
    uuid,
    text,
    text
  )
  to service_role;

commit;