begin;

-- ============================================================
-- Checked-in visitor-card assignments
-- ============================================================

create or replace function
  public.get_checked_in_card_visitors(
    p_actor_id uuid,
    p_tower text default '',
    p_page integer default 1,
    p_page_size integer default 10,
    p_search text default '',
    p_card_status text default 'all'
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_scope jsonb;
  v_card_status text :=
    lower(
      btrim(
        coalesce(
          p_card_status,
          'all'
        )
      )
    );
  v_offset integer;
  v_page integer := p_page;
  v_page_size integer :=
    p_page_size;
  v_role text;
  v_search text :=
    lower(
      btrim(
        coalesce(
          p_search,
          ''
        )
      )
    );
  v_tower text;
  v_total_count bigint := 0;
  v_total_pages integer := 0;
  v_visitors jsonb := '[]'::jsonb;
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

  if v_role =
    'client_service_head'
  then
    raise exception using
      errcode = '42501',
      message =
        'Client Service Head accounts cannot perform reception operations';
  end if;

  if (
    v_page is null
    or v_page < 1
    or v_page > 10000
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Invalid checked-in visitor page';
  end if;

  if (
    v_page_size is null
    or v_page_size < 1
    or v_page_size > 50
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Invalid checked-in visitor page size';
  end if;

  if char_length(v_search) > 120 then
    raise exception using
      errcode = '22023',
      message =
        'Checked-in visitor search is too long';
  end if;

  if v_card_status not in (
    'all',
    'assigned',
    'not_returned'
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Invalid visitor-card status filter';
  end if;

  perform
    public.mark_overdue_visitor_cards();

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
  join public.visitor_card_assignments
    as assignment
    on assignment.visit_id =
      visit.id
  join public.visitor_cards
    as card
    on card.id =
      assignment.card_id
  where visit.status =
      'checked_in'
    and assignment.status in (
      'assigned',
      'not_returned'
    )
    and (
      v_tower = ''
      or visit.tower =
        v_tower
    )
    and (
      v_card_status = 'all'
      or assignment.status =
        v_card_status
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
      or strpos(
        lower(
          card.card_number
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
      checked_in_row.payload
      order by
        checked_in_row.checked_in_at
          desc,
        checked_in_row.visit_id
          desc
    ),
    '[]'::jsonb
  )
  into v_visitors
  from (
    select
      visit.checked_in_at,
      visit.id as visit_id,
      jsonb_build_object(
        'visitId',
        visit.id,
        'visitorId',
        visitor.id,
        'assignmentId',
        assignment.id,
        'cardId',
        card.id,
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
        'cardNumber',
        card.card_number,
        'tower',
        visit.tower,
        'destinationAgency',
        visit.destination_agency,
        'destinationDivision',
        visit.destination_division,
        'personVisiting',
        visit.person_visiting,
        'purpose',
        visit.purpose,
        'checkedInAt',
        visit.checked_in_at,
        'assignedAt',
        assignment.assigned_at,
        'returnDueAt',
        assignment.return_due_at,
        'visitStatus',
        visit.status,
        'assignmentStatus',
        assignment.status,
        'cardStatus',
        card.status,
        'overdueSince',
        case
          when assignment.status =
            'not_returned'
          then assignment.return_due_at
          else null
        end,
        'canCheckout',
        assignment.status =
          'assigned',
        'requiresIncidentAction',
        assignment.status =
          'not_returned'
      ) as payload
    from public.visits as visit
    join public.visitor_profiles
      as visitor
      on visitor.id =
        visit.visitor_id
    join public.visitor_card_assignments
      as assignment
      on assignment.visit_id =
        visit.id
    join public.visitor_cards
      as card
      on card.id =
        assignment.card_id
    where visit.status =
        'checked_in'
      and assignment.status in (
        'assigned',
        'not_returned'
      )
      and (
        v_tower = ''
        or visit.tower =
          v_tower
      )
      and (
        v_card_status = 'all'
        or assignment.status =
          v_card_status
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
        or strpos(
          lower(
            card.card_number
          ),
          v_search
        ) > 0
      )
    order by
      visit.checked_in_at desc,
      visit.id desc
    limit v_page_size
    offset v_offset
  ) as checked_in_row;

  return jsonb_build_object(
    'visitors',
    v_visitors,
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
    'filters',
    jsonb_build_object(
      'cardStatus',
      v_card_status,
      'search',
      v_search
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
-- Card-incident administration list
-- ============================================================

create or replace function
  public.get_visitor_card_incidents(
    p_actor_id uuid,
    p_tower text default '',
    p_page integer default 1,
    p_page_size integer default 10,
    p_search text default '',
    p_status text default 'all',
    p_resolution text default 'all'
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_scope jsonb;
  v_incidents jsonb := '[]'::jsonb;
  v_offset integer;
  v_open_count bigint := 0;
  v_investigating_count bigint := 0;
  v_page integer := p_page;
  v_page_size integer :=
    p_page_size;
  v_resolution text :=
    lower(
      btrim(
        coalesce(
          p_resolution,
          'all'
        )
      )
    );
  v_resolved_count bigint := 0;
  v_role text;
  v_search text :=
    lower(
      btrim(
        coalesce(
          p_search,
          ''
        )
      )
    );
  v_status text :=
    lower(
      btrim(
        coalesce(
          p_status,
          'all'
        )
      )
    );
  v_tower text;
  v_total_count bigint := 0;
  v_total_pages integer := 0;
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

  if v_role not in (
    'client_service_head',
    'admin'
  ) then
    raise exception using
      errcode = '42501',
      message =
        'Only the Client Service Head or Super Administrator can view card incidents';
  end if;

  if (
    v_page is null
    or v_page < 1
    or v_page > 10000
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Invalid card-incident page';
  end if;

  if (
    v_page_size is null
    or v_page_size < 1
    or v_page_size > 50
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Invalid card-incident page size';
  end if;

  if char_length(v_search) > 120 then
    raise exception using
      errcode = '22023',
      message =
        'Card-incident search is too long';
  end if;

  if v_status not in (
    'all',
    'open',
    'investigating',
    'resolved'
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Invalid card-incident status filter';
  end if;

  if v_resolution not in (
    'all',
    'late_return',
    'lost',
    'damaged',
    'unusable'
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Invalid card-incident resolution filter';
  end if;

  perform
    public.mark_overdue_visitor_cards();

  v_offset :=
    (v_page - 1) *
    v_page_size;

  select
    count(*) filter (
      where incident.status =
        'open'
    ),
    count(*) filter (
      where incident.status =
        'investigating'
    ),
    count(*) filter (
      where incident.status =
        'resolved'
    )
  into
    v_open_count,
    v_investigating_count,
    v_resolved_count
  from public.visitor_card_incidents
    as incident
  join public.visitor_card_assignments
    as assignment
    on assignment.id =
      incident.assignment_id
  join public.visits
    as visit
    on visit.id =
      assignment.visit_id
  where (
    v_tower = ''
    or visit.tower =
      v_tower
  );

  select count(*)
  into v_total_count
  from public.visitor_card_incidents
    as incident
  join public.visitor_card_assignments
    as assignment
    on assignment.id =
      incident.assignment_id
  join public.visitor_cards
    as card
    on card.id =
      assignment.card_id
  join public.visits
    as visit
    on visit.id =
      assignment.visit_id
  join public.visitor_profiles
    as visitor
    on visitor.id =
      visit.visitor_id
  where (
      v_tower = ''
      or visit.tower =
        v_tower
    )
    and (
      v_status = 'all'
      or incident.status =
        v_status
    )
    and (
      v_resolution = 'all'
      or incident.resolution =
        v_resolution
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
      or strpos(
        lower(
          card.card_number
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
      incident_row.payload
      order by
        incident_row.status_priority,
        incident_row.opened_at desc,
        incident_row.incident_id desc
    ),
    '[]'::jsonb
  )
  into v_incidents
  from (
    select
      incident.id
        as incident_id,
      incident.opened_at,
      case incident.status
        when 'open' then 1
        when 'investigating'
          then 2
        else 3
      end as status_priority,
      jsonb_build_object(
        'incidentId',
        incident.id,
        'assignmentId',
        assignment.id,
        'visitId',
        visit.id,
        'visitorId',
        visitor.id,
        'cardId',
        card.id,
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
        'cardNumber',
        card.card_number,
        'cardStatus',
        card.status,
        'assignmentStatus',
        assignment.status,
        'tower',
        visit.tower,
        'openedReason',
        incident.opened_reason,
        'openedAt',
        incident.opened_at,
        'overdueSince',
        case
          when incident.opened_reason =
            'overdue'
          then assignment.return_due_at
          else incident.opened_at
        end,
        'incidentStatus',
        incident.status,
        'assignedOfficer',
        case
          when incident.assigned_to
            is null
          then null
          else jsonb_build_object(
            'userId',
            incident.assigned_to,
            'fullName',
            officer.full_name
          )
        end,
        'investigationStartedAt',
        incident.investigation_started_at,
        'investigationNotes',
        incident.investigation_notes,
        'resolution',
        incident.resolution,
        'resolutionNotes',
        incident.resolution_notes,
        'resolvedAt',
        incident.resolved_at,
        'resolvedBy',
        incident.resolved_by,
        'replacementCard',
        case
          when replacement.id is null
          then null
          else jsonb_build_object(
            'cardId',
            replacement.id,
            'cardNumber',
            replacement.card_number,
            'status',
            replacement.status
          )
        end,
        'canStartInvestigation',
        incident.status =
          'open',
        'canResolve',
        incident.status =
          'investigating',
        'canReprint',
        (
          incident.status =
            'resolved'
          and incident.resolution in (
            'lost',
            'damaged',
            'unusable'
          )
          and replacement.id is null
        )
      ) as payload
    from public.visitor_card_incidents
      as incident
    join public.visitor_card_assignments
      as assignment
      on assignment.id =
        incident.assignment_id
    join public.visitor_cards
      as card
      on card.id =
        assignment.card_id
    join public.visits
      as visit
      on visit.id =
        assignment.visit_id
    join public.visitor_profiles
      as visitor
      on visitor.id =
        visit.visitor_id
    left join public.staff_profiles
      as officer
      on officer.user_id =
        incident.assigned_to
    left join public.visitor_cards
      as replacement
      on replacement.replaces_card_id =
        card.id
    where (
        v_tower = ''
        or visit.tower =
          v_tower
      )
      and (
        v_status = 'all'
        or incident.status =
          v_status
      )
      and (
        v_resolution = 'all'
        or incident.resolution =
          v_resolution
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
        or strpos(
          lower(
            card.card_number
          ),
          v_search
        ) > 0
      )
    order by
      status_priority,
      incident.opened_at desc,
      incident.id desc
    limit v_page_size
    offset v_offset
  ) as incident_row;

  return jsonb_build_object(
    'incidents',
    v_incidents,
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
    'summary',
    jsonb_build_object(
      'openCount',
      v_open_count,
      'investigatingCount',
      v_investigating_count,
      'resolvedCount',
      v_resolved_count
    ),
    'filters',
    jsonb_build_object(
      'status',
      v_status,
      'resolution',
      v_resolution,
      'search',
      v_search
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
-- Function permissions
-- ============================================================

revoke all
  on function
    public.get_checked_in_card_visitors(
      uuid,
      text,
      integer,
      integer,
      text,
      text
    )
  from public, anon, authenticated;

revoke all
  on function
    public.get_visitor_card_incidents(
      uuid,
      text,
      integer,
      integer,
      text,
      text,
      text
    )
  from public, anon, authenticated;

grant execute
  on function
    public.get_checked_in_card_visitors(
      uuid,
      text,
      integer,
      integer,
      text,
      text
    )
  to service_role;

grant execute
  on function
    public.get_visitor_card_incidents(
      uuid,
      text,
      integer,
      integer,
      text,
      text,
      text
    )
  to service_role;

comment on function
  public.get_checked_in_card_visitors(
    uuid,
    text,
    integer,
    integer,
    text,
    text
  )
is
  'Returns the paginated checked-in visitor-card workspace for receptionists and Super Administrators.';

comment on function
  public.get_visitor_card_incidents(
    uuid,
    text,
    integer,
    integer,
    text,
    text,
    text
  )
is
  'Returns the paginated card-incident workspace for Client Service Heads and Super Administrators.';

notify pgrst, 'reload schema';

commit;