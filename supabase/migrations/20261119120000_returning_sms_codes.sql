begin;

-- ============================================================
-- Returning visitors verify their number with an SMS code
-- ============================================================
-- A returning visitor enters only their mobile number. When the
-- number belongs to a visitor profile, the API texts a 6-digit code
-- to it; the visitor's record is shown only after the code is
-- entered. The first-name check is gone.
--
-- Codes are stored as keyed hashes made by the API (neither the code
-- nor the phone number is stored in plain text). A code lasts 5
-- minutes and allows 5 tries. A number can be sent a new code after
-- 60 seconds, and at most 3 codes an hour. Rows older than 24 hours
-- are deleted each time a code is requested.

create table if not exists public.visitor_sms_codes (
  id uuid primary key default gen_random_uuid(),
  phone_hash text not null,
  code_hash text not null,
  visitor_id uuid not null
    references public.visitor_profiles(id) on delete cascade,
  attempts smallint not null default 0,
  expires_at timestamp with time zone not null,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),

  constraint visitor_sms_codes_phone_hash_check
    check (char_length(phone_hash) between 32 and 128),
  constraint visitor_sms_codes_code_hash_check
    check (char_length(code_hash) between 32 and 128),
  constraint visitor_sms_codes_attempts_check
    check (attempts between 0 and 5)
);

create index if not exists visitor_sms_codes_phone_idx
  on public.visitor_sms_codes (phone_hash, created_at desc);

create index if not exists visitor_sms_codes_created_idx
  on public.visitor_sms_codes (created_at);

alter table public.visitor_sms_codes enable row level security;

revoke all on public.visitor_sms_codes from public, anon, authenticated;

comment on table public.visitor_sms_codes is
  'One-time SMS codes for returning visitors. Hashes only; rows are removed after 24 hours.';

-- Records a new code for a registered number. Returns
-- {registered: false} for an unknown number (no row is written and no
-- SMS should be sent), or {registered: true, retryAfterSeconds} when
-- the number must wait before another code.
create or replace function public.create_visitor_sms_code(
  p_phone text,
  p_phone_hash text,
  p_code_hash text,
  p_ttl_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_visitor_id uuid;
  v_last_sent timestamp with time zone;
  v_sent_last_hour integer;
  v_oldest_last_hour timestamp with time zone;
begin
  if p_ttl_seconds is null or p_ttl_seconds not between 60 and 900 then
    raise exception using
      errcode = '22023',
      message = 'Invalid code lifetime';
  end if;

  -- Keep at most a day of rows.
  delete from public.visitor_sms_codes
  where created_at < now() - interval '24 hours';

  select profile.id
  into v_visitor_id
  from public.visitor_profiles as profile
  where profile.phone = p_phone
  limit 1;

  if v_visitor_id is null then
    return jsonb_build_object('registered', false);
  end if;

  -- One request at a time per number.
  perform pg_catalog.pg_advisory_xact_lock(
    hashtextextended(p_phone_hash, 20261119)
  );

  select
    max(code.created_at),
    count(*)::integer,
    min(code.created_at)
  into v_last_sent, v_sent_last_hour, v_oldest_last_hour
  from public.visitor_sms_codes as code
  where code.phone_hash = p_phone_hash
    and code.created_at > now() - interval '1 hour';

  if v_last_sent is not null and v_last_sent > now() - interval '60 seconds' then
    return jsonb_build_object(
      'registered', true,
      'retryAfterSeconds',
      ceil(extract(epoch from (v_last_sent + interval '60 seconds' - now())))::integer
    );
  end if;

  if v_sent_last_hour >= 3 then
    return jsonb_build_object(
      'registered', true,
      'retryAfterSeconds',
      ceil(extract(epoch from (v_oldest_last_hour + interval '1 hour' - now())))::integer
    );
  end if;

  -- A new code replaces any earlier one.
  update public.visitor_sms_codes
  set consumed_at = now()
  where phone_hash = p_phone_hash
    and consumed_at is null;

  insert into public.visitor_sms_codes (
    phone_hash, code_hash, visitor_id, expires_at
  )
  values (
    p_phone_hash,
    p_code_hash,
    v_visitor_id,
    now() + make_interval(secs => p_ttl_seconds)
  );

  return jsonb_build_object('registered', true, 'retryAfterSeconds', 0);
end;
$function$;

-- Checks a code. status: 'verified' (with the visitor's profile),
-- 'wrong' (with attemptsLeft), or 'expired' (no live code, used, or
-- out of tries).
create or replace function public.verify_visitor_sms_code(
  p_phone_hash text,
  p_code_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_code public.visitor_sms_codes%rowtype;
  v_profile public.visitor_profiles%rowtype;
begin
  select *
  into v_code
  from public.visitor_sms_codes as code
  where code.phone_hash = p_phone_hash
    and code.consumed_at is null
    and code.expires_at > now()
  order by code.created_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('status', 'expired');
  end if;

  if v_code.code_hash <> p_code_hash then
    update public.visitor_sms_codes
    set
      attempts = attempts + 1,
      consumed_at = case when attempts + 1 >= 5 then now() end
    where id = v_code.id;

    if v_code.attempts + 1 >= 5 then
      return jsonb_build_object('status', 'expired');
    end if;

    return jsonb_build_object(
      'status', 'wrong',
      'attemptsLeft', 5 - (v_code.attempts + 1)
    );
  end if;

  update public.visitor_sms_codes
  set consumed_at = now()
  where id = v_code.id;

  select *
  into v_profile
  from public.visitor_profiles as profile
  where profile.id = v_code.visitor_id;

  if not found then
    return jsonb_build_object('status', 'expired');
  end if;

  return jsonb_build_object(
    'status', 'verified',
    'visitorId', v_profile.id,
    'fullName', v_profile.full_name,
    'email', v_profile.email,
    'organization', v_profile.organization
  );
end;
$function$;

do $grants$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.create_visitor_sms_code(text, text, text, integer)',
    'public.verify_visitor_sms_code(text, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_signature);
    execute format('grant execute on function %s to service_role', v_signature);
  end loop;
end;
$grants$;

-- ============================================================
-- Privacy notice 2.1
-- ============================================================
-- The notice now says Wi-Fi requests are shared with the IT network
-- team and that mobile numbers go to an SMS provider for codes.
-- Returning check-ins accept 2.1; 2.0 is still accepted while the
-- new app version rolls out. Booked guests are recorded under 2.1.

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

  v_new_visit_id uuid;
  v_reference_code text;
  v_reference_attempt integer;

  v_existing_visit_id uuid;
  v_existing_reference_code text;

  v_consent_version text :=
    btrim(coalesce(p_consent_version, ''));

  v_division text :=
    nullif(
      btrim(coalesce(p_destination_division, '')),
      ''
    );

  v_person_visiting text :=
    nullif(
      btrim(coalesce(p_person_visiting, '')),
      ''
    );

  v_custom_meeting_title text :=
    nullif(
      btrim(coalesce(p_custom_meeting_title, '')),
      ''
    );
begin
  if v_consent_version not in ('2.0', '2.1') then
    raise exception using
      errcode = '22023',
      message =
        'The current privacy notice must be acknowledged';
  end if;

  if p_visitor_id is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid verified visitor';
  end if;

  if p_verification_token_id is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid verification token';
  end if;

  if p_token_expires_at is null
    or p_token_expires_at <= v_now
    or p_token_expires_at >
      v_now + interval '15 minutes'
  then
    raise exception using
      errcode = '22023',
      message = 'Verification token has expired';
  end if;

  -- Serialise all check-in attempts for this visitor.
  perform 1
  from public.visitor_profiles as profile
  where profile.id = p_visitor_id
  for update;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'Invalid verified visitor';
  end if;

  -- Return the original result when this exact token already
  -- completed a check-in.
  select
    visit.id,
    visit.reference_code
  into
    v_existing_visit_id,
    v_existing_reference_code
  from public.used_visitor_verification_tokens
    as used_token
  join public.visits as visit
    on visit.id = used_token.visit_id
  where used_token.token_id =
      p_verification_token_id
    and visit.visitor_id = p_visitor_id
  limit 1;

  if found then
    -- Supports a replay originating during the compatibility
    -- rollout without renewing an acknowledgement already
    -- recorded under version 2.0.
    update public.visitor_profiles
    set
      consent_version = v_consent_version,
      consented_at = v_now
    where id = p_visitor_id
      and (
        consent_version is distinct from
          v_consent_version
        or consented_at is null
      );

    return query
    select
      v_existing_visit_id,
      v_existing_reference_code;

    return;
  end if;

  -- A token record without a matching visit cannot be reused.
  if exists (
    select 1
    from public.used_visitor_verification_tokens
      as used_token
    where used_token.token_id =
      p_verification_token_id
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Verification token is invalid or already used';
  end if;

  if exists (
    select 1
    from public.visits as visit
    where visit.visitor_id = p_visitor_id
      and visit.status = 'checked_in'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'VISITOR_ALREADY_CHECKED_IN';
  end if;

  if p_destination_agency is null
    or p_destination_agency not in (
      'Ministry of Finance (MoF)',
      'IAA',
      'ITAB',
      'GIPC',
      'GCX',
      'GIFMIS',
      'GIIF',
      'MIIF',
      'PPA',
      'VFM',
      'NDPC',
      'PFM4SD',
      'Accra Kumasi Project Office',
      'Ghana Thermal Project Office'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid destination agency';
  end if;

  if p_destination_agency =
    'Ministry of Finance (MoF)'
  then
    if v_division is null
      or v_division not in (
        'Budget Office',
        'External Resource Mobilisation Division',
        'Financial Sector Division',
        'Finance Division',
        'Human Capital & General Administration Division',
        'Internal Audit Directorate',
        'Legal Directorate',
        'PFM Compliance Division',
        'PFM Systems Division',
        'Policy Coordination Monitoring & Evaluation Division',
        'Procurement Division',
        'Public Debt Management Office',
        'Public Investment & Asset Division',
        'Real Sector Division',
        'Research Division',
        'Revenue Policy Division',
        'Unclaimed Fund Division',
        'Central Tender Review Committee',
        'Office of the Chief Director',
        'Office of the Coordinating Director (Operation)',
        'Office of the Coordinating Director (Technical)',
        'Office of the Deputy Minister',
        'Office of the Minister'
      )
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid Ministry division';
    end if;
  else
    v_division := null;
  end if;

  if p_purpose is null
    or p_purpose not in (
      'Meeting',
      'Follow up',
      'SOD / SOL',
      'PUD / Delivery',
      'Personal',
      'Visit',
      'Official'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid visit purpose';
  end if;

  if p_purpose = 'Meeting' then
    if v_person_visiting is not null then
      raise exception using
        errcode = '22023',
        message =
          'Unexpected person being visited';
    end if;

    if p_meeting_id is not null
      and v_custom_meeting_title is not null
    then
      raise exception using
        errcode = '22023',
        message =
          'Select either an official or custom meeting';
    end if;

    if p_meeting_id is not null then
      if not exists (
        select 1
        from public.get_available_meetings(
          current_date
        ) as available_meeting
        where available_meeting.id = p_meeting_id
      ) then
        raise exception using
          errcode = '22023',
          message = 'Meeting is unavailable';
      end if;
    elsif v_custom_meeting_title is null
      or char_length(v_custom_meeting_title)
        not between 2 and 160
    then
      raise exception using
        errcode = '22023',
        message =
          'Invalid custom meeting title';
    end if;
  else
    if v_person_visiting is null
      or char_length(v_person_visiting)
        not between 2 and 120
    then
      raise exception using
        errcode = '22023',
        message =
          'Invalid person being visited';
    end if;

    if p_meeting_id is not null
      or v_custom_meeting_title is not null
    then
      raise exception using
        errcode = '22023',
        message =
          'Unexpected meeting information';
    end if;
  end if;

  delete from public.used_visitor_verification_tokens
  where expires_at < v_now - interval '1 day';

  insert into public.used_visitor_verification_tokens (
    token_id,
    expires_at,
    consumed_at,
    visit_id
  )
  values (
    p_verification_token_id,
    p_token_expires_at,
    v_now,
    null
  );

  for v_reference_attempt in 1..5 loop
    v_reference_code :=
      'VIS-' ||
      upper(
        encode(
          extensions.gen_random_bytes(4),
          'hex'
        )
      );

    begin
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
        status
      )
      values (
        p_visitor_id,
        null,
        p_destination_agency,
        v_division,
        v_person_visiting,
        p_purpose,
        p_meeting_id,
        v_custom_meeting_title,
        v_reference_code,
        'checked_in'
      )
      returning id into v_new_visit_id;

      exit;
    exception
      when unique_violation then
        if v_reference_attempt = 5 then
          raise;
        end if;
    end;
  end loop;

  update public.used_visitor_verification_tokens
  set visit_id = v_new_visit_id
  where token_id = p_verification_token_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'TOKEN_CONSUMPTION_FAILED';
  end if;

  -- Record the visit and notice acknowledgement in the same
  -- database transaction and with the same timestamp.
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
    v_new_visit_id,
    v_reference_code;
end;
$function$;

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
          v_guest.organization, '2.1', v_guest.consent_confirmed_at
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
            '2.1', v_guest.consent_confirmed_at
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

notify pgrst, 'reload schema';

commit;
