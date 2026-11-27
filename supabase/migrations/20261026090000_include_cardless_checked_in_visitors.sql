-- Include checked-in visitors who have no visitor card.
--
-- get_checked_in_card_visitors inner-joined card assignments, so a visit
-- checked in without a card (for example one admitted before the card
-- workflow existed) appeared on neither the "Pending admissions" nor the
-- "Checked-in visitors" tab. The active assignment is now left-joined:
-- cardless visits are returned with assignmentStatus "unassigned" and the
-- card-status filter accepts "unassigned". Card checkout stays unavailable
-- for them (canCheckout false); they are checked out from the dashboard.

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
    'not_returned',
    'unassigned'
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
  left join public.visitor_card_assignments
    as assignment
    on assignment.visit_id =
      visit.id
    and assignment.status in (
      'assigned',
      'not_returned'
    )
  left join public.visitor_cards
    as card
    on card.id =
      assignment.card_id
  where visit.status =
      'checked_in'
    and (
      v_tower = ''
      or visit.tower =
        v_tower
    )
    and (
      v_card_status = 'all'
      or (
        v_card_status = 'unassigned'
        and assignment.id is null
      )
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
          coalesce(
            card.card_number,
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
        coalesce(
          assignment.status,
          'unassigned'
        ),
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
        coalesce(
          assignment.status =
            'assigned',
          false
        ),
        'requiresIncidentAction',
        coalesce(
          assignment.status =
            'not_returned',
          false
        )
      ) as payload
    from public.visits as visit
    join public.visitor_profiles
      as visitor
      on visitor.id =
        visit.visitor_id
    left join public.visitor_card_assignments
      as assignment
      on assignment.visit_id =
        visit.id
      and assignment.status in (
        'assigned',
        'not_returned'
      )
    left join public.visitor_cards
      as card
      on card.id =
        assignment.card_id
    where visit.status =
        'checked_in'
      and (
        v_tower = ''
        or visit.tower =
          v_tower
      )
      and (
        v_card_status = 'all'
        or (
          v_card_status = 'unassigned'
          and assignment.id is null
        )
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
            coalesce(
              card.card_number,
              ''
            )
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
