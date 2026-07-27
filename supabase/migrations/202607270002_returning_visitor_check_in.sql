begin;

-- Stores only random identifiers from consumed verification
-- tokens. It does not store the signed token, visitor ID,
-- telephone number or IP address.
create table public.used_visitor_verification_tokens (
  token_id uuid primary key,
  expires_at timestamp with time zone not null,
  consumed_at timestamp with time zone not null default now(),

  constraint used_visitor_tokens_expiry_check
    check (expires_at > consumed_at)
);

alter table public.used_visitor_verification_tokens
  enable row level security;

revoke all
  on table public.used_visitor_verification_tokens
  from public, anon, authenticated;

create index used_visitor_tokens_expires_at_idx
  on public.used_visitor_verification_tokens (expires_at);

-- The earlier inspection confirmed that no visitor currently
-- has more than one checked-in visit.
create unique index visits_one_checked_in_per_visitor_idx
  on public.visits (visitor_id)
  where status = 'checked_in';

create or replace function public.register_return_visit(
  p_visitor_id uuid,
  p_verification_token_id uuid,
  p_token_expires_at timestamp with time zone,
  p_destination_agency text,
  p_destination_division text,
  p_person_visiting text,
  p_purpose text,
  p_meeting_id uuid,
  p_custom_meeting_title text
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
    or p_token_expires_at > v_now + interval '15 minutes'
  then
    raise exception using
      errcode = '22023',
      message = 'Verification token has expired';
  end if;

  -- Serialise repeat check-ins for the same visitor.
  perform 1
  from public.visitor_profiles as profile
  where profile.id = p_visitor_id
  for update;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'Invalid verified visitor';
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
        message = 'Unexpected person being visited';
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
        message = 'Invalid custom meeting title';
    end if;
  else
    if v_person_visiting is null
      or char_length(v_person_visiting)
        not between 2 and 120
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid person being visited';
    end if;

    if p_meeting_id is not null
      or v_custom_meeting_title is not null
    then
      raise exception using
        errcode = '22023',
        message = 'Unexpected meeting information';
    end if;
  end if;

  -- Remove only old, already-expired replay records.
  delete from public.used_visitor_verification_tokens
  where expires_at < v_now - interval '1 day';

  -- A duplicate token ID means that the signed verification
  -- token was already used for a successful check-in.
  begin
    insert into public.used_visitor_verification_tokens (
      token_id,
      expires_at,
      consumed_at
    )
    values (
      p_verification_token_id,
      p_token_expires_at,
      v_now
    );
  exception
    when unique_violation then
      raise exception using
        errcode = '22023',
        message =
          'Verification token is invalid or already used';
  end;

  -- Generate a new reference and retry only in the
  -- exceptionally unlikely event of a reference collision.
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
    text
  )
  to service_role;

notify pgrst, 'reload schema';

commit;