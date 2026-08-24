begin;

-- ============================================================
-- Temporary-password staff onboarding
-- ============================================================
--
-- Existing staff accounts remain fully configured.
-- Newly created temporary-password accounts are explicitly
-- marked by the server after their staff profile is created.
-- ============================================================

alter table public.staff_profiles
  add column password_change_required boolean
    not null
    default false,
  add column temporary_password_expires_at
    timestamp with time zone,
  add column password_setup_completed_at
    timestamp with time zone;

alter table public.staff_profiles
  add constraint
    staff_profiles_temporary_password_state_check
  check (
    (
      password_change_required = false
      and temporary_password_expires_at is null
    )
    or
    (
      password_change_required = true
      and temporary_password_expires_at is not null
      and password_setup_completed_at is null
    )
  );

create index
  staff_profiles_pending_password_setup_idx
on public.staff_profiles (
  temporary_password_expires_at,
  user_id
)
where password_change_required = true;

comment on column
  public.staff_profiles.password_change_required
is
  'Requires the staff member to replace an administrator-issued temporary password before accessing staff functions.';

comment on column
  public.staff_profiles.temporary_password_expires_at
is
  'Expiry time for the initial temporary password. Null after password setup is completed.';

comment on column
  public.staff_profiles.password_setup_completed_at
is
  'Time when the staff member replaced the initial temporary password. Tokens issued at or before this time cannot authorize staff access.';

-- ============================================================
-- Token-aware staff authorization
-- ============================================================

create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.staff_profiles as staff
    where staff.user_id = auth.uid()
      and staff.active = true
      and staff.password_change_required = false
      and (
        staff.password_setup_completed_at is null
        or coalesce(
          nullif(
            auth.jwt() ->> 'iat',
            ''
          )::bigint,
          0
        ) >
        floor(
          extract(
            epoch from
              staff.password_setup_completed_at
          )
        )::bigint
      )
  );
$function$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.staff_profiles as staff
    where staff.user_id = auth.uid()
      and staff.active = true
      and staff.role = 'admin'
      and staff.password_change_required = false
      and (
        staff.password_setup_completed_at is null
        or coalesce(
          nullif(
            auth.jwt() ->> 'iat',
            ''
          )::bigint,
          0
        ) >
        floor(
          extract(
            epoch from
              staff.password_setup_completed_at
          )
        )::bigint
      )
  );
$function$;

revoke all
  on function public.is_active_staff()
  from public, anon;

revoke all
  on function public.is_admin()
  from public, anon;

grant execute
  on function public.is_active_staff()
  to authenticated, service_role;

grant execute
  on function public.is_admin()
  to authenticated, service_role;

-- ============================================================
-- Password-setup completion
-- ============================================================

create or replace function
  public.complete_staff_password_setup(
    p_actor_id uuid
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_active boolean;
  v_completed_at timestamp with time zone;
  v_expires_at timestamp with time zone;
  v_password_change_required boolean;
begin
  if p_actor_id is null then
    raise exception using
      errcode = '22023',
      message =
        'Invalid staff identifier';
  end if;

  select
    staff.active,
    staff.password_change_required,
    staff.temporary_password_expires_at
  into
    v_active,
    v_password_change_required,
    v_expires_at
  from public.staff_profiles as staff
  where staff.user_id = p_actor_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message =
        'Staff profile was not found';
  end if;

  if v_active is not true then
    raise exception using
      errcode = '42501',
      message =
        'Staff account is not authorised';
  end if;

  if v_password_change_required is not true then
    raise exception using
      errcode = '55000',
      message =
        'Password setup is already complete';
  end if;

  if (
    v_expires_at is null
    or v_expires_at <= now()
  ) then
    raise exception using
      errcode = '55000',
      message =
        'Temporary password has expired';
  end if;

  v_completed_at := now();

  update public.staff_profiles
  set
    password_change_required = false,
    temporary_password_expires_at = null,
    password_setup_completed_at =
      v_completed_at
  where user_id = p_actor_id;

  insert into public.audit_events (
    actor_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    p_actor_id,
    'staff.password_setup_completed',
    'staff_profile',
    p_actor_id::text,
    jsonb_build_object(
      'passwordSetupCompletedAt',
      v_completed_at
    )
  );

  return jsonb_build_object(
    'passwordChangeRequired',
    false,
    'passwordSetupCompletedAt',
    v_completed_at
  );
end;
$function$;

revoke all
  on function
    public.complete_staff_password_setup(
      uuid
    )
  from public, anon, authenticated;

grant execute
  on function
    public.complete_staff_password_setup(
      uuid
    )
  to service_role;

comment on function
  public.complete_staff_password_setup(
    uuid
  )
is
  'Completes temporary-password onboarding and records the security event without storing password material.';

notify pgrst, 'reload schema';

commit;