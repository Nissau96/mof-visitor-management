begin;

-- ============================================================
-- Booked meetings need a real host division
-- ============================================================
-- Guests of an approved booking become pending visits on the meeting
-- day, and a Ministry of Finance visit must name one of its divisions.
-- "Ministry Headquarters" is a valid host for meetings created by
-- reception, but a booking hosted there could never open its guests,
-- so bookings now refuse it (and a missing division).

create or replace function public.submit_meeting_booking(
  p_booker_oid text,
  p_booker_email text,
  p_booker_name text,
  p_title text,
  p_meeting_date date,
  p_starts_at time,
  p_ends_at time,
  p_host_agency text,
  p_host_division text,
  p_venue text,
  p_notes text,
  p_guests jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_booking public.meeting_bookings%rowtype;
  v_division text := nullif(btrim(coalesce(p_host_division, '')), '');
  v_starts timestamp with time zone;
  v_reference text;
  v_guest jsonb;
  v_position integer := 0;
begin
  if p_meeting_date is null or p_starts_at is null or p_ends_at is null then
    raise exception using
      errcode = '22023',
      message = 'Choose the meeting date, start time and end time.';
  end if;

  v_starts := public.meeting_booking_starts(p_meeting_date, p_starts_at);

  if v_starts < now() + interval '2 hours' then
    raise exception using
      errcode = '22023',
      message = 'Book the meeting at least 2 hours before it starts.';
  end if;

  if p_meeting_date > (now() at time zone 'Africa/Accra')::date + 90 then
    raise exception using
      errcode = '22023',
      message = 'Meetings can be booked up to 90 days ahead.';
  end if;

  if p_host_agency <> 'Ministry of Finance (MoF)' then
    v_division := null;
  elsif v_division is null or v_division = 'Ministry Headquarters' then
    -- Each guest becomes a visit, and a Ministry visit must name a
    -- real division.
    raise exception using
      errcode = '22023',
      message = 'Select the division hosting the meeting.';
  end if;

  perform public.validate_meeting_booking_guests(coalesce(p_guests, '[]'::jsonb));

  if (
    select count(*)
    from public.meeting_bookings as booking
    where booking.booker_oid = p_booker_oid
      and booking.status = 'pending'
  ) >= 10 then
    raise exception using
      errcode = '55000',
      message = 'You already have 10 requests waiting for approval. Wait for reception to answer them first.';
  end if;

  for attempt in 1..5 loop
    v_reference := 'MTG-' || upper(encode(extensions.gen_random_bytes(3), 'hex'));

    begin
      insert into public.meeting_bookings (
        reference_code, booker_oid, booker_email, booker_name, title,
        meeting_date, starts_at, ends_at, tower, host_agency,
        host_division, venue, notes, consent_confirmed_at
      )
      values (
        v_reference,
        p_booker_oid,
        lower(btrim(p_booker_email)),
        btrim(p_booker_name),
        btrim(coalesce(p_title, '')),
        p_meeting_date,
        p_starts_at,
        p_ends_at,
        public.tower_for_destination(p_host_agency, v_division),
        btrim(p_host_agency),
        v_division,
        nullif(btrim(coalesce(p_venue, '')), ''),
        nullif(btrim(coalesce(p_notes, '')), ''),
        now()
      )
      returning * into v_booking;

      exit;
    exception
      when unique_violation then
        if attempt = 5 then
          raise;
        end if;
      when check_violation then
        raise exception using
          errcode = '22023',
          message = 'Check the meeting title, times, host and venue.';
    end;
  end loop;

  for v_guest in select value from jsonb_array_elements(coalesce(p_guests, '[]'::jsonb))
  loop
    v_position := v_position + 1;

    insert into public.meeting_booking_guests (
      booking_id, position, full_name, phone, organization, email
    )
    values (
      v_booking.id,
      v_position,
      btrim(v_guest ->> 'fullName'),
      v_guest ->> 'phone',
      nullif(btrim(coalesce(v_guest ->> 'organization', '')), ''),
      nullif(lower(btrim(coalesce(v_guest ->> 'email', ''))), '')
    );
  end loop;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, details)
  values (
    null,
    'meeting_booking.submitted',
    'meeting_booking',
    v_booking.id::text,
    jsonb_build_object(
      'referenceCode', v_booking.reference_code,
      'bookerEmail', v_booking.booker_email,
      'tower', v_booking.tower,
      'guestCount', v_position
    )
  );

  return public.meeting_booking_json(v_booking);
end;
$function$;

notify pgrst, 'reload schema';

commit;
