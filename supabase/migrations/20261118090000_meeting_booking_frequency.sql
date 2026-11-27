begin;

-- ============================================================
-- Meeting bookings can repeat
-- ============================================================
-- A booking can be for one day, a date range, or chosen weekdays
-- within a date range, as reception's own meetings are. Approving
-- one creates a meeting with the same schedule.
--
-- Guests are pre-registered for the first day the meeting happens
-- only. meeting_date now holds that first day, so expiry, guest
-- statuses and opening guests as pending admissions are unchanged.
-- On later days guests check in through the returning-visitor flow
-- with their mobile number and first name.
--
-- The guest list can change until the first day ends; the booking
-- can be cancelled until the last day ends.

alter table public.meeting_bookings
  add column if not exists schedule_type text not null default 'single',
  add column if not exists starts_on date,
  add column if not exists ends_on date,
  add column if not exists recurrence_days smallint[] not null
    default array[]::smallint[];

update public.meeting_bookings
set starts_on = meeting_date
where starts_on is null;

alter table public.meeting_bookings
  alter column starts_on set not null;

alter table public.meeting_bookings
  drop constraint if exists meeting_bookings_schedule_check;

alter table public.meeting_bookings
  add constraint meeting_bookings_schedule_check check (
    (
      schedule_type = 'single'
      and ends_on is null
      and cardinality(recurrence_days) = 0
      and meeting_date = starts_on
    )
    or (
      schedule_type = 'continuous'
      and ends_on is not null
      and ends_on >= starts_on
      and cardinality(recurrence_days) = 0
    )
    or (
      schedule_type = 'weekly'
      and ends_on is not null
      and ends_on >= starts_on
      and cardinality(recurrence_days) between 1 and 7
      and recurrence_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    )
  );

alter table public.meeting_bookings
  drop constraint if exists meeting_bookings_first_day_check;

alter table public.meeting_bookings
  add constraint meeting_bookings_first_day_check check (
    meeting_date between starts_on and coalesce(ends_on, starts_on)
  );

comment on column public.meeting_bookings.meeting_date is
  'First day the meeting happens. Guests are expected that day only.';

-- ------------------------------------------------------------
-- Schedule helpers
-- ------------------------------------------------------------

-- First day in the schedule that the meeting happens, or null when
-- none does (a weekly range without any of the chosen weekdays).
create or replace function public.meeting_booking_first_day(
  p_schedule_type text,
  p_starts_on date,
  p_ends_on date,
  p_recurrence_days smallint[]
)
returns date
language sql
immutable
set search_path = ''
as $function$
  select min(day::date)
  from generate_series(
    p_starts_on,
    coalesce(p_ends_on, p_starts_on),
    interval '1 day'
  ) as day
  where public.meeting_occurs_on(
    p_schedule_type,
    p_starts_on,
    p_ends_on,
    p_recurrence_days,
    day::date
  );
$function$;

-- Whether the booker can still change a booking. 'guests': the guest
-- list, until the first day ends. 'cancel': the whole booking, until
-- the last day ends. A request still waiting for reception can change
-- only until its meeting starts (it then expires).
create or replace function public.meeting_booking_changeable(
  p_booking public.meeting_bookings,
  p_purpose text
)
returns boolean
language sql
stable
set search_path = ''
as $function$
  select case
    when p_booking.status = 'pending' then
      public.meeting_booking_starts(p_booking.meeting_date, p_booking.starts_at) > now()
    when p_booking.status = 'approved' then
      (now() at time zone 'Africa/Accra')::date <= case
        when p_purpose = 'cancel'
          then coalesce(p_booking.ends_on, p_booking.meeting_date)
        else p_booking.meeting_date
      end
    else false
  end;
$function$;

create or replace function public.meeting_booking_json(
  p_booking public.meeting_bookings
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'bookingId', p_booking.id,
    'referenceCode', p_booking.reference_code,
    'status', p_booking.status,
    'bookerName', p_booking.booker_name,
    'bookerEmail', p_booking.booker_email,
    'title', p_booking.title,
    'meetingDate', p_booking.meeting_date,
    'scheduleType', p_booking.schedule_type,
    'startsOn', p_booking.starts_on,
    'endsOn', p_booking.ends_on,
    'recurrenceDays', to_jsonb(p_booking.recurrence_days),
    'lastDate', coalesce(p_booking.ends_on, p_booking.meeting_date),
    'canEditGuests', public.meeting_booking_changeable(p_booking, 'guests'),
    'canCancel', public.meeting_booking_changeable(p_booking, 'cancel'),
    'startsAt', to_char(p_booking.starts_at, 'HH24:MI'),
    'endsAt', to_char(p_booking.ends_at, 'HH24:MI'),
    'tower', p_booking.tower,
    'hostAgency', p_booking.host_agency,
    'hostDivision', p_booking.host_division,
    'venue', p_booking.venue,
    'notes', p_booking.notes,
    'meetingId', p_booking.meeting_id,
    'decisionReason', p_booking.decision_reason,
    'decidedAt', p_booking.decided_at,
    'cancelledAt', p_booking.cancelled_at,
    'createdAt', p_booking.created_at,
    'started',
      public.meeting_booking_starts(p_booking.meeting_date, p_booking.starts_at) <= now(),
    'guests', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'guestId', guest.id,
            'fullName', guest.full_name,
            'phone', guest.phone,
            'organization', guest.organization,
            'email', guest.email,
            'status', public.meeting_booking_guest_status(
              visit.status::text,
              visit.id is not null,
              p_booking.meeting_date
            )
          )
          order by guest.position
        )
        from public.meeting_booking_guests as guest
        left join public.visits as visit
          on visit.id = guest.visit_id
        where guest.booking_id = p_booking.id
          and guest.removed_at is null
      ),
      '[]'::jsonb
    )
  );
$function$;

-- ------------------------------------------------------------
-- Booker
-- ------------------------------------------------------------

drop function if exists public.submit_meeting_booking(
  text, text, text, text, date, time, time, text, text, text, text, jsonb
);

create or replace function public.submit_meeting_booking(
  p_booker_oid text,
  p_booker_email text,
  p_booker_name text,
  p_title text,
  p_schedule_type text,
  p_starts_on date,
  p_ends_on date,
  p_recurrence_days smallint[],
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
  v_schedule text := lower(btrim(coalesce(p_schedule_type, '')));
  v_ends_on date := p_ends_on;
  v_days smallint[] := array[]::smallint[];
  v_first_day date;
  v_starts timestamp with time zone;
  v_reference text;
  v_guest jsonb;
  v_position integer := 0;
begin
  if p_starts_on is null or p_starts_at is null or p_ends_at is null then
    raise exception using
      errcode = '22023',
      message = 'Choose the meeting date, start time and end time.';
  end if;

  if v_schedule not in ('single', 'continuous', 'weekly') then
    raise exception using
      errcode = '22023',
      message = 'Choose how often the meeting happens.';
  end if;

  if v_schedule = 'single' then
    v_ends_on := null;
  else
    if v_ends_on is null then
      raise exception using
        errcode = '22023',
        message = 'Choose the last day of the meeting.';
    end if;

    if v_ends_on < p_starts_on then
      raise exception using
        errcode = '22023',
        message = 'The last day cannot be before the first day.';
    end if;
  end if;

  if v_schedule = 'weekly' then
    select coalesce(array_agg(distinct day order by day), array[]::smallint[])
    into v_days
    from unnest(coalesce(p_recurrence_days, array[]::smallint[])) as day
    where day between 0 and 6;

    if cardinality(v_days) = 0 then
      raise exception using
        errcode = '22023',
        message = 'Select at least one day of the week.';
    end if;
  end if;

  -- Guests are expected on the first day the meeting happens only.
  v_first_day := public.meeting_booking_first_day(
    v_schedule, p_starts_on, v_ends_on, v_days
  );

  if v_first_day is null then
    raise exception using
      errcode = '22023',
      message = 'Choose at least one weekday that falls between the start and end dates.';
  end if;

  v_starts := public.meeting_booking_starts(v_first_day, p_starts_at);

  if v_starts < now() + interval '2 hours' then
    raise exception using
      errcode = '22023',
      message = 'Book the meeting at least 2 hours before it starts.';
  end if;

  if coalesce(v_ends_on, p_starts_on) > (now() at time zone 'Africa/Accra')::date + 90 then
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
        host_division, venue, notes, consent_confirmed_at,
        schedule_type, starts_on, ends_on, recurrence_days
      )
      values (
        v_reference,
        p_booker_oid,
        lower(btrim(p_booker_email)),
        btrim(p_booker_name),
        btrim(coalesce(p_title, '')),
        v_first_day,
        p_starts_at,
        p_ends_at,
        public.tower_for_destination(p_host_agency, v_division),
        btrim(p_host_agency),
        v_division,
        nullif(btrim(coalesce(p_venue, '')), ''),
        nullif(btrim(coalesce(p_notes, '')), ''),
        now(),
        v_schedule,
        p_starts_on,
        v_ends_on,
        v_days
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
      'scheduleType', v_booking.schedule_type,
      'guestCount', v_position
    )
  );

  return public.meeting_booking_json(v_booking);
end;
$function$;

create or replace function public.get_booker_meeting_bookings(
  p_booker_oid text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  return jsonb_build_object(
    'bookings',
    coalesce(
      (
        select jsonb_agg(
          public.meeting_booking_json(booking)
          order by booking.meeting_date desc, booking.starts_at desc, booking.created_at desc
        )
        from public.meeting_bookings as booking
        where booking.booker_oid = p_booker_oid
          and coalesce(booking.ends_on, booking.meeting_date)
            >= (now() at time zone 'Africa/Accra')::date - 90
      ),
      '[]'::jsonb
    )
  );
end;
$function$;

drop function if exists public.lock_booker_meeting_booking(text, uuid);

-- Locks a booking the booker owns and can still change for p_purpose.
create or replace function public.lock_booker_meeting_booking(
  p_booker_oid text,
  p_booking_id uuid,
  p_purpose text
)
returns public.meeting_bookings
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_booking public.meeting_bookings%rowtype;
begin
  select *
  into v_booking
  from public.meeting_bookings as booking
  where booking.id = p_booking_id
    and booking.booker_oid = p_booker_oid
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Booking not found';
  end if;

  if not public.meeting_booking_changeable(v_booking, p_purpose) then
    raise exception using
      errcode = '55000',
      message = 'This booking can no longer be changed.';
  end if;

  return v_booking;
end;
$function$;

create or replace function public.save_meeting_booking_guests(
  p_booker_oid text,
  p_booking_id uuid,
  p_guests jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_booking public.meeting_bookings%rowtype;
  v_guest jsonb;
  v_existing public.meeting_booking_guests%rowtype;
  v_next_position integer;
  v_arrived_name text;
begin
  v_booking := public.lock_booker_meeting_booking(p_booker_oid, p_booking_id, 'guests');

  perform public.validate_meeting_booking_guests(p_guests);

  select guest.full_name
  into v_arrived_name
  from public.meeting_booking_guests as guest
  join public.visits as visit on visit.id = guest.visit_id
  where guest.booking_id = v_booking.id
    and guest.removed_at is null
    and visit.status in ('checked_in', 'checked_out')
    and not exists (
      select 1
      from jsonb_array_elements(p_guests) as wanted
      where wanted ->> 'phone' = guest.phone
    )
  limit 1;

  if v_arrived_name is not null then
    raise exception using
      errcode = '55000',
      message = v_arrived_name || ' has already arrived and cannot be removed.';
  end if;

  -- Remove guests no longer listed.
  for v_existing in
    select guest.*
    from public.meeting_booking_guests as guest
    where guest.booking_id = v_booking.id
      and guest.removed_at is null
      and not exists (
        select 1
        from jsonb_array_elements(p_guests) as wanted
        where wanted ->> 'phone' = guest.phone
      )
  loop
    if v_existing.visit_id is not null then
      perform public.cancel_booking_guest_visit(
        v_existing.visit_id,
        'Removed from the meeting booking by the organiser.'
      );
    end if;

    update public.meeting_booking_guests
    set removed_at = now()
    where id = v_existing.id;
  end loop;

  select coalesce(max(guest.position), 0) + 1
  into v_next_position
  from public.meeting_booking_guests as guest
  where guest.booking_id = v_booking.id;

  for v_guest in select value from jsonb_array_elements(p_guests)
  loop
    select *
    into v_existing
    from public.meeting_booking_guests as guest
    where guest.booking_id = v_booking.id
      and guest.phone = v_guest ->> 'phone';

    if found then
      update public.meeting_booking_guests as guest
      set
        full_name = btrim(v_guest ->> 'fullName'),
        organization = nullif(btrim(coalesce(v_guest ->> 'organization', '')), ''),
        email = nullif(lower(btrim(coalesce(v_guest ->> 'email', ''))), ''),
        -- A guest added back after removal starts again.
        removed_at = null,
        visit_id = case
          when guest.removed_at is not null then null
          else guest.visit_id
        end
      where guest.id = v_existing.id;
    else
      insert into public.meeting_booking_guests (
        booking_id, position, full_name, phone, organization, email
      )
      values (
        v_booking.id,
        v_next_position,
        btrim(v_guest ->> 'fullName'),
        v_guest ->> 'phone',
        nullif(btrim(coalesce(v_guest ->> 'organization', '')), ''),
        nullif(lower(btrim(coalesce(v_guest ->> 'email', ''))), '')
      );

      v_next_position := v_next_position + 1;
    end if;
  end loop;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, details)
  values (
    null,
    'meeting_booking.guests_updated',
    'meeting_booking',
    v_booking.id::text,
    jsonb_build_object(
      'referenceCode', v_booking.reference_code,
      'guestCount', jsonb_array_length(p_guests)
    )
  );

  return public.meeting_booking_json(v_booking);
end;
$function$;

create or replace function public.cancel_meeting_booking(
  p_booker_oid text,
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_booking public.meeting_bookings%rowtype;
  v_visit_id uuid;
begin
  v_booking := public.lock_booker_meeting_booking(p_booker_oid, p_booking_id, 'cancel');

  update public.meeting_bookings
  set status = 'cancelled', cancelled_at = now()
  where id = v_booking.id
  returning * into v_booking;

  if v_booking.meeting_id is not null then
    update public.meetings
    set active = false, cancelled_at = now()
    where id = v_booking.meeting_id
      and active;
  end if;

  for v_visit_id in
    select guest.visit_id
    from public.meeting_booking_guests as guest
    where guest.booking_id = v_booking.id
      and guest.visit_id is not null
  loop
    perform public.cancel_booking_guest_visit(
      v_visit_id,
      'The meeting booking was cancelled by the organiser.'
    );
  end loop;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, details)
  values (
    null,
    'meeting_booking.cancelled',
    'meeting_booking',
    v_booking.id::text,
    jsonb_build_object('referenceCode', v_booking.reference_code)
  );

  return public.meeting_booking_json(v_booking);
end;
$function$;

-- ------------------------------------------------------------
-- Reception
-- ------------------------------------------------------------

create or replace function public.get_meeting_booking_requests(
  p_actor_id uuid,
  p_tower text default '',
  p_view text default 'pending'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_scope jsonb;
  v_role text;
  v_tower text;
  v_view text := lower(btrim(coalesce(p_view, 'pending')));
  v_today date := (now() at time zone 'Africa/Accra')::date;
begin
  v_scope := public.resolve_visitor_card_actor_scope(p_actor_id, p_tower);
  v_role := v_scope ->> 'role';
  v_tower := coalesce(v_scope ->> 'tower', '');

  if v_view not in ('pending', 'approved', 'closed') then
    raise exception using
      errcode = '22023',
      message = 'Invalid booking view';
  end if;

  return jsonb_build_object(
    'bookings',
    coalesce(
      (
        select jsonb_agg(
          public.meeting_booking_json(listed.booking)
            || jsonb_build_object(
              'canDecide',
                (listed.booking).status = 'pending'
                and (
                  v_role = 'admin'
                  or (v_role = 'receptionist' and (listed.booking).tower = v_tower)
                )
            )
          order by
            case when v_view = 'closed' then (listed.booking).updated_at end desc,
            (listed.booking).meeting_date,
            (listed.booking).starts_at,
            (listed.booking).created_at
        )
        from (
          select booking
          from public.meeting_bookings as booking
          where (v_tower = '' or booking.tower = v_tower)
            and (
              (v_view = 'pending' and booking.status = 'pending')
              or (
                v_view = 'approved'
                and booking.status = 'approved'
                and coalesce(booking.ends_on, booking.meeting_date) >= v_today
              )
              or (
                v_view = 'closed'
                and (
                  booking.status in ('rejected', 'cancelled', 'expired')
                  or (
                    booking.status = 'approved'
                    and coalesce(booking.ends_on, booking.meeting_date) < v_today
                  )
                )
                and booking.updated_at >= now() - interval '60 days'
              )
            )
          order by booking.meeting_date, booking.starts_at
          limit 100
        ) as listed
      ),
      '[]'::jsonb
    ),
    'pendingCount',
    (
      select count(*)
      from public.meeting_bookings as booking
      where booking.status = 'pending'
        and (v_tower = '' or booking.tower = v_tower)
    ),
    'scope', jsonb_build_object('role', v_role, 'tower', nullif(v_tower, ''))
  );
end;
$function$;

create or replace function public.decide_meeting_booking(
  p_actor_id uuid,
  p_tower text,
  p_booking_id uuid,
  p_decision text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_booking public.meeting_bookings%rowtype;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_meeting_id uuid;
begin
  if v_decision not in ('approve', 'reject') then
    raise exception using
      errcode = '22023',
      message = 'Choose approve or reject.';
  end if;

  select *
  into v_booking
  from public.meeting_bookings as booking
  where booking.id = p_booking_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Booking not found';
  end if;

  perform public.require_meeting_manager(p_actor_id, p_tower, v_booking.tower);

  if v_booking.status <> 'pending' then
    raise exception using
      errcode = '55000',
      message = 'This booking request has already been answered.';
  end if;

  if public.meeting_booking_starts(v_booking.meeting_date, v_booking.starts_at) <= now() then
    raise exception using
      errcode = '55000',
      message = 'This meeting has already started, so the request can no longer be approved.';
  end if;

  if v_decision = 'reject' and (v_reason is null or char_length(v_reason) < 2) then
    raise exception using
      errcode = '22023',
      message = 'Give the organiser a reason for rejecting the request.';
  end if;

  if v_decision = 'approve' then
    insert into public.meetings (
      title, schedule_type, starts_on, ends_on, recurrence_days,
      starts_at, ends_at, tower, venue, host_agency, host_division,
      active, created_by, updated_by
    )
    values (
      v_booking.title, v_booking.schedule_type, v_booking.starts_on,
      coalesce(v_booking.ends_on, v_booking.meeting_date),
      v_booking.recurrence_days, v_booking.starts_at, v_booking.ends_at,
      v_booking.tower, v_booking.venue, v_booking.host_agency,
      v_booking.host_division, true, p_actor_id, p_actor_id
    )
    returning id into v_meeting_id;
  end if;

  update public.meeting_bookings
  set
    status = case when v_decision = 'approve' then 'approved' else 'rejected' end,
    meeting_id = v_meeting_id,
    decided_by = p_actor_id,
    decided_at = now(),
    decision_reason = v_reason
  where id = v_booking.id
  returning * into v_booking;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, details)
  values (
    p_actor_id,
    'meeting_booking.' || v_booking.status,
    'meeting_booking',
    v_booking.id::text,
    jsonb_build_object(
      'referenceCode', v_booking.reference_code,
      'meetingId', v_meeting_id,
      'reason', v_reason
    )
  );

  return public.meeting_booking_json(v_booking);
end;
$function$;

-- ------------------------------------------------------------
-- Permissions: the API (service role) only
-- ------------------------------------------------------------

do $grants$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.meeting_booking_first_day(text, date, date, smallint[])',
    'public.meeting_booking_changeable(public.meeting_bookings, text)',
    'public.meeting_booking_json(public.meeting_bookings)',
    'public.submit_meeting_booking(text, text, text, text, text, date, date, smallint[], time, time, text, text, text, text, jsonb)',
    'public.get_booker_meeting_bookings(text)',
    'public.lock_booker_meeting_booking(text, uuid, text)',
    'public.save_meeting_booking_guests(text, uuid, jsonb)',
    'public.cancel_meeting_booking(text, uuid)',
    'public.get_meeting_booking_requests(uuid, text, text)',
    'public.decide_meeting_booking(uuid, text, uuid, text, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_signature);
    execute format('grant execute on function %s to service_role', v_signature);
  end loop;
end
$grants$;

notify pgrst, 'reload schema';

commit;
