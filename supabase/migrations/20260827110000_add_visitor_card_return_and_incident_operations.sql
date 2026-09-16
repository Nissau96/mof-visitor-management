begin;

-- ============================================================
-- Remove the retired two-parameter checkout overload
-- ============================================================

revoke all
  on function
    public.checkout_visit(
      uuid,
      uuid
    )
  from
    public,
    anon,
    authenticated,
    service_role;

drop function if exists
  public.checkout_visit(
    uuid,
    uuid
  );

-- ============================================================
-- Atomic card return and visitor check-out
-- ============================================================

create or replace function
  public.checkout_visit(
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
  v_actor_scope jsonb;
  v_assignment
    public.visitor_card_assignments%rowtype;
  v_card
    public.visitor_cards%rowtype;
  v_checked_out_at
    timestamp with time zone;
  v_has_assignment boolean := false;
  v_role text;
  v_tower_scope text;
  v_visit
    public.visits%rowtype;
begin
  if p_visit_id is null then
    raise exception using
      errcode = '22023',
      message =
        'Invalid visit identifier';
  end if;

  v_actor_scope :=
    public.resolve_visitor_card_actor_scope(
      p_actor_id,
      p_tower
    );

  v_role :=
    v_actor_scope ->> 'role';

  v_tower_scope :=
    v_actor_scope ->> 'tower';

  if v_role =
    'client_service_head'
  then
    raise exception using
      errcode = '42501',
      message =
        'Client Service Head accounts cannot perform reception check-out';
  end if;

  select visit.*
  into v_visit
  from public.visits as visit
  where visit.id =
    p_visit_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message =
        'Visit was not found';
  end if;

  if (
    v_tower_scope <> ''
    and v_visit.tower <>
      v_tower_scope
  ) then
    raise exception using
      errcode = '42501',
      message =
        'The visit does not belong to the selected tower';
  end if;

  select assignment.*
  into v_assignment
  from public.visitor_card_assignments
    as assignment
  where assignment.visit_id =
    v_visit.id
  for update;

  v_has_assignment := found;

  if v_visit.status =
    'checked_out'
  then
    if v_visit.checked_out_at
      is null
    then
      raise exception using
        errcode = '23514',
        message =
          'Checked-out visit has an invalid timestamp';
    end if;

    return jsonb_build_object(
      'visitId',
      v_visit.id,
      'reference',
      v_visit.reference_code,
      'tower',
      v_visit.tower,
      'status',
      'checked_out',
      'checkedOutAt',
      v_visit.checked_out_at,
      'cardReturned',
      v_has_assignment
        and v_assignment.status =
          'returned',
      'alreadyCheckedOut',
      true
    );
  end if;

  if v_visit.status =
    'cancelled'
  then
    raise exception using
      errcode = '55000',
      message =
        'A cancelled visit cannot be checked out';
  end if;

  if v_visit.status <>
    'checked_in'
  then
    raise exception using
      errcode = '55000',
      message =
        'Visit cannot be checked out';
  end if;

  -- Transitional support for visits that were already active
  -- before visitor-card admission was introduced.

  if not v_has_assignment then
    if v_visit.admitted_by
      is not null
    then
      raise exception using
        errcode = '23514',
        message =
          'The admitted visit does not have a visitor-card assignment';
    end if;

    v_checked_out_at := now();

    update public.visits
    set
      status = 'checked_out',
      checked_out_at =
        v_checked_out_at
    where id = v_visit.id;

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
      v_visit.id::text,
      jsonb_build_object(
        'reference',
        v_visit.reference_code,
        'tower',
        v_visit.tower,
        'staffRole',
        v_role,
        'legacyWithoutCard',
        true,
        'checkedOutAt',
        v_checked_out_at
      )
    );

    return jsonb_build_object(
      'visitId',
      v_visit.id,
      'reference',
      v_visit.reference_code,
      'tower',
      v_visit.tower,
      'status',
      'checked_out',
      'checkedOutAt',
      v_checked_out_at,
      'cardReturned',
      false,
      'legacyWithoutCard',
      true,
      'alreadyCheckedOut',
      false
    );
  end if;

  if v_assignment.status in (
    'not_returned',
    'deactivated'
  ) then
    raise exception using
      errcode = '55000',
      message =
        'The visitor card must be handled through the card-incident process';
  end if;

  if v_assignment.status =
    'returned'
  then
    raise exception using
      errcode = '23514',
      message =
        'The card is recorded as returned but the visit remains checked in';
  end if;

  if v_assignment.status <>
    'assigned'
  then
    raise exception using
      errcode = '55000',
      message =
        'The visitor-card assignment cannot be returned';
  end if;

  select card.*
  into v_card
  from public.visitor_cards
    as card
  where card.id =
    v_assignment.card_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message =
        'Assigned visitor card was not found';
  end if;

  if v_card.status <>
    'assigned'
  then
    raise exception using
      errcode = '23514',
      message =
        'The visitor-card inventory state does not match its assignment';
  end if;

  v_checked_out_at := now();

  update
    public.visitor_card_assignments
  set
    status = 'returned',
    returned_at =
      v_checked_out_at,
    returned_by =
      p_actor_id,
    return_notes =
      'Card returned during visitor check-out.',
    updated_at =
      v_checked_out_at
  where id =
    v_assignment.id;

  update public.visitor_cards
  set
    status = 'available',
    updated_at =
      v_checked_out_at
  where id =
    v_card.id;

  update public.visits
  set
    status = 'checked_out',
    checked_out_at =
      v_checked_out_at
  where id =
    v_visit.id;

  insert into public.audit_events (
    actor_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    p_actor_id,
    'visitor_card.returned',
    'visitor_card_assignment',
    v_assignment.id::text,
    jsonb_build_object(
      'visitId',
      v_visit.id,
      'visitorId',
      v_visit.visitor_id,
      'reference',
      v_visit.reference_code,
      'cardId',
      v_card.id,
      'cardNumber',
      v_card.card_number,
      'tower',
      v_visit.tower,
      'returnedAt',
      v_checked_out_at
    )
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
    'visit.checked_out',
    'visit',
    v_visit.id::text,
    jsonb_build_object(
      'reference',
      v_visit.reference_code,
      'tower',
      v_visit.tower,
      'staffRole',
      v_role,
      'cardNumber',
      v_card.card_number,
      'cardReturned',
      true,
      'checkedOutAt',
      v_checked_out_at
    )
  );

  return jsonb_build_object(
    'visitId',
    v_visit.id,
    'reference',
    v_visit.reference_code,
    'tower',
    v_visit.tower,
    'status',
    'checked_out',
    'checkedOutAt',
    v_checked_out_at,
    'cardReturned',
    true,
    'card',
    jsonb_build_object(
      'cardId',
      v_card.id,
      'cardNumber',
      v_card.card_number,
      'status',
      'available'
    ),
    'alreadyCheckedOut',
    false
  );
end;
$function$;

-- ============================================================
-- Automatically flag cards overdue after 24 hours
-- ============================================================

create or replace function
  public.mark_overdue_visitor_cards()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_incident_id uuid;
  v_marked_count integer := 0;
  v_overdue record;
begin
  for v_overdue in
    select
      assignment.id
        as assignment_id,
      assignment.return_due_at,
      card.id as card_id,
      card.card_number,
      visit.id as visit_id,
      visit.reference_code,
      visit.tower,
      visit.visitor_id
    from public.visitor_card_assignments
      as assignment
    join public.visitor_cards
      as card
      on card.id =
        assignment.card_id
    join public.visits
      as visit
      on visit.id =
        assignment.visit_id
    where assignment.status =
        'assigned'
      and assignment.return_due_at <=
        now()
    order by
      assignment.return_due_at,
      assignment.id
    for update
      of assignment,
         card
    skip locked
  loop
    update
      public.visitor_card_assignments
    set
      status = 'not_returned',
      updated_at = now()
    where id =
      v_overdue.assignment_id;

    update public.visitor_cards
    set
      status = 'not_returned',
      updated_at = now()
    where id =
      v_overdue.card_id;

    insert into
      public.visitor_card_incidents (
        assignment_id,
        opened_reason,
        status
      )
    values (
      v_overdue.assignment_id,
      'overdue',
      'open'
    )
    on conflict (
      assignment_id
    )
    do nothing
    returning id
    into v_incident_id;

    if v_incident_id is null then
      select incident.id
      into v_incident_id
      from public.visitor_card_incidents
        as incident
      where incident.assignment_id =
        v_overdue.assignment_id;
    end if;

    insert into public.audit_events (
      actor_id,
      action,
      entity_type,
      entity_id,
      details
    )
    values (
      null,
      'visitor_card.not_returned',
      'visitor_card_incident',
      v_incident_id::text,
      jsonb_build_object(
        'assignmentId',
        v_overdue.assignment_id,
        'visitId',
        v_overdue.visit_id,
        'visitorId',
        v_overdue.visitor_id,
        'reference',
        v_overdue.reference_code,
        'cardId',
        v_overdue.card_id,
        'cardNumber',
        v_overdue.card_number,
        'tower',
        v_overdue.tower,
        'returnDueAt',
        v_overdue.return_due_at,
        'openedReason',
        'overdue'
      )
    );

    v_marked_count :=
      v_marked_count + 1;

    v_incident_id := null;
  end loop;

  return jsonb_build_object(
    'markedNotReturnedCount',
    v_marked_count
  );
end;
$function$;

-- ============================================================
-- Report a card not returned during check-out
-- ============================================================

create or replace function
  public.report_visitor_card_not_returned(
    p_actor_id uuid,
    p_visit_id uuid,
    p_tower text
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_scope jsonb;
  v_assignment
    public.visitor_card_assignments%rowtype;
  v_card
    public.visitor_cards%rowtype;
  v_incident_id uuid;
  v_now timestamp with time zone :=
    now();
  v_role text;
  v_tower_scope text;
  v_visit
    public.visits%rowtype;
begin
  if p_visit_id is null then
    raise exception using
      errcode = '22023',
      message =
        'Invalid visit identifier';
  end if;

  v_actor_scope :=
    public.resolve_visitor_card_actor_scope(
      p_actor_id,
      p_tower
    );

  v_role :=
    v_actor_scope ->> 'role';

  v_tower_scope :=
    v_actor_scope ->> 'tower';

  if v_role =
    'client_service_head'
  then
    raise exception using
      errcode = '42501',
      message =
        'Client Service Head accounts cannot perform reception check-out';
  end if;

  select visit.*
  into v_visit
  from public.visits as visit
  where visit.id =
    p_visit_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message =
        'Visit was not found';
  end if;

  if (
    v_tower_scope <> ''
    and v_visit.tower <>
      v_tower_scope
  ) then
    raise exception using
      errcode = '42501',
      message =
        'The visit does not belong to the selected tower';
  end if;

  select assignment.*
  into v_assignment
  from public.visitor_card_assignments
    as assignment
  where assignment.visit_id =
    v_visit.id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message =
        'Visitor-card assignment was not found';
  end if;

  select card.*
  into v_card
  from public.visitor_cards
    as card
  where card.id =
    v_assignment.card_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message =
        'Assigned visitor card was not found';
  end if;

  if v_assignment.status =
    'not_returned'
  then
    select incident.id
    into v_incident_id
    from public.visitor_card_incidents
      as incident
    where incident.assignment_id =
      v_assignment.id;

    return jsonb_build_object(
      'reportedNotReturned',
      true,
      'alreadyReported',
      true,
      'incidentId',
      v_incident_id,
      'visitId',
      v_visit.id,
      'cardNumber',
      v_card.card_number
    );
  end if;

  if v_visit.status <>
    'checked_in'
  then
    raise exception using
      errcode = '55000',
      message =
        'Only a checked-in visit can report an unreturned card';
  end if;

  if v_assignment.status <>
    'assigned'
  then
    raise exception using
      errcode = '55000',
      message =
        'The visitor-card assignment cannot be reported as unreturned';
  end if;

  if v_card.status <>
    'assigned'
  then
    raise exception using
      errcode = '23514',
      message =
        'The visitor-card inventory state does not match its assignment';
  end if;

  update
    public.visitor_card_assignments
  set
    status = 'not_returned',
    updated_at = v_now
  where id =
    v_assignment.id;

  update public.visitor_cards
  set
    status = 'not_returned',
    updated_at = v_now
  where id =
    v_card.id;

  insert into
    public.visitor_card_incidents (
      assignment_id,
      opened_reason,
      status
    )
  values (
    v_assignment.id,
    'reported_not_returned',
    'open'
  )
  returning id
  into v_incident_id;

  -- The visitor has physically departed, although the card
  -- remains outstanding and unavailable.

  update public.visits
  set
    status = 'checked_out',
    checked_out_at = v_now
  where id =
    v_visit.id;

  insert into public.audit_events (
    actor_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    p_actor_id,
    'visitor_card.not_returned',
    'visitor_card_incident',
    v_incident_id::text,
    jsonb_build_object(
      'assignmentId',
      v_assignment.id,
      'visitId',
      v_visit.id,
      'visitorId',
      v_visit.visitor_id,
      'reference',
      v_visit.reference_code,
      'cardId',
      v_card.id,
      'cardNumber',
      v_card.card_number,
      'tower',
      v_visit.tower,
      'openedReason',
      'reported_not_returned',
      'reportedAt',
      v_now
    )
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
    'visit.checked_out',
    'visit',
    v_visit.id::text,
    jsonb_build_object(
      'reference',
      v_visit.reference_code,
      'tower',
      v_visit.tower,
      'cardNumber',
      v_card.card_number,
      'cardReturned',
      false,
      'incidentId',
      v_incident_id,
      'checkedOutAt',
      v_now
    )
  );

  return jsonb_build_object(
    'reportedNotReturned',
    true,
    'alreadyReported',
    false,
    'incidentId',
    v_incident_id,
    'visitId',
    v_visit.id,
    'visitorId',
    v_visit.visitor_id,
    'reference',
    v_visit.reference_code,
    'checkedOutAt',
    v_now,
    'card',
    jsonb_build_object(
      'cardId',
      v_card.id,
      'cardNumber',
      v_card.card_number,
      'status',
      'not_returned'
    )
  );
end;
$function$;

-- ============================================================
-- Begin incident investigation
-- ============================================================

create or replace function
  public.start_visitor_card_incident_investigation(
    p_actor_id uuid,
    p_incident_id uuid,
    p_notes text,
    p_tower text default ''
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_scope jsonb;
  v_assignment
    public.visitor_card_assignments%rowtype;
  v_card
    public.visitor_cards%rowtype;
  v_incident
    public.visitor_card_incidents%rowtype;
  v_notes text :=
    btrim(
      coalesce(
        p_notes,
        ''
      )
    );
  v_now timestamp with time zone :=
    now();
  v_role text;
  v_tower_scope text;
  v_visit
    public.visits%rowtype;
begin
  if p_incident_id is null then
    raise exception using
      errcode = '22023',
      message =
        'Invalid incident identifier';
  end if;

  if char_length(v_notes)
    not between 5 and 2000
  then
    raise exception using
      errcode = '22023',
      message =
        'Investigation notes must contain between 5 and 2000 characters';
  end if;

  v_actor_scope :=
    public.resolve_visitor_card_actor_scope(
      p_actor_id,
      p_tower
    );

  v_role :=
    v_actor_scope ->> 'role';

  v_tower_scope :=
    v_actor_scope ->> 'tower';

  if v_role not in (
    'client_service_head',
    'admin'
  ) then
    raise exception using
      errcode = '42501',
      message =
        'Only the Client Service Head or Super Administrator can investigate card incidents';
  end if;

  select incident.*
  into v_incident
  from public.visitor_card_incidents
    as incident
  where incident.id =
    p_incident_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message =
        'Visitor-card incident was not found';
  end if;

  select assignment.*
  into v_assignment
  from public.visitor_card_assignments
    as assignment
  where assignment.id =
    v_incident.assignment_id
  for update;

  select visit.*
  into v_visit
  from public.visits as visit
  where visit.id =
    v_assignment.visit_id
  for update;

  if (
    v_tower_scope <> ''
    and v_visit.tower <>
      v_tower_scope
  ) then
    raise exception using
      errcode = '42501',
      message =
        'The incident does not belong to the selected tower';
  end if;

  select card.*
  into v_card
  from public.visitor_cards
    as card
  where card.id =
    v_assignment.card_id
  for update;

  if v_incident.status =
    'resolved'
  then
    raise exception using
      errcode = '55000',
      message =
        'The visitor-card incident is already resolved';
  end if;

  if v_incident.status =
    'investigating'
  then
    return jsonb_build_object(
      'investigationStarted',
      true,
      'alreadyInvestigating',
      true,
      'incidentId',
      v_incident.id,
      'assignedTo',
      v_incident.assigned_to,
      'startedAt',
      v_incident.investigation_started_at
    );
  end if;

  update
    public.visitor_card_incidents
  set
    status = 'investigating',
    assigned_to = p_actor_id,
    investigation_started_at =
      v_now,
    investigation_started_by =
      p_actor_id,
    investigation_notes =
      v_notes,
    updated_at = v_now
  where id =
    v_incident.id;

  update public.visitor_cards
  set
    status = 'investigating',
    updated_at = v_now
  where id =
    v_card.id;

  insert into public.audit_events (
    actor_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    p_actor_id,
    'visitor_card.investigation_started',
    'visitor_card_incident',
    v_incident.id::text,
    jsonb_build_object(
      'assignmentId',
      v_assignment.id,
      'visitId',
      v_visit.id,
      'visitorId',
      v_visit.visitor_id,
      'cardId',
      v_card.id,
      'cardNumber',
      v_card.card_number,
      'tower',
      v_visit.tower,
      'notes',
      v_notes,
      'startedAt',
      v_now
    )
  );

  return jsonb_build_object(
    'investigationStarted',
    true,
    'alreadyInvestigating',
    false,
    'incidentId',
    v_incident.id,
    'assignedTo',
    p_actor_id,
    'startedAt',
    v_now,
    'cardNumber',
    v_card.card_number
  );
end;
$function$;

-- ============================================================
-- Resolve an investigated card incident
-- ============================================================

create or replace function
  public.resolve_visitor_card_incident(
    p_actor_id uuid,
    p_incident_id uuid,
    p_resolution text,
    p_notes text,
    p_tower text default ''
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_scope jsonb;
  v_assignment
    public.visitor_card_assignments%rowtype;
  v_card
    public.visitor_cards%rowtype;
  v_incident
    public.visitor_card_incidents%rowtype;
  v_notes text :=
    btrim(
      coalesce(
        p_notes,
        ''
      )
    );
  v_now timestamp with time zone :=
    now();
  v_requires_reprint boolean;
  v_resolution text :=
    lower(
      btrim(
        coalesce(
          p_resolution,
          ''
        )
      )
    );
  v_role text;
  v_tower_scope text;
  v_visit
    public.visits%rowtype;
begin
  if p_incident_id is null then
    raise exception using
      errcode = '22023',
      message =
        'Invalid incident identifier';
  end if;

  if v_resolution not in (
    'late_return',
    'lost',
    'damaged',
    'unusable'
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Invalid visitor-card incident resolution';
  end if;

  if char_length(v_notes)
    not between 5 and 2000
  then
    raise exception using
      errcode = '22023',
      message =
        'Resolution notes must contain between 5 and 2000 characters';
  end if;

  v_actor_scope :=
    public.resolve_visitor_card_actor_scope(
      p_actor_id,
      p_tower
    );

  v_role :=
    v_actor_scope ->> 'role';

  v_tower_scope :=
    v_actor_scope ->> 'tower';

  if v_role not in (
    'client_service_head',
    'admin'
  ) then
    raise exception using
      errcode = '42501',
      message =
        'Only the Client Service Head or Super Administrator can resolve card incidents';
  end if;

  select incident.*
  into v_incident
  from public.visitor_card_incidents
    as incident
  where incident.id =
    p_incident_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message =
        'Visitor-card incident was not found';
  end if;

  if v_incident.status =
    'resolved'
  then
    return jsonb_build_object(
      'incidentResolved',
      true,
      'alreadyResolved',
      true,
      'incidentId',
      v_incident.id,
      'resolution',
      v_incident.resolution,
      'resolvedAt',
      v_incident.resolved_at
    );
  end if;

  if v_incident.status <>
    'investigating'
  then
    raise exception using
      errcode = '55000',
      message =
        'The incident must be investigated before it can be resolved';
  end if;

  if (
    v_incident.assigned_to
      is not null
    and v_incident.assigned_to <>
      p_actor_id
    and v_role <> 'admin'
  ) then
    raise exception using
      errcode = '42501',
      message =
        'The incident is assigned to another officer';
  end if;

  select assignment.*
  into v_assignment
  from public.visitor_card_assignments
    as assignment
  where assignment.id =
    v_incident.assignment_id
  for update;

  select visit.*
  into v_visit
  from public.visits as visit
  where visit.id =
    v_assignment.visit_id
  for update;

  if (
    v_tower_scope <> ''
    and v_visit.tower <>
      v_tower_scope
  ) then
    raise exception using
      errcode = '42501',
      message =
        'The incident does not belong to the selected tower';
  end if;

  select card.*
  into v_card
  from public.visitor_cards
    as card
  where card.id =
    v_assignment.card_id
  for update;

  v_requires_reprint :=
    v_resolution <> 'late_return';

  if v_resolution =
    'late_return'
  then
    update
      public.visitor_card_assignments
    set
      status = 'returned',
      returned_at = v_now,
      returned_by = p_actor_id,
      return_notes = v_notes,
      updated_at = v_now
    where id =
      v_assignment.id;

    update public.visitor_cards
    set
      status = 'available',
      updated_at = v_now
    where id =
      v_card.id;
  else
    update
      public.visitor_card_assignments
    set
      status = 'deactivated',
      returned_at = null,
      returned_by = null,
      return_notes = null,
      updated_at = v_now
    where id =
      v_assignment.id;

    update public.visitor_cards
    set
      status = 'deactivated',
      deactivation_reason =
        v_resolution,
      deactivation_notes =
        v_notes,
      deactivated_at = v_now,
      deactivated_by =
        p_actor_id,
      updated_at = v_now
    where id =
      v_card.id;
  end if;

  update
    public.visitor_card_incidents
  set
    status = 'resolved',
    resolution = v_resolution,
    resolution_notes = v_notes,
    resolved_at = v_now,
    resolved_by = p_actor_id,
    updated_at = v_now
  where id =
    v_incident.id;

  -- Automatic overdue incidents may still have a checked-in
  -- visit. Resolution closes that visit safely.

  if v_visit.status =
    'checked_in'
  then
    update public.visits
    set
      status = 'checked_out',
      checked_out_at = v_now
    where id =
      v_visit.id;
  end if;

  insert into public.audit_events (
    actor_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    p_actor_id,
    'visitor_card.incident_resolved',
    'visitor_card_incident',
    v_incident.id::text,
    jsonb_build_object(
      'assignmentId',
      v_assignment.id,
      'visitId',
      v_visit.id,
      'visitorId',
      v_visit.visitor_id,
      'cardId',
      v_card.id,
      'cardNumber',
      v_card.card_number,
      'tower',
      v_visit.tower,
      'resolution',
      v_resolution,
      'requiresReprint',
      v_requires_reprint,
      'resolvedAt',
      v_now
    )
  );

  return jsonb_build_object(
    'incidentResolved',
    true,
    'alreadyResolved',
    false,
    'incidentId',
    v_incident.id,
    'resolution',
    v_resolution,
    'resolvedAt',
    v_now,
    'requiresReprint',
    v_requires_reprint,
    'card',
    jsonb_build_object(
      'cardId',
      v_card.id,
      'cardNumber',
      v_card.card_number,
      'status',
      case
        when v_requires_reprint
        then 'deactivated'
        else 'available'
      end
    )
  );
end;
$function$;

-- ============================================================
-- Register a replacement for a deactivated physical card
-- ============================================================

create or replace function
  public.reprint_deactivated_visitor_card(
    p_actor_id uuid,
    p_card_id uuid,
    p_notes text,
    p_tower text default ''
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_scope jsonb;
  v_existing_replacement
    public.visitor_cards%rowtype;
  v_new_card
    public.visitor_cards%rowtype;
  v_next_sequence integer;
  v_notes text :=
    btrim(
      coalesce(
        p_notes,
        ''
      )
    );
  v_old_card
    public.visitor_cards%rowtype;
  v_role text;
  v_tower_scope text;
begin
  if p_card_id is null then
    raise exception using
      errcode = '22023',
      message =
        'Invalid visitor-card identifier';
  end if;

  if char_length(v_notes)
    not between 5 and 1000
  then
    raise exception using
      errcode = '22023',
      message =
        'Reprint notes must contain between 5 and 1000 characters';
  end if;

  v_actor_scope :=
    public.resolve_visitor_card_actor_scope(
      p_actor_id,
      p_tower
    );

  v_role :=
    v_actor_scope ->> 'role';

  v_tower_scope :=
    v_actor_scope ->> 'tower';

  if v_role not in (
    'client_service_head',
    'admin'
  ) then
    raise exception using
      errcode = '42501',
      message =
        'Only the Client Service Head or Super Administrator can register replacement cards';
  end if;

  select card.*
  into v_old_card
  from public.visitor_cards
    as card
  where card.id =
    p_card_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message =
        'Visitor card was not found';
  end if;

  if (
    v_tower_scope <> ''
    and v_old_card.tower <>
      v_tower_scope
  ) then
    raise exception using
      errcode = '42501',
      message =
        'The visitor card does not belong to the selected tower';
  end if;

  if v_old_card.status <>
    'deactivated'
  then
    raise exception using
      errcode = '55000',
      message =
        'Only a permanently deactivated card can be reprinted';
  end if;

  select replacement.*
  into v_existing_replacement
  from public.visitor_cards
    as replacement
  where replacement.replaces_card_id =
    v_old_card.id;

  if found then
    return jsonb_build_object(
      'replacementRegistered',
      true,
      'alreadyRegistered',
      true,
      'oldCardNumber',
      v_old_card.card_number,
      'replacementCard',
      jsonb_build_object(
        'cardId',
        v_existing_replacement.id,
        'cardNumber',
        v_existing_replacement.card_number,
        'tower',
        v_existing_replacement.tower,
        'status',
        v_existing_replacement.status
      )
    );
  end if;

  if exists (
    select 1
    from public.visitor_cards
      as current_card
    where current_card.base_number =
        v_old_card.base_number
      and current_card.status <>
        'deactivated'
  ) then
    raise exception using
      errcode = '55000',
      message =
        'An active card already exists for this base number';
  end if;

  select
    coalesce(
      max(
        card.replacement_sequence
      ),
      0
    ) + 1
  into v_next_sequence
  from public.visitor_cards as card
  where card.base_number =
    v_old_card.base_number;

  if v_next_sequence > 999 then
    raise exception using
      errcode = '22003',
      message =
        'The visitor-card replacement sequence is exhausted';
  end if;

  insert into public.visitor_cards (
    base_number,
    replacement_sequence,
    status,
    replaces_card_id,
    created_by
  )
  values (
    v_old_card.base_number,
    v_next_sequence,
    'available',
    v_old_card.id,
    p_actor_id
  )
  returning *
  into v_new_card;

  insert into public.audit_events (
    actor_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    p_actor_id,
    'visitor_card.replacement_registered',
    'visitor_card',
    v_new_card.id::text,
    jsonb_build_object(
      'oldCardId',
      v_old_card.id,
      'oldCardNumber',
      v_old_card.card_number,
      'replacementCardId',
      v_new_card.id,
      'replacementCardNumber',
      v_new_card.card_number,
      'baseNumber',
      v_new_card.base_number,
      'replacementSequence',
      v_new_card.replacement_sequence,
      'tower',
      v_new_card.tower,
      'notes',
      v_notes
    )
  );

  return jsonb_build_object(
    'replacementRegistered',
    true,
    'alreadyRegistered',
    false,
    'oldCardNumber',
    v_old_card.card_number,
    'replacementCard',
    jsonb_build_object(
      'cardId',
      v_new_card.id,
      'cardNumber',
      v_new_card.card_number,
      'baseNumber',
      v_new_card.base_number,
      'replacementSequence',
      v_new_card.replacement_sequence,
      'tower',
      v_new_card.tower,
      'status',
      v_new_card.status
    )
  );
end;
$function$;

-- ============================================================
-- Function permissions
-- ============================================================

revoke all
  on function
    public.checkout_visit(
      uuid,
      uuid,
      text
    )
  from public, anon, authenticated;

revoke all
  on function
    public.mark_overdue_visitor_cards()
  from public, anon, authenticated;

revoke all
  on function
    public.report_visitor_card_not_returned(
      uuid,
      uuid,
      text
    )
  from public, anon, authenticated;

revoke all
  on function
    public.start_visitor_card_incident_investigation(
      uuid,
      uuid,
      text,
      text
    )
  from public, anon, authenticated;

revoke all
  on function
    public.resolve_visitor_card_incident(
      uuid,
      uuid,
      text,
      text,
      text
    )
  from public, anon, authenticated;

revoke all
  on function
    public.reprint_deactivated_visitor_card(
      uuid,
      uuid,
      text,
      text
    )
  from public, anon, authenticated;

grant execute
  on function
    public.checkout_visit(
      uuid,
      uuid,
      text
    )
  to service_role;

grant execute
  on function
    public.mark_overdue_visitor_cards()
  to service_role;

grant execute
  on function
    public.report_visitor_card_not_returned(
      uuid,
      uuid,
      text
    )
  to service_role;

grant execute
  on function
    public.start_visitor_card_incident_investigation(
      uuid,
      uuid,
      text,
      text
    )
  to service_role;

grant execute
  on function
    public.resolve_visitor_card_incident(
      uuid,
      uuid,
      text,
      text,
      text
    )
  to service_role;

grant execute
  on function
    public.reprint_deactivated_visitor_card(
      uuid,
      uuid,
      text,
      text
    )
  to service_role;

comment on function
  public.checkout_visit(
    uuid,
    uuid,
    text
  )
is
  'Atomically returns the assigned visitor card and checks out the visitor. Legacy pre-card visits remain safely supported.';

comment on function
  public.mark_overdue_visitor_cards()
is
  'Marks assigned cards as not returned after their 24-hour deadline and creates auditable incidents.';

comment on function
  public.report_visitor_card_not_returned(
    uuid,
    uuid,
    text
  )
is
  'Records that a visitor departed without returning the assigned card and opens an incident.';

comment on function
  public.start_visitor_card_incident_investigation(
    uuid,
    uuid,
    text,
    text
  )
is
  'Assigns an open visitor-card incident to the acting Client Service Head or Super Administrator.';

comment on function
  public.resolve_visitor_card_incident(
    uuid,
    uuid,
    text,
    text,
    text
  )
is
  'Resolves an investigated card incident as late return, lost, damaged or unusable.';

comment on function
  public.reprint_deactivated_visitor_card(
    uuid,
    uuid,
    text,
    text
  )
is
  'Registers the next replacement identifier only after the preceding physical card has been permanently deactivated.';

notify pgrst, 'reload schema';

commit;