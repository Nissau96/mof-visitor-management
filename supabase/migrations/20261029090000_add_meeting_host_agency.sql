begin;

-- ============================================================
-- Meeting host agency
-- ============================================================
-- Adds the hosting agency to meetings. The staff form picks an agency
-- and, for the Ministry of Finance, a division. Older meetings keep
-- their free-text host division unchanged.

alter table public.meetings
  add column if not exists host_agency text;

alter table public.meetings
  drop constraint if exists meetings_host_agency_check;

alter table public.meetings
  add constraint meetings_host_agency_check
    check (
      host_agency is null
      or char_length(btrim(host_agency)) between 1 and 80
    );

-- ------------------------------------------------------------
-- Staff list: include the host agency
-- ------------------------------------------------------------

create or replace function public.get_staff_meetings(
  p_actor_id uuid,
  p_tower text default '',
  p_view text default 'today',
  p_search text default '',
  p_page integer default 1,
  p_page_size integer default 10,
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_scope jsonb;
  v_role text;
  v_tower text;
  v_view text := lower(btrim(coalesce(p_view, 'today')));
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_today date := current_date;
  v_week_start date;
  v_page integer := p_page;
  v_page_size integer := p_page_size;
  v_total_count bigint := 0;
  v_total_pages integer := 0;
  v_meetings jsonb := '[]'::jsonb;
  v_summary jsonb;
begin
  v_scope := public.resolve_visitor_card_actor_scope(
    p_actor_id,
    p_tower
  );

  v_role := v_scope ->> 'role';
  v_tower := coalesce(v_scope ->> 'tower', '');

  if v_view not in (
    'today', 'upcoming', 'past', 'cancelled', 'range'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid meeting view';
  end if;

  if char_length(v_search) > 80 then
    raise exception using
      errcode = '22023',
      message = 'Meeting search is too long';
  end if;

  if v_view = 'range' then
    if p_from is null
      or p_to is null
      or p_to < p_from
      or p_to - p_from > 62
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid meeting date range';
    end if;

    -- The calendar shows every meeting in the range on one page.
    v_page := 1;
    v_page_size := 300;
  elsif v_page is null
    or v_page < 1
    or v_page > 10000
    or v_page_size is null
    or v_page_size < 1
    or v_page_size > 50
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid meeting page';
  end if;

  -- Monday of the current week (Accra is UTC+0).
  v_week_start :=
    v_today - ((extract(isodow from v_today)::integer) - 1);

  select jsonb_build_object(
    'todayCount',
    count(*) filter (
      where meeting.active
        and public.meeting_occurs_on(
          meeting.schedule_type, meeting.starts_on,
          meeting.ends_on, meeting.recurrence_days, v_today
        )
    ),
    'thisWeekCount',
    count(*) filter (
      where meeting.active
        and exists (
          select 1
          from generate_series(
            v_week_start,
            v_week_start + 6,
            interval '1 day'
          ) as day(value)
          where public.meeting_occurs_on(
            meeting.schedule_type, meeting.starts_on,
            meeting.ends_on, meeting.recurrence_days,
            day.value::date
          )
        )
    ),
    'recurringCount',
    count(*) filter (
      where meeting.active
        and meeting.schedule_type in ('weekly', 'continuous')
        and (meeting.ends_on is null or meeting.ends_on >= v_today)
    ),
    'cancelledCount',
    count(*) filter (where not meeting.active)
  )
  into v_summary
  from public.meetings as meeting
  where v_tower = '' or meeting.tower = v_tower;

  with scoped as (
    select meeting.*
    from public.meetings as meeting
    where (v_tower = '' or meeting.tower = v_tower)
      and (
        v_search = ''
        or strpos(lower(meeting.title), v_search) > 0
        or strpos(lower(coalesce(meeting.venue, '')), v_search) > 0
        or strpos(lower(coalesce(meeting.host_agency, '')), v_search) > 0
        or strpos(lower(coalesce(meeting.host_division, '')), v_search) > 0
      )
      and (
        (
          v_view = 'today'
          and meeting.active
          and public.meeting_occurs_on(
            meeting.schedule_type, meeting.starts_on,
            meeting.ends_on, meeting.recurrence_days, v_today
          )
        )
        or (
          v_view = 'upcoming'
          and meeting.active
          and (meeting.ends_on is null or meeting.ends_on > v_today)
        )
        or (
          v_view = 'past'
          and meeting.active
          and meeting.ends_on < v_today
        )
        or (v_view = 'cancelled' and not meeting.active)
        or (
          v_view = 'range'
          and meeting.active
          and meeting.starts_on <= p_to
          and (meeting.ends_on is null or meeting.ends_on >= p_from)
        )
      )
  ),
  counted as (
    select count(*) as total from scoped
  ),
  paged as (
    select
      scoped.*,
      (
        select count(*)
        from public.visits as visit
        where visit.meeting_id = scoped.id
      ) as visitor_count
    from scoped
    order by
      case when v_view = 'past' then scoped.ends_on end desc,
      case when v_view = 'cancelled' then scoped.cancelled_at end desc nulls last,
      scoped.starts_on,
      scoped.starts_at nulls last,
      lower(scoped.title),
      scoped.id
    limit v_page_size
    offset (v_page - 1) * v_page_size
  )
  select
    (select total from counted),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'meetingId', paged.id,
            'title', paged.title,
            'scheduleType', paged.schedule_type,
            'startsOn', paged.starts_on,
            'endsOn', paged.ends_on,
            'recurrenceDays', to_jsonb(paged.recurrence_days),
            'startsAt', to_char(paged.starts_at, 'HH24:MI'),
            'endsAt', to_char(paged.ends_at, 'HH24:MI'),
            'tower', paged.tower,
            'venue', paged.venue,
            'hostAgency', paged.host_agency,
            'hostDivision', paged.host_division,
            'active', paged.active,
            'cancelledAt', paged.cancelled_at,
            'visitorCount', paged.visitor_count,
            'canManage',
              v_role = 'admin'
              or (v_role = 'receptionist' and coalesce(paged.tower = v_tower, false)),
            'canDelete',
              (
                v_role = 'admin'
                or (v_role = 'receptionist' and coalesce(paged.tower = v_tower, false))
              )
              and paged.visitor_count = 0
          )
          order by
            case when v_view = 'past' then paged.ends_on end desc,
            case when v_view = 'cancelled' then paged.cancelled_at end desc nulls last,
            paged.starts_on,
            paged.starts_at nulls last,
            lower(paged.title),
            paged.id
        )
        from paged
      ),
      '[]'::jsonb
    )
  into v_total_count, v_meetings;

  if v_total_count > 0 then
    v_total_pages :=
      ceil(v_total_count::numeric / v_page_size::numeric)::integer;
  end if;

  return jsonb_build_object(
    'meetings', v_meetings,
    'pagination', jsonb_build_object(
      'page', v_page,
      'pageSize', v_page_size,
      'totalCount', v_total_count,
      'totalPages', v_total_pages
    ),
    'summary', v_summary,
    'scope', jsonb_build_object(
      'canManage', v_role in ('receptionist', 'admin'),
      'role', v_role,
      'tower', nullif(v_tower, ''),
      'today', v_today
    )
  );
end;
$function$;

-- ------------------------------------------------------------
-- Create or update a meeting, now with a host agency
-- ------------------------------------------------------------

drop function if exists public.save_staff_meeting(
  uuid, text, uuid, text, text, date, date, smallint[], time, time, text, text, text
);

create or replace function public.save_staff_meeting(
  p_actor_id uuid,
  p_tower text,
  p_meeting_id uuid,
  p_title text,
  p_schedule_type text,
  p_starts_on date,
  p_ends_on date,
  p_recurrence_days smallint[],
  p_starts_at time,
  p_ends_at time,
  p_meeting_tower text,
  p_venue text,
  p_host_agency text,
  p_host_division text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing_tower text;
  v_title text := btrim(coalesce(p_title, ''));
  v_type text := lower(btrim(coalesce(p_schedule_type, '')));
  v_meeting_tower text := lower(btrim(coalesce(p_meeting_tower, '')));
  v_ends_on date := p_ends_on;
  v_days smallint[] := coalesce(p_recurrence_days, array[]::smallint[]);
  v_id uuid;
begin
  if v_meeting_tower not in ('tower_1', 'tower_2') then
    raise exception using
      errcode = '22023',
      message = 'Select the meeting tower';
  end if;

  if p_meeting_id is not null then
    select meeting.tower
    into v_existing_tower
    from public.meetings as meeting
    where meeting.id = p_meeting_id
    for update;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'Meeting not found';
    end if;

    -- A receptionist must be allowed to manage both the current and the
    -- new tower of the meeting.
    perform public.require_meeting_manager(
      p_actor_id, p_tower, v_existing_tower
    );
  end if;

  perform public.require_meeting_manager(
    p_actor_id, p_tower, v_meeting_tower
  );

  if v_type not in ('single', 'continuous', 'weekly') then
    raise exception using
      errcode = '22023',
      message = 'Invalid meeting schedule';
  end if;

  if p_starts_on is null then
    raise exception using
      errcode = '22023',
      message = 'Meeting start date is required';
  end if;

  if v_type = 'single' then
    v_ends_on := p_starts_on;
    v_days := array[]::smallint[];
  elsif v_type = 'continuous' then
    v_days := array[]::smallint[];
  end if;

  if p_meeting_id is null
    and coalesce(v_ends_on, p_starts_on) < current_date
  then
    raise exception using
      errcode = '22023',
      message = 'A new meeting cannot end in the past';
  end if;

  begin
    if p_meeting_id is null then
      insert into public.meetings (
        title, schedule_type, starts_on, ends_on, recurrence_days,
        starts_at, ends_at, tower, venue, host_agency, host_division,
        active, created_by, updated_by
      )
      values (
        v_title, v_type, p_starts_on, v_ends_on, v_days,
        p_starts_at, p_ends_at, v_meeting_tower,
        nullif(btrim(coalesce(p_venue, '')), ''),
        nullif(btrim(coalesce(p_host_agency, '')), ''),
        nullif(btrim(coalesce(p_host_division, '')), ''),
        true, p_actor_id, p_actor_id
      )
      returning id into v_id;
    else
      update public.meetings
      set
        title = v_title,
        schedule_type = v_type,
        starts_on = p_starts_on,
        ends_on = v_ends_on,
        recurrence_days = v_days,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        tower = v_meeting_tower,
        venue = nullif(btrim(coalesce(p_venue, '')), ''),
        host_agency = nullif(btrim(coalesce(p_host_agency, '')), ''),
        host_division = nullif(btrim(coalesce(p_host_division, '')), ''),
        updated_by = p_actor_id
      where id = p_meeting_id
      returning id into v_id;
    end if;
  exception
    when check_violation then
      raise exception using
        errcode = '22023',
        message = 'Check the meeting title, dates, days, times and host';
  end;

  return jsonb_build_object(
    'meetingId', v_id,
    'title', v_title,
    'created', p_meeting_id is null
  );
end;
$function$;

revoke all on function
  public.save_staff_meeting(uuid, text, uuid, text, text, date, date, smallint[], time, time, text, text, text, text)
  from public, anon, authenticated;

grant execute on function
  public.save_staff_meeting(uuid, text, uuid, text, text, date, date, smallint[], time, time, text, text, text, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
