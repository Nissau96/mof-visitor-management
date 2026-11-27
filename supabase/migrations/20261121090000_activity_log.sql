-- ============================================================
-- Activity log
-- ============================================================
-- The admin-only Activity Log reads audit_events. This migration:
--   1. adds who/where/result columns (IP, device, tower, result, role,
--      name), filled in automatically from request headers the API
--      sends with every database call;
--   2. records field changes (before/after) for hosts, staff, visitor
--      cards and visit Wi-Fi when the same transaction writes an audit
--      event, and logs meeting edits and booking decisions directly;
--   3. locks the log: rows cannot be edited or deleted, except the
--      retention cleanup of expired rows and the staff-deletion
--      bookkeeping that already existed;
--   4. adds get_activity_log() for administrators.

begin;

-- ------------------------------------------------------------
-- 1. Columns
-- ------------------------------------------------------------

alter table public.audit_events
  add column if not exists ip_address text,
  add column if not exists user_agent text,
  add column if not exists tower text,
  add column if not exists result text not null default 'success',
  add column if not exists actor_role text,
  add column if not exists actor_name text;

alter table public.audit_events
  drop constraint if exists audit_events_result_check;

alter table public.audit_events
  add constraint audit_events_result_check
  check (result in ('success', 'failed'));

-- Existing events: the actor's name and role, and failed results.
-- (Runs before the lock trigger below is created.)
update public.audit_events as event
set
  actor_name = coalesce(event.actor_name, staff.full_name),
  actor_role = coalesce(event.actor_role, staff.role)
from public.staff_profiles as staff
where staff.user_id = event.actor_id
  and (event.actor_name is null or event.actor_role is null);

update public.audit_events
set actor_role = case
  when action like 'retention.%' then 'system'
  when action like 'meeting_booking.%' then 'booker'
  else 'visitor'
end
where actor_id is null
  and actor_role is null;

update public.audit_events
set result = 'failed'
where action ~ '(refused|failed)$'
  and result <> 'failed';

create index if not exists audit_events_actor_created_idx
  on public.audit_events (actor_id, created_at desc);

create index if not exists audit_events_action_idx
  on public.audit_events (action);

-- ------------------------------------------------------------
-- Request headers (set by the API on each PostgREST call)
-- ------------------------------------------------------------

create or replace function public.audit_request_header(p_name text)
returns text
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_headers text := nullif(current_setting('request.headers', true), '');
begin
  if v_headers is null then
    return null;
  end if;

  return nullif(btrim(v_headers::jsonb ->> p_name), '');
exception
  when others then
    return null;
end;
$function$;

-- Field-level differences between two row images.
create or replace function public.audit_row_changes(
  p_old jsonb,
  p_new jsonb,
  p_fields text[]
)
returns jsonb
language sql
immutable
set search_path = ''
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'field', field,
        'before', p_old -> field,
        'after', p_new -> field
      )
      order by position
    ),
    '[]'::jsonb
  )
  from unnest(p_fields) with ordinality as listed(field, position)
  where (p_old -> field) is distinct from (p_new -> field);
$function$;

-- Remembers changes for the audit event this transaction writes next
-- (keyed by entity id).
create or replace function public.audit_note_changes(
  p_entity_id text,
  p_changes jsonb
)
returns void
language plpgsql
volatile
set search_path = ''
as $function$
declare
  v_pending jsonb :=
    coalesce(nullif(current_setting('audit.pending_changes', true), '')::jsonb, '{}'::jsonb);
begin
  if p_changes is null or jsonb_array_length(p_changes) = 0 then
    return;
  end if;

  perform set_config(
    'audit.pending_changes',
    (v_pending || jsonb_build_object(p_entity_id, p_changes))::text,
    true
  );
end;
$function$;

-- AFTER UPDATE trigger: TG_ARGV[0] is the key column; the rest list the
-- fields to compare. With no fields listed, every column is compared
-- except ids, timestamps and anything secret.
create or replace function public.audit_capture_row_changes()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_fields text[];
begin
  if tg_nargs > 1 then
    v_fields := tg_argv[1:tg_nargs - 1];
  else
    select array_agg(key order by key)
    into v_fields
    from jsonb_object_keys(v_new) as key
    where key not in ('id', 'user_id', 'created_at', 'updated_at')
      and key !~ '(hash|cipher|token|secret|password)';
  end if;

  perform public.audit_note_changes(
    v_new ->> tg_argv[0],
    public.audit_row_changes(v_old, v_new, v_fields)
  );

  return new;
end;
$function$;

drop trigger if exists hosts_audit_changes on public.hosts;
create trigger hosts_audit_changes
  after update on public.hosts
  for each row execute function public.audit_capture_row_changes('id');

drop trigger if exists staff_profiles_audit_changes on public.staff_profiles;
create trigger staff_profiles_audit_changes
  after update on public.staff_profiles
  for each row execute function public.audit_capture_row_changes(
    'user_id', 'full_name', 'role', 'active', 'sign_in_method', 'is_nsp', 'access_expires_at'
  );

drop trigger if exists visitor_cards_audit_changes on public.visitor_cards;
create trigger visitor_cards_audit_changes
  after update on public.visitor_cards
  for each row execute function public.audit_capture_row_changes('id', 'tower', 'card_type');

drop trigger if exists visits_wifi_audit_changes on public.visits;
create trigger visits_wifi_audit_changes
  after update on public.visits
  for each row execute function public.audit_capture_row_changes(
    'id', 'wifi_status', 'wifi_expires_at', 'wifi_note'
  );

-- ------------------------------------------------------------
-- Fill-in trigger
-- ------------------------------------------------------------

create or replace function public.audit_events_fill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_header_actor text := public.audit_request_header('x-audit-actor');
  v_header_role text := public.audit_request_header('x-audit-role');
  v_header_name text := public.audit_request_header('x-audit-actor-name');
  v_has_request boolean := nullif(current_setting('request.headers', true), '') is not null;
  v_pending jsonb;
  v_tower text;
begin
  new.details := coalesce(new.details, '{}'::jsonb);
  new.ip_address := coalesce(new.ip_address, left(public.audit_request_header('x-audit-ip'), 64));
  new.user_agent := coalesce(new.user_agent, left(public.audit_request_header('x-audit-ua'), 400));

  -- Staff actions carry the signed-in staff member when the caller
  -- did not name an actor.
  if new.actor_id is null
    and v_header_actor ~ '^[0-9a-fA-F-]{36}$'
    and exists (select 1 from auth.users where id = v_header_actor::uuid)
  then
    new.actor_id := v_header_actor::uuid;
  end if;

  if new.actor_id is not null then
    select
      coalesce(new.actor_name, staff.full_name),
      coalesce(new.actor_role, staff.role)
    into new.actor_name, new.actor_role
    from public.staff_profiles as staff
    where staff.user_id = new.actor_id;
  end if;

  if new.actor_name is null and v_header_name is not null then
    begin
      new.actor_name := left(convert_from(decode(v_header_name, 'base64'), 'UTF8'), 160);
    exception
      when others then
        new.actor_name := null;
    end;
  end if;

  new.actor_role := coalesce(
    new.actor_role,
    v_header_role,
    case when v_has_request then 'visitor' else 'system' end
  );

  if new.result is null or new.result = 'success' then
    new.result := case
      when new.action ~ '(refused|failed)$' then 'failed'
      else 'success'
    end;
  end if;

  -- Tower: the event's own, then the visit, card or booking it names.
  v_tower := coalesce(new.tower, new.details ->> 'tower');

  if v_tower is null and new.entity_id ~ '^[0-9a-fA-F-]{36}$' then
    if new.entity_type = 'visit' then
      select visit.tower::text into v_tower
      from public.visits as visit where visit.id = new.entity_id::uuid;
    elsif new.entity_type = 'visitor_card' then
      select card.tower::text into v_tower
      from public.visitor_cards as card where card.id = new.entity_id::uuid;
    elsif new.entity_type = 'meeting_booking' then
      select booking.tower into v_tower
      from public.meeting_bookings as booking where booking.id = new.entity_id::uuid;
    end if;
  end if;

  new.tower := case when v_tower in ('tower_1', 'tower_2') then v_tower else null end;

  -- Before/after changes noted earlier in this transaction.
  if not (new.details ? 'changes') and new.entity_id is not null then
    v_pending := coalesce(nullif(current_setting('audit.pending_changes', true), '')::jsonb, '{}'::jsonb);

    if v_pending ? new.entity_id then
      new.details := new.details || jsonb_build_object('changes', v_pending -> new.entity_id);
      perform set_config('audit.pending_changes', (v_pending - new.entity_id)::text, true);
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists audit_events_fill on public.audit_events;
create trigger audit_events_fill
  before insert on public.audit_events
  for each row execute function public.audit_events_fill();

-- ------------------------------------------------------------
-- 3. Lock: no edits, no deletes
-- ------------------------------------------------------------

create or replace function public.audit_events_protect()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_retention interval;
begin
  if tg_op = 'DELETE' then
    select policy.audit_event_retention
    into v_retention
    from public.data_retention_policies as policy
    where policy.active
    limit 1;

    -- Only the retention cleanup of rows past their retention period.
    if old.created_at < now() - coalesce(v_retention, interval '2 years') then
      return old;
    end if;

    raise exception using
      errcode = '42501',
      message = 'Activity log entries cannot be deleted.';
  end if;

  -- Deleting a staff account clears actor_id (foreign key) and notes the
  -- deleted actor in details; nothing else may change.
  if (to_jsonb(new) - 'actor_id' - 'details') = (to_jsonb(old) - 'actor_id' - 'details')
    and (new.actor_id is null or new.actor_id = old.actor_id)
    and (coalesce(new.details, '{}'::jsonb) - 'deletedActorId')
      = (coalesce(old.details, '{}'::jsonb) - 'deletedActorId')
  then
    return new;
  end if;

  raise exception using
    errcode = '42501',
    message = 'Activity log entries cannot be edited.';
end;
$function$;

drop trigger if exists audit_events_protect on public.audit_events;
create trigger audit_events_protect
  before update or delete on public.audit_events
  for each row execute function public.audit_events_protect();

-- ------------------------------------------------------------
-- Meetings and booking decisions (no audit rows before)
-- ------------------------------------------------------------

create or replace function public.audit_meetings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_changes jsonb;
  v_fields text[];
begin
  if tg_op = 'INSERT' then
    insert into public.audit_events (action, entity_type, entity_id, details)
    values ('meeting.created', 'meeting', new.id::text, jsonb_build_object('title', new.title));
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.audit_events (action, entity_type, entity_id, details)
    values ('meeting.deleted', 'meeting', old.id::text, jsonb_build_object('title', old.title));
    return old;
  end if;

  select array_agg(key order by key)
  into v_fields
  from jsonb_object_keys(to_jsonb(new)) as key
  where key not in ('id', 'created_at', 'updated_at');

  v_changes := public.audit_row_changes(to_jsonb(old), to_jsonb(new), v_fields);

  if jsonb_array_length(v_changes) > 0 then
    insert into public.audit_events (action, entity_type, entity_id, details)
    values (
      'meeting.updated',
      'meeting',
      new.id::text,
      jsonb_build_object('title', new.title, 'changes', v_changes)
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists meetings_audit on public.meetings;
create trigger meetings_audit
  after insert or update or delete on public.meetings
  for each row execute function public.audit_meetings();

create or replace function public.audit_meeting_booking_decisions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status is distinct from old.status
    and new.status in ('approved', 'rejected')
  then
    insert into public.audit_events (actor_id, action, entity_type, entity_id, details)
    values (
      new.decided_by,
      'meeting_booking.' || new.status,
      'meeting_booking',
      new.id::text,
      jsonb_build_object(
        'referenceCode', new.reference_code,
        'title', new.title,
        'reason', new.decision_reason,
        'tower', new.tower
      )
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists meeting_bookings_audit_decisions on public.meeting_bookings;
create trigger meeting_bookings_audit_decisions
  after update on public.meeting_bookings
  for each row execute function public.audit_meeting_booking_decisions();

-- ------------------------------------------------------------
-- Categories and sensitive events
-- ------------------------------------------------------------

create or replace function public.audit_event_category(p_action text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select case
    when p_action like '%.exported' then 'export'
    when p_action in ('staff_signed_in', 'staff_signed_out', 'staff_sign_in_refused', 'staff_sign_in_failed')
      or p_action like 'staff.password%' then 'signin'
    when p_action like 'visitor_card.%' then 'card'
    when p_action like 'visit.%' then 'visitor'
    when p_action like 'meeting%' then 'meeting'
    when p_action like 'wifi%' then 'wifi'
    when p_action like 'visitor_invite.%' then 'link'
    when p_action like 'kiosk%' then 'kiosk'
    when p_action like 'host.%' or p_action like 'staff%' or p_action like 'weekly_qr.%' then 'settings'
    else 'system'
  end;
$function$;

create or replace function public.audit_event_sensitive(p_action text)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select p_action like 'staff.%'
    and p_action not like 'staff.password_setup%'
    or p_action = 'staff_sign_in_settings_updated'
    or p_action like 'host.%'
    or p_action in ('visitor_card.inventory_added', 'visitor_card.tower_assigned')
    or p_action like '%.exported'
    or p_action = 'wifi.password_revealed';
$function$;

-- ------------------------------------------------------------
-- 4. get_activity_log (administrators only)
-- ------------------------------------------------------------

create or replace function public.get_activity_log(
  p_actor_id uuid,
  p_page integer default 1,
  p_page_size integer default 10,
  p_search text default '',
  p_date_from date default null,
  p_date_to date default null,
  p_user_id uuid default null,
  p_role text default '',
  p_tower text default '',
  p_category text default '',
  p_result text default ''
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_from timestamptz;
  v_to timestamptz;
  v_day_start timestamptz := (timezone('Africa/Accra', now())::date)::timestamp at time zone 'Africa/Accra';
  v_offset integer;
  v_total bigint := 0;
  v_events jsonb := '[]'::jsonb;
  v_stats jsonb;
  v_users jsonb;
begin
  if not exists (
    select 1 from public.staff_profiles as staff
    where staff.user_id = p_actor_id and staff.role = 'admin' and staff.active
  ) then
    raise exception using errcode = '42501', message = 'Only administrators can read the activity log';
  end if;

  if p_page is null or p_page < 1 or p_page > 10000 then
    raise exception using errcode = '22023', message = 'Invalid activity page';
  end if;

  if p_page_size is null or p_page_size < 1 or p_page_size > 5000 then
    raise exception using errcode = '22023', message = 'Invalid activity page size';
  end if;

  if char_length(v_search) > 80 then
    raise exception using errcode = '22023', message = 'Activity search is too long';
  end if;

  if p_date_from is not null and p_date_to is not null and p_date_from > p_date_to then
    raise exception using errcode = '22023', message = 'Activity start date must not be after end date';
  end if;

  if p_date_from is not null then
    v_from := p_date_from::timestamp at time zone 'Africa/Accra';
  end if;

  if p_date_to is not null then
    v_to := (p_date_to + 1)::timestamp at time zone 'Africa/Accra';
  end if;

  v_offset := (p_page - 1) * p_page_size;

  with base as (
    select
      event.*,
      public.audit_event_category(event.action) as category,
      public.audit_event_sensitive(event.action) as sensitive,
      coalesce(
        event.actor_name,
        event.details ->> 'bookerName',
        event.details ->> 'creatorName'
      ) as display_name,
      target.name as target_name,
      target.detail as target_detail
    from public.audit_events as event
    left join lateral (
      select
        case
          when event.entity_type = 'visit' then (
            select profile.full_name
            from public.visits as visit
            join public.visitor_profiles as profile on profile.id = visit.visitor_id
            where visit.id::text = event.entity_id
          )
          when event.entity_type = 'visitor_card' then (
            select card.card_number from public.visitor_cards as card where card.id::text = event.entity_id
          )
          when event.entity_type = 'host' then (
            select host.full_name from public.hosts as host where host.id::text = event.entity_id
          )
          when event.entity_type in ('staff', 'staff_session') then (
            select staff.full_name from public.staff_profiles as staff where staff.user_id::text = event.entity_id
          )
          when event.entity_type = 'meeting' then coalesce(
            (select meeting.title from public.meetings as meeting where meeting.id::text = event.entity_id),
            event.details ->> 'title'
          )
          when event.entity_type = 'meeting_booking' then (
            select booking.title from public.meeting_bookings as booking where booking.id::text = event.entity_id
          )
          when event.entity_type = 'kiosk_device' then (
            select device.label from public.kiosk_devices as device where device.id::text = event.entity_id
          )
          when event.entity_type = 'visitor_invite' then (
            select coalesce(invite.full_name, 'Visitor link for ' || invite.host_name)
            from public.visitor_invites as invite where invite.id::text = event.entity_id
          )
          else null
        end as name,
        case
          when event.entity_type = 'visit' then (
            select visit.reference_code from public.visits as visit where visit.id::text = event.entity_id
          )
          when event.entity_type = 'meeting_booking' then (
            select booking.reference_code from public.meeting_bookings as booking where booking.id::text = event.entity_id
          )
          when event.entity_type = 'visitor_invite' then (
            select invite.reference_code from public.visitor_invites as invite where invite.id::text = event.entity_id
          )
          when event.entity_type = 'host' then (
            select host.department from public.hosts as host where host.id::text = event.entity_id
          )
          else null
        end as detail
    ) as target on true
    where (v_from is null or event.created_at >= v_from)
      and (v_to is null or event.created_at < v_to)
      and (p_user_id is null or event.actor_id = p_user_id)
      and (coalesce(p_role, '') = '' or event.actor_role = p_role)
      and (
        coalesce(p_tower, '') = ''
        or (p_tower = 'none' and event.tower is null)
        or event.tower = p_tower
      )
      and (coalesce(p_result, '') = '' or event.result = p_result)
  ),
  matched as (
    select *
    from base
    where (coalesce(p_category, '') = '' or base.category = p_category or (p_category = 'sensitive' and base.sensitive))
      and (
        v_search = ''
        or strpos(lower(base.action), v_search) > 0
        or strpos(lower(coalesce(base.display_name, '')), v_search) > 0
        or strpos(lower(coalesce(base.target_name, '')), v_search) > 0
        or strpos(lower(coalesce(base.target_detail, '')), v_search) > 0
        or strpos(lower(coalesce(base.entity_id, '')), v_search) > 0
        or strpos(lower(base.details::text), v_search) > 0
        or ('ev-' || base.id::text) = v_search
      )
  ),
  ordered as (
    select matched.*, count(*) over () as total_count,
      row_number() over (order by matched.created_at desc, matched.id desc) as position
    from matched
  )
  select
    coalesce(max(ordered.total_count), 0),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', ordered.id,
          'createdAt', ordered.created_at,
          'action', ordered.action,
          'category', ordered.category,
          'sensitive', ordered.sensitive,
          'result', ordered.result,
          'actorId', ordered.actor_id,
          'actorName', ordered.display_name,
          'actorRole', ordered.actor_role,
          'ipAddress', ordered.ip_address,
          'userAgent', ordered.user_agent,
          'tower', ordered.tower,
          'entityType', ordered.entity_type,
          'entityId', ordered.entity_id,
          'targetName', ordered.target_name,
          'targetDetail', ordered.target_detail,
          'details', ordered.details
        )
        order by ordered.position
      ) filter (where ordered.position > v_offset and ordered.position <= v_offset + p_page_size),
      '[]'::jsonb
    )
  into v_total, v_events
  from ordered;

  -- Today's figures (Ghana time), across all towers.
  select jsonb_build_object(
    'eventsToday', count(*),
    'firstEventAt', min(event.created_at),
    'failedToday', count(*) filter (where event.result = 'failed'),
    'sensitiveToday', count(*) filter (where public.audit_event_sensitive(event.action)),
    'activeUsers', coalesce(
      (
        select jsonb_agg(distinct split_part(active.actor_name, ' ', 1))
        from public.audit_events as active
        where active.created_at >= v_day_start
          and active.actor_id is not null
          and active.actor_name is not null
      ),
      '[]'::jsonb
    ),
    'activeUserCount', count(distinct event.actor_id)
  )
  into v_stats
  from public.audit_events as event
  where event.created_at >= v_day_start;

  -- Everyone who appears in the log, for the User filter.
  select coalesce(
    jsonb_agg(jsonb_build_object('id', staff.user_id, 'name', staff.full_name, 'role', staff.role) order by staff.full_name),
    '[]'::jsonb
  )
  into v_users
  from public.staff_profiles as staff;

  return jsonb_build_object(
    'generatedAt', now(),
    'pagination', jsonb_build_object(
      'page', p_page,
      'pageSize', p_page_size,
      'totalCount', v_total,
      'totalPages', case when v_total > 0 then ceil(v_total::numeric / p_page_size)::integer else 0 end
    ),
    'events', v_events,
    'stats', v_stats,
    'users', v_users
  );
end;
$function$;

revoke all on function public.get_activity_log(uuid, integer, integer, text, date, date, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.get_activity_log(uuid, integer, integer, text, date, date, uuid, text, text, text, text)
  to service_role;

revoke all on function public.audit_note_changes(text, jsonb) from public, anon, authenticated;
revoke all on function public.audit_request_header(text) from public, anon, authenticated;

comment on function public.get_activity_log(uuid, integer, integer, text, date, date, uuid, text, text, text, text)
is 'Administrator-only, filtered activity log with today''s figures; pages of up to 5,000 rows for export.';

notify pgrst, 'reload schema';

commit;
