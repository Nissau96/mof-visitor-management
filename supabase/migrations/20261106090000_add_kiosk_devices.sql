begin;

-- ============================================================
-- Reception kiosk tablets
-- ============================================================
-- Each tablet set up as a kiosk holds a signed cookie naming its row
-- here. Removing a lost or stolen tablet sets revoked_at, which stops
-- that one tablet on its next request. Only the service role reads or
-- writes the table, through the functions below.

create table if not exists public.kiosk_devices (
  id uuid primary key,
  label text not null
    check (char_length(btrim(label)) between 2 and 60),
  created_by uuid
    references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null,
  last_seen_at timestamp with time zone not null default now(),
  revoked_at timestamp with time zone,
  revoked_by uuid
    references auth.users(id) on delete set null,
  constraint kiosk_devices_expiry_check
    check (expires_at > created_at)
);

create index if not exists kiosk_devices_active_idx
  on public.kiosk_devices (created_at desc)
  where revoked_at is null;

alter table public.kiosk_devices enable row level security;

revoke all on table public.kiosk_devices
  from public, anon, authenticated;

-- Called on each visitor request from a kiosk. Refreshes last_seen_at
-- at most once an hour so the list shows roughly when a tablet was
-- last used without a write on every request.
create or replace function public.touch_kiosk_device(
  p_device_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.kiosk_devices
     set last_seen_at = now()
   where id = p_device_id
     and revoked_at is null
     and expires_at > now()
     and last_seen_at < now() - interval '1 hour';

  return exists (
    select 1
      from public.kiosk_devices
     where id = p_device_id
       and revoked_at is null
       and expires_at > now()
  );
end;
$$;

create or replace function public.register_kiosk_device(
  p_actor_id uuid,
  p_device_id uuid,
  p_label text,
  p_expires_at timestamp with time zone
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.kiosk_devices (
    id,
    label,
    created_by,
    expires_at
  )
  values (
    p_device_id,
    btrim(p_label),
    p_actor_id,
    p_expires_at
  );

  insert into public.audit_events (
    actor_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    p_actor_id,
    'kiosk_device_set_up',
    'kiosk_device',
    p_device_id::text,
    jsonb_build_object('label', btrim(p_label))
  );
end;
$$;

-- Returns false when the tablet was not found or is already removed.
create or replace function public.revoke_kiosk_device(
  p_actor_id uuid,
  p_device_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text;
begin
  update public.kiosk_devices
     set revoked_at = now(),
         revoked_by = p_actor_id
   where id = p_device_id
     and revoked_at is null
  returning label into v_label;

  if v_label is null then
    return false;
  end if;

  insert into public.audit_events (
    actor_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    p_actor_id,
    'kiosk_device_removed',
    'kiosk_device',
    p_device_id::text,
    jsonb_build_object('label', v_label)
  );

  return true;
end;
$$;

-- Tablets that still work: not removed and not expired.
create or replace function public.list_kiosk_devices()
returns table (
  id uuid,
  label text,
  created_at timestamp with time zone,
  created_by_name text,
  expires_at timestamp with time zone,
  last_seen_at timestamp with time zone
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    device.id,
    device.label,
    device.created_at,
    staff.full_name,
    device.expires_at,
    device.last_seen_at
  from public.kiosk_devices as device
  left join public.staff_profiles as staff
    on staff.user_id = device.created_by
  where device.revoked_at is null
    and device.expires_at > now()
  order by device.created_at desc;
$$;

revoke all on function public.touch_kiosk_device(uuid)
  from public, anon, authenticated;
revoke all on function public.register_kiosk_device(uuid, uuid, text, timestamp with time zone)
  from public, anon, authenticated;
revoke all on function public.revoke_kiosk_device(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.list_kiosk_devices()
  from public, anon, authenticated;

grant execute on function public.touch_kiosk_device(uuid)
  to service_role;
grant execute on function public.register_kiosk_device(uuid, uuid, text, timestamp with time zone)
  to service_role;
grant execute on function public.revoke_kiosk_device(uuid, uuid)
  to service_role;
grant execute on function public.list_kiosk_devices()
  to service_role;

notify pgrst, 'reload schema';

commit;
