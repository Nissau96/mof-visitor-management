begin;

-- ============================================================
-- Phase 1: Staff tower authorization
-- ============================================================
--
-- Receptionists:
-- - must select Tower 1 or Tower 2;
-- - may operate only on visits assigned to that tower.
--
-- Administrators:
-- - may select either tower;
-- - may use an empty tower value for all-tower access.
-- ============================================================

create or replace function public.get_staff_tower_scope(
  p_actor_id uuid,
  p_requested_tower text
)
returns table (
  staff_role text,
  tower_scope text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_role text;

  v_tower text :=
    nullif(
      lower(
        btrim(
          coalesce(
            p_requested_tower,
            ''
          )
        )
      ),
      ''
    );
begin
  if p_actor_id is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff identifier';
  end if;

  select staff.role::text
  into v_role
  from public.staff_profiles as staff
  where staff.user_id = p_actor_id
    and staff.active = true
    and staff.role in (
      'receptionist',
      'admin'
    )
  limit 1;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Staff account is not authorised';
  end if;

  if v_tower is not null
    and v_tower not in (
      'tower_1',
      'tower_2'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid tower selection';
  end if;

  if v_role = 'receptionist'
    and v_tower is null
  then
    raise exception using
      errcode = '42501',
      message =
        'Receptionists must select a working tower';
  end if;

  return query
  select
    v_role,
    v_tower;
end;
$function$;

revoke all
  on function public.get_staff_tower_scope(
    uuid,
    text
  )
  from public, anon, authenticated;

grant execute
  on function public.get_staff_tower_scope(
    uuid,
    text
  )
  to service_role;

comment on function public.get_staff_tower_scope(
  uuid,
  text
)
is
  'Validates an active staff member and returns their authorised reception tower scope. Receptionists require one tower; administrators may access all towers.';

-- ============================================================
-- Tower-authorized visitor checkout
-- ============================================================
--
-- This is a new three-parameter overload. The existing
-- two-parameter function remains temporarily available until
-- the updated API has been deployed and verified.
-- ============================================================

create or replace function public.checkout_visit(
  p_visit_id uuid,
  p_actor_id uuid,
  p_tower text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_staff_role text;
  v_tower_scope text;

  v_status public.visit_status;
  v_reference_code text;
  v_visit_tower text;
  v_checked_out_at timestamp with time zone;
begin
  if p_visit_id is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid visit identifier';
  end if;

  select
    authorised_scope.staff_role,
    authorised_scope.tower_scope
  into
    v_staff_role,
    v_tower_scope
  from public.get_staff_tower_scope(
    p_actor_id,
    p_tower
  ) as authorised_scope;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Staff tower access could not be verified';
  end if;

  -- Lock the visit so concurrent checkout requests cannot
  -- create conflicting status changes or duplicate audits.
  select
    visit.status,
    visit.reference_code,
    visit.tower,
    visit.checked_out_at
  into
    v_status,
    v_reference_code,
    v_visit_tower,
    v_checked_out_at
  from public.visits as visit
  where visit.id = p_visit_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Visit was not found';
  end if;

  -- A receptionist may access only the selected tower.
  -- An administrator selecting a specific tower is also
  -- restricted to that filter. An administrator using the
  -- all-towers scope has a null v_tower_scope.
  if v_tower_scope is not null
    and v_visit_tower <> v_tower_scope
  then
    raise exception using
      errcode = '42501',
      message =
        'The visit does not belong to the selected tower';
  end if;

  -- Repeated checkout is idempotent.
  if v_status = 'checked_out' then
    if v_checked_out_at is null then
      raise exception using
        errcode = '23514',
        message =
          'Checked-out visit has an invalid timestamp';
    end if;

    return jsonb_build_object(
      'visitId',
      p_visit_id,
      'reference',
      v_reference_code,
      'tower',
      v_visit_tower,
      'status',
      'checked_out',
      'checkedOutAt',
      v_checked_out_at,
      'alreadyCheckedOut',
      true
    );
  end if;

  if v_status = 'cancelled' then
    raise exception using
      errcode = '55000',
      message =
        'A cancelled visit cannot be checked out';
  end if;

  if v_status <> 'checked_in' then
    raise exception using
      errcode = '55000',
      message = 'Visit cannot be checked out';
  end if;

  v_checked_out_at := now();

  update public.visits
  set
    status = 'checked_out',
    checked_out_at = v_checked_out_at
  where id = p_visit_id;

  insert into public.audit_events (
    actor_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    p_actor_id,
    'visit.checked_out',
    'visit',
    p_visit_id::text,
    jsonb_build_object(
      'reference',
      v_reference_code,
      'tower',
      v_visit_tower,
      'staffRole',
      v_staff_role,
      'towerScope',
      v_tower_scope,
      'previousStatus',
      'checked_in',
      'newStatus',
      'checked_out',
      'checkedOutAt',
      v_checked_out_at
    )
  );

  return jsonb_build_object(
    'visitId',
    p_visit_id,
    'reference',
    v_reference_code,
    'tower',
    v_visit_tower,
    'status',
    'checked_out',
    'checkedOutAt',
    v_checked_out_at,
    'alreadyCheckedOut',
    false
  );
end;
$function$;

revoke all
  on function public.checkout_visit(
    uuid,
    uuid,
    text
  )
  from public, anon, authenticated;

grant execute
  on function public.checkout_visit(
    uuid,
    uuid,
    text
  )
  to service_role;

comment on function public.checkout_visit(
  uuid,
  uuid,
  text
)
is
  'Checks out a visit only when it belongs to the staff member selected tower scope and records the authorised action.';

notify pgrst, 'reload schema';

commit;