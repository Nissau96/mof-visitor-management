begin;

create or replace function public.get_reception_dashboard(
  p_page integer default 1,
  p_page_size integer default 10,
  p_search text default '',
  p_agency text default '',
  p_division text default ''
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_page integer := p_page;
  v_page_size integer := p_page_size;

  v_search text :=
    lower(btrim(coalesce(p_search, '')));

  v_agency text :=
    nullif(btrim(coalesce(p_agency, '')), '');

  v_division text :=
    nullif(btrim(coalesce(p_division, '')), '');

  v_offset integer;
  v_total_count bigint := 0;
  v_total_pages integer := 0;
  v_active_count bigint := 0;
  v_checked_in_today bigint := 0;
  v_checked_out_today bigint := 0;
  v_visitors jsonb := '[]'::jsonb;

  v_day_start timestamp with time zone :=
    (
      date_trunc(
        'day',
        now() at time zone 'Africa/Accra'
      ) at time zone 'Africa/Accra'
    );

  v_day_end timestamp with time zone;
begin
  if v_page is null
    or v_page < 1
    or v_page > 10000
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid dashboard page';
  end if;

  if v_page_size is null
    or v_page_size < 1
    or v_page_size > 10
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid dashboard page size';
  end if;

  if char_length(v_search) > 80 then
    raise exception using
      errcode = '22023',
      message = 'Dashboard search is too long';
  end if;

  if v_agency is not null
    and char_length(v_agency) > 160
  then
    raise exception using
      errcode = '22023',
      message = 'Dashboard agency filter is too long';
  end if;

  if v_division is not null
    and char_length(v_division) > 160
  then
    raise exception using
      errcode = '22023',
      message = 'Dashboard division filter is too long';
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

  v_day_end := v_day_start + interval '1 day';
  v_offset := (v_page - 1) * v_page_size;

  select
    count(*) filter (
      where visit.status = 'checked_in'
    ),
    count(*) filter (
      where visit.checked_in_at >= v_day_start
        and visit.checked_in_at < v_day_end
    ),
    count(*) filter (
      where visit.status = 'checked_out'
        and visit.checked_out_at >= v_day_start
        and visit.checked_out_at < v_day_end
    )
  into
    v_active_count,
    v_checked_in_today,
    v_checked_out_today
  from public.visits as visit;

  select count(*)
  into v_total_count
  from public.visits as visit
  join public.visitor_profiles as visitor
    on visitor.id = visit.visitor_id
  where visit.status = 'checked_in'
    and (
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
      v_agency is null
      or visit.destination_agency = v_agency
    )
    and (
      v_division is null
      or visit.destination_division = v_division
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
        dashboard_visit.id,
        'reference',
        dashboard_visit.reference_code,
        'fullName',
        dashboard_visit.full_name,
        'phone',
        dashboard_visit.phone,
        'organization',
        dashboard_visit.organization,
        'agency',
        dashboard_visit.destination_agency,
        'division',
        dashboard_visit.destination_division,
        'purpose',
        dashboard_visit.purpose,
        'personVisiting',
        dashboard_visit.person_visiting,
        'meetingTitle',
        dashboard_visit.meeting_title,
        'checkedInAt',
        dashboard_visit.checked_in_at
      )
      order by
        dashboard_visit.checked_in_at desc,
        dashboard_visit.id desc
    ),
    '[]'::jsonb
  )
  into v_visitors
  from (
    select
      visit.id,
      visit.reference_code,
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
      visit.checked_in_at
    from public.visits as visit
    join public.visitor_profiles as visitor
      on visitor.id = visit.visitor_id
    left join public.meetings as meeting
      on meeting.id = visit.meeting_id
    where visit.status = 'checked_in'
      and (
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
        v_agency is null
        or visit.destination_agency = v_agency
      )
      and (
        v_division is null
        or visit.destination_division = v_division
      )
    order by
      visit.checked_in_at desc,
      visit.id desc
    limit v_page_size
    offset v_offset
  ) as dashboard_visit;

  return jsonb_build_object(
    'generatedAt',
    now(),
    'stats',
    jsonb_build_object(
      'active',
      v_active_count,
      'checkedInToday',
      v_checked_in_today,
      'checkedOutToday',
      v_checked_out_today
    ),
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
    'visitors',
    v_visitors
  );
end;
$function$;

revoke all
on function public.get_reception_dashboard(
  integer,
  integer,
  text,
  text,
  text
)
from public, anon, authenticated;

grant execute
on function public.get_reception_dashboard(
  integer,
  integer,
  text,
  text,
  text
)
to service_role;

comment on function public.get_reception_dashboard(
  integer,
  integer,
  text,
  text,
  text
)
is
  'Returns paginated active-visitor dashboard data to trusted server-side application functions.';

commit;