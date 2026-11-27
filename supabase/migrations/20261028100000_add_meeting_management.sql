begin;

-- ============================================================
-- Meeting management for reception staff
-- ============================================================
-- Adds tower, times, venue and host division to meetings, a shared
-- "does this meeting happen on this date" check, the visitor-facing
-- option list (with times), and staff list / save / cancel / delete
-- functions. Receptionists manage meetings in their working tower;
-- administrators manage all; Client Service Heads may only view.

alter table public.meetings
  add column if not exists tower text,
  add column if not exists starts_at time,
  add column if not exists ends_at time,
  add column if not exists venue text,
  add column if not exists host_division text,
  add column if not exists cancelled_at timestamp with time zone,
  add column if not exists created_by uuid
    references auth.users(id) on delete set null,
  add column if not exists updated_by uuid
    references auth.users(id) on delete set null;

-- Meetings created before this migration have no tower; administrators
-- can set one when editing them.
alter table public.meetings
  drop constraint if exists meetings_tower_check,
  drop constraint if exists meetings_time_range_check,
  drop constraint if exists meetings_venue_check,
  drop constraint if exists meetings_host_division_check;

alter table public.meetings
  add constraint meetings_tower_check
    check (
      tower is null
      or tower in ('tower_1', 'tower_2')
    ),
  add constraint meetings_time_range_check
    check (
      (ends_at is null)
      or (starts_at is not null and ends_at > starts_at)
    ),
  add constraint meetings_venue_check
    check (
      venue is null
      or char_length(btrim(venue)) between 1 and 120
    ),
  add constraint meetings_host_division_check
    check (
      host_division is null
      or char_length(btrim(host_division)) between 1 and 160
    );

create index if not exists meetings_tower_idx
  on public.meetings (tower);

-- ------------------------------------------------------------
-- Does a meeting happen on a given date?
-- ------------------------------------------------------------

create or replace function public.meeting_occurs_on(
  p_schedule_type text,
  p_starts_on date,
  p_ends_on date,
  p_recurrence_days smallint[],
  p_on_date date
)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select
    p_starts_on <= p_on_date
    and (p_ends_on is null or p_ends_on >= p_on_date)
    and (
      (p_schedule_type = 'single' and p_starts_on = p_on_date)
      or p_schedule_type = 'continuous'
      or (
        p_schedule_type = 'weekly'
        and extract(dow from p_on_date)::smallint
          = any(p_recurrence_days)
      )
    );
$function$;

-- ------------------------------------------------------------
-- Visitor-facing options: today's active meetings with times
-- ------------------------------------------------------------

create or replace function public.get_available_meeting_options(
  p_on_date date default current_date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', meeting.id,
        'title', meeting.title,
        'startsAt', to_char(meeting.starts_at, 'HH24:MI'),
        'endsAt', to_char(meeting.ends_at, 'HH24:MI'),
        'venue', meeting.venue
      )
      order by
        meeting.starts_at nulls last,
        lower(meeting.title),
        meeting.id
    ),
    '[]'::jsonb
  )
  from public.meetings as meeting
  where meeting.active = true
    and public.meeting_occurs_on(
      meeting.schedule_type,
      meeting.starts_on,
      meeting.ends_on,
      meeting.recurrence_days,
      p_on_date
    );
$function$;

-- ------------------------------------------------------------
-- Staff list (table view and calendar range)
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
-- Shared permission check for changes
-- ------------------------------------------------------------

create or replace function public.require_meeting_manager(
  p_actor_id uuid,
  p_tower text,
  p_meeting_tower text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_scope jsonb;
begin
  v_scope := public.resolve_visitor_card_actor_scope(
    p_actor_id,
    p_tower
  );

  if v_scope ->> 'role' not in ('receptionist', 'admin') then
    raise exception using
      errcode = '42501',
      message = 'Only reception staff and administrators can manage meetings';
  end if;

  if v_scope ->> 'role' = 'receptionist'
    and p_meeting_tower is distinct from v_scope ->> 'tower'
  then
    raise exception using
      errcode = '42501',
      message = 'Receptionists can only manage meetings in their working tower';
  end if;

  return v_scope;
end;
$function$;

-- ------------------------------------------------------------
-- Create or update a meeting
-- ------------------------------------------------------------

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
        starts_at, ends_at, tower, venue, host_division,
        active, created_by, updated_by
      )
      values (
        v_title, v_type, p_starts_on, v_ends_on, v_days,
        p_starts_at, p_ends_at, v_meeting_tower,
        nullif(btrim(coalesce(p_venue, '')), ''),
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
        host_division = nullif(btrim(coalesce(p_host_division, '')), ''),
        updated_by = p_actor_id
      where id = p_meeting_id
      returning id into v_id;
    end if;
  exception
    when check_violation then
      raise exception using
        errcode = '22023',
        message = 'Check the meeting title, dates, days and times';
  end;

  return jsonb_build_object(
    'meetingId', v_id,
    'title', v_title,
    'created', p_meeting_id is null
  );
end;
$function$;

-- ------------------------------------------------------------
-- Cancel or restore a meeting
-- ------------------------------------------------------------

create or replace function public.set_staff_meeting_active(
  p_actor_id uuid,
  p_tower text,
  p_meeting_id uuid,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_meeting_tower text;
  v_title text;
begin
  if p_active is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid meeting status';
  end if;

  select meeting.tower, meeting.title
  into v_meeting_tower, v_title
  from public.meetings as meeting
  where meeting.id = p_meeting_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Meeting not found';
  end if;

  perform public.require_meeting_manager(
    p_actor_id, p_tower, v_meeting_tower
  );

  update public.meetings
  set
    active = p_active,
    cancelled_at = case when p_active then null else now() end,
    updated_by = p_actor_id
  where id = p_meeting_id;

  return jsonb_build_object(
    'meetingId', p_meeting_id,
    'title', v_title,
    'active', p_active
  );
end;
$function$;

-- ------------------------------------------------------------
-- Delete a meeting no visitor has registered for
-- ------------------------------------------------------------

create or replace function public.delete_staff_meeting(
  p_actor_id uuid,
  p_tower text,
  p_meeting_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_meeting_tower text;
  v_title text;
begin
  select meeting.tower, meeting.title
  into v_meeting_tower, v_title
  from public.meetings as meeting
  where meeting.id = p_meeting_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Meeting not found';
  end if;

  perform public.require_meeting_manager(
    p_actor_id, p_tower, v_meeting_tower
  );

  if exists (
    select 1
    from public.visits as visit
    where visit.meeting_id = p_meeting_id
  ) then
    raise exception using
      errcode = '55000',
      message = 'Visitors have registered for this meeting. Cancel it instead.';
  end if;

  delete from public.meetings where id = p_meeting_id;

  return jsonb_build_object(
    'meetingId', p_meeting_id,
    'title', v_title,
    'deleted', true
  );
end;
$function$;

-- ------------------------------------------------------------
-- Permissions: server functions only
-- ------------------------------------------------------------

revoke all on function
  public.meeting_occurs_on(text, date, date, smallint[], date),
  public.get_available_meeting_options(date),
  public.get_staff_meetings(uuid, text, text, text, integer, integer, date, date),
  public.require_meeting_manager(uuid, text, text),
  public.save_staff_meeting(uuid, text, uuid, text, text, date, date, smallint[], time, time, text, text, text),
  public.set_staff_meeting_active(uuid, text, uuid, boolean),
  public.delete_staff_meeting(uuid, text, uuid)
  from public, anon, authenticated;

grant execute on function
  public.meeting_occurs_on(text, date, date, smallint[], date),
  public.get_available_meeting_options(date),
  public.get_staff_meetings(uuid, text, text, text, integer, integer, date, date),
  public.require_meeting_manager(uuid, text, text),
  public.save_staff_meeting(uuid, text, uuid, text, text, date, date, smallint[], time, time, text, text, text),
  public.set_staff_meeting_active(uuid, text, uuid, boolean),
  public.delete_staff_meeting(uuid, text, uuid)
  to service_role;

notify pgrst, 'reload schema';

commit;
