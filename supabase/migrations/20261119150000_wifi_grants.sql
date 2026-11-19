begin;

-- ============================================================
-- Wi-Fi grants: password, expiry and how it was sent
-- ============================================================
-- IT creates a guest password in the Wi-Fi system, pastes it here and
-- grants access. The password is stored encrypted by the API (this
-- database never sees it in plain text) only until it expires, so it
-- can be shown again or re-sent; after that only the expiry time and
-- the ways it was sent remain. A meeting gets one shared password for
-- all its guests.

alter table public.visits
  add column if not exists wifi_password_cipher text,
  add column if not exists wifi_expires_at timestamp with time zone,
  add column if not exists wifi_sent_by text[] not null default array[]::text[];

alter table public.meetings
  add column if not exists wifi_password_cipher text,
  add column if not exists wifi_expires_at timestamp with time zone,
  add column if not exists wifi_sent_by text[] not null default array[]::text[];

alter table public.visits
  drop constraint if exists visits_wifi_cipher_check,
  drop constraint if exists visits_wifi_sent_by_check;

alter table public.visits
  add constraint visits_wifi_cipher_check
    check (wifi_password_cipher is null or char_length(wifi_password_cipher) between 20 and 1000),
  add constraint visits_wifi_sent_by_check
    check (wifi_sent_by <@ array['sms', 'email', 'print']::text[]);

alter table public.meetings
  drop constraint if exists meetings_wifi_cipher_check,
  drop constraint if exists meetings_wifi_sent_by_check;

alter table public.meetings
  add constraint meetings_wifi_cipher_check
    check (wifi_password_cipher is null or char_length(wifi_password_cipher) between 20 and 1000),
  add constraint meetings_wifi_sent_by_check
    check (wifi_sent_by <@ array['sms', 'email', 'print']::text[]);

-- Who receives a grant: the visitor, or every guest of the meeting on
-- the day.
create or replace function public.wifi_grant_recipients(
  p_entry_type text,
  p_entry_id uuid,
  p_date date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when p_entry_type = 'visit' then (
      select coalesce(jsonb_agg(jsonb_build_object(
        'fullName', profile.full_name,
        'phone', profile.phone,
        'email', profile.email
      )), '[]'::jsonb)
      from public.visits as visit
      join public.visitor_profiles as profile on profile.id = visit.visitor_id
      where visit.id = p_entry_id
    )
    else (
      select coalesce(jsonb_agg(listed.recipient), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'fullName', guest.full_name,
          'phone', guest.phone,
          'email', guest.email
        ) as recipient
        from public.meeting_bookings as booking
        join public.meeting_booking_guests as guest on guest.booking_id = booking.id
        where booking.meeting_id = p_entry_id
          and booking.status = 'approved'
          and guest.removed_at is null
        union all
        select jsonb_build_object(
          'fullName', profile.full_name,
          'phone', profile.phone,
          'email', profile.email
        )
        from public.visits as visit
        join public.visitor_profiles as profile on profile.id = visit.visitor_id
        where visit.meeting_id = p_entry_id
          and visit.booking_guest_id is null
          and visit.status::text <> 'cancelled'
          and (visit.created_at at time zone 'Africa/Accra')::date = p_date
        limit 300
      ) as listed
    )
  end;
$function$;

create or replace function public.grant_wifi_access(
  p_actor_id uuid,
  p_entry_type text,
  p_entry_id uuid,
  p_password_cipher text,
  p_duration text,
  p_date date,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_today date := (now() at time zone 'Africa/Accra')::date;
  v_date date := coalesce(p_date, v_today);
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_ends_at time;
  v_expires timestamp with time zone;
  v_found boolean;
begin
  perform public.require_wifi_reviewer(p_actor_id);

  if p_entry_type not in ('visit', 'meeting') then
    raise exception using errcode = '22023', message = 'Invalid Wi-Fi request';
  end if;

  if p_password_cipher is null or char_length(p_password_cipher) not between 20 and 1000 then
    raise exception using errcode = '22023', message = 'Paste the password from the Wi-Fi system.';
  end if;

  if v_note is not null and char_length(v_note) > 300 then
    raise exception using errcode = '22023', message = 'Keep the note to 300 characters or fewer.';
  end if;

  if p_entry_type = 'meeting' then
    select meeting.ends_at into v_ends_at
    from public.meetings as meeting
    where meeting.id = p_entry_id;
  end if;

  v_expires := case p_duration
    when '2h' then now() + interval '2 hours'
    when '4h' then now() + interval '4 hours'
    when 'end_of_day' then (v_date + time '23:59:59') at time zone 'Africa/Accra'
    when 'meeting_end' then
      case when p_entry_type = 'meeting'
        then (v_date + coalesce(v_ends_at, time '23:59:59')) at time zone 'Africa/Accra'
      end
  end;

  if v_expires is null then
    raise exception using errcode = '22023', message = 'Choose how long access lasts.';
  end if;

  if v_expires <= now() then
    raise exception using errcode = '22023', message = 'That time has already passed. Choose a longer duration.';
  end if;

  if p_entry_type = 'visit' then
    update public.visits
    set
      wifi_status = 'given',
      wifi_note = v_note,
      wifi_decided_by = p_actor_id,
      wifi_decided_at = now(),
      wifi_password_cipher = p_password_cipher,
      wifi_expires_at = v_expires,
      wifi_sent_by = array[]::text[]
    where id = p_entry_id
      and wifi_requested is true;
  else
    update public.meetings
    set
      wifi_status = 'given',
      wifi_note = v_note,
      wifi_decided_by = p_actor_id,
      wifi_decided_at = now(),
      wifi_password_cipher = p_password_cipher,
      wifi_expires_at = v_expires,
      wifi_sent_by = array[]::text[]
    where id = p_entry_id
      and wifi_requested is true
      and active;
  end if;

  v_found := found;

  if not v_found then
    raise exception using errcode = 'P0002', message = 'Wi-Fi request not found';
  end if;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, details)
  values (
    p_actor_id,
    'wifi_access.granted',
    p_entry_type,
    p_entry_id::text,
    jsonb_build_object('expiresAt', v_expires, 'duration', p_duration)
  );

  return jsonb_build_object(
    'type', p_entry_type,
    'id', p_entry_id,
    'status', 'given',
    'note', v_note,
    'expiresAt', v_expires,
    'decidedAt', now(),
    'decidedByName', (
      select staff.full_name from public.staff_profiles as staff
      where staff.user_id = p_actor_id
    ),
    'recipients', public.wifi_grant_recipients(p_entry_type, p_entry_id, v_date)
  );
end;
$function$;

-- The stored password and recipients, while the grant is still valid.
create or replace function public.get_wifi_grant_secret(
  p_actor_id uuid,
  p_entry_type text,
  p_entry_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_cipher text;
  v_expires timestamp with time zone;
begin
  perform public.require_wifi_reviewer(p_actor_id);

  if p_entry_type = 'visit' then
    select visit.wifi_password_cipher, visit.wifi_expires_at
    into v_cipher, v_expires
    from public.visits as visit
    where visit.id = p_entry_id and visit.wifi_status = 'given';
  elsif p_entry_type = 'meeting' then
    select meeting.wifi_password_cipher, meeting.wifi_expires_at
    into v_cipher, v_expires
    from public.meetings as meeting
    where meeting.id = p_entry_id and meeting.wifi_status = 'given';
  end if;

  if v_cipher is null or v_expires is null or v_expires <= now() then
    raise exception using errcode = 'P0002', message = 'This password has expired or was not stored.';
  end if;

  return jsonb_build_object(
    'cipher', v_cipher,
    'expiresAt', v_expires,
    'recipients', public.wifi_grant_recipients(
      p_entry_type,
      p_entry_id,
      (v_expires at time zone 'Africa/Accra')::date
    )
  );
end;
$function$;

-- Adds the ways the password actually went out.
create or replace function public.record_wifi_delivery(
  p_actor_id uuid,
  p_entry_type text,
  p_entry_id uuid,
  p_channels text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_channels text[] := coalesce(p_channels, array[]::text[]);
  v_sent text[];
begin
  perform public.require_wifi_reviewer(p_actor_id);

  if not (v_channels <@ array['sms', 'email', 'print']::text[]) then
    raise exception using errcode = '22023', message = 'Invalid delivery method';
  end if;

  if p_entry_type = 'visit' then
    update public.visits
    set wifi_sent_by = array(
      select distinct channel from unnest(wifi_sent_by || v_channels) as channel order by 1
    )
    where id = p_entry_id and wifi_status = 'given'
    returning wifi_sent_by into v_sent;
  else
    update public.meetings
    set wifi_sent_by = array(
      select distinct channel from unnest(wifi_sent_by || v_channels) as channel order by 1
    )
    where id = p_entry_id and wifi_status = 'given'
    returning wifi_sent_by into v_sent;
  end if;

  if not found then
    raise exception using errcode = 'P0002', message = 'Wi-Fi request not found';
  end if;

  return jsonb_build_object('sentBy', to_jsonb(v_sent));
end;
$function$;



create or replace function public.sync_wifi_request_status()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    new.wifi_status := case when new.wifi_requested then 'waiting' end;
    new.wifi_note := null;
    new.wifi_decided_by := null;
    new.wifi_decided_at := null;
    new.wifi_password_cipher := null;
    new.wifi_expires_at := null;
    new.wifi_sent_by := array[]::text[];

    return new;
  end if;

  if new.wifi_requested is not distinct from old.wifi_requested then
    return new;
  end if;

  if coalesce(new.wifi_requested, false) then
    new.wifi_status := 'waiting';
    new.wifi_note := null;
    new.wifi_decided_by := null;
    new.wifi_decided_at := null;
    new.wifi_password_cipher := null;
    new.wifi_expires_at := null;
    new.wifi_sent_by := array[]::text[];
  elsif old.wifi_status = 'given' then
    -- Access was already given: IT must see that it is withdrawn.
    new.wifi_status := 'cancelled';
    new.wifi_decided_by := null;
    new.wifi_decided_at := now();
    new.wifi_password_cipher := null;
  else
    new.wifi_status := null;
    new.wifi_note := null;
    new.wifi_decided_by := null;
    new.wifi_decided_at := null;
    new.wifi_password_cipher := null;
    new.wifi_expires_at := null;
    new.wifi_sent_by := array[]::text[];
  end if;

  return new;
end;
$function$;

create or replace function public.wifi_access_rows(
  p_view text,
  p_today date
)
returns table (
  entry_type text,
  entry_id uuid,
  entry_date date,
  status text,
  sort_time time,
  entry jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_from date;
  v_to date;
begin
  if p_view = 'today' then
    v_from := p_today;
    v_to := p_today;
  elsif p_view = 'upcoming' then
    v_from := p_today + 1;
    v_to := p_today + 90;
  elsif p_view = 'history' then
    v_from := p_today - 30;
    v_to := p_today - 1;
  else
    raise exception using
      errcode = '22023',
      message = 'Invalid Wi-Fi view';
  end if;

  if p_view <> 'upcoming' then
    return query
    select
      'visit'::text,
      visit.id,
      (visit.created_at at time zone 'Africa/Accra')::date,
      visit.wifi_status,
      (visit.created_at at time zone 'Africa/Accra')::time,
      jsonb_build_object(
        'type', 'visit',
        'id', visit.id,
        'date', (visit.created_at at time zone 'Africa/Accra')::date,
        'registeredAt', visit.created_at,
        'fullName', profile.full_name,
        'organization', profile.organization,
        'phone', profile.phone,
        'email', profile.email,
        'tower', visit.tower,
        'agency', visit.destination_agency,
        'division', visit.destination_division,
        'personVisiting', visit.person_visiting,
        'meetingTitle', coalesce(meeting.title, visit.custom_meeting_title),
        'meetingFloor', meeting.floor,
        'visitStatus', visit.status::text,
        'status', visit.wifi_status,
        'note', visit.wifi_note,
        'decidedAt', visit.wifi_decided_at,
        'decidedByName', decider.full_name,
        'expiresAt', visit.wifi_expires_at,
        'sentBy', to_jsonb(visit.wifi_sent_by),
        'hasPassword', visit.wifi_password_cipher is not null and visit.wifi_expires_at > now()
      )
    from public.visits as visit
    join public.visitor_profiles as profile
      on profile.id = visit.visitor_id
    left join public.meetings as meeting
      on meeting.id = visit.meeting_id
    left join public.staff_profiles as decider
      on decider.user_id = visit.wifi_decided_by
    where visit.wifi_status is not null
      and visit.status::text <> 'cancelled'
      and (visit.created_at at time zone 'Africa/Accra')::date
        between v_from and v_to;
  end if;

  return query
  with dated as (
    select
      meeting.*,
      (
        select
          case
            when p_view = 'history' then max(day.value::date)
            else min(day.value::date)
          end
        from generate_series(
          greatest(meeting.starts_on, v_from),
          least(coalesce(meeting.ends_on, v_to), v_to),
          interval '1 day'
        ) as day(value)
        where public.meeting_occurs_on(
          meeting.schedule_type,
          meeting.starts_on,
          meeting.ends_on,
          meeting.recurrence_days,
          day.value::date
        )
      ) as occurs_on
    from public.meetings as meeting
    where meeting.wifi_status is not null
      and meeting.active
      and meeting.starts_on <= v_to
      and coalesce(meeting.ends_on, v_to) >= v_from
      and not exists (
        select 1
        from public.meeting_bookings as booking
        where booking.meeting_id = meeting.id
          and booking.status <> 'approved'
      )
  )
  select
    'meeting'::text,
    dated.id,
    dated.occurs_on,
    dated.wifi_status,
    dated.starts_at,
    jsonb_build_object(
      'type', 'meeting',
      'id', dated.id,
      'date', dated.occurs_on,
      'title', dated.title,
      'tower', dated.tower,
      'floor', dated.floor,
      'venue', dated.venue,
      'hostAgency', dated.host_agency,
      'hostDivision', dated.host_division,
      'startsAt', to_char(dated.starts_at, 'HH24:MI'),
      'endsAt', to_char(dated.ends_at, 'HH24:MI'),
      'organiserName', booking.booker_name,
      'organiserEmail', booking.booker_email,
      'referenceCode', booking.reference_code,
      'status', dated.wifi_status,
      'note', dated.wifi_note,
      'decidedAt', dated.wifi_decided_at,
      'decidedByName', decider.full_name,
      'expiresAt', dated.wifi_expires_at,
      'sentBy', to_jsonb(dated.wifi_sent_by),
      'hasPassword', dated.wifi_password_cipher is not null and dated.wifi_expires_at > now(),
      'guests', coalesce(
        (
          select jsonb_agg(listed.guest order by listed.sort_order, listed.sort_name)
          from (
            select
              0 as sort_order,
              lower(guest.full_name) as sort_name,
              jsonb_build_object(
                'fullName', guest.full_name,
                'organization', guest.organization,
                'phone', guest.phone,
                'email', guest.email,
                'source', 'booked'
              ) as guest
            from public.meeting_booking_guests as guest
            where guest.booking_id = booking.id
              and guest.removed_at is null
            union all
            select
              1,
              lower(profile.full_name),
              jsonb_build_object(
                'fullName', profile.full_name,
                'organization', profile.organization,
                'phone', profile.phone,
                'email', profile.email,
                'source', 'walk_in'
              )
            from public.visits as visit
            join public.visitor_profiles as profile
              on profile.id = visit.visitor_id
            where visit.meeting_id = dated.id
              and visit.booking_guest_id is null
              and visit.status::text <> 'cancelled'
              and (visit.created_at at time zone 'Africa/Accra')::date = dated.occurs_on
            limit 300
          ) as listed
        ),
        '[]'::jsonb
      )
    )
  from dated
  left join public.meeting_bookings as booking
    on booking.meeting_id = dated.id
    and booking.status = 'approved'
  left join public.staff_profiles as decider
    on decider.user_id = dated.wifi_decided_by
  where dated.occurs_on is not null;
end;
$function$;

create or replace function public.get_wifi_access_requests(
  p_actor_id uuid,
  p_view text default 'today'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_today date := (now() at time zone 'Africa/Accra')::date;
  v_view text := lower(btrim(coalesce(p_view, 'today')));
  v_entries jsonb;
  v_summary jsonb;
begin
  perform public.require_wifi_reviewer(p_actor_id);

  -- Expired passwords are deleted; the expiry and delivery stay.
  update public.visits
  set wifi_password_cipher = null
  where wifi_password_cipher is not null and wifi_expires_at <= now();

  update public.meetings
  set wifi_password_cipher = null
  where wifi_password_cipher is not null and wifi_expires_at <= now();

  select
    coalesce(
      jsonb_agg(
        r.entry
        order by
          case when r.status = 'waiting' then 0 else 1 end,
          case when v_view = 'history' then r.entry_date end desc,
          case when v_view <> 'history' then r.entry_date end,
          r.sort_time nulls last,
          r.entry_id
      ),
      '[]'::jsonb
    ),
    jsonb_build_object(
      'total', count(*),
      'waiting', count(*) filter (where r.status = 'waiting'),
      'given', count(*) filter (where r.status = 'given'),
      'notGiven', count(*) filter (where r.status = 'not_given'),
      'cancelled', count(*) filter (where r.status = 'cancelled'),
      'meetings', count(*) filter (where r.entry_type = 'meeting'),
      'visitors', count(*) filter (where r.entry_type = 'visit')
    )
  into v_entries, v_summary
  from public.wifi_access_rows(v_view, v_today) as r;

  return jsonb_build_object(
    'view', v_view,
    'today', v_today,
    'entries', v_entries,
    'summary', v_summary,
    'waitingCount', public.count_waiting_wifi_requests(v_today)
  );
end;
$function$;

create or replace function public.set_wifi_access_status(
  p_actor_id uuid,
  p_entry_type text,
  p_entry_id uuid,
  p_status text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_decided_by uuid;
  v_decided_at timestamp with time zone;
  v_found boolean;
begin
  perform public.require_wifi_reviewer(p_actor_id);

  if v_status not in ('waiting', 'given', 'not_given') then
    raise exception using
      errcode = '22023',
      message = 'Choose Access given or Not given.';
  end if;

  if v_note is not null and char_length(v_note) > 300 then
    raise exception using
      errcode = '22023',
      message = 'Keep the note to 300 characters or fewer.';
  end if;

  -- Moving back to Waiting clears the decision.
  if v_status <> 'waiting' then
    v_decided_by := p_actor_id;
    v_decided_at := now();
  else
    v_note := null;
  end if;

  if p_entry_type = 'visit' then
    update public.visits
    set
      wifi_status = v_status,
      wifi_note = v_note,
      wifi_decided_by = v_decided_by,
      wifi_decided_at = v_decided_at,
      wifi_password_cipher = case when v_status = 'given' then wifi_password_cipher end,
      wifi_expires_at = case when v_status = 'given' then wifi_expires_at end,
      wifi_sent_by = case when v_status = 'given' then wifi_sent_by else array[]::text[] end
    where id = p_entry_id
      and wifi_requested is true;

    v_found := found;
  elsif p_entry_type = 'meeting' then
    update public.meetings
    set
      wifi_status = v_status,
      wifi_note = v_note,
      wifi_decided_by = v_decided_by,
      wifi_decided_at = v_decided_at,
      wifi_password_cipher = case when v_status = 'given' then wifi_password_cipher end,
      wifi_expires_at = case when v_status = 'given' then wifi_expires_at end,
      wifi_sent_by = case when v_status = 'given' then wifi_sent_by else array[]::text[] end
    where id = p_entry_id
      and wifi_requested is true
      and active;

    v_found := found;
  else
    raise exception using
      errcode = '22023',
      message = 'Invalid Wi-Fi request';
  end if;

  -- Withdrawn and cancelled requests cannot be changed.
  if not v_found then
    raise exception using
      errcode = 'P0002',
      message = 'Wi-Fi request not found';
  end if;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, details)
  values (
    p_actor_id,
    'wifi_access.updated',
    p_entry_type,
    p_entry_id::text,
    jsonb_build_object('status', v_status, 'hasNote', v_note is not null)
  );

  return jsonb_build_object(
    'type', p_entry_type,
    'id', p_entry_id,
    'status', v_status,
    'note', v_note,
    'decidedAt', v_decided_at,
    'decidedByName', (
      select staff.full_name
      from public.staff_profiles as staff
      where staff.user_id = v_decided_by
    )
  );
end;
$function$;


do $grants$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.wifi_grant_recipients(text, uuid, date)',
    'public.grant_wifi_access(uuid, text, uuid, text, text, date, text)',
    'public.get_wifi_grant_secret(uuid, text, uuid)',
    'public.record_wifi_delivery(uuid, text, uuid, text[])',
    'public.get_wifi_access_requests(uuid, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_signature);
    execute format('grant execute on function %s to service_role', v_signature);
  end loop;
end;
$grants$;

notify pgrst, 'reload schema';

commit;
