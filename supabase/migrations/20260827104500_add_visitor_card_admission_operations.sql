begin;

-- ============================================================
-- Pending-admission lifecycle
-- ============================================================

alter table public.visits
  alter column checked_in_at
    drop not null,
  alter column checked_in_at
    drop default,
  alter column status
    set default 'pending_admission';

drop index if exists
  public.visits_one_checked_in_per_visitor_idx;

create unique index
  visits_one_active_admission_per_visitor_idx
on public.visits (
  visitor_id
)
where status in (
  'pending_admission',
  'checked_in'
);

-- Existing registration functions explicitly insert
-- "checked_in". Convert those inserts into admission requests
-- without duplicating their established validation logic.

create or replace function
  public.prepare_pending_visitor_admission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (
    new.status in (
      'pending_admission',
      'checked_in'
    )
    and new.admitted_by is null
  ) then
    if exists (
      select 1
      from public.visits as existing_visit
      where existing_visit.visitor_id =
        new.visitor_id
        and existing_visit.status in (
          'pending_admission',
          'checked_in'
        )
    ) then
      raise exception using
        errcode = 'P0001',
        message =
          'VISITOR_ALREADY_CHECKED_IN';
    end if;

    new.status :=
      'pending_admission';

    new.checked_in_at := null;
    new.checked_out_at := null;
    new.admitted_at := null;
    new.admitted_by := null;

    new.admission_expires_at :=
      (
        date_trunc(
          'day',
          now() at time zone
            'Africa/Accra'
        ) +
        interval '1 day'
      ) at time zone
        'Africa/Accra';

    new.admission_cancelled_at := null;
    new.admission_cancelled_by := null;
    new.admission_cancellation_reason :=
      null;
  end if;

  return new;
end;
$function$;

drop trigger if exists
  visits_prepare_pending_admission
on public.visits;

create trigger
  visits_prepare_pending_admission
before insert
on public.visits
for each row
execute function
  public.prepare_pending_visitor_admission();

create or replace function
  public.audit_pending_visitor_admission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status =
    'pending_admission'
  then
    insert into public.audit_events (
      actor_id,
      action,
      entity_type,
      entity_id,
      details
    )
    values (
      null,
      'visit.admission_requested',
      'visit',
      new.id::text,
      jsonb_build_object(
        'visitorId',
        new.visitor_id,
        'referenceCode',
        new.reference_code,
        'tower',
        new.tower,
        'admissionExpiresAt',
        new.admission_expires_at
      )
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists
  visits_audit_pending_admission
on public.visits;

create trigger
  visits_audit_pending_admission
after insert
on public.visits
for each row
execute function
  public.audit_pending_visitor_admission();

-- ============================================================
-- Staff scope validation
-- ============================================================

create or replace function
  public.resolve_visitor_card_actor_scope(
    p_actor_id uuid,
    p_requested_tower text
      default ''
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_active boolean;
  v_password_change_required boolean;
  v_role text;
  v_tower text :=
    lower(
      btrim(
        coalesce(
          p_requested_tower,
          ''
        )
      )
    );
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
    staff.role
  into
    v_active,
    v_password_change_required,
    v_role
  from public.staff_profiles as staff
  where staff.user_id = p_actor_id;

  if not found
    or v_active is not true
    or v_password_change_required is true
  then
    raise exception using
      errcode = '42501',
      message =
        'Staff account is not authorised';
  end if;

  if v_role not in (
    'receptionist',
    'client_service_head',
    'admin'
  ) then
    raise exception using
      errcode = '42501',
      message =
        'Staff role is not authorised';
  end if;

  if (
    v_tower <> ''
    and v_tower not in (
      'tower_1',
      'tower_2'
    )
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Invalid tower';
  end if;

  if (
    v_role = 'receptionist'
    and v_tower = ''
  ) then
    raise exception using
      errcode = '42501',
      message =
        'Receptionist tower is required';
  end if;

  return jsonb_build_object(
    'role',
    v_role,
    'tower',
    v_tower
  );
end;
$function$;

-- ============================================================
-- Expire unadmitted requests at Accra midnight
-- ============================================================

create or replace function
  public.expire_pending_visitor_admissions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_expired_count integer := 0;
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

  return jsonb_build_object(
    'expiredCount',
    v_expired_count
  );
end;
$function$;

-- ============================================================
-- Pending-admission list
-- ============================================================

create or replace function
  public.get_pending_visitor_admissions(
    p_actor_id uuid,
    p_tower text default '',
    p_page integer default 1,
    p_page_size integer default 10,
    p_search text default ''
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_scope jsonb;
  v_page integer := p_page;
  v_page_size integer := p_page_size;
  v_search text :=
    lower(
      btrim(
        coalesce(
          p_search,
          ''
        )
      )
    );
  v_offset integer;
  v_role text;
  v_tower text;
  v_total_count bigint := 0;
  v_total_pages integer := 0;
  v_admissions jsonb := '[]'::jsonb;
begin
  v_actor_scope :=
    public.resolve_visitor_card_actor_scope(
      p_actor_id,
      p_tower
    );

  v_role :=
    v_actor_scope ->> 'role';

  v_tower :=
    v_actor_scope ->> 'tower';

  if (
    v_page is null
    or v_page < 1
    or v_page > 10000
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Invalid admissions page';
  end if;

  if (
    v_page_size is null
    or v_page_size < 1
    or v_page_size > 50
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Invalid admissions page size';
  end if;

  if char_length(v_search) > 120 then
    raise exception using
      errcode = '22023',
      message =
        'Admission search is too long';
  end if;

  perform
    public.expire_pending_visitor_admissions();

  v_offset :=
    (v_page - 1) *
    v_page_size;

  select count(*)
  into v_total_count
  from public.visits as visit
  join public.visitor_profiles
    as visitor
    on visitor.id =
      visit.visitor_id
  where visit.status =
      'pending_admission'
    and (
      v_tower = ''
      or visit.tower =
        v_tower
    )
    and (
      v_search = ''
      or strpos(
        lower(
          visitor.full_name
        ),
        v_search
      ) > 0
      or strpos(
        lower(
          coalesce(
            visitor.phone,
            ''
          )
        ),
        v_search
      ) > 0
      or strpos(
        lower(
          coalesce(
            visit.reference_code,
            ''
          )
        ),
        v_search
      ) > 0
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
      admission_row.payload
      order by
        admission_row.created_at
          desc,
        admission_row.visit_id
          desc
    ),
    '[]'::jsonb
  )
  into v_admissions
  from (
    select
      visit.created_at,
      visit.id as visit_id,
      jsonb_build_object(
        'visitId',
        visit.id,
        'visitorId',
        visitor.id,
        'referenceCode',
        visit.reference_code,
        'fullName',
        visitor.full_name,
        'phone',
        visitor.phone,
        'email',
        visitor.email,
        'organization',
        visitor.organization,
        'destinationAgency',
        visit.destination_agency,
        'destinationDivision',
        visit.destination_division,
        'personVisiting',
        visit.person_visiting,
        'purpose',
        visit.purpose,
        'tower',
        visit.tower,
        'submittedAt',
        visit.created_at,
        'admissionExpiresAt',
        visit.admission_expires_at,
        'status',
        visit.status
      ) as payload
    from public.visits as visit
    join public.visitor_profiles
      as visitor
      on visitor.id =
        visit.visitor_id
    where visit.status =
        'pending_admission'
      and (
        v_tower = ''
        or visit.tower =
          v_tower
      )
      and (
        v_search = ''
        or strpos(
          lower(
            visitor.full_name
          ),
          v_search
        ) > 0
        or strpos(
          lower(
            coalesce(
              visitor.phone,
              ''
            )
          ),
          v_search
        ) > 0
        or strpos(
          lower(
            coalesce(
              visit.reference_code,
              ''
            )
          ),
          v_search
        ) > 0
      )
    order by
      visit.created_at desc,
      visit.id desc
    limit v_page_size
    offset v_offset
  ) as admission_row;

  return jsonb_build_object(
    'admissions',
    v_admissions,
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
    'scope',
    jsonb_build_object(
      'role',
      v_role,
      'tower',
      case
        when v_tower = ''
          then null
        else v_tower
      end
    )
  );
end;
$function$;

-- ============================================================
-- Search available cards by the last three digits
-- ============================================================

create or replace function
  public.get_available_visitor_cards(
    p_actor_id uuid,
    p_tower text,
    p_last_three_digits text
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_scope jsonb;
  v_base_number integer;
  v_digits text :=
    btrim(
      coalesce(
        p_last_three_digits,
        ''
      )
    );
  v_tower text;
  v_cards jsonb := '[]'::jsonb;
begin
  v_actor_scope :=
    public.resolve_visitor_card_actor_scope(
      p_actor_id,
      p_tower
    );

  v_tower :=
    v_actor_scope ->> 'tower';

  if v_tower = '' then
    raise exception using
      errcode = '22023',
      message =
        'A tower is required when searching for cards';
  end if;

  if v_digits !~ '^[0-9]{3}$' then
    raise exception using
      errcode = '22023',
      message =
        'Enter exactly the last three card digits';
  end if;

  v_base_number :=
    v_digits::integer;

  if (
    (
      v_tower = 'tower_2'
      and v_base_number
        not between 1 and 199
    )
    or
    (
      v_tower = 'tower_1'
      and v_base_number
        not between 200 and 299
    )
  ) then
    return jsonb_build_object(
      'cards',
      '[]'::jsonb,
      'lastThreeDigits',
      v_digits,
      'tower',
      v_tower
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cardId',
        card.id,
        'cardNumber',
        card.card_number,
        'baseNumber',
        card.base_number,
        'replacementSequence',
        card.replacement_sequence,
        'tower',
        card.tower,
        'status',
        card.status
      )
      order by
        card.replacement_sequence
          desc
    ),
    '[]'::jsonb
  )
  into v_cards
  from public.visitor_cards as card
  where card.base_number =
      v_base_number
    and card.tower =
      v_tower
    and card.status =
      'available';

  return jsonb_build_object(
    'cards',
    v_cards,
    'lastThreeDigits',
    v_digits,
    'tower',
    v_tower
  );
end;
$function$;

-- ============================================================
-- Admit a visitor and assign a card atomically
-- ============================================================

create or replace function
  public.admit_visitor_with_card(
    p_actor_id uuid,
    p_visit_id uuid,
    p_card_id uuid,
    p_tower text
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_scope jsonb;
  v_assignment_id uuid;
  v_card public.visitor_cards%rowtype;
  v_now timestamp with time zone :=
    now();
  v_return_due_at
    timestamp with time zone;
  v_tower text;
  v_visit public.visits%rowtype;
begin
  if (
    p_visit_id is null
    or p_card_id is null
  ) then
    raise exception using
      errcode = '22023',
      message =
        'A visit and visitor card are required';
  end if;

  v_actor_scope :=
    public.resolve_visitor_card_actor_scope(
      p_actor_id,
      p_tower
    );

  v_tower :=
    v_actor_scope ->> 'tower';

  if v_tower = '' then
    raise exception using
      errcode = '22023',
      message =
        'A tower is required for admission';
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
        'Pending admission was not found';
  end if;

  if v_visit.status <>
    'pending_admission'
  then
    raise exception using
      errcode = '55000',
      message =
        'The visitor is no longer awaiting admission';
  end if;

  if (
    v_visit.admission_expires_at
      is null
    or
    v_visit.admission_expires_at <=
      v_now
  ) then
    raise exception using
      errcode = '55000',
      message =
        'The admission request has expired';
  end if;

  if v_visit.tower <>
    v_tower
  then
    raise exception using
      errcode = '42501',
      message =
        'The visitor belongs to a different tower';
  end if;

  select card.*
  into v_card
  from public.visitor_cards as card
  where card.id =
    p_card_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message =
        'Visitor card was not found';
  end if;

  if v_card.tower <>
    v_visit.tower
  then
    raise exception using
      errcode = '42501',
      message =
        'The card belongs to a different tower';
  end if;

  if v_card.status <>
    'available'
  then
    raise exception using
      errcode = '55000',
      message =
        'The selected visitor card is unavailable';
  end if;

  v_return_due_at :=
    v_now +
    interval '24 hours';

  insert into
    public.visitor_card_assignments (
      card_id,
      visit_id,
      assigned_by,
      assigned_at,
      return_due_at,
      status
    )
  values (
    v_card.id,
    v_visit.id,
    p_actor_id,
    v_now,
    v_return_due_at,
    'assigned'
  )
  returning id
  into v_assignment_id;

  update public.visitor_cards
  set
    status = 'assigned',
    updated_at = v_now
  where id = v_card.id;

  update public.visits
  set
    status = 'checked_in',
    checked_in_at = v_now,
    admitted_at = v_now,
    admitted_by = p_actor_id,
    admission_expires_at = null,
    admission_cancelled_at = null,
    admission_cancelled_by = null,
    admission_cancellation_reason =
      null
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
    'visit.admitted',
    'visit',
    v_visit.id::text,
    jsonb_build_object(
      'visitorId',
      v_visit.visitor_id,
      'assignmentId',
      v_assignment_id,
      'cardId',
      v_card.id,
      'cardNumber',
      v_card.card_number,
      'tower',
      v_visit.tower,
      'returnDueAt',
      v_return_due_at
    )
  );

  return jsonb_build_object(
    'admitted',
    true,
    'visit',
    jsonb_build_object(
      'visitId',
      v_visit.id,
      'visitorId',
      v_visit.visitor_id,
      'referenceCode',
      v_visit.reference_code,
      'tower',
      v_visit.tower,
      'status',
      'checked_in',
      'checkedInAt',
      v_now
    ),
    'cardAssignment',
    jsonb_build_object(
      'assignmentId',
      v_assignment_id,
      'cardId',
      v_card.id,
      'cardNumber',
      v_card.card_number,
      'assignedAt',
      v_now,
      'returnDueAt',
      v_return_due_at,
      'status',
      'assigned'
    )
  );
end;
$function$;

-- ============================================================
-- Cancel a pending admission
-- ============================================================

create or replace function
  public.cancel_pending_visitor_admission(
    p_actor_id uuid,
    p_visit_id uuid,
    p_reason text,
    p_tower text
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_scope jsonb;
  v_now timestamp with time zone :=
    now();
  v_reason text :=
    btrim(
      coalesce(
        p_reason,
        ''
      )
    );
  v_tower text;
  v_visit public.visits%rowtype;
begin
  if p_visit_id is null then
    raise exception using
      errcode = '22023',
      message =
        'A visit is required';
  end if;

  if (
    char_length(v_reason) < 5
    or char_length(v_reason) > 500
  ) then
    raise exception using
      errcode = '22023',
      message =
        'A cancellation reason between 5 and 500 characters is required';
  end if;

  v_actor_scope :=
    public.resolve_visitor_card_actor_scope(
      p_actor_id,
      p_tower
    );

  v_tower :=
    v_actor_scope ->> 'tower';

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
        'Pending admission was not found';
  end if;

  if v_visit.status <>
    'pending_admission'
  then
    raise exception using
      errcode = '55000',
      message =
        'The visitor is no longer awaiting admission';
  end if;

  if (
    v_tower <> ''
    and v_visit.tower <>
      v_tower
  ) then
    raise exception using
      errcode = '42501',
      message =
        'The visitor belongs to a different tower';
  end if;

  update public.visits
  set
    status = 'cancelled',
    admission_cancelled_at = v_now,
    admission_cancelled_by =
      p_actor_id,
    admission_cancellation_reason =
      v_reason,
    admission_expires_at = null
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
    'visit.admission_cancelled',
    'visit',
    v_visit.id::text,
    jsonb_build_object(
      'visitorId',
      v_visit.visitor_id,
      'referenceCode',
      v_visit.reference_code,
      'tower',
      v_visit.tower,
      'reason',
      v_reason
    )
  );

  return jsonb_build_object(
    'admissionCancelled',
    true,
    'visitId',
    v_visit.id,
    'status',
    'cancelled'
  );
end;
$function$;

-- ============================================================
-- Function permissions
-- ============================================================

revoke all
  on function
    public.prepare_pending_visitor_admission()
  from public, anon, authenticated;

revoke all
  on function
    public.audit_pending_visitor_admission()
  from public, anon, authenticated;

revoke all
  on function
    public.resolve_visitor_card_actor_scope(
      uuid,
      text
    )
  from public, anon, authenticated;

revoke all
  on function
    public.expire_pending_visitor_admissions()
  from public, anon, authenticated;

revoke all
  on function
    public.get_pending_visitor_admissions(
      uuid,
      text,
      integer,
      integer,
      text
    )
  from public, anon, authenticated;

revoke all
  on function
    public.get_available_visitor_cards(
      uuid,
      text,
      text
    )
  from public, anon, authenticated;

revoke all
  on function
    public.admit_visitor_with_card(
      uuid,
      uuid,
      uuid,
      text
    )
  from public, anon, authenticated;

revoke all
  on function
    public.cancel_pending_visitor_admission(
      uuid,
      uuid,
      text,
      text
    )
  from public, anon, authenticated;

grant execute
  on function
    public.resolve_visitor_card_actor_scope(
      uuid,
      text
    )
  to service_role;

grant execute
  on function
    public.expire_pending_visitor_admissions()
  to service_role;

grant execute
  on function
    public.get_pending_visitor_admissions(
      uuid,
      text,
      integer,
      integer,
      text
    )
  to service_role;

grant execute
  on function
    public.get_available_visitor_cards(
      uuid,
      text,
      text
    )
  to service_role;

grant execute
  on function
    public.admit_visitor_with_card(
      uuid,
      uuid,
      uuid,
      text
    )
  to service_role;

grant execute
  on function
    public.cancel_pending_visitor_admission(
      uuid,
      uuid,
      text,
      text
    )
  to service_role;

comment on function
  public.get_available_visitor_cards(
    uuid,
    text,
    text
  )
is
  'Finds an available physical visitor card using its exact final three digits and the selected reception tower.';

comment on function
  public.admit_visitor_with_card(
    uuid,
    uuid,
    uuid,
    text
  )
is
  'Atomically assigns an available physical visitor card and confirms visitor admission.';

comment on function
  public.cancel_pending_visitor_admission(
    uuid,
    uuid,
    text,
    text
  )
is
  'Cancels a pending visitor admission with an auditable reason.';

notify pgrst, 'reload schema';

commit;