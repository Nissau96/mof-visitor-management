-- ------------------------------------------------------------
-- Guests inherit the lead visitor's organisation
-- ------------------------------------------------------------
-- Guests registered with a group visit are recorded under the
-- lead visitor's organisation. A guest whose profile already has
-- an organisation keeps it. Guests registered before this change
-- are filled in from their most recent lead.

create or replace function public.register_first_visit_with_guests(
  p_full_name text,
  p_phone text,
  p_email text,
  p_organization text,
  p_destination_agency text,
  p_destination_division text,
  p_person_visiting text,
  p_purpose text,
  p_meeting_id uuid,
  p_custom_meeting_title text,
  p_consent_version text,
  p_guests jsonb default '[]'::jsonb
)
returns table (
  visitor_id uuid,
  reference_code text,
  guest_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_guests jsonb := coalesce(p_guests, '[]'::jsonb);
  v_guest jsonb;
  v_guest_number integer;
  v_guest_name text;
  v_guest_phone text;
  v_guest_profile_id uuid;
  v_lead_visitor_id uuid;
  v_lead_reference text;
  v_lead_visit public.visits%rowtype;
  v_lead_organization text;
begin
  if jsonb_typeof(v_guests) <> 'array'
    or jsonb_array_length(v_guests) > 9
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid guest list';
  end if;

  -- Validate every guest before anything is written.
  for v_guest, v_guest_number in
    select guest.value, guest.ordinality::integer + 1
    from jsonb_array_elements(v_guests)
      with ordinality as guest(value, ordinality)
  loop
    v_guest_name := btrim(coalesce(v_guest ->> 'fullName', ''));
    v_guest_phone := btrim(coalesce(v_guest ->> 'phone', ''));

    if char_length(v_guest_name) not between 2 and 120 then
      raise exception using
        errcode = '22023',
        message = 'Invalid guest name';
    end if;

    if v_guest_phone !~ '^\+[1-9][0-9]{7,14}$'
      or v_guest_phone = p_phone
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid guest phone';
    end if;
  end loop;

  if (
    select count(distinct guest ->> 'phone')
    from jsonb_array_elements(v_guests) as guest
  ) <> jsonb_array_length(v_guests) then
    raise exception using
      errcode = '22023',
      message = 'Duplicate guest phone';
  end if;

  select registered.visitor_id, registered.reference_code
  into v_lead_visitor_id, v_lead_reference
  from public.register_first_visit(
    p_full_name,
    p_phone,
    p_email,
    p_organization,
    p_destination_agency,
    p_destination_division,
    p_person_visiting,
    p_purpose,
    p_meeting_id,
    p_custom_meeting_title,
    p_consent_version
  ) as registered;

  select *
  into v_lead_visit
  from public.visits as visit
  where visit.reference_code = v_lead_reference;

  -- Guests are recorded under the lead's organisation, if one was given.
  select nullif(btrim(profile.organization), '')
  into v_lead_organization
  from public.visitor_profiles as profile
  where profile.id = v_lead_visitor_id;

  for v_guest, v_guest_number in
    select guest.value, guest.ordinality::integer + 1
    from jsonb_array_elements(v_guests)
      with ordinality as guest(value, ordinality)
  loop
    v_guest_name := btrim(v_guest ->> 'fullName');
    v_guest_phone := btrim(v_guest ->> 'phone');

    insert into public.visitor_profiles (
      full_name,
      phone,
      organization,
      consent_version,
      consented_at
    )
    values (
      v_guest_name,
      v_guest_phone,
      v_lead_organization,
      p_consent_version,
      now()
    )
    on conflict (phone) do nothing
    returning id into v_guest_profile_id;

    if v_guest_profile_id is null then
      select profile.id
      into v_guest_profile_id
      from public.visitor_profiles as profile
      where profile.phone = v_guest_phone;
    end if;

    if exists (
      select 1
      from public.visits as active_visit
      where active_visit.visitor_id = v_guest_profile_id
        and active_visit.status in (
          'pending_admission',
          'checked_in'
        )
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'GUEST_ALREADY_CHECKED_IN:' || v_guest_number;
    end if;

    -- A returning guest keeps an organisation they gave before.
    if v_lead_organization is not null then
      update public.visitor_profiles as profile
      set organization = v_lead_organization
      where profile.id = v_guest_profile_id
        and nullif(btrim(profile.organization), '') is null;
    end if;

    insert into public.visits (
      visitor_id,
      host_id,
      destination_agency,
      destination_division,
      person_visiting,
      purpose,
      meeting_id,
      custom_meeting_title,
      reference_code,
      status,
      group_lead_visit_id
    )
    values (
      v_guest_profile_id,
      null,
      v_lead_visit.destination_agency,
      v_lead_visit.destination_division,
      v_lead_visit.person_visiting,
      v_lead_visit.purpose,
      v_lead_visit.meeting_id,
      v_lead_visit.custom_meeting_title,
      v_lead_reference || '-' || v_guest_number,
      'checked_in',
      v_lead_visit.id
    );
  end loop;

  return query
  select
    v_lead_visitor_id,
    v_lead_reference,
    jsonb_array_length(v_guests);
end;
$function$;

-- ------------------------------------------------------------
-- Fill in guests registered before this change
-- ------------------------------------------------------------

update public.visitor_profiles as guest_profile
set organization = latest_lead.organization
from (
  select distinct on (guest_visit.visitor_id)
    guest_visit.visitor_id,
    btrim(lead_profile.organization) as organization
  from public.visits as guest_visit
  join public.visits as lead_visit
    on lead_visit.id = guest_visit.group_lead_visit_id
  join public.visitor_profiles as lead_profile
    on lead_profile.id = lead_visit.visitor_id
  where nullif(btrim(lead_profile.organization), '') is not null
  order by guest_visit.visitor_id, guest_visit.created_at desc
) as latest_lead
where guest_profile.id = latest_lead.visitor_id
  and nullif(btrim(guest_profile.organization), '') is null;

notify pgrst, 'reload schema';
