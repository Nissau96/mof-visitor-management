begin;

-- ============================================================
-- Stage 12: Finalise returning-visitor privacy acknowledgement
-- ============================================================
-- Makes the notice-aware ten-parameter function independent,
-- then removes the temporary nine-parameter compatibility
-- function.
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
  if v_consent_version <> '2.0' then
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
      'PPA'
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
        'Unclaimed Fund Division'
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

drop function public.register_return_visit(
  uuid,
  uuid,
  timestamp with time zone,
  text,
  text,
  text,
  text,
  uuid,
  text
);

commit;