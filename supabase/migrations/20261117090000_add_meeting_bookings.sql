begin;

-- ============================================================
-- Meeting bookings with pre-registered guests
-- ============================================================
-- Ministry staff book a meeting through /book after signing in with
-- their work email (verified by the API; they have no app account, so
-- bookers are identified by their Microsoft object id). Receptionists
-- of the meeting's tower, and administrators, approve or reject each
-- request. An approved booking becomes an ordinary single-date meeting.
--
-- On the meeting day each listed guest becomes a pending admission,
-- the first time reception opens a pending list or count. Reception
-- then admits them and assigns a card as for any visitor. Guests who
-- never arrive expire at Accra midnight with the other pending
-- admissions.

create table if not exists public.meeting_bookings (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique,
  status text not null default 'pending',
  booker_oid text not null,
  booker_email text not null,
  booker_name text not null,
  title text not null,
  meeting_date date not null,
  starts_at time not null,
  ends_at time not null,
  tower text not null,
  host_agency text not null,
  host_division text,
  venue text,
  notes text,
  consent_confirmed_at timestamp with time zone not null,
  meeting_id uuid references public.meetings(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamp with time zone,
  decision_reason text,
  cancelled_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint meeting_bookings_status_check
    check (status in ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  constraint meeting_bookings_booker_oid_check
    check (char_length(booker_oid) between 1 and 64),
  constraint meeting_bookings_booker_email_check
    check (char_length(booker_email) between 3 and 254),
  constraint meeting_bookings_booker_name_check
    check (char_length(btrim(booker_name)) between 1 and 160),
  constraint meeting_bookings_title_check
    check (char_length(btrim(title)) between 2 and 160),
  constraint meeting_bookings_time_check
    check (ends_at > starts_at),
  constraint meeting_bookings_tower_check
    check (tower in ('tower_1', 'tower_2')),
  constraint meeting_bookings_host_agency_check
    check (char_length(btrim(host_agency)) between 1 and 80),
  constraint meeting_bookings_host_division_check
    check (host_division is null or char_length(btrim(host_division)) between 1 and 160),
  constraint meeting_bookings_venue_check
    check (venue is null or char_length(btrim(venue)) between 1 and 120),
  constraint meeting_bookings_notes_check
    check (notes is null or char_length(btrim(notes)) between 1 and 500),
  constraint meeting_bookings_reason_check
    check (decision_reason is null or char_length(btrim(decision_reason)) between 2 and 500)
);

create index if not exists meeting_bookings_queue_idx
  on public.meeting_bookings (status, tower, meeting_date, starts_at);

create index if not exists meeting_bookings_booker_idx
  on public.meeting_bookings (booker_oid, created_at desc);

create index if not exists meeting_bookings_meeting_idx
  on public.meeting_bookings (meeting_id)
  where meeting_id is not null;

create table if not exists public.meeting_booking_guests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null
    references public.meeting_bookings(id) on delete cascade,
  position smallint not null,
  full_name text not null,
  phone text not null,
  organization text,
  email text,
  visit_id uuid references public.visits(id) on delete set null,
  removed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),

  constraint meeting_booking_guests_name_check
    check (char_length(btrim(full_name)) between 2 and 120),
  constraint meeting_booking_guests_phone_check
    check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint meeting_booking_guests_organization_check
    check (organization is null or char_length(btrim(organization)) between 1 and 160),
  constraint meeting_booking_guests_email_check
    check (email is null or char_length(email) between 3 and 254),
  constraint meeting_booking_guests_position_check
    check (position between 1 and 999),
  constraint meeting_booking_guests_phone_unique
    unique (booking_id, phone),
  constraint meeting_booking_guests_position_unique
    unique (booking_id, position)
);

create index if not exists meeting_booking_guests_open_idx
  on public.meeting_booking_guests (booking_id)
  where visit_id is null and removed_at is null;

alter table public.visits
  add column if not exists booking_guest_id uuid
    references public.meeting_booking_guests(id) on delete set null;

create index if not exists visits_booking_guest_id_idx
  on public.visits (booking_guest_id)
  where booking_guest_id is not null;

comment on column public.visits.booking_guest_id is
  'Guest entry of the meeting booking this visit was opened from. Null for walk-in visitors.';

alter table public.meeting_bookings enable row level security;
alter table public.meeting_booking_guests enable row level security;

revoke all on public.meeting_bookings from public, anon, authenticated;
revoke all on public.meeting_booking_guests from public, anon, authenticated;

drop trigger if exists meeting_bookings_set_updated_at on public.meeting_bookings;

create trigger meeting_bookings_set_updated_at
  before update on public.meeting_bookings
  for each row
  execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------

-- Same rule as the generated visits.tower column.
create or replace function public.tower_for_destination(
  p_agency text,
  p_division text
)
returns text
language sql
immutable
set search_path = ''
as $function$
  select case
    when p_agency = 'Ministry of Finance (MoF)'
      and p_division <> 'PFM Systems Division'
    then 'tower_2'
    else 'tower_1'
  end;
$function$;

create or replace function public.meeting_booking_starts(
  p_meeting_date date,
  p_starts_at time
)
returns timestamp with time zone
language sql
immutable
set search_path = ''
as $function$
  select (p_meeting_date + p_starts_at) at time zone 'Africa/Accra';
$function$;

-- Checks a guest list: an array of {fullName, phone, organization,
-- email} with at most 30 entries and no repeated phone.
create or replace function public.validate_meeting_booking_guests(
  p_guests jsonb
)
returns void
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_guest jsonb;
begin
  if p_guests is null
    or jsonb_typeof(p_guests) <> 'array'
    or jsonb_array_length(p_guests) > 30
  then
    raise exception using
      errcode = '22023',
      message = 'A booking can list up to 30 guests.';
  end if;

  for v_guest in select value from jsonb_array_elements(p_guests)
  loop
    if char_length(btrim(coalesce(v_guest ->> 'fullName', ''))) not between 2 and 120 then
      raise exception using
        errcode = '22023',
        message = 'Each guest needs a name of 2 to 120 characters.';
    end if;

    if coalesce(v_guest ->> 'phone', '') !~ '^\+[1-9][0-9]{7,14}$' then
      raise exception using
        errcode = '22023',
        message = 'Each guest needs a valid phone number.';
    end if;
  end loop;

  if (
    select count(distinct guest ->> 'phone')
    from jsonb_array_elements(p_guests) as guest
  ) <> jsonb_array_length(p_guests) then
    raise exception using
      errcode = '22023',
      message = 'Two guests have the same phone number.';
  end if;
end;
$function$;

-- What has happened to a guest so far.
create or replace function public.meeting_booking_guest_status(
  p_visit_status text,
  p_has_visit boolean,
  p_meeting_date date
)
returns text
language sql
stable
set search_path = ''
as $function$
  select case
    when not p_has_visit then
      case
        when p_meeting_date < (now() at time zone 'Africa/Accra')::date
          then 'did_not_arrive'
        else 'expected'
      end
    when p_visit_status = 'pending_admission' then 'waiting'
    when p_visit_status in ('checked_in', 'checked_out') then 'arrived'
    else 'did_not_arrive'
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
-- Requests still pending when their meeting starts expire
-- ------------------------------------------------------------
-- Returns the expired bookings so the API can email their bookers.

create or replace function public.expire_meeting_bookings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ids uuid[];
begin
  with expired as (
    update public.meeting_bookings as booking
    set status = 'expired'
    where booking.status = 'pending'
      and public.meeting_booking_starts(booking.meeting_date, booking.starts_at) <= now()
    returning booking.id
  )
  select coalesce(array_agg(expired.id), array[]::uuid[])
  into v_ids
  from expired;

  -- A separate statement, so it sees the updated rows.
  return coalesce(
    (
      select jsonb_agg(public.meeting_booking_json(booking))
      from public.meeting_bookings as booking
      where booking.id = any(v_ids)
    ),
    '[]'::jsonb
  );
end;
$function$;

-- ------------------------------------------------------------
-- Booker: submit, list, change guests, cancel
-- ------------------------------------------------------------

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
          and booking.meeting_date >= (now() at time zone 'Africa/Accra')::date - 90
      ),
      '[]'::jsonb
    )
  );
end;
$function$;

-- Locks a booking the booker owns and can still change.
create or replace function public.lock_booker_meeting_booking(
  p_booker_oid text,
  p_booking_id uuid
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

  if v_booking.status not in ('pending', 'approved')
    or public.meeting_booking_starts(v_booking.meeting_date, v_booking.starts_at) <= now()
  then
    raise exception using
      errcode = '55000',
      message = 'This booking can no longer be changed.';
  end if;

  return v_booking;
end;
$function$;

-- Cancels a guest's visit that is still waiting at reception.
create or replace function public.cancel_booking_guest_visit(
  p_visit_id uuid,
  p_reason text
)
returns void
language sql
security definer
set search_path = ''
as $function$
  update public.visits
  set
    status = 'cancelled',
    admission_cancelled_at = now(),
    admission_cancelled_by = null,
    admission_cancellation_reason = p_reason,
    admission_expires_at = null
  where id = p_visit_id
    and status = 'pending_admission';
$function$;

-- Replaces the guest list. Guests are matched by phone: kept guests
-- are updated, missing guests removed, new guests added. A guest who
-- has already been admitted cannot be removed.
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
  v_booking := public.lock_booker_meeting_booking(p_booker_oid, p_booking_id);

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
  v_booking := public.lock_booker_meeting_booking(p_booker_oid, p_booking_id);

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
-- Reception: review queue and decisions
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
                and booking.meeting_date >= v_today
              )
              or (
                v_view = 'closed'
                and (
                  booking.status in ('rejected', 'cancelled', 'expired')
                  or (booking.status = 'approved' and booking.meeting_date < v_today)
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
      v_booking.title, 'single', v_booking.meeting_date, v_booking.meeting_date,
      array[]::smallint[], v_booking.starts_at, v_booking.ends_at,
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
-- Open today's expected guests as pending admissions
-- ------------------------------------------------------------
-- A guest who already has a visit waiting or in progress is skipped
-- and tried again on the next call. A guest whose profile cannot be
-- written (for example, an email address already used by another
-- visitor) is opened without the email.

create or replace function public.open_expected_meeting_guests()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_today date := (now() at time zone 'Africa/Accra')::date;
  v_guest record;
  v_profile_id uuid;
  v_visit_id uuid;
  v_opened integer := 0;
begin
  for v_guest in
    select
      guest.id,
      guest.position,
      guest.full_name,
      guest.phone,
      guest.organization,
      guest.email,
      booking.reference_code,
      booking.meeting_id,
      booking.host_agency,
      booking.host_division,
      booking.consent_confirmed_at
    from public.meeting_booking_guests as guest
    join public.meeting_bookings as booking
      on booking.id = guest.booking_id
    join public.meetings as meeting
      on meeting.id = booking.meeting_id
    where booking.status = 'approved'
      and booking.meeting_date = v_today
      and meeting.active
      and guest.visit_id is null
      and guest.removed_at is null
    order by booking.starts_at, guest.position
    for update of guest skip locked
  loop
    begin
      v_profile_id := null;

      begin
        insert into public.visitor_profiles (
          full_name, phone, email, organization, consent_version, consented_at
        )
        values (
          v_guest.full_name, v_guest.phone, v_guest.email,
          v_guest.organization, '2.0', v_guest.consent_confirmed_at
        )
        on conflict (phone) do nothing
        returning id into v_profile_id;
      exception
        when unique_violation then
          insert into public.visitor_profiles (
            full_name, phone, organization, consent_version, consented_at
          )
          values (
            v_guest.full_name, v_guest.phone, v_guest.organization,
            '2.0', v_guest.consent_confirmed_at
          )
          on conflict (phone) do nothing
          returning id into v_profile_id;
      end;

      if v_profile_id is null then
        select profile.id
        into v_profile_id
        from public.visitor_profiles as profile
        where profile.phone = v_guest.phone;

        -- A returning visitor keeps their details; only gaps are filled.
        update public.visitor_profiles as profile
        set organization = v_guest.organization
        where profile.id = v_profile_id
          and v_guest.organization is not null
          and nullif(btrim(profile.organization), '') is null;
      end if;

      insert into public.visits (
        visitor_id, host_id, destination_agency, destination_division,
        person_visiting, purpose, meeting_id, custom_meeting_title,
        reference_code, status, booking_guest_id
      )
      values (
        v_profile_id, null, v_guest.host_agency, v_guest.host_division,
        null, 'Meeting', v_guest.meeting_id, null,
        v_guest.reference_code || '-' || v_guest.position,
        'pending_admission', v_guest.id
      )
      returning id into v_visit_id;

      update public.meeting_booking_guests
      set visit_id = v_visit_id
      where id = v_guest.id;

      v_opened := v_opened + 1;
    exception
      -- Already waiting or checked in: try again later.
      when raise_exception
        or unique_violation
        or check_violation
        or invalid_parameter_value
      then
        null;
    end;
  end loop;

  return v_opened;
end;
$function$;

-- Every pending list and count calls this first, so today's guests
-- are opened before reception looks.
create or replace function
  public.expire_pending_visitor_admissions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_expired_count integer := 0;
  v_opened_count integer := 0;
begin
  with expired_visits as (
    update public.visits
    set
      status = 'cancelled',
      admission_cancelled_at = now(),
      admission_cancelled_by = null,
      admission_cancellation_reason =
        'Pending admission expired at the end of the submission day.',
      admission_expires_at = null
    where status =
      'pending_admission'
      and admission_expires_at <=
        now()
    returning
      id,
      reference_code,
      tower,
      visitor_id
  ),
  audit_insert as (
    insert into public.audit_events (
      actor_id,
      action,
      entity_type,
      entity_id,
      details
    )
    select
      null,
      'visit.admission_expired',
      'visit',
      expired_visit.id::text,
      jsonb_build_object(
        'visitorId',
        expired_visit.visitor_id,
        'referenceCode',
        expired_visit.reference_code,
        'tower',
        expired_visit.tower
      )
    from expired_visits
      as expired_visit
    returning id
  )
  select count(*)::integer
  into v_expired_count
  from audit_insert;

  v_opened_count := public.open_expected_meeting_guests();

  return jsonb_build_object(
    'expiredCount',
    v_expired_count,
    'openedGuestCount',
    v_opened_count
  );
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
    'public.tower_for_destination(text, text)',
    'public.meeting_booking_starts(date, time)',
    'public.validate_meeting_booking_guests(jsonb)',
    'public.meeting_booking_guest_status(text, boolean, date)',
    'public.meeting_booking_json(public.meeting_bookings)',
    'public.expire_meeting_bookings()',
    'public.submit_meeting_booking(text, text, text, text, date, time, time, text, text, text, text, jsonb)',
    'public.get_booker_meeting_bookings(text)',
    'public.lock_booker_meeting_booking(text, uuid)',
    'public.cancel_booking_guest_visit(uuid, text)',
    'public.save_meeting_booking_guests(text, uuid, jsonb)',
    'public.cancel_meeting_booking(text, uuid)',
    'public.get_meeting_booking_requests(uuid, text, text)',
    'public.decide_meeting_booking(uuid, text, uuid, text, text)',
    'public.open_expected_meeting_guests()',
    'public.expire_pending_visitor_admissions()'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_signature);
    execute format('grant execute on function %s to service_role', v_signature);
  end loop;
end;
$grants$;

notify pgrst, 'reload schema';

commit;
