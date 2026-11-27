-- ============================================================
-- Visit history: filter and sort by check-out time
-- ============================================================
-- The Visitor Cards page lists today's check-outs, newest first. That
-- needs the date range and the date sort to follow check-out time, so a
-- visitor who arrived yesterday and left today is counted today.
-- p_date_basis = 'check_out' does that; the default 'check_in' keeps
-- Visit History and the reports as they were.

begin;

drop function if exists public.get_visit_history(
  uuid, text, integer, integer, text, text, text, text, date, date, text, text, text
);

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
  p_date_to date default null,
  p_purpose text default '',
  p_sort text default 'date',
  p_direction text default 'desc',
  p_date_basis text default 'check_in'
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

  v_search text := lower(btrim(coalesce(p_search, '')));
  v_status text := nullif(lower(btrim(coalesce(p_status, ''))), '');
  v_agency text := nullif(btrim(coalesce(p_agency, '')), '');
  v_division text := nullif(btrim(coalesce(p_division, '')), '');
  v_purpose text := nullif(btrim(coalesce(p_purpose, '')), '');
  v_sort text := lower(btrim(coalesce(p_sort, 'date')));
  v_direction text := lower(btrim(coalesce(p_direction, 'desc')));
  v_basis text := lower(btrim(coalesce(p_date_basis, 'check_in')));

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
  from public.get_staff_tower_scope(p_actor_id, p_tower) as authorised_scope;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Staff tower access could not be verified';
  end if;

  if v_page is null or v_page < 1 or v_page > 10000 then
    raise exception using errcode = '22023', message = 'Invalid history page';
  end if;

  if v_page_size is null or v_page_size < 1 or v_page_size > 5000 then
    raise exception using errcode = '22023', message = 'Invalid history page size';
  end if;

  if char_length(v_search) > 80 then
    raise exception using errcode = '22023', message = 'History search is too long';
  end if;

  if v_status is not null
    and v_status not in ('checked_in', 'checked_out', 'cancelled')
  then
    raise exception using errcode = '22023', message = 'Invalid visit status filter';
  end if;

  if v_agency is not null and char_length(v_agency) > 160 then
    raise exception using errcode = '22023', message = 'History agency filter is too long';
  end if;

  if v_division is not null and char_length(v_division) > 160 then
    raise exception using errcode = '22023', message = 'History division filter is too long';
  end if;

  if v_purpose is not null and char_length(v_purpose) > 60 then
    raise exception using errcode = '22023', message = 'History purpose filter is too long';
  end if;

  if v_division is not null
    and v_agency is distinct from 'Ministry of Finance (MoF)'
  then
    raise exception using
      errcode = '22023',
      message = 'A division filter requires the Ministry of Finance agency';
  end if;

  if v_sort not in ('date', 'visitor') then
    raise exception using errcode = '22023', message = 'Invalid history sort';
  end if;

  if v_direction not in ('asc', 'desc') then
    raise exception using errcode = '22023', message = 'Invalid history sort direction';
  end if;

  if v_basis not in ('check_in', 'check_out') then
    raise exception using errcode = '22023', message = 'Invalid history date basis';
  end if;

  if p_date_from is not null and p_date_to is not null and p_date_from > p_date_to then
    raise exception using
      errcode = '22023',
      message = 'History start date must not be after end date';
  end if;

  if p_date_from is not null and p_date_to is not null and (p_date_to - p_date_from) > 366 then
    raise exception using
      errcode = '22023',
      message = 'History date range cannot exceed 366 days';
  end if;

  if p_date_from is not null then
    v_date_from_start := p_date_from::timestamp at time zone 'Africa/Accra';
  end if;

  if p_date_to is not null then
    v_date_to_end := (p_date_to + 1)::timestamp at time zone 'Africa/Accra';
  end if;

  v_offset := (v_page - 1) * v_page_size;

  -- One pass: filter, number the rows in the chosen order, count them,
  -- and keep only the requested page.
  with matched as (
    select
      visit.id,
      visit.reference_code,
      visit.tower::text as tower,
      visit.status::text as status,
      visitor.full_name,
      visitor.phone,
      visitor.organization,
      visit.destination_agency,
      visit.destination_division,
      visit.purpose,
      visit.person_visiting,
      coalesce(meeting.title, visit.custom_meeting_title) as meeting_title,
      visit.checked_in_at,
      visit.checked_out_at,
      case
        when v_basis = 'check_out' then visit.checked_out_at
        -- A visit cancelled before check-in is dated by its creation.
        else coalesce(visit.checked_in_at, visit.created_at)
      end as basis_at
    from public.visits as visit
    join public.visitor_profiles as visitor
      on visitor.id = visit.visitor_id
    left join public.meetings as meeting
      on meeting.id = visit.meeting_id
    where (v_tower_scope is null or visit.tower = v_tower_scope)
      and (
        v_search = ''
        or pg_catalog.strpos(lower(visitor.full_name), v_search) > 0
        or pg_catalog.strpos(lower(visit.reference_code), v_search) > 0
        or pg_catalog.strpos(lower(coalesce(visitor.organization, '')), v_search) > 0
        or pg_catalog.strpos(lower(coalesce(visit.person_visiting, '')), v_search) > 0
        or pg_catalog.strpos(
          lower(coalesce(meeting.title, visit.custom_meeting_title, '')),
          v_search
        ) > 0
      )
      and (v_status is null or visit.status::text = v_status)
      and (v_agency is null or visit.destination_agency = v_agency)
      and (v_division is null or visit.destination_division = v_division)
      and (v_purpose is null or visit.purpose = v_purpose)
      and (v_date_from_start is null
        or (case
          when v_basis = 'check_out' then visit.checked_out_at
          else coalesce(visit.checked_in_at, visit.created_at)
        end) >= v_date_from_start)
      and (v_date_to_end is null
        or (case
          when v_basis = 'check_out' then visit.checked_out_at
          else coalesce(visit.checked_in_at, visit.created_at)
        end) < v_date_to_end)
  ),
  ordered as (
    select
      matched.*,
      count(*) over () as total_count,
      row_number() over (
        order by
          case when v_sort = 'visitor' and v_direction = 'asc'
            then lower(matched.full_name) end asc,
          case when v_sort = 'visitor' and v_direction = 'desc'
            then lower(matched.full_name) end desc,
          case when v_sort = 'date' and v_direction = 'asc'
            then matched.basis_at end asc nulls last,
          matched.basis_at desc nulls last,
          matched.id desc
      ) as position
    from matched
  )
  select
    coalesce(max(ordered.total_count), 0),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'visitId', ordered.id,
          'reference', ordered.reference_code,
          'tower', ordered.tower,
          'status', ordered.status,
          'fullName', ordered.full_name,
          'phone', ordered.phone,
          'organization', ordered.organization,
          'agency', ordered.destination_agency,
          'division', ordered.destination_division,
          'purpose', ordered.purpose,
          'personVisiting', ordered.person_visiting,
          'meetingTitle', ordered.meeting_title,
          'checkedInAt', ordered.checked_in_at,
          'checkedOutAt', ordered.checked_out_at
        )
        order by ordered.position
      ) filter (
        where ordered.position > v_offset
          and ordered.position <= v_offset + v_page_size
      ),
      '[]'::jsonb
    )
  into v_total_count, v_visits
  from ordered;

  if v_total_count > 0 then
    v_total_pages := pg_catalog.ceil(
      v_total_count::numeric / v_page_size::numeric
    )::integer;
  end if;

  return jsonb_build_object(
    'generatedAt', now(),
    'staffRole', v_staff_role,
    'towerScope', v_tower_scope,
    'pagination', jsonb_build_object(
      'page', v_page,
      'pageSize', v_page_size,
      'totalCount', v_total_count,
      'totalPages', v_total_pages
    ),
    'visits', v_visits
  );
end;
$function$;

revoke all
  on function public.get_visit_history(
    uuid, text, integer, integer, text, text, text, text, date, date, text, text, text, text
  )
  from public, anon, authenticated;

grant execute
  on function public.get_visit_history(
    uuid, text, integer, integer, text, text, text, text, date, date, text, text, text, text
  )
  to service_role;

comment on function public.get_visit_history(
  uuid, text, integer, integer, text, text, text, text, date, date, text, text, text, text
)
is
  'Returns tower-authorised, filtered and sorted visit history by check-in or check-out time; pages of up to 5,000 rows for export.';

notify pgrst, 'reload schema';

commit;
