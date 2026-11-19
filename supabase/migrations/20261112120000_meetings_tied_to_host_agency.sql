-- ------------------------------------------------------------
-- Meetings belong to their host agency
-- ------------------------------------------------------------
-- A visitor attending a meeting only sees, and can only book, the
-- meetings hosted by the agency they are visiting. For the Ministry
-- of Finance the host division must also match the visitor's
-- division, unless the meeting is hosted by Ministry Headquarters or
-- has no host division. Meetings without a host agency are no longer
-- offered to visitors.

begin;

-- True when a meeting hosted by (host agency, host division) can be
-- attended by a visitor going to (agency, division).
create or replace function public.meeting_hosted_at(
  p_host_agency text,
  p_host_division text,
  p_agency text,
  p_division text
)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select
    p_host_agency is not null
    and p_host_agency = p_agency
    and (
      p_agency <> 'Ministry of Finance (MoF)'
      or nullif(btrim(coalesce(p_host_division, '')), '') is null
      or p_host_division = 'Ministry Headquarters'
      or p_host_division = p_division
    );
$function$;

revoke execute
  on function public.meeting_hosted_at(text, text, text, text)
  from public, anon, authenticated;

grant execute
  on function public.meeting_hosted_at(text, text, text, text)
  to service_role;

-- ------------------------------------------------------------
-- Visitor meeting list, filtered by destination
-- ------------------------------------------------------------

drop function if exists public.get_available_meeting_options(date);

create or replace function public.get_available_meeting_options(
  p_agency text,
  p_division text default '',
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
    )
    and public.meeting_hosted_at(
      meeting.host_agency,
      meeting.host_division,
      p_agency,
      p_division
    );
$function$;

revoke execute
  on function public.get_available_meeting_options(text, text, date)
  from public, anon, authenticated;

grant execute
  on function public.get_available_meeting_options(text, text, date)
  to service_role;

-- ------------------------------------------------------------
-- New visits must match their meeting's host
-- ------------------------------------------------------------
-- Covers first visits, their guests and returning check-ins. Visits
-- already recorded are left as they are.

create or replace function public.check_visit_meeting_host()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.meeting_id is not null
    and not exists (
      select 1
      from public.meetings as meeting
      where meeting.id = new.meeting_id
        and public.meeting_hosted_at(
          meeting.host_agency,
          meeting.host_division,
          new.destination_agency,
          new.destination_division
        )
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Meeting is unavailable';
  end if;

  return new;
end;
$function$;

revoke execute
  on function public.check_visit_meeting_host()
  from public, anon, authenticated;

drop trigger if exists visits_meeting_host_check on public.visits;

create trigger visits_meeting_host_check
  before insert on public.visits
  for each row
  execute function public.check_visit_meeting_host();

notify pgrst, 'reload schema';

commit;
