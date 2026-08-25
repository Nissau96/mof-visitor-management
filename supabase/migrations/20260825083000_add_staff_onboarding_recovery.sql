begin;

-- ============================================================
-- Preserve audit history when Auth users are deleted
-- ============================================================

alter table public.audit_events
  drop constraint if exists
    audit_events_actor_id_fkey;

alter table public.audit_events
  add constraint audit_events_actor_id_fkey
  foreign key (actor_id)
  references auth.users(id)
  on delete set null;

comment on constraint
  audit_events_actor_id_fkey
  on public.audit_events
is
  'Preserves audit events when a referenced Auth user is permanently deleted.';

-- ============================================================
-- Include onboarding state in staff administration results
-- ============================================================

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
set search_path = ''
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
    'admin'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff role filter';
  end if;

  if v_active not in (
    'all',
    'active',
    'inactive'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff status filter';
  end if;

  v_offset :=
    (v_page - 1) * v_page_size;

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
    v_staff
  );
end;
$function$;

-- ============================================================
-- Complete the database portion of temporary-password reissue
-- ============================================================

create or replace function
  public.prepare_admin_staff_password_reissue(
    p_actor_id uuid,
    p_user_id uuid,
    p_expires_at timestamp with time zone
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_active boolean;
  v_email text;
  v_full_name text;
  v_role text;
begin
  if (
    p_actor_id is null
    or p_user_id is null
    or p_expires_at is null
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Invalid password-reissue request';
  end if;

  if p_actor_id = p_user_id then
    raise exception using
      errcode = '55000',
      message =
        'You cannot reissue your own temporary password.';
  end if;

  if not exists (
    select 1
    from public.staff_profiles as actor
    where actor.user_id = p_actor_id
      and actor.active = true
      and actor.role = 'admin'
      and actor.password_change_required = false
  ) then
    raise exception using
      errcode = '42501',
      message =
        'Administrator access is required';
  end if;

  if (
    p_expires_at <= now()
    or p_expires_at >
      now() + interval '25 hours'
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Invalid temporary-password expiry';
  end if;

  select
    staff.active,
    auth_user.email,
    staff.full_name,
    staff.role
  into
    v_active,
    v_email,
    v_full_name,
    v_role
  from public.staff_profiles as staff
  join auth.users as auth_user
    on auth_user.id = staff.user_id
  where staff.user_id = p_user_id
  for update of staff;

  if not found then
    raise exception using
      errcode = 'P0002',
      message =
        'Staff profile was not found';
  end if;

  if v_active is not true then
    raise exception using
      errcode = '55000',
      message =
        'Only active staff accounts can receive a reissued temporary password.';
  end if;

  if not exists (
    select 1
    from public.staff_profiles as staff
    where staff.user_id = p_user_id
      and staff.password_change_required = true
  ) then
    raise exception using
      errcode = '55000',
      message =
        'A temporary password can be reissued only while password setup is pending.';
  end if;

  if (
    v_email is null
    or btrim(v_email) = ''
  ) then
    raise exception using
      errcode = '55000',
      message =
        'The staff account does not have a valid email address.';
  end if;

  update public.staff_profiles
  set
    password_change_required = true,
    temporary_password_expires_at =
      p_expires_at,
    password_setup_completed_at = null
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
    'staff.temporary_password_reissued',
    'staff_profile',
    p_user_id::text,
    jsonb_build_object(
      'expiresAt',
      p_expires_at,
      'role',
      v_role
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
    v_active,
    'passwordChangeRequired',
    true,
    'temporaryPasswordExpiresAt',
    p_expires_at,
    'passwordSetupCompletedAt',
    null
  );
end;
$function$;

-- ============================================================
-- Authorize and record permanent staff-account deletion
-- ============================================================

create or replace function
  public.prepare_admin_staff_deletion(
    p_actor_id uuid,
    p_user_id uuid
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_active boolean;
  v_active_admin_count bigint;
  v_audit_event_id bigint;
  v_email text;
  v_full_name text;
  v_role text;
begin
  if (
    p_actor_id is null
    or p_user_id is null
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Invalid staff-deletion request';
  end if;

  if p_actor_id = p_user_id then
    raise exception using
      errcode = '55000',
      message =
        'You cannot delete your own staff account.';
  end if;

  if not exists (
    select 1
    from public.staff_profiles as actor
    where actor.user_id = p_actor_id
      and actor.active = true
      and actor.role = 'admin'
      and actor.password_change_required = false
  ) then
    raise exception using
      errcode = '42501',
      message =
        'Administrator access is required';
  end if;

  select
    staff.active,
    auth_user.email,
    staff.full_name,
    staff.role
  into
    v_active,
    v_email,
    v_full_name,
    v_role
  from public.staff_profiles as staff
  join auth.users as auth_user
    on auth_user.id = staff.user_id
  where staff.user_id = p_user_id
  for update of staff;

  if not found then
    raise exception using
      errcode = 'P0002',
      message =
        'Staff profile was not found';
  end if;

  if (
    v_role = 'admin'
    and v_active = true
  ) then
    select count(*)
    into v_active_admin_count
    from public.staff_profiles as staff
    where staff.role = 'admin'
      and staff.active = true;

    if v_active_admin_count <= 1 then
      raise exception using
        errcode = '55000',
        message =
          'The last active administrator cannot be deleted.';
    end if;
  end if;

  update public.audit_events
  set details =
    coalesce(
      details,
      '{}'::jsonb
    ) ||
    jsonb_build_object(
      'deletedActorId',
      p_user_id
    )
  where actor_id = p_user_id;

  update public.staff_profiles
  set active = false
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
    'staff.account_deletion_requested',
    'staff_profile',
    p_user_id::text,
    jsonb_build_object(
      'email',
      v_email,
      'fullName',
      v_full_name,
      'role',
      v_role,
      'wasActive',
      v_active
    )
  )
  returning id
  into v_audit_event_id;

  return jsonb_build_object(
    'auditEventId',
    v_audit_event_id,
    'userId',
    p_user_id,
    'fullName',
    v_full_name,
    'email',
    v_email,
    'role',
    v_role,
    'active',
    false
  );
end;
$function$;

-- ============================================================
-- Restrict recovery functions to the trusted server role
-- ============================================================

revoke all
  on function public.get_admin_staff(
    integer,
    integer,
    text,
    text,
    text
  )
  from public, anon, authenticated;

grant execute
  on function public.get_admin_staff(
    integer,
    integer,
    text,
    text,
    text
  )
  to service_role;

revoke all
  on function
    public.prepare_admin_staff_password_reissue(
      uuid,
      uuid,
      timestamp with time zone
    )
  from public, anon, authenticated;

grant execute
  on function
    public.prepare_admin_staff_password_reissue(
      uuid,
      uuid,
      timestamp with time zone
    )
  to service_role;

revoke all
  on function
    public.prepare_admin_staff_deletion(
      uuid,
      uuid
    )
  from public, anon, authenticated;

grant execute
  on function
    public.prepare_admin_staff_deletion(
      uuid,
      uuid
    )
  to service_role;

comment on function public.get_admin_staff(
  integer,
  integer,
  text,
  text,
  text
)
is
  'Returns protected paginated staff records including temporary-password onboarding state.';

comment on function
  public.prepare_admin_staff_password_reissue(
    uuid,
    uuid,
    timestamp with time zone
  )
is
  'Records a new temporary-password expiry after the trusted server replaces the Auth password. Password material is never stored.';

comment on function
  public.prepare_admin_staff_deletion(
    uuid,
    uuid
  )
is
  'Validates a permanent staff deletion, preserves historical actor identifiers, disables the target and records the deletion request before Auth removal.';

notify pgrst, 'reload schema';

commit;