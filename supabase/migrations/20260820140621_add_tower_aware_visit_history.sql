begin;

-- ============================================================
-- Phase 1: Tower-aware visit history
-- ============================================================
--
-- Receptionists:
-- - receive history only for their selected tower.
--
-- Administrators:
-- - may filter by Tower 1 or Tower 2;
-- - may leave the tower empty to view all towers.
--
-- The existing eight-parameter function remains temporarily
-- available until the updated API has been deployed.
-- ============================================================

create or replace function public.get_visit_history(
  p_actor_id uuid,
  p_tower text,
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
set search_path = ''
as $function$
declare
  v_staff_role text;
  v_tower_scope text;

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

  v_status text :=
    nullif(
      lower(
        btrim(
          coalesce(
            p_status,
            ''
          )
        )
      ),
      ''
    );

  v_agency text :=
    nullif(
      btrim(
        coalesce(
          p_agency,
          ''
        )
      ),
      ''
    );

  v_division text :=
    nullif(
      btrim(
        coalesce(
          p_division,
          ''
        )
      ),
      ''
    );

  v_date_from_start timestamp with time zone;
  v_date_to_end timestamp with time zone;

  v_offset integer;
  v_total_count bigint := 0;
  v_total_pages integer := 0;
  v_visits jsonb := '[]'::jsonb;
begin
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
      message =
        'Staff tower access could not be verified';
  end if;

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
      message =
        'History agency filter is too long';
  end if;

  if v_division is not null
    and char_length(v_division) > 160
  then
    raise exception using
      errcode = '22023',
      message =
        'History division filter is too long';
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
      message =
        'History start date must not be after end date';
  end if;

  if p_date_from is not null
    and p_date_to is not null
    and (p_date_to - p_date_from) > 366
  then
    raise exception using
      errcode = '22023',
      message =
        'History date range cannot exceed 366 days';
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

  v_offset :=
    (v_page - 1) * v_page_size;

  select count(*)
  into v_total_count
  from public.visits as visit
  join public.visitor_profiles as visitor
    on visitor.id = visit.visitor_id
  where (
      v_tower_scope is null
      or visit.tower = v_tower_scope
    )
    and (
      v_search = ''
      or pg_catalog.strpos(
        lower(visitor.full_name),
        v_search
      ) > 0
      or pg_catalog.strpos(
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
      or visit.checked_in_at >=
        v_date_from_start
    )
    and (
      v_date_to_end is null
      or visit.checked_in_at <
        v_date_to_end
    );

  if v_total_count > 0 then
    v_total_pages :=
      pg_catalog.ceil(
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
        'tower',
        history_visit.tower,
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
      visit.tower,
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
        v_tower_scope is null
        or visit.tower = v_tower_scope
      )
      and (
        v_search = ''
        or pg_catalog.strpos(
          lower(visitor.full_name),
          v_search
        ) > 0
        or pg_catalog.strpos(
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
        or visit.checked_in_at >=
          v_date_from_start
      )
      and (
        v_date_to_end is null
        or visit.checked_in_at <
          v_date_to_end
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
    'staffRole',
    v_staff_role,
    'towerScope',
    v_tower_scope,
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

revoke all
  on function public.get_visit_history(
    uuid,
    text,
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
    uuid,
    text,
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

comment on function public.get_visit_history(
  uuid,
  text,
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
  'Returns tower-authorized, filtered visit history with server-side pagination limited to ten records per page.';

notify pgrst, 'reload schema';

commit;