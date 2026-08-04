begin;

-- =========================================================
-- Stage 10: Visitor checkout and paginated visit history
-- =========================================================

-- Direct visit updates must not be available to authenticated
-- browser clients. Checkout is performed through checkout_visit.
drop policy if exists "staff update visits"
  on public.visits;

revoke update
  on table public.visits
  from public, anon, authenticated;

-- Audit records must be created only by trusted database
-- operations, not directly by authenticated browser clients.
revoke insert
  on table public.audit_events
  from public, anon, authenticated;

grant update
  on table public.visits
  to service_role;

grant insert
  on table public.audit_events
  to service_role;

-- =========================================================
-- Supporting indexes
-- =========================================================

create index if not exists
  visits_status_checked_in_at_idx
on public.visits (
  status,
  checked_in_at desc,
  id desc
);

create index if not exists
  visits_checked_out_at_idx
on public.visits (
  checked_out_at desc
)
where checked_out_at is not null;

create index if not exists
  audit_events_entity_created_at_idx
on public.audit_events (
  entity_type,
  entity_id,
  created_at desc
);

-- =========================================================
-- Atomic visitor checkout
-- =========================================================

create or replace function public.checkout_visit(
  p_visit_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status public.visit_status;
  v_reference_code text;
  v_checked_out_at timestamp with time zone;
begin
  if p_visit_id is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid visit identifier';
  end if;

  if p_actor_id is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff identifier';
  end if;

  -- The API authenticates the bearer token. The database also
  -- confirms that the supplied actor remains active and authorised.
  if not exists (
    select 1
    from public.staff_profiles as staff
    where staff.user_id = p_actor_id
      and staff.active = true
      and staff.role in (
        'receptionist',
        'admin'
      )
  ) then
    raise exception using
      errcode = '42501',
      message = 'Staff account is not authorised';
  end if;

  -- Lock the visit so concurrent checkout requests cannot create
  -- conflicting status changes or duplicate audit records.
  select
    visit.status,
    visit.reference_code,
    visit.checked_out_at
  into
    v_status,
    v_reference_code,
    v_checked_out_at
  from public.visits as visit
  where visit.id = p_visit_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Visit was not found';
  end if;

  -- A repeated request for an already checked-out visit is safe
  -- and returns the existing result without another audit event.
  if v_status = 'checked_out' then
    if v_checked_out_at is null then
      raise exception using
        errcode = '23514',
        message = 'Checked-out visit has an invalid timestamp';
    end if;

    return jsonb_build_object(
      'visitId',
      p_visit_id,
      'reference',
      v_reference_code,
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
      message = 'A cancelled visit cannot be checked out';
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
    'status',
    'checked_out',
    'checkedOutAt',
    v_checked_out_at,
    'alreadyCheckedOut',
    false
  );
end;
$function$;

-- =========================================================
-- Paginated visit history
-- =========================================================

create or replace function public.get_visit_history(
  p_page integer default 1,
  p_page_size integer default 10,
  p_search text default '',
  p_status text default '',
  p_agency text default '',
  p_division text default '',
  p_date_from date default null,
  p_date_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_page integer := p_page;
  v_page_size integer := p_page_size;

  v_search text :=
    lower(btrim(coalesce(p_search, '')));

  v_status text :=
    nullif(
      lower(btrim(coalesce(p_status, ''))),
      ''
    );

  v_agency text :=
    nullif(
      btrim(coalesce(p_agency, '')),
      ''
    );

  v_division text :=
    nullif(
      btrim(coalesce(p_division, '')),
      ''
    );

  v_date_from_start timestamp with time zone;
  v_date_to_end timestamp with time zone;

  v_offset integer;
  v_total_count bigint := 0;
  v_total_pages integer := 0;
  v_visits jsonb := '[]'::jsonb;
begin
  if v_page is null
    or v_page < 1
    or v_page > 10000
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid history page';
  end if;

  if v_page_size is null
    or v_page_size < 1
    or v_page_size > 10
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid history page size';
  end if;

  if char_length(v_search) > 80 then
    raise exception using
      errcode = '22023',
      message = 'History search is too long';
  end if;

  if v_status is not null
    and v_status not in (
      'checked_in',
      'checked_out',
      'cancelled'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid visit status filter';
  end if;

  if v_agency is not null
    and char_length(v_agency) > 160
  then
    raise exception using
      errcode = '22023',
      message = 'History agency filter is too long';
  end if;

  if v_division is not null
    and char_length(v_division) > 160
  then
    raise exception using
      errcode = '22023',
      message = 'History division filter is too long';
  end if;

  if v_division is not null
    and v_agency is distinct from
      'Ministry of Finance (MoF)'
  then
    raise exception using
      errcode = '22023',
      message =
        'A division filter requires the Ministry of Finance agency';
  end if;

  if p_date_from is not null
    and p_date_to is not null
    and p_date_from > p_date_to
  then
    raise exception using
      errcode = '22023',
      message = 'History start date must not be after end date';
  end if;

  if p_date_from is not null
    and p_date_to is not null
    and (p_date_to - p_date_from) > 366
  then
    raise exception using
      errcode = '22023',
      message = 'History date range cannot exceed 366 days';
  end if;

  if p_date_from is not null then
    v_date_from_start :=
      p_date_from::timestamp
      at time zone 'Africa/Accra';
  end if;

  if p_date_to is not null then
    v_date_to_end :=
      (p_date_to + 1)::timestamp
      at time zone 'Africa/Accra';
  end if;

  v_offset := (v_page - 1) * v_page_size;

  select count(*)
  into v_total_count
  from public.visits as visit
  join public.visitor_profiles as visitor
    on visitor.id = visit.visitor_id
  where (
      v_search = ''
      or strpos(
        lower(visitor.full_name),
        v_search
      ) > 0
      or strpos(
        lower(visit.reference_code),
        v_search
      ) > 0
    )
    and (
      v_status is null
      or visit.status::text = v_status
    )
    and (
      v_agency is null
      or visit.destination_agency = v_agency
    )
    and (
      v_division is null
      or visit.destination_division = v_division
    )
    and (
      v_date_from_start is null
      or visit.checked_in_at >= v_date_from_start
    )
    and (
      v_date_to_end is null
      or visit.checked_in_at < v_date_to_end
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
        'visitId',
        history_visit.id,
        'reference',
        history_visit.reference_code,
        'status',
        history_visit.status,
        'fullName',
        history_visit.full_name,
        'phone',
        history_visit.phone,
        'organization',
        history_visit.organization,
        'agency',
        history_visit.destination_agency,
        'division',
        history_visit.destination_division,
        'purpose',
        history_visit.purpose,
        'personVisiting',
        history_visit.person_visiting,
        'meetingTitle',
        history_visit.meeting_title,
        'checkedInAt',
        history_visit.checked_in_at,
        'checkedOutAt',
        history_visit.checked_out_at
      )
      order by
        history_visit.checked_in_at desc,
        history_visit.id desc
    ),
    '[]'::jsonb
  )
  into v_visits
  from (
    select
      visit.id,
      visit.reference_code,
      visit.status,
      visitor.full_name,
      visitor.phone,
      visitor.organization,
      visit.destination_agency,
      visit.destination_division,
      visit.purpose,
      visit.person_visiting,
      coalesce(
        meeting.title,
        visit.custom_meeting_title
      ) as meeting_title,
      visit.checked_in_at,
      visit.checked_out_at
    from public.visits as visit
    join public.visitor_profiles as visitor
      on visitor.id = visit.visitor_id
    left join public.meetings as meeting
      on meeting.id = visit.meeting_id
    where (
        v_search = ''
        or strpos(
          lower(visitor.full_name),
          v_search
        ) > 0
        or strpos(
          lower(visit.reference_code),
          v_search
        ) > 0
      )
      and (
        v_status is null
        or visit.status::text = v_status
      )
      and (
        v_agency is null
        or visit.destination_agency = v_agency
      )
      and (
        v_division is null
        or visit.destination_division = v_division
      )
      and (
        v_date_from_start is null
        or visit.checked_in_at >= v_date_from_start
      )
      and (
        v_date_to_end is null
        or visit.checked_in_at < v_date_to_end
      )
    order by
      visit.checked_in_at desc,
      visit.id desc
    limit v_page_size
    offset v_offset
  ) as history_visit;

  return jsonb_build_object(
    'generatedAt',
    now(),
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
    'visits',
    v_visits
  );
end;
$function$;

-- =========================================================
-- Function permissions
-- =========================================================

revoke all
  on function public.checkout_visit(uuid, uuid)
  from public, anon, authenticated;

grant execute
  on function public.checkout_visit(uuid, uuid)
  to service_role;

revoke all
  on function public.get_visit_history(
    integer,
    integer,
    text,
    text,
    text,
    text,
    date,
    date
  )
  from public, anon, authenticated;

grant execute
  on function public.get_visit_history(
    integer,
    integer,
    text,
    text,
    text,
    text,
    date,
    date
  )
  to service_role;

comment on function public.checkout_visit(uuid, uuid)
is
  'Atomically checks out an active visit and records the authorised staff action.';

comment on function public.get_visit_history(
  integer,
  integer,
  text,
  text,
  text,
  text,
  date,
  date
)
is
  'Returns filtered visit history with server-side pagination limited to ten records per page.';

commit;