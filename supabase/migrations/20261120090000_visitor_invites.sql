-- ============================================================
-- Visitor booking links
-- ============================================================
-- A staff member creates a one-visitor booking link. The visitor opens
-- it, fills in their details and picks a date (today to 30 days ahead).
-- The link works once, and for 24 hours at most.
--
-- The visitor gets a VIS- reference code straight away. On the visit
-- date the booking opens as a pending admission for its tower, the way
-- meeting guests do; at reception the code is searched with "Find
-- booking" and a card is assigned through the usual admission. A
-- visitor who does not arrive expires at midnight with every other
-- pending admission.
--
-- Links are made by app staff (created_by) or by Ministry staff signed
-- in with their work email (creator_oid). Only a hash of the link's
-- token is stored.

create table if not exists public.visitor_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  creator_oid text,
  creator_email text,
  creator_name text not null,
  host_name text not null,
  destination_agency text not null,
  destination_division text,
  tower text not null,
  floor text,
  status text not null default 'open',
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone not null default now(),
  submitted_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  reference_code text unique,
  visit_date date,
  full_name text,
  phone text,
  email text,
  organization text,
  purpose text,
  wifi_requested boolean,
  consent_version text,
  visit_id uuid references public.visits(id) on delete set null,

  constraint visitor_invites_creator_check
    check (created_by is null or creator_oid is null),
  constraint visitor_invites_status_check
    check (status in ('open', 'used', 'cancelled')),
  constraint visitor_invites_tower_check
    check (tower in ('tower_1', 'tower_2')),
  constraint visitor_invites_floor_check
    check (floor is null or floor in ('ground', '1', '2', '3', '4', '5', '6', '7')),
  constraint visitor_invites_host_name_check
    check (char_length(btrim(host_name)) between 2 and 120),
  constraint visitor_invites_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint visitor_invites_used_check
    check (
      status <> 'used'
      or (
        reference_code is not null
        and visit_date is not null
        and full_name is not null
        and phone is not null
        and purpose is not null
        and submitted_at is not null
      )
    )
);

create index if not exists visitor_invites_created_by_idx
  on public.visitor_invites (created_by, created_at desc)
  where created_by is not null;

create index if not exists visitor_invites_creator_oid_idx
  on public.visitor_invites (creator_oid, created_at desc)
  where creator_oid is not null;

create index if not exists visitor_invites_due_idx
  on public.visitor_invites (visit_date)
  where status = 'used' and visit_id is null;

alter table public.visitor_invites enable row level security;

revoke all on public.visitor_invites from public, anon, authenticated;

comment on table public.visitor_invites is
  'One-visitor booking links created by staff. Usable once, for 24 hours at most.';

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------

-- Staff who may create visitor links: everyone except the IT role.
create or replace function public.require_invite_creator(
  p_actor_id uuid,
  out full_name text,
  out email text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  select
    staff.full_name,
    (select account.email from auth.users as account where account.id = staff.user_id)
  into full_name, email
  from public.staff_profiles as staff
  where staff.user_id = p_actor_id
    and staff.active = true
    and staff.role in ('receptionist', 'client_service_head', 'admin');

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Staff role is not authorised';
  end if;
end;
$function$;

-- What a link is now: 'unused', 'expired', 'used' or 'cancelled'.
create or replace function public.visitor_invite_state(
  p_invite public.visitor_invites
)
returns text
language sql
stable
set search_path = ''
as $function$
  select case
    when p_invite.status = 'cancelled' then 'cancelled'
    when p_invite.status = 'used' then 'used'
    when p_invite.expires_at <= now() then 'expired'
    else 'unused'
  end;
$function$;

-- How a used link's visit is going: 'upcoming', 'waiting', 'arrived',
-- 'not_arrived' or 'cancelled'.
create or replace function public.visitor_invite_visit_state(
  p_invite public.visitor_invites
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_today date := (now() at time zone 'Africa/Accra')::date;
  v_status text;
  v_reason text;
begin
  if p_invite.status <> 'used' then
    return null;
  end if;

  if p_invite.visit_id is null then
    return case when p_invite.visit_date < v_today then 'not_arrived' else 'upcoming' end;
  end if;

  select visit.status::text, visit.admission_cancellation_reason
  into v_status, v_reason
  from public.visits as visit
  where visit.id = p_invite.visit_id;

  return case
    when v_status = 'pending_admission' then 'waiting'
    when v_status in ('checked_in', 'checked_out') then 'arrived'
    when v_status = 'cancelled' and v_reason like 'Pending admission expired%' then 'not_arrived'
    when v_status = 'cancelled' then 'cancelled'
    else 'upcoming'
  end;
end;
$function$;

create or replace function public.visitor_invite_json(
  p_invite public.visitor_invites
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'id', p_invite.id,
    'state', public.visitor_invite_state(p_invite),
    'visitState', public.visitor_invite_visit_state(p_invite),
    'hostName', p_invite.host_name,
    'agency', p_invite.destination_agency,
    'division', p_invite.destination_division,
    'tower', p_invite.tower,
    'floor', p_invite.floor,
    'createdAt', p_invite.created_at,
    'expiresAt', p_invite.expires_at,
    'submittedAt', p_invite.submitted_at,
    'referenceCode', p_invite.reference_code,
    'visitDate', p_invite.visit_date,
    'visitorName', p_invite.full_name
  );
$function$;

-- ------------------------------------------------------------
-- Creating a link
-- ------------------------------------------------------------

-- p_actor_id for app staff, or p_creator_oid (with email and name) for
-- a Ministry staff member signed in with their work email. Twenty links
-- a day each.
create or replace function public.create_visitor_invite(
  p_token_hash text,
  p_actor_id uuid,
  p_creator_oid text,
  p_creator_email text,
  p_creator_name text,
  p_host_name text,
  p_agency text,
  p_division text,
  p_floor text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_staff record;
  v_creator_name text := nullif(btrim(coalesce(p_creator_name, '')), '');
  v_creator_email text := nullif(lower(btrim(coalesce(p_creator_email, ''))), '');
  v_oid text := nullif(btrim(coalesce(p_creator_oid, '')), '');
  v_division text := nullif(btrim(coalesce(p_division, '')), '');
  v_floor text := nullif(lower(btrim(coalesce(p_floor, ''))), '');
  v_today_start timestamptz :=
    date_trunc('day', now() at time zone 'Africa/Accra') at time zone 'Africa/Accra';
  v_count integer;
  v_invite public.visitor_invites;
begin
  if (p_actor_id is null) = (v_oid is null) then
    raise exception using
      errcode = '22023',
      message = 'The link creator could not be identified.';
  end if;

  if p_actor_id is not null then
    select * into v_staff from public.require_invite_creator(p_actor_id);
    v_creator_name := v_staff.full_name;
    v_creator_email := lower(v_staff.email);
  end if;

  if v_creator_name is null then
    raise exception using
      errcode = '22023',
      message = 'The link creator could not be identified.';
  end if;

  if p_agency = 'Ministry of Finance (MoF)' and v_division is null then
    raise exception using
      errcode = '22023',
      message = 'Choose the division the visitor is coming to.';
  end if;

  if p_agency <> 'Ministry of Finance (MoF)' then
    v_division := null;
  end if;

  select count(*)
  into v_count
  from public.visitor_invites as invite
  where invite.created_at >= v_today_start
    and (
      (p_actor_id is not null and invite.created_by = p_actor_id)
      or (v_oid is not null and invite.creator_oid = v_oid)
    );

  if v_count >= 20 then
    raise exception using
      errcode = '55000',
      message = 'You have created 20 visitor links today. You can create more tomorrow.';
  end if;

  insert into public.visitor_invites (
    token_hash, created_by, creator_oid, creator_email, creator_name,
    host_name, destination_agency, destination_division, tower, floor,
    expires_at
  )
  values (
    p_token_hash, p_actor_id, v_oid, v_creator_email, v_creator_name,
    regexp_replace(btrim(p_host_name), '\s+', ' ', 'g'), p_agency, v_division,
    public.tower_for_destination(p_agency, coalesce(v_division, '')), v_floor,
    now() + interval '24 hours'
  )
  returning * into v_invite;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, details)
  values (
    p_actor_id, 'visitor_invite.created', 'visitor_invite', v_invite.id::text,
    jsonb_build_object('creatorEmail', v_creator_email, 'hostName', v_invite.host_name)
  );

  return public.visitor_invite_json(v_invite);
end;
$function$;

-- ------------------------------------------------------------
-- The visitor's side
-- ------------------------------------------------------------

-- What the visitor's page shows. Only an open link reveals who it is
-- from; a used, expired or cancelled one only says so.
create or replace function public.get_visitor_invite(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_invite public.visitor_invites;
  v_state text;
begin
  select * into v_invite
  from public.visitor_invites as invite
  where invite.token_hash = p_token_hash;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'This booking link is not valid.';
  end if;

  v_state := public.visitor_invite_state(v_invite);

  if v_state <> 'unused' then
    return jsonb_build_object('state', v_state);
  end if;

  return jsonb_build_object(
    'state', v_state,
    'hostName', v_invite.host_name,
    'agency', v_invite.destination_agency,
    'division', v_invite.destination_division,
    'tower', v_invite.tower,
    'floor', v_invite.floor,
    'expiresAt', v_invite.expires_at
  );
end;
$function$;

-- Opens today's booked visits as pending admissions. Called before
-- every pending list and count, and straight after a same-day booking.
create or replace function public.open_expected_invite_visits()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_today date := (now() at time zone 'Africa/Accra')::date;
  v_invite record;
  v_profile_id uuid;
  v_visit_id uuid;
  v_opened integer := 0;
begin
  for v_invite in
    select invite.*
    from public.visitor_invites as invite
    where invite.status = 'used'
      and invite.visit_date = v_today
      and invite.visit_id is null
    order by invite.submitted_at
    for update of invite skip locked
  loop
    begin
      v_profile_id := null;

      begin
        insert into public.visitor_profiles (
          full_name, phone, email, organization, consent_version, consented_at
        )
        values (
          v_invite.full_name, v_invite.phone, v_invite.email,
          v_invite.organization, v_invite.consent_version, v_invite.submitted_at
        )
        on conflict (phone) do nothing
        returning id into v_profile_id;
      exception
        when unique_violation then
          -- The email belongs to another visitor: keep it off.
          insert into public.visitor_profiles (
            full_name, phone, organization, consent_version, consented_at
          )
          values (
            v_invite.full_name, v_invite.phone, v_invite.organization,
            v_invite.consent_version, v_invite.submitted_at
          )
          on conflict (phone) do nothing
          returning id into v_profile_id;
      end;

      if v_profile_id is null then
        select profile.id
        into v_profile_id
        from public.visitor_profiles as profile
        where profile.phone = v_invite.phone;

        -- A returning visitor keeps their details; only gaps are filled,
        -- and the privacy notice they confirmed with the link is recorded.
        update public.visitor_profiles as profile
        set
          organization = coalesce(nullif(btrim(profile.organization), ''), v_invite.organization),
          consent_version = v_invite.consent_version,
          consented_at = v_invite.submitted_at
        where profile.id = v_profile_id;
      end if;

      insert into public.visits (
        visitor_id, host_id, destination_agency, destination_division,
        person_visiting, purpose, meeting_id, custom_meeting_title,
        reference_code, status, wifi_requested
      )
      values (
        v_profile_id, null, v_invite.destination_agency, v_invite.destination_division,
        v_invite.host_name, v_invite.purpose, null, null,
        v_invite.reference_code, 'pending_admission', v_invite.wifi_requested
      )
      returning id into v_visit_id;

      update public.visitor_invites
      set visit_id = v_visit_id
      where id = v_invite.id;

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

-- The visitor submits the link once. Returns what the emails need.
create or replace function public.submit_visitor_invite(
  p_token_hash text,
  p_full_name text,
  p_phone text,
  p_email text,
  p_organization text,
  p_purpose text,
  p_visit_date date,
  p_wifi_requested boolean,
  p_consent_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_today date := (now() at time zone 'Africa/Accra')::date;
  v_invite public.visitor_invites;
  v_reference_code text;
  v_attempt integer := 0;
begin
  select * into v_invite
  from public.visitor_invites as invite
  where invite.token_hash = p_token_hash
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'This booking link is not valid.';
  end if;

  if public.visitor_invite_state(v_invite) <> 'unused' then
    raise exception using
      errcode = '55000',
      message = 'This link has expired or was already used. Ask your host for a new one.';
  end if;

  if p_visit_date is null or p_visit_date < v_today or p_visit_date > v_today + 30 then
    raise exception using
      errcode = '22023',
      message = 'Choose a visit date from today up to 30 days ahead.';
  end if;

  if p_purpose = 'Meeting' then
    raise exception using
      errcode = '22023',
      message = 'Choose the purpose of your visit.';
  end if;

  if p_wifi_requested is null then
    raise exception using
      errcode = '22023',
      message = 'Choose whether you need Wi-Fi access.';
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_reference_code :=
      'VIS-' || upper(encode(extensions.gen_random_bytes(4), 'hex'));

    exit when not exists (
      select 1 from public.visits as visit where visit.reference_code = v_reference_code
    ) and not exists (
      select 1 from public.visitor_invites as invite where invite.reference_code = v_reference_code
    );

    if v_attempt >= 5 then
      raise exception using
        errcode = 'P0001',
        message = 'A reference code could not be created.';
    end if;
  end loop;

  update public.visitor_invites
  set
    status = 'used',
    submitted_at = now(),
    reference_code = v_reference_code,
    visit_date = p_visit_date,
    full_name = regexp_replace(btrim(p_full_name), '\s+', ' ', 'g'),
    phone = p_phone,
    email = nullif(lower(btrim(coalesce(p_email, ''))), ''),
    organization = nullif(btrim(coalesce(p_organization, '')), ''),
    purpose = p_purpose,
    wifi_requested = p_wifi_requested,
    consent_version = p_consent_version
  where id = v_invite.id
  returning * into v_invite;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, details)
  values (
    null, 'visitor_invite.submitted', 'visitor_invite', v_invite.id::text,
    jsonb_build_object('referenceCode', v_reference_code, 'visitDate', p_visit_date)
  );

  if p_visit_date = v_today then
    perform public.open_expected_invite_visits();
  end if;

  return jsonb_build_object(
    'referenceCode', v_invite.reference_code,
    'visitDate', v_invite.visit_date,
    'visitorName', v_invite.full_name,
    'visitorEmail', v_invite.email,
    'visitorPhone', v_invite.phone,
    'hostName', v_invite.host_name,
    'hostEmail', v_invite.creator_email,
    'agency', v_invite.destination_agency,
    'division', v_invite.destination_division,
    'tower', v_invite.tower,
    'floor', v_invite.floor
  );
end;
$function$;

-- Every pending list and count calls this first: expired admissions
-- close, and today's meeting guests and booked visitors open.
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
  v_invites_opened integer := 0;
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
  v_invites_opened := public.open_expected_invite_visits();

  return jsonb_build_object(
    'expiredCount',
    v_expired_count,
    'openedGuestCount',
    v_opened_count,
    'openedInviteCount',
    v_invites_opened
  );
end;
$function$;

-- ------------------------------------------------------------
-- Reception: Find booking
-- ------------------------------------------------------------

-- Finds a visit by its reference code, with or without "VIS-".
-- p_tower is the receptionist's tower (null for administrators, who
-- see both). Returns a state the dialog explains:
--   waiting      the visitor can be admitted here
--   other_tower  waiting in the other tower ('tower' says which)
--   upcoming     booked for a later date ('visitDate')
--   arrived      already checked in or out
--   not_arrived  the booked date has passed
--   cancelled    the host cancelled
create or replace function public.find_visitor_booking(
  p_actor_id uuid,
  p_tower text,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'));
  v_visit record;
  v_invite public.visitor_invites;
  v_state text;
begin
  perform 1
  from public.staff_profiles as staff
  where staff.user_id = p_actor_id
    and staff.active = true
    and staff.role in ('receptionist', 'admin');

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Staff role is not authorised';
  end if;

  if v_code ~ '^[0-9A-F]{8}$' then
    v_code := 'VIS-' || v_code;
  end if;

  perform public.expire_pending_visitor_admissions();

  select
    visit.id,
    visit.status::text as status,
    visit.tower,
    visit.admission_cancellation_reason as reason
  into v_visit
  from public.visits as visit
  where visit.reference_code = v_code
  order by visit.created_at desc
  limit 1;

  select * into v_invite
  from public.visitor_invites as invite
  where invite.reference_code = v_code;

  if v_visit.id is null and v_invite.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'No booking matches this code. Check the code with the visitor.';
  end if;

  if v_visit.id is not null then
    v_state := case
      when v_visit.status = 'pending_admission'
        and p_tower is not null
        and v_visit.tower <> p_tower then 'other_tower'
      when v_visit.status = 'pending_admission' then 'waiting'
      when v_visit.status in ('checked_in', 'checked_out') then 'arrived'
      when v_visit.reason like 'Pending admission expired%' then 'not_arrived'
      else 'cancelled'
    end;
  else
    v_state := case
      when v_invite.status = 'cancelled' then 'cancelled'
      else coalesce(public.visitor_invite_visit_state(v_invite), 'cancelled')
    end;
  end if;

  return jsonb_build_object(
    'state', v_state,
    'referenceCode', v_code,
    'tower', coalesce(v_visit.tower, v_invite.tower),
    'visitDate', v_invite.visit_date,
    'visitorName', v_invite.full_name,
    'hostName', v_invite.host_name,
    'floor', v_invite.floor
  );
end;
$function$;

-- ------------------------------------------------------------
-- The creator's list and cancelling
-- ------------------------------------------------------------

create or replace function public.get_visitor_invites(
  p_actor_id uuid,
  p_creator_oid text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_oid text := nullif(btrim(coalesce(p_creator_oid, '')), '');
begin
  if (p_actor_id is null) = (v_oid is null) then
    raise exception using
      errcode = '22023',
      message = 'The link creator could not be identified.';
  end if;

  if p_actor_id is not null then
    perform public.require_invite_creator(p_actor_id);
  end if;

  perform public.expire_pending_visitor_admissions();

  return jsonb_build_object(
    'invites',
    coalesce(
      (
        select jsonb_agg(public.visitor_invite_json(invite) order by invite.created_at desc)
        from (
          select *
          from public.visitor_invites as invite
          where (
              (p_actor_id is not null and invite.created_by = p_actor_id)
              or (v_oid is not null and invite.creator_oid = v_oid)
            )
            and invite.created_at >= now() - interval '60 days'
          order by invite.created_at desc
          limit 100
        ) as invite
      ),
      '[]'::jsonb
    )
  );
end;
$function$;

-- Cancels an unused link, or a used one whose visitor has not arrived;
-- a visit already waiting at reception is withdrawn too.
create or replace function public.cancel_visitor_invite(
  p_actor_id uuid,
  p_creator_oid text,
  p_invite_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_oid text := nullif(btrim(coalesce(p_creator_oid, '')), '');
  v_invite public.visitor_invites;
  v_visit_state text;
begin
  if (p_actor_id is null) = (v_oid is null) then
    raise exception using
      errcode = '22023',
      message = 'The link creator could not be identified.';
  end if;

  if p_actor_id is not null then
    perform public.require_invite_creator(p_actor_id);
  end if;

  select * into v_invite
  from public.visitor_invites as invite
  where invite.id = p_invite_id
    and (
      (p_actor_id is not null and invite.created_by = p_actor_id)
      or (v_oid is not null and invite.creator_oid = v_oid)
    )
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'The visitor link could not be found. Refresh the list and try again.';
  end if;

  if v_invite.status = 'cancelled' then
    return public.visitor_invite_json(v_invite);
  end if;

  v_visit_state := public.visitor_invite_visit_state(v_invite);

  if v_visit_state in ('arrived', 'not_arrived') then
    raise exception using
      errcode = '55000',
      message = case v_visit_state
        when 'arrived' then 'This visitor has already arrived, so the booking cannot be cancelled.'
        else 'This booking has already ended.'
      end;
  end if;

  if v_invite.visit_id is not null then
    update public.visits
    set
      status = 'cancelled',
      admission_cancelled_at = now(),
      admission_cancelled_by = p_actor_id,
      admission_cancellation_reason = 'Booking cancelled by the host.',
      admission_expires_at = null
    where id = v_invite.visit_id
      and status = 'pending_admission';
  end if;

  update public.visitor_invites
  set status = 'cancelled', cancelled_at = now()
  where id = v_invite.id
  returning * into v_invite;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, details)
  values (
    p_actor_id, 'visitor_invite.cancelled', 'visitor_invite', v_invite.id::text,
    jsonb_build_object('referenceCode', v_invite.reference_code)
  );

  return public.visitor_invite_json(v_invite);
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
    'public.require_invite_creator(uuid)',
    'public.visitor_invite_state(public.visitor_invites)',
    'public.visitor_invite_visit_state(public.visitor_invites)',
    'public.visitor_invite_json(public.visitor_invites)',
    'public.create_visitor_invite(text, uuid, text, text, text, text, text, text, text)',
    'public.get_visitor_invite(text)',
    'public.open_expected_invite_visits()',
    'public.submit_visitor_invite(text, text, text, text, text, text, date, boolean, text)',
    'public.expire_pending_visitor_admissions()',
    'public.find_visitor_booking(uuid, text, text)',
    'public.get_visitor_invites(uuid, text)',
    'public.cancel_visitor_invite(uuid, text, uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_signature);
    execute format('grant execute on function %s to service_role', v_signature);
  end loop;
end;
$grants$;
