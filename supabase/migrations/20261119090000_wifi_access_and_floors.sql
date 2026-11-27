begin;

-- ============================================================
-- IT Network Administrator role
-- ============================================================
-- IT network staff see only the Wi-Fi access page. Staff invitation
-- and editing also accept the Client Service Head role, which the
-- database had not been updated to allow.

alter table public.staff_profiles
  drop constraint if exists staff_profiles_role_check;

alter table public.staff_profiles
  add constraint staff_profiles_role_check
  check (
    role in (
      'receptionist',
      'client_service_head',
      'it_network_admin',
      'admin'
    )
  );

comment on column public.staff_profiles.role is
  'Authorized staff role: receptionist, client_service_head, it_network_admin or admin. The admin role is displayed as Super Administrator in the interface.';

create or replace function
  public.create_invited_staff_profile(
    p_actor_id uuid,
    p_user_id uuid,
    p_full_name text,
    p_role text
  )
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_full_name text :=
    btrim(coalesce(p_full_name, ''));

  v_role text :=
    lower(btrim(coalesce(p_role, '')));

  v_email text;
  v_email_confirmed_at timestamp with time zone;
  v_created_at timestamp with time zone;
begin
  if p_actor_id is null
    or not exists (
      select 1
      from public.staff_profiles as actor
      where actor.user_id = p_actor_id
        and actor.active = true
        and actor.role = 'admin'
    )
  then
    raise exception using
      errcode = '42501',
      message =
        'Administrator account is not authorised';
  end if;

  if p_user_id is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid invited user';
  end if;

  if char_length(v_full_name)
    not between 2 and 120
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff name';
  end if;

  if v_role not in (
    'receptionist',
    'client_service_head',
    'it_network_admin',
    'admin'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff role';
  end if;

  select
    auth_user.email,
    auth_user.email_confirmed_at,
    auth_user.created_at
  into
    v_email,
    v_email_confirmed_at,
    v_created_at
  from auth.users as auth_user
  where auth_user.id = p_user_id;

  if not found or v_email is null then
    raise exception using
      errcode = 'P0002',
      message = 'Invited Auth user was not found';
  end if;

  if exists (
    select 1
    from public.staff_profiles as staff
    where staff.user_id = p_user_id
  ) then
    raise exception using
      errcode = '23505',
      message =
        'Staff profile already exists';
  end if;

  insert into public.staff_profiles (
    user_id,
    full_name,
    role,
    active
  )
  values (
    p_user_id,
    v_full_name,
    v_role,
    true
  );

  insert into public.audit_events (
    actor_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    p_actor_id,
    'staff.invited',
    'staff_profile',
    p_user_id::text,
    jsonb_build_object(
      'role',
      v_role,
      'active',
      true
    )
  );

  return jsonb_build_object(
    'userId',
    p_user_id,
    'fullName',
    v_full_name,
    'email',
    v_email,
    'role',
    v_role,
    'active',
    true,
    'emailConfirmed',
    v_email_confirmed_at is not null,
    'lastSignInAt',
    null,
    'createdAt',
    v_created_at
  );
end;
$function$;

create or replace function public.update_admin_staff(
  p_actor_id uuid,
  p_user_id uuid,
  p_full_name text,
  p_role text,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_full_name text :=
    btrim(coalesce(p_full_name, ''));

  v_role text :=
    lower(btrim(coalesce(p_role, '')));

  v_previous_full_name text;
  v_previous_role text;
  v_previous_active boolean;

  v_email text;
  v_email_confirmed_at timestamp with time zone;
  v_last_sign_in_at timestamp with time zone;
  v_created_at timestamp with time zone;

  v_changed boolean;
begin
  if p_actor_id is null
    or not exists (
      select 1
      from public.staff_profiles as actor
      where actor.user_id = p_actor_id
        and actor.active = true
        and actor.role = 'admin'
    )
  then
    raise exception using
      errcode = '42501',
      message =
        'Administrator account is not authorised';
  end if;

  if p_user_id is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff user';
  end if;

  if char_length(v_full_name)
    not between 2 and 120
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff name';
  end if;

  if v_role not in (
    'receptionist',
    'client_service_head',
    'it_network_admin',
    'admin'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff role';
  end if;

  if p_active is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff status';
  end if;

  select
    staff.full_name,
    staff.role,
    staff.active,
    auth_user.email,
    auth_user.email_confirmed_at,
    auth_user.last_sign_in_at,
    auth_user.created_at
  into
    v_previous_full_name,
    v_previous_role,
    v_previous_active,
    v_email,
    v_email_confirmed_at,
    v_last_sign_in_at,
    v_created_at
  from public.staff_profiles as staff
  join auth.users as auth_user
    on auth_user.id = staff.user_id
  where staff.user_id = p_user_id
  for update of staff;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Staff profile was not found';
  end if;

  -- Administrators cannot remove their own administrative
  -- access or deactivate their own account.
  if p_user_id = p_actor_id
    and (
      v_role <> 'admin'
      or p_active = false
    )
  then
    raise exception using
      errcode = '55000',
      message =
        'Administrators cannot remove their own access';
  end if;

  -- Preserve at least one active administrator.
  if v_previous_role = 'admin'
    and v_previous_active = true
    and (
      v_role <> 'admin'
      or p_active = false
    )
    and not exists (
      select 1
      from public.staff_profiles as other_admin
      where other_admin.user_id <> p_user_id
        and other_admin.role = 'admin'
        and other_admin.active = true
    )
  then
    raise exception using
      errcode = '55000',
      message =
        'At least one active administrator is required';
  end if;

  v_changed :=
    v_previous_full_name is distinct from
      v_full_name
    or v_previous_role is distinct from
      v_role
    or v_previous_active is distinct from
      p_active;

  if v_changed then
    update public.staff_profiles
    set
      full_name = v_full_name,
      role = v_role,
      active = p_active
    where user_id = p_user_id;

    insert into public.audit_events (
      actor_id,
      action,
      entity_type,
      entity_id,
      details
    )
    values (
      p_actor_id,
      'staff.updated',
      'staff_profile',
      p_user_id::text,
      jsonb_build_object(
        'nameChanged',
        v_previous_full_name
          is distinct from v_full_name,
        'previousRole',
        v_previous_role,
        'newRole',
        v_role,
        'previousActive',
        v_previous_active,
        'newActive',
        p_active
      )
    );
  end if;

  return jsonb_build_object(
    'userId',
    p_user_id,
    'fullName',
    v_full_name,
    'email',
    v_email,
    'role',
    v_role,
    'active',
    p_active,
    'emailConfirmed',
    v_email_confirmed_at is not null,
    'lastSignInAt',
    v_last_sign_in_at,
    'createdAt',
    v_created_at,
    'changed',
    v_changed
  );
end;
$function$;

create or replace function public.get_admin_staff(
  p_page integer default 1,
  p_page_size integer default 10,
  p_search text default '',
  p_role text default 'all',
  p_active text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_page integer := p_page;
  v_page_size integer := p_page_size;

  v_search text :=
    lower(
      btrim(
        coalesce(p_search, '')
      )
    );

  v_role text :=
    lower(
      btrim(
        coalesce(p_role, 'all')
      )
    );

  v_active text :=
    lower(
      btrim(
        coalesce(p_active, 'all')
      )
    );

  v_offset integer;
  v_total_count bigint := 0;
  v_total_pages integer := 0;
  v_staff jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  if (
    v_page is null
    or v_page < 1
    or v_page > 10000
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff page';
  end if;

  if (
    v_page_size is null
    or v_page_size < 1
    or v_page_size > 10
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff page size';
  end if;

  if char_length(v_search) > 120 then
    raise exception using
      errcode = '22023',
      message = 'Staff search is too long';
  end if;

  if v_role not in (
    'all',
    'receptionist',
    'client_service_head',
    'it_network_admin',
    'admin'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff role filter';
  end if;

  -- 'inactive' means a deactivated account. Setup pending and expired
  -- follow the temporary-password expiry, as the onboarding badge does.
  if v_active not in (
    'all',
    'active',
    'inactive',
    'setup_pending',
    'setup_expired'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff status filter';
  end if;

  v_offset :=
    (v_page - 1) * v_page_size;

  select jsonb_build_object(
    'totalCount',
    count(*),
    'adminCount',
    count(*) filter (where staff.role = 'admin'),
    'clientServiceHeadCount',
    count(*) filter (
      where staff.role = 'client_service_head'
    ),
    'itNetworkAdminCount',
    count(*) filter (
      where staff.role = 'it_network_admin'
    ),
    'receptionistCount',
    count(*) filter (
      where staff.role = 'receptionist'
    ),
    'activeCount',
    count(*) filter (where staff.active = true),
    'deactivatedCount',
    count(*) filter (where staff.active = false),
    'setupPendingCount',
    count(*) filter (
      where staff.password_change_required = true
        and (
          staff.temporary_password_expires_at is null
          or staff.temporary_password_expires_at > now()
        )
    ),
    'setupExpiredCount',
    count(*) filter (
      where staff.password_change_required = true
        and staff.temporary_password_expires_at <= now()
    )
  )
  into v_summary
  from public.staff_profiles as staff;

  select count(*)
  into v_total_count
  from public.staff_profiles as staff
  join auth.users as auth_user
    on auth_user.id = staff.user_id
  where (
      v_search = ''
      or strpos(
        lower(staff.full_name),
        v_search
      ) > 0
      or strpos(
        lower(
          coalesce(
            auth_user.email,
            ''
          )
        ),
        v_search
      ) > 0
    )
    and (
      v_role = 'all'
      or staff.role = v_role
    )
    and (
      v_active = 'all'
      or (
        v_active = 'active'
        and staff.active = true
      )
      or (
        v_active = 'inactive'
        and staff.active = false
      )
      or (
        v_active = 'setup_pending'
        and staff.password_change_required = true
        and (
          staff.temporary_password_expires_at is null
          or staff.temporary_password_expires_at > now()
        )
      )
      or (
        v_active = 'setup_expired'
        and staff.password_change_required = true
        and staff.temporary_password_expires_at <= now()
      )
    );

  if v_total_count > 0 then
    v_total_pages :=
      ceil(
        v_total_count::numeric /
        v_page_size::numeric
      )::integer;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'userId',
        admin_staff.user_id,
        'fullName',
        admin_staff.full_name,
        'email',
        admin_staff.email,
        'role',
        admin_staff.role,
        'active',
        admin_staff.active,
        'emailConfirmed',
        admin_staff.email_confirmed_at
          is not null,
        'lastSignInAt',
        admin_staff.last_sign_in_at,
        'createdAt',
        admin_staff.created_at,
        'passwordChangeRequired',
        admin_staff.password_change_required,
        'temporaryPasswordExpiresAt',
        admin_staff.temporary_password_expires_at,
        'passwordSetupCompletedAt',
        admin_staff.password_setup_completed_at
      )
      order by
        lower(admin_staff.full_name),
        admin_staff.user_id
    ),
    '[]'::jsonb
  )
  into v_staff
  from (
    select
      staff.user_id,
      staff.full_name,
      auth_user.email,
      staff.role,
      staff.active,
      auth_user.email_confirmed_at,
      auth_user.last_sign_in_at,
      auth_user.created_at,
      staff.password_change_required,
      staff.temporary_password_expires_at,
      staff.password_setup_completed_at
    from public.staff_profiles as staff
    join auth.users as auth_user
      on auth_user.id = staff.user_id
    where (
        v_search = ''
        or strpos(
          lower(staff.full_name),
          v_search
        ) > 0
        or strpos(
          lower(
            coalesce(
              auth_user.email,
              ''
            )
          ),
          v_search
        ) > 0
      )
      and (
        v_role = 'all'
        or staff.role = v_role
      )
      and (
        v_active = 'all'
        or (
          v_active = 'active'
          and staff.active = true
        )
        or (
          v_active = 'inactive'
          and staff.active = false
        )
        or (
          v_active = 'setup_pending'
          and staff.password_change_required = true
          and (
            staff.temporary_password_expires_at is null
            or staff.temporary_password_expires_at > now()
          )
        )
        or (
          v_active = 'setup_expired'
          and staff.password_change_required = true
          and staff.temporary_password_expires_at <= now()
        )
      )
    order by
      lower(staff.full_name),
      staff.user_id
    limit v_page_size
    offset v_offset
  ) as admin_staff;

  return jsonb_build_object(
    'pagination',
    jsonb_build_object(
      'page',
      v_page,
      'pageSize',
      v_page_size,
      'totalCount',
      v_total_count,
      'totalPages',
      v_total_pages
    ),
    'staff',
    v_staff,
    'summary',
    v_summary
  );
end;
$function$;

-- ============================================================
-- Six more Ministry of Finance destinations
-- ============================================================
-- The Central Tender Review Committee, the two Coordinating Director
-- offices, and the offices of the Chief Director, the Deputy Minister
-- and the Minister. All are in Tower 2.

alter table public.visits
  drop constraint if exists visits_destination_division_check;

alter table public.visits
  add constraint visits_destination_division_check
    check (
      (
        destination_agency = 'Ministry of Finance (MoF)'
        and destination_division is not null
        and destination_division in (
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
      )
      or
      (
        destination_agency <> 'Ministry of Finance (MoF)'
        and destination_division is null
      )
    )
    not valid;

alter table public.visits
  validate constraint visits_destination_division_check;

create or replace function public.register_first_visit(
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
  p_consent_version text
)
returns table (
  visitor_id uuid,
  reference_code text
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  new_visitor_id uuid;

  new_reference text :=
    'VIS-' || upper(
      encode(gen_random_bytes(3), 'hex')
    );

  normalized_division text :=
    nullif(
      btrim(p_destination_division),
      ''
    );

  normalized_person_visiting text :=
    nullif(
      btrim(p_person_visiting),
      ''
    );

  normalized_custom_meeting_title text :=
    nullif(
      btrim(p_custom_meeting_title),
      ''
    );
begin
  if char_length(btrim(p_full_name))
    not between 2 and 120
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid visitor name';
  end if;

  if p_destination_agency not in (
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
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid destination agency';
  end if;

  if p_destination_agency =
    'Ministry of Finance (MoF)'
  then
    if normalized_division is null
      or normalized_division not in (
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
    normalized_division := null;
  end if;

  if p_purpose not in (
    'Meeting',
    'Follow up',
    'SOD / SOL',
    'PUD / Delivery',
    'Personal',
    'Visit',
    'Official'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid visit purpose';
  end if;

  if p_purpose = 'Meeting' then
    if normalized_person_visiting is not null then
      raise exception using
        errcode = '22023',
        message = 'Unexpected person being visited';
    end if;

    if p_meeting_id is not null
      and normalized_custom_meeting_title is not null
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
    elsif normalized_custom_meeting_title is null
      or char_length(
        normalized_custom_meeting_title
      ) not between 2 and 160
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid custom meeting title';
    end if;
  else
    if normalized_person_visiting is null
      or char_length(
        normalized_person_visiting
      ) not between 2 and 120
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid person being visited';
    end if;

    if p_meeting_id is not null
      or normalized_custom_meeting_title is not null
    then
      raise exception using
        errcode = '22023',
        message = 'Unexpected meeting information';
    end if;
  end if;

  insert into public.visitor_profiles (
    full_name,
    phone,
    email,
    organization,
    consent_version,
    consented_at
  )
  values (
    btrim(p_full_name),
    p_phone,
    nullif(btrim(p_email), ''),
    nullif(btrim(p_organization), ''),
    p_consent_version,
    now()
  )
  returning id into new_visitor_id;

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
    new_visitor_id,
    null,
    p_destination_agency,
    normalized_division,
    normalized_person_visiting,
    p_purpose,
    p_meeting_id,
    normalized_custom_meeting_title,
    new_reference,
    'checked_in'
  );

  return query
  select
    new_visitor_id,
    new_reference;
end;
$function$;

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

-- ============================================================
-- Wi-Fi access and meeting floors
-- ============================================================
-- Visitors say on every visit whether they need Wi-Fi. A meeting
-- (booked through /book or added by reception) says it once for all
-- its guests and records the floor it is held on. Visitors attending
-- a meeting that already asked for Wi-Fi are not asked again.
--
-- The IT network team works through each request: Waiting, then
-- Access given or Not given. A booker who withdraws a request after
-- access was given leaves it as Cancelled by organiser, so IT knows
-- to revoke it.

alter table public.visits
  add column if not exists wifi_requested boolean,
  add column if not exists wifi_status text,
  add column if not exists wifi_note text,
  add column if not exists wifi_decided_by uuid
    references auth.users(id) on delete set null,
  add column if not exists wifi_decided_at timestamp with time zone;

alter table public.meetings
  add column if not exists floor text,
  add column if not exists wifi_requested boolean not null default false,
  add column if not exists wifi_status text,
  add column if not exists wifi_note text,
  add column if not exists wifi_decided_by uuid
    references auth.users(id) on delete set null,
  add column if not exists wifi_decided_at timestamp with time zone;

alter table public.meeting_bookings
  add column if not exists floor text,
  add column if not exists wifi_requested boolean not null default false;

alter table public.visits
  drop constraint if exists visits_wifi_status_check,
  drop constraint if exists visits_wifi_note_check;

alter table public.visits
  add constraint visits_wifi_status_check
    check (
      wifi_status is null
      or wifi_status in ('waiting', 'given', 'not_given', 'cancelled')
    ),
  add constraint visits_wifi_note_check
    check (wifi_note is null or char_length(wifi_note) between 1 and 300);

alter table public.meetings
  drop constraint if exists meetings_floor_check,
  drop constraint if exists meetings_wifi_status_check,
  drop constraint if exists meetings_wifi_note_check;

alter table public.meetings
  add constraint meetings_floor_check
    check (
      floor is null
      or floor in ('ground', '1', '2', '3', '4', '5', '6', '7')
    ),
  add constraint meetings_wifi_status_check
    check (
      wifi_status is null
      or wifi_status in ('waiting', 'given', 'not_given', 'cancelled')
    ),
  add constraint meetings_wifi_note_check
    check (wifi_note is null or char_length(wifi_note) between 1 and 300);

alter table public.meeting_bookings
  drop constraint if exists meeting_bookings_floor_check;

alter table public.meeting_bookings
  add constraint meeting_bookings_floor_check
    check (
      floor is null
      or floor in ('ground', '1', '2', '3', '4', '5', '6', '7')
    );

comment on column public.visits.wifi_requested is
  'The visitor''s own Wi-Fi answer. Null when the visit is covered by its meeting''s request, or was recorded before Wi-Fi was asked.';

comment on column public.meetings.floor is
  'Floor the meeting is held on: ground or 1 to 7.';

create index if not exists visits_wifi_requested_idx
  on public.visits (created_at)
  where wifi_requested or wifi_status is not null;

create index if not exists meetings_wifi_requested_idx
  on public.meetings (starts_on)
  where wifi_requested or wifi_status is not null;

-- ------------------------------------------------------------
-- Status follows the request
-- ------------------------------------------------------------

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
  elsif old.wifi_status = 'given' then
    -- Access was already given: IT must see that it is withdrawn.
    new.wifi_status := 'cancelled';
    new.wifi_decided_by := null;
    new.wifi_decided_at := now();
  else
    new.wifi_status := null;
    new.wifi_note := null;
    new.wifi_decided_by := null;
    new.wifi_decided_at := null;
  end if;

  return new;
end;
$function$;

drop trigger if exists visits_wifi_request_status on public.visits;

create trigger visits_wifi_request_status
  before insert or update of wifi_requested on public.visits
  for each row
  execute function public.sync_wifi_request_status();

drop trigger if exists meetings_wifi_request_status on public.meetings;

create trigger meetings_wifi_request_status
  before insert or update of wifi_requested on public.meetings
  for each row
  execute function public.sync_wifi_request_status();

-- An approved booking's meeting carries the booking's floor and Wi-Fi
-- request, including later changes the booker makes.
create or replace function public.sync_booking_meeting_wifi()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.meeting_id is null then
    return new;
  end if;

  update public.meetings as meeting
  set
    wifi_requested = new.wifi_requested,
    floor = coalesce(new.floor, meeting.floor)
  where meeting.id = new.meeting_id
    and (
      meeting.wifi_requested is distinct from new.wifi_requested
      or (new.floor is not null and meeting.floor is distinct from new.floor)
    );

  return new;
end;
$function$;

drop trigger if exists meeting_bookings_sync_meeting_wifi on public.meeting_bookings;

create trigger meeting_bookings_sync_meeting_wifi
  after insert or update of meeting_id, wifi_requested, floor
  on public.meeting_bookings
  for each row
  execute function public.sync_booking_meeting_wifi();

-- ------------------------------------------------------------
-- Visitor registration with the Wi-Fi answer
-- ------------------------------------------------------------

-- True when the visit is covered by its meeting's Wi-Fi request.
create or replace function public.meeting_covers_wifi(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    (
      select meeting.wifi_requested
      from public.meetings as meeting
      where meeting.id = p_meeting_id
    ),
    false
  );
$function$;

create or replace function public.register_first_visit_with_wifi(
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
  p_guests jsonb,
  p_wifi_requested boolean
)
returns table (
  visitor_id uuid,
  reference_code text,
  guest_count integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_covered boolean := public.meeting_covers_wifi(p_meeting_id);
  v_visitor_id uuid;
  v_reference text;
  v_guest_count integer;
begin
  if not v_covered and p_wifi_requested is null then
    raise exception using
      errcode = '22023',
      message = 'Choose whether you need Wi-Fi access.';
  end if;

  select registered.visitor_id, registered.reference_code, registered.guest_count
  into v_visitor_id, v_reference, v_guest_count
  from public.register_first_visit_with_guests(
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
    p_consent_version,
    p_guests
  ) as registered;

  -- Guests share the lead visitor's answer.
  if not v_covered then
    update public.visits as visit
    set wifi_requested = p_wifi_requested
    where visit.reference_code = v_reference
      or visit.group_lead_visit_id = (
        select lead.id
        from public.visits as lead
        where lead.reference_code = v_reference
      );
  end if;

  return query
  select v_visitor_id, v_reference, v_guest_count;
end;
$function$;

create or replace function public.register_return_visit_with_wifi(
  p_visitor_id uuid,
  p_verification_token_id uuid,
  p_token_expires_at timestamp with time zone,
  p_destination_agency text,
  p_destination_division text,
  p_person_visiting text,
  p_purpose text,
  p_meeting_id uuid,
  p_custom_meeting_title text,
  p_consent_version text,
  p_organization text,
  p_email text,
  p_wifi_requested boolean
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
  v_covered boolean := public.meeting_covers_wifi(p_meeting_id);
  v_visit_id uuid;
  v_reference text;
begin
  if not v_covered and p_wifi_requested is null then
    raise exception using
      errcode = '22023',
      message = 'Choose whether you need Wi-Fi access.';
  end if;

  select registered.visit_id, registered.reference_code
  into v_visit_id, v_reference
  from public.register_return_visit_with_profile(
    p_visitor_id,
    p_verification_token_id,
    p_token_expires_at,
    p_destination_agency,
    p_destination_division,
    p_person_visiting,
    p_purpose,
    p_meeting_id,
    p_custom_meeting_title,
    p_consent_version,
    p_organization,
    p_email
  ) as registered;

  if not v_covered then
    update public.visits as visit
    set wifi_requested = p_wifi_requested
    where visit.id = v_visit_id;
  end if;

  return query
  select v_visit_id, v_reference;
end;
$function$;

-- Visitor meeting list: also says whether the meeting already asked
-- for Wi-Fi, so the form can skip the question.
create or replace function public.get_available_meeting_options(
  p_agency text,
  p_division text default '',
  p_on_date date default current_date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', meeting.id,
        'title', meeting.title,
        'startsAt', to_char(meeting.starts_at, 'HH24:MI'),
        'endsAt', to_char(meeting.ends_at, 'HH24:MI'),
        'venue', meeting.venue,
        'wifiRequested', meeting.wifi_requested
      )
      order by
        meeting.starts_at nulls last,
        lower(meeting.title),
        meeting.id
    ),
    '[]'::jsonb
  )
  from public.meetings as meeting
  where meeting.active = true
    and public.meeting_occurs_on(
      meeting.schedule_type,
      meeting.starts_on,
      meeting.ends_on,
      meeting.recurrence_days,
      p_on_date
    )
    and public.meeting_hosted_at(
      meeting.host_agency,
      meeting.host_division,
      p_agency,
      p_division
    );
$function$;

-- ------------------------------------------------------------
-- Reception meetings with floor and Wi-Fi
-- ------------------------------------------------------------

create or replace function public.require_meeting_floor(p_floor text)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_floor text := lower(btrim(coalesce(p_floor, '')));
begin
  if v_floor not in ('ground', '1', '2', '3', '4', '5', '6', '7') then
    raise exception using
      errcode = '22023',
      message = 'Select the floor the meeting is on.';
  end if;

  return v_floor;
end;
$function$;

create or replace function public.save_staff_meeting_with_wifi(
  p_actor_id uuid,
  p_tower text,
  p_meeting_id uuid,
  p_title text,
  p_schedule_type text,
  p_starts_on date,
  p_ends_on date,
  p_recurrence_days smallint[],
  p_starts_at time,
  p_ends_at time,
  p_meeting_tower text,
  p_venue text,
  p_host_agency text,
  p_host_division text,
  p_floor text,
  p_wifi_requested boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_floor text := public.require_meeting_floor(p_floor);
  v_result jsonb;
begin
  if p_wifi_requested is null then
    raise exception using
      errcode = '22023',
      message = 'Choose whether the guests need Wi-Fi access.';
  end if;

  v_result := public.save_staff_meeting(
    p_actor_id,
    p_tower,
    p_meeting_id,
    p_title,
    p_schedule_type,
    p_starts_on,
    p_ends_on,
    p_recurrence_days,
    p_starts_at,
    p_ends_at,
    p_meeting_tower,
    p_venue,
    p_host_agency,
    p_host_division
  );

  update public.meetings
  set floor = v_floor, wifi_requested = p_wifi_requested
  where id = (v_result ->> 'meetingId')::uuid;

  return v_result || jsonb_build_object(
    'floor', v_floor,
    'wifiRequested', p_wifi_requested
  );
end;
$function$;

create or replace function public.get_staff_meetings_with_wifi(
  p_actor_id uuid,
  p_tower text default '',
  p_view text default 'today',
  p_search text default '',
  p_page integer default 1,
  p_page_size integer default 10,
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  v_result := public.get_staff_meetings(
    p_actor_id, p_tower, p_view, p_search, p_page, p_page_size, p_from, p_to
  );

  return jsonb_set(
    v_result,
    '{meetings}',
    coalesce(
      (
        select jsonb_agg(
          item.value || jsonb_build_object(
            'floor', meeting.floor,
            'wifiRequested', coalesce(meeting.wifi_requested, false)
          )
          order by item.ordinality
        )
        from jsonb_array_elements(v_result -> 'meetings')
          with ordinality as item(value, ordinality)
        left join public.meetings as meeting
          on meeting.id = (item.value ->> 'meetingId')::uuid
      ),
      '[]'::jsonb
    )
  );
end;
$function$;

-- ------------------------------------------------------------
-- Bookings with floor and Wi-Fi
-- ------------------------------------------------------------

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
    'floor', coalesce(
      (
        select meeting.floor
        from public.meetings as meeting
        where meeting.id = p_booking.meeting_id
      ),
      p_booking.floor
    ),
    'wifiRequested', p_booking.wifi_requested,
    'wifiStatus', (
      select meeting.wifi_status
      from public.meetings as meeting
      where meeting.id = p_booking.meeting_id
    ),
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

create or replace function public.submit_meeting_booking_with_wifi(
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
  p_guests jsonb,
  p_floor text,
  p_wifi_requested boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_floor text := public.require_meeting_floor(p_floor);
  v_result jsonb;
  v_booking public.meeting_bookings%rowtype;
begin
  if p_wifi_requested is null then
    raise exception using
      errcode = '22023',
      message = 'Choose whether the guests need Wi-Fi access.';
  end if;

  v_result := public.submit_meeting_booking(
    p_booker_oid,
    p_booker_email,
    p_booker_name,
    p_title,
    p_schedule_type,
    p_starts_on,
    p_ends_on,
    p_recurrence_days,
    p_starts_at,
    p_ends_at,
    p_host_agency,
    p_host_division,
    p_venue,
    p_notes,
    p_guests
  );

  update public.meeting_bookings
  set floor = v_floor, wifi_requested = p_wifi_requested
  where id = (v_result ->> 'bookingId')::uuid
  returning * into v_booking;

  return public.meeting_booking_json(v_booking);
end;
$function$;

-- The booker turns the Wi-Fi request on or off while the meeting is
-- still to come (until its last day ends).
create or replace function public.set_meeting_booking_wifi(
  p_booker_oid text,
  p_booking_id uuid,
  p_wifi_requested boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_booking public.meeting_bookings%rowtype;
begin
  if p_wifi_requested is null then
    raise exception using
      errcode = '22023',
      message = 'Choose whether the guests need Wi-Fi access.';
  end if;

  v_booking := public.lock_booker_meeting_booking(p_booker_oid, p_booking_id, 'cancel');

  if v_booking.wifi_requested is distinct from p_wifi_requested then
    update public.meeting_bookings
    set wifi_requested = p_wifi_requested
    where id = v_booking.id
    returning * into v_booking;

    insert into public.audit_events (actor_id, action, entity_type, entity_id, details)
    values (
      null,
      'meeting_booking.wifi_changed',
      'meeting_booking',
      v_booking.id::text,
      jsonb_build_object(
        'referenceCode', v_booking.reference_code,
        'wifiRequested', p_wifi_requested
      )
    );
  end if;

  return public.meeting_booking_json(v_booking);
end;
$function$;

-- ------------------------------------------------------------
-- IT network team
-- ------------------------------------------------------------

create or replace function public.require_wifi_reviewer(p_actor_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_role text;
begin
  select staff.role
  into v_role
  from public.staff_profiles as staff
  where staff.user_id = p_actor_id
    and staff.active = true
    and staff.role in ('it_network_admin', 'admin');

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Staff role is not authorised';
  end if;

  return v_role;
end;
$function$;

-- One row per Wi-Fi request in a view. Walk-in visitors are one row
-- each; a meeting is one row carrying its guests. 'today' and
-- 'history' (the 30 days before today) include both; 'upcoming' is
-- meetings after today, up to 90 days ahead. Meetings from bookings
-- count only while the booking is approved.
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
        'decidedByName', decider.full_name
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
stable
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

-- Waiting requests today and ahead: the side-menu badge.
create or replace function public.count_waiting_wifi_requests(p_today date)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select count(*)::integer
  from (
    select r.status from public.wifi_access_rows('today', p_today) as r
    union all
    select r.status from public.wifi_access_rows('upcoming', p_today) as r
  ) as listed_rows
  where listed_rows.status = 'waiting';
$function$;

create or replace function public.get_wifi_waiting_count(p_actor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform public.require_wifi_reviewer(p_actor_id);

  return jsonb_build_object(
    'waitingCount',
    public.count_waiting_wifi_requests(
      (now() at time zone 'Africa/Accra')::date
    )
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
      wifi_decided_at = v_decided_at
    where id = p_entry_id
      and wifi_requested is true;

    v_found := found;
  elsif p_entry_type = 'meeting' then
    update public.meetings
    set
      wifi_status = v_status,
      wifi_note = v_note,
      wifi_decided_by = v_decided_by,
      wifi_decided_at = v_decided_at
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

-- ------------------------------------------------------------
-- Permissions: the API (service role) only
-- ------------------------------------------------------------

do $grants$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.sync_wifi_request_status()',
    'public.sync_booking_meeting_wifi()',
    'public.meeting_covers_wifi(uuid)',
    'public.register_first_visit_with_wifi(text, text, text, text, text, text, text, text, uuid, text, text, jsonb, boolean)',
    'public.register_return_visit_with_wifi(uuid, uuid, timestamp with time zone, text, text, text, text, uuid, text, text, text, text, boolean)',
    'public.get_available_meeting_options(text, text, date)',
    'public.require_meeting_floor(text)',
    'public.save_staff_meeting_with_wifi(uuid, text, uuid, text, text, date, date, smallint[], time, time, text, text, text, text, text, boolean)',
    'public.get_staff_meetings_with_wifi(uuid, text, text, text, integer, integer, date, date)',
    'public.meeting_booking_json(public.meeting_bookings)',
    'public.submit_meeting_booking_with_wifi(text, text, text, text, text, date, date, smallint[], time, time, text, text, text, text, jsonb, text, boolean)',
    'public.set_meeting_booking_wifi(text, uuid, boolean)',
    'public.require_wifi_reviewer(uuid)',
    'public.wifi_access_rows(text, date)',
    'public.get_wifi_access_requests(uuid, text)',
    'public.count_waiting_wifi_requests(date)',
    'public.get_wifi_waiting_count(uuid)',
    'public.set_wifi_access_status(uuid, text, uuid, text, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_signature);
    execute format('grant execute on function %s to service_role', v_signature);
  end loop;
end;
$grants$;

notify pgrst, 'reload schema';

commit;
