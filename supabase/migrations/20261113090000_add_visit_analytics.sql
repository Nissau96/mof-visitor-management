begin;

-- ============================================================
-- Analytics and reports
-- ============================================================
--
-- Three read-only functions for the staff Analytics & Reports page:
--
--   get_visit_analytics      figures and charts for a date range
--   get_csu_monthly_report   Client Service Unit visits by purpose
--                            and week of a month
--   get_visit_export         visit rows for CSV and print reports
--
-- All three take the signed-in staff member and resolve the tower
-- through get_staff_tower_scope, so receptionists only ever see their
-- own tower. Only the service role (the API) may call them.
--
-- A visit counts once it is admitted (checked in or checked out);
-- pending and cancelled visits are left out. Dates are Accra dates
-- of the check-in time.
-- ============================================================

create index if not exists visits_checked_in_at_idx
  on public.visits (checked_in_at);

-- ------------------------------------------------------------
-- Shared checks
-- ------------------------------------------------------------

create or replace function public.resolve_analytics_scope(
  p_actor_id uuid,
  p_tower text,
  p_agency text
)
returns table (
  staff_role text,
  tower_scope text,
  agency text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_agency text :=
    nullif(btrim(coalesce(p_agency, '')), '');
begin
  select
    authorised_scope.staff_role,
    authorised_scope.tower_scope
  into
    staff_role,
    tower_scope
  from public.get_staff_tower_scope(
    p_actor_id,
    p_tower
  ) as authorised_scope;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Staff tower access could not be verified';
  end if;

  if v_agency is not null
    and char_length(v_agency) > 160
  then
    raise exception using
      errcode = '22023',
      message = 'Analytics agency filter is too long';
  end if;

  agency := v_agency;

  return next;
end;
$function$;

create or replace function public.check_analytics_range(
  p_date_from date,
  p_date_to date
)
returns void
language plpgsql
immutable
set search_path = ''
as $function$
begin
  if p_date_from is null
    or p_date_to is null
    or p_date_from > p_date_to
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid analytics date range';
  end if;

  if p_date_to - p_date_from > 365 then
    raise exception using
      errcode = '22023',
      message = 'The analytics date range cannot exceed 366 days';
  end if;
end;
$function$;

-- ------------------------------------------------------------
-- Headline figures for one window
-- ------------------------------------------------------------

create or replace function public.visit_analytics_totals(
  p_tower_scope text,
  p_agency text,
  p_from timestamp with time zone,
  p_to timestamp with time zone
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with scoped as (
    select visit.*
    from public.visits as visit
    where visit.status in ('checked_in', 'checked_out')
      and visit.checked_in_at >= p_from
      and visit.checked_in_at < p_to
      and (p_tower_scope is null or visit.tower = p_tower_scope)
      and (p_agency is null or visit.destination_agency = p_agency)
  ),
  visitors as (
    select
      scoped.visitor_id,
      -- First-time: no admitted visit anywhere before this window.
      not exists (
        select 1
        from public.visits as earlier
        where earlier.visitor_id = scoped.visitor_id
          and earlier.status in ('checked_in', 'checked_out')
          and earlier.checked_in_at < p_from
      ) as first_time
    from scoped
    group by scoped.visitor_id
  )
  select jsonb_build_object(
    'visits',
      (select count(*) from scoped),
    'uniqueVisitors',
      (select count(*) from visitors),
    'newVisitors',
      (select count(*) from visitors where first_time),
    'returningVisitors',
      (select count(*) from visitors where not first_time),
    'checkouts',
      (select count(*) from scoped where status = 'checked_out'),
    'averageDurationMinutes',
      (
        select round(
          extract(epoch from avg(checked_out_at - checked_in_at)) / 60
        )
        from scoped
        where checked_out_at is not null
      ),
    'longestDurationMinutes',
      (
        select round(
          extract(epoch from max(checked_out_at - checked_in_at)) / 60
        )
        from scoped
        where checked_out_at is not null
      ),
    'averageWaitMinutes',
      (
        select round(
          extract(epoch from avg(admitted_at - created_at)) / 60
        )
        from scoped
        where admitted_at is not null
          and admitted_at >= created_at
      ),
    'cardsIssued',
      (
        select count(*)
        from public.visitor_card_assignments as assignment
        join scoped on scoped.id = assignment.visit_id
      )
  );
$function$;

-- ------------------------------------------------------------
-- Analytics for a date range
-- ------------------------------------------------------------

create or replace function public.get_visit_analytics(
  p_actor_id uuid,
  p_tower text,
  p_agency text,
  p_date_from date,
  p_date_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_scope record;
  v_days integer;
  v_from timestamp with time zone;
  v_to timestamp with time zone;
  v_previous_from timestamp with time zone;
  v_result jsonb;
begin
  select * into v_scope
  from public.resolve_analytics_scope(p_actor_id, p_tower, p_agency);

  perform public.check_analytics_range(p_date_from, p_date_to);

  v_days := p_date_to - p_date_from + 1;
  v_from := p_date_from::timestamp at time zone 'Africa/Accra';
  v_to := (p_date_to + 1)::timestamp at time zone 'Africa/Accra';
  -- The comparison window is the same number of days just before.
  v_previous_from :=
    (p_date_from - v_days)::timestamp at time zone 'Africa/Accra';

  with scoped as (
    select
      visit.*,
      (visit.checked_in_at at time zone 'Africa/Accra') as local_at
    from public.visits as visit
    where visit.status in ('checked_in', 'checked_out')
      and visit.checked_in_at >= v_from
      and visit.checked_in_at < v_to
      and (v_scope.tower_scope is null or visit.tower = v_scope.tower_scope)
      and (v_scope.agency is null or visit.destination_agency = v_scope.agency)
  ),
  previous as (
    select
      ((visit.checked_in_at at time zone 'Africa/Accra')::date
        - (p_date_from - v_days)) as day_index
    from public.visits as visit
    where visit.status in ('checked_in', 'checked_out')
      and visit.checked_in_at >= v_previous_from
      and visit.checked_in_at < v_from
      and (v_scope.tower_scope is null or visit.tower = v_scope.tower_scope)
      and (v_scope.agency is null or visit.destination_agency = v_scope.agency)
  ),
  days as (
    select
      day::date as day,
      row_number() over (order by day) - 1 as day_index
    from generate_series(
      p_date_from::timestamp,
      p_date_to::timestamp,
      interval '1 day'
    ) as day
  )
  select jsonb_build_object(
    'range', jsonb_build_object(
      'from', p_date_from,
      'to', p_date_to,
      'days', v_days
    ),
    'staffRole', v_scope.staff_role,
    'towerScope', v_scope.tower_scope,
    'agency', v_scope.agency,
    'totals', public.visit_analytics_totals(
      v_scope.tower_scope, v_scope.agency, v_from, v_to
    ),
    'previousTotals', public.visit_analytics_totals(
      v_scope.tower_scope, v_scope.agency, v_previous_from, v_from
    ),
    'onSiteNow', (
      select count(*)
      from public.visits as visit
      where visit.status = 'checked_in'
        and (v_scope.tower_scope is null or visit.tower = v_scope.tower_scope)
        and (v_scope.agency is null or visit.destination_agency = v_scope.agency)
    ),
    'daily', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'date', days.day,
          'visits', (
            select count(*) from scoped
            where scoped.local_at::date = days.day
          ),
          'previous', (
            select count(*) from previous
            where previous.day_index = days.day_index
          )
        )
        order by days.day
      ), '[]'::jsonb)
      from days
    ),
    'towers', (
      select coalesce(jsonb_agg(
        jsonb_build_object('tower', tower, 'visits', visits)
        order by tower
      ), '[]'::jsonb)
      from (
        select scoped.tower, count(*) as visits
        from scoped
        where scoped.tower is not null
        group by scoped.tower
      ) as by_tower
    ),
    'agencies', (
      select coalesce(jsonb_agg(
        jsonb_build_object('agency', agency, 'visits', visits)
        order by visits desc, agency
      ), '[]'::jsonb)
      from (
        select
          coalesce(nullif(scoped.destination_agency, ''), 'Not recorded')
            as agency,
          count(*) as visits
        from scoped
        group by 1
      ) as by_agency
    ),
    'purposes', (
      select coalesce(jsonb_agg(
        jsonb_build_object('purpose', purpose, 'visits', visits)
        order by visits desc, purpose
      ), '[]'::jsonb)
      from (
        select scoped.purpose, count(*) as visits
        from scoped
        group by scoped.purpose
      ) as by_purpose
    ),
    -- Weekdays (1 = Monday) by hour, 8 am to 5 pm.
    'heatmap', (
      select coalesce(jsonb_agg(
        jsonb_build_object('day', day, 'hour', hour, 'visits', visits)
        order by day, hour
      ), '[]'::jsonb)
      from (
        select
          extract(isodow from scoped.local_at)::integer as day,
          extract(hour from scoped.local_at)::integer as hour,
          count(*) as visits
        from scoped
        where extract(isodow from scoped.local_at) between 1 and 5
          and extract(hour from scoped.local_at) between 8 and 17
        group by 1, 2
      ) as by_slot
    ),
    'cards', jsonb_build_object(
      'assigned', (
        select count(*)
        from public.visitor_card_assignments as assignment
        join public.visits as visit on visit.id = assignment.visit_id
        where assignment.status = 'assigned'
          and (v_scope.tower_scope is null or visit.tower = v_scope.tower_scope)
      ),
      'available', (
        select count(*)
        from public.visitor_cards as card
        where card.status = 'available'
          and (v_scope.tower_scope is null or card.tower = v_scope.tower_scope)
      ),
      'incidents', (
        select count(*)
        from public.visitor_cards as card
        where card.status in ('not_returned', 'investigating')
          and (v_scope.tower_scope is null or card.tower = v_scope.tower_scope)
      )
    ),
    'hosts', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'name', name,
          'division', division,
          'visits', visits
        )
        order by visits desc, name
      ), '[]'::jsonb)
      from (
        select
          btrim(scoped.person_visiting) as name,
          coalesce(
            nullif(scoped.destination_division, ''),
            nullif(scoped.destination_agency, '')
          ) as division,
          count(*) as visits
        from scoped
        where nullif(btrim(scoped.person_visiting), '') is not null
        group by 1, 2
        order by count(*) desc, 1
        limit 4
      ) as by_host
    )
  )
  into v_result;

  return v_result;
end;
$function$;

-- ------------------------------------------------------------
-- Client Service Unit monthly report
-- ------------------------------------------------------------
--
-- Weeks run Monday to Friday. A week belongs to the month its
-- Monday falls in, so no visit is counted in two months. Weekend
-- visits count in the week before them.

create or replace function public.get_csu_monthly_report(
  p_actor_id uuid,
  p_tower text,
  p_agency text,
  p_year integer,
  p_month integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_scope record;
  v_month_start date;
  v_first_monday date;
  v_result jsonb;
begin
  select * into v_scope
  from public.resolve_analytics_scope(p_actor_id, p_tower, p_agency);

  if p_year is null
    or p_year < 2020
    or p_year > 2100
    or p_month is null
    or p_month < 1
    or p_month > 12
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid report month';
  end if;

  v_month_start := make_date(p_year, p_month, 1);
  v_first_monday :=
    v_month_start
    + ((8 - extract(isodow from v_month_start)::integer) % 7);

  with weeks as (
    select
      (row_number() over (order by monday))::integer as week,
      monday::date as monday
    from generate_series(
      v_first_monday::timestamp,
      ((v_month_start + interval '1 month')::date - 1)::timestamp,
      interval '7 days'
    ) as monday
  ),
  counted as (
    select weeks.week, visit.purpose
    from weeks
    join public.visits as visit
      on visit.checked_in_at >=
          weeks.monday::timestamp at time zone 'Africa/Accra'
        and visit.checked_in_at <
          (weeks.monday + 7)::timestamp at time zone 'Africa/Accra'
    where visit.status in ('checked_in', 'checked_out')
      and (v_scope.tower_scope is null or visit.tower = v_scope.tower_scope)
      and (v_scope.agency is null or visit.destination_agency = v_scope.agency)
  )
  select jsonb_build_object(
    'year', p_year,
    'month', p_month,
    'towerScope', v_scope.tower_scope,
    'agency', v_scope.agency,
    'weeks', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'week', weeks.week,
          'start', weeks.monday,
          'end', weeks.monday + 4
        )
        order by weeks.week
      ), '[]'::jsonb)
      from weeks
    ),
    'cells', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'week', week,
          'purpose', purpose,
          'visits', visits
        )
      ), '[]'::jsonb)
      from (
        select counted.week, counted.purpose, count(*) as visits
        from counted
        group by 1, 2
      ) as by_cell
    )
  )
  into v_result;

  return v_result;
end;
$function$;

-- ------------------------------------------------------------
-- Visit rows for downloads
-- ------------------------------------------------------------

create or replace function public.get_visit_export(
  p_actor_id uuid,
  p_tower text,
  p_agency text,
  p_date_from date,
  p_date_to date,
  p_limit integer default 5000
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_scope record;
  v_from timestamp with time zone;
  v_to timestamp with time zone;
  v_limit integer := least(greatest(coalesce(p_limit, 5000), 1), 5000);
  v_total bigint;
  v_rows jsonb;
begin
  select * into v_scope
  from public.resolve_analytics_scope(p_actor_id, p_tower, p_agency);

  perform public.check_analytics_range(p_date_from, p_date_to);

  v_from := p_date_from::timestamp at time zone 'Africa/Accra';
  v_to := (p_date_to + 1)::timestamp at time zone 'Africa/Accra';

  select count(*)
  into v_total
  from public.visits as visit
  where visit.status in ('checked_in', 'checked_out')
    and visit.checked_in_at >= v_from
    and visit.checked_in_at < v_to
    and (v_scope.tower_scope is null or visit.tower = v_scope.tower_scope)
    and (v_scope.agency is null or visit.destination_agency = v_scope.agency);

  select coalesce(jsonb_agg(row_data order by checked_in_at desc), '[]'::jsonb)
  into v_rows
  from (
    select
      visit.checked_in_at,
      jsonb_build_object(
        'reference', visit.reference_code,
        'visitorName', visitor.full_name,
        'organization', visitor.organization,
        'purpose', visit.purpose,
        'agency', visit.destination_agency,
        'division', visit.destination_division,
        'personVisiting', visit.person_visiting,
        'tower', visit.tower,
        'status', visit.status,
        'checkedInAt', visit.checked_in_at,
        'checkedOutAt', visit.checked_out_at,
        'cardNumber', (
          select card.card_number
          from public.visitor_card_assignments as assignment
          join public.visitor_cards as card on card.id = assignment.card_id
          where assignment.visit_id = visit.id
          order by assignment.assigned_at desc
          limit 1
        ),
        'cardStatus', (
          select assignment.status
          from public.visitor_card_assignments as assignment
          where assignment.visit_id = visit.id
          order by assignment.assigned_at desc
          limit 1
        )
      ) as row_data
    from public.visits as visit
    join public.visitor_profiles as visitor
      on visitor.id = visit.visitor_id
    where visit.status in ('checked_in', 'checked_out')
      and visit.checked_in_at >= v_from
      and visit.checked_in_at < v_to
      and (v_scope.tower_scope is null or visit.tower = v_scope.tower_scope)
      and (v_scope.agency is null or visit.destination_agency = v_scope.agency)
    order by visit.checked_in_at desc
    limit v_limit
  ) as limited;

  return jsonb_build_object(
    'totalCount', v_total,
    'truncated', v_total > v_limit,
    'towerScope', v_scope.tower_scope,
    'visits', v_rows
  );
end;
$function$;

-- ------------------------------------------------------------
-- Access: the API's service role only
-- ------------------------------------------------------------

revoke all on function public.resolve_analytics_scope(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.check_analytics_range(date, date)
  from public, anon, authenticated;
revoke all on function public.visit_analytics_totals(
  text, text, timestamp with time zone, timestamp with time zone
) from public, anon, authenticated;
revoke all on function public.get_visit_analytics(uuid, text, text, date, date)
  from public, anon, authenticated;
revoke all on function public.get_csu_monthly_report(uuid, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.get_visit_export(uuid, text, text, date, date, integer)
  from public, anon, authenticated;

grant execute on function public.get_visit_analytics(uuid, text, text, date, date)
  to service_role;
grant execute on function public.get_csu_monthly_report(uuid, text, text, integer, integer)
  to service_role;
grant execute on function public.get_visit_export(uuid, text, text, date, date, integer)
  to service_role;

commit;
