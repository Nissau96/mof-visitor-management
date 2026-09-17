begin;

-- ============================================================
-- Super Administrator visitor-card inventory
-- ============================================================

create or replace function
  public.get_admin_visitor_card_inventory(
    p_actor_id uuid,
    p_page integer default 1,
    p_page_size integer default 10,
    p_search text default '',
    p_card_type text default 'all',
    p_tower text default 'all',
    p_status text default 'all'
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_scope jsonb;
  v_available_count bigint := 0;
  v_assigned_count bigint := 0;
  v_card_type text :=
    lower(
      btrim(
        coalesce(
          p_card_type,
          'all'
        )
      )
    );
  v_cards jsonb := '[]'::jsonb;
  v_deactivated_count bigint := 0;
  v_investigating_count bigint := 0;
  v_not_returned_count bigint := 0;
  v_offset integer;
  v_page integer := p_page;
  v_page_size integer :=
    p_page_size;
  v_regular_count bigint := 0;
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
  v_tower text :=
    lower(
      btrim(
        coalesce(
          p_tower,
          'all'
        )
      )
    );
  v_total_count bigint := 0;
  v_total_pages integer := 0;
  v_tower_1_count bigint := 0;
  v_tower_2_count bigint := 0;
  v_vip_count bigint := 0;
begin
  v_actor_scope :=
    public.resolve_visitor_card_actor_scope(
      p_actor_id,
      ''
    );

  v_role :=
    v_actor_scope ->> 'role';

  if v_role <> 'admin' then
    raise exception using
      errcode = '42501',
      message =
        'Only a Super Administrator can view the visitor-card inventory';
  end if;

  if (
    v_page is null
    or v_page < 1
    or v_page > 10000
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Invalid visitor-card inventory page';
  end if;

  if (
    v_page_size is null
    or v_page_size < 1
    or v_page_size > 50
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Invalid visitor-card inventory page size';
  end if;

  if char_length(v_search) > 120 then
    raise exception using
      errcode = '22023',
      message =
        'Visitor-card inventory search is too long';
  end if;

  if v_card_type not in (
    'all',
    'regular',
    'vip'
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Invalid visitor-card type filter';
  end if;

  if v_tower not in (
    'all',
    'tower_1',
    'tower_2'
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Invalid visitor-card tower filter';
  end if;

  if v_status not in (
    'all',
    'available',
    'assigned',
    'not_returned',
    'investigating',
    'deactivated'
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

  select
    count(*) filter (
      where card.card_type =
        'regular'
    ),
    count(*) filter (
      where card.card_type =
        'vip'
    ),
    count(*) filter (
      where card.tower =
        'tower_1'
    ),
    count(*) filter (
      where card.tower =
        'tower_2'
    ),
    count(*) filter (
      where card.status =
        'available'
    ),
    count(*) filter (
      where card.status =
        'assigned'
    ),
    count(*) filter (
      where card.status =
        'not_returned'
    ),
    count(*) filter (
      where card.status =
        'investigating'
    ),
    count(*) filter (
      where card.status =
        'deactivated'
    )
  into
    v_regular_count,
    v_vip_count,
    v_tower_1_count,
    v_tower_2_count,
    v_available_count,
    v_assigned_count,
    v_not_returned_count,
    v_investigating_count,
    v_deactivated_count
  from public.visitor_cards
    as card;

  select count(*)
  into v_total_count
  from public.visitor_cards
    as card
  left join
    public.visitor_card_assignments
      as assignment
    on assignment.card_id =
      card.id
    and assignment.status in (
      'assigned',
      'not_returned'
    )
  left join public.visits
    as visit
    on visit.id =
      assignment.visit_id
  left join public.visitor_profiles
    as visitor
    on visitor.id =
      visit.visitor_id
  where (
      v_card_type = 'all'
      or card.card_type =
        v_card_type
    )
    and (
      v_tower = 'all'
      or card.tower =
        v_tower
    )
    and (
      v_status = 'all'
      or card.status =
        v_status
    )
    and (
      v_search = ''
      or strpos(
        lower(
          card.card_number
        ),
        v_search
      ) > 0
      or strpos(
        lpad(
          card.base_number::text,
          3,
          '0'
        ),
        v_search
      ) > 0
      or strpos(
        lower(
          coalesce(
            visitor.full_name,
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
      inventory_row.payload
      order by
        inventory_row.card_type_order,
        inventory_row.base_number,
        inventory_row.replacement_sequence
          desc
    ),
    '[]'::jsonb
  )
  into v_cards
  from (
    select
      card.base_number,
      case card.card_type
        when 'regular' then 1
        else 2
      end as card_type_order,
      card.replacement_sequence,
      jsonb_build_object(
        'cardId',
        card.id,
        'cardType',
        card.card_type,
        'cardNumber',
        card.card_number,
        'baseNumber',
        card.base_number,
        'replacementSequence',
        card.replacement_sequence,
        'tower',
        card.tower,
        'status',
        card.status,
        'replacesCardId',
        card.replaces_card_id,
        'replacesCardNumber',
        predecessor.card_number,
        'replacementCardId',
        replacement.id,
        'replacementCardNumber',
        replacement.card_number,
        'deactivationReason',
        card.deactivation_reason,
        'deactivationNotes',
        card.deactivation_notes,
        'deactivatedAt',
        card.deactivated_at,
        'createdAt',
        card.created_at,
        'updatedAt',
        card.updated_at,
        'activeAssignment',
        case
          when assignment.id is null
          then null
          else jsonb_build_object(
            'assignmentId',
            assignment.id,
            'visitId',
            visit.id,
            'visitorId',
            visitor.id,
            'referenceCode',
            visit.reference_code,
            'fullName',
            visitor.full_name,
            'assignedAt',
            assignment.assigned_at,
            'returnDueAt',
            assignment.return_due_at,
            'assignmentStatus',
            assignment.status
          )
        end,
        'activeIncident',
        case
          when incident.id is null
          then null
          else jsonb_build_object(
            'incidentId',
            incident.id,
            'status',
            incident.status,
            'openedReason',
            incident.opened_reason,
            'openedAt',
            incident.opened_at,
            'assignedTo',
            incident.assigned_to
          )
        end,
        'canChangeTower',
        card.status =
          'available',
        'canBeAssigned',
        card.status =
          'available'
      ) as payload
    from public.visitor_cards
      as card
    left join public.visitor_cards
      as predecessor
      on predecessor.id =
        card.replaces_card_id
    left join public.visitor_cards
      as replacement
      on replacement.replaces_card_id =
        card.id
    left join
      public.visitor_card_assignments
        as assignment
      on assignment.card_id =
        card.id
      and assignment.status in (
        'assigned',
        'not_returned'
      )
    left join public.visits
      as visit
      on visit.id =
        assignment.visit_id
    left join public.visitor_profiles
      as visitor
      on visitor.id =
        visit.visitor_id
    left join
      public.visitor_card_incidents
        as incident
      on incident.assignment_id =
        assignment.id
      and incident.status in (
        'open',
        'investigating'
      )
    where (
        v_card_type = 'all'
        or card.card_type =
          v_card_type
      )
      and (
        v_tower = 'all'
        or card.tower =
          v_tower
      )
      and (
        v_status = 'all'
        or card.status =
          v_status
      )
      and (
        v_search = ''
        or strpos(
          lower(
            card.card_number
          ),
          v_search
        ) > 0
        or strpos(
          lpad(
            card.base_number::text,
            3,
            '0'
          ),
          v_search
        ) > 0
        or strpos(
          lower(
            coalesce(
              visitor.full_name,
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
      card_type_order,
      card.base_number,
      card.replacement_sequence
        desc
    limit v_page_size
    offset v_offset
  ) as inventory_row;

  return jsonb_build_object(
    'cards',
    v_cards,
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
      'regularCount',
      v_regular_count,
      'vipCount',
      v_vip_count,
      'tower1Count',
      v_tower_1_count,
      'tower2Count',
      v_tower_2_count,
      'availableCount',
      v_available_count,
      'assignedCount',
      v_assigned_count,
      'notReturnedCount',
      v_not_returned_count,
      'investigatingCount',
      v_investigating_count,
      'deactivatedCount',
      v_deactivated_count
    ),
    'filters',
    jsonb_build_object(
      'search',
      v_search,
      'cardType',
      v_card_type,
      'tower',
      v_tower,
      'status',
      v_status
    )
  );
end;
$function$;

revoke all
  on function
    public.get_admin_visitor_card_inventory(
      uuid,
      integer,
      integer,
      text,
      text,
      text,
      text
    )
  from public, anon, authenticated;

grant execute
  on function
    public.get_admin_visitor_card_inventory(
      uuid,
      integer,
      integer,
      text,
      text,
      text,
      text
    )
  to service_role;

comment on function
  public.get_admin_visitor_card_inventory(
    uuid,
    integer,
    integer,
    text,
    text,
    text,
    text
  )
is
  'Returns paginated Regular and VIP visitor-card inventory, current assignments, incidents, replacement lineage and administrative action permissions.';

notify pgrst, 'reload schema';

commit;