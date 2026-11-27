-- Reception's booking list also returns how many bookings are in the
-- Approved and Closed tabs, so the Meetings page can show the counts
-- without loading both lists.

create or replace function public.get_meeting_booking_requests(
  p_actor_id uuid,
  p_tower text default '',
  p_view text default 'pending'
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
  v_view text := lower(btrim(coalesce(p_view, 'pending')));
  v_today date := (now() at time zone 'Africa/Accra')::date;
begin
  v_scope := public.resolve_visitor_card_actor_scope(p_actor_id, p_tower);
  v_role := v_scope ->> 'role';
  v_tower := coalesce(v_scope ->> 'tower', '');

  if v_view not in ('pending', 'approved', 'closed') then
    raise exception using
      errcode = '22023',
      message = 'Invalid booking view';
  end if;

  return jsonb_build_object(
    'bookings',
    coalesce(
      (
        select jsonb_agg(
          public.meeting_booking_json(listed.booking)
            || jsonb_build_object(
              'canDecide',
                (listed.booking).status = 'pending'
                and (
                  v_role = 'admin'
                  or (v_role = 'receptionist' and (listed.booking).tower = v_tower)
                )
            )
          order by
            case when v_view = 'closed' then (listed.booking).updated_at end desc,
            (listed.booking).meeting_date,
            (listed.booking).starts_at,
            (listed.booking).created_at
        )
        from (
          select booking
          from public.meeting_bookings as booking
          where (v_tower = '' or booking.tower = v_tower)
            and (
              (v_view = 'pending' and booking.status = 'pending')
              or (
                v_view = 'approved'
                and booking.status = 'approved'
                and coalesce(booking.ends_on, booking.meeting_date) >= v_today
              )
              or (
                v_view = 'closed'
                and (
                  booking.status in ('rejected', 'cancelled', 'expired')
                  or (
                    booking.status = 'approved'
                    and coalesce(booking.ends_on, booking.meeting_date) < v_today
                  )
                )
                and booking.updated_at >= now() - interval '60 days'
              )
            )
          order by booking.meeting_date, booking.starts_at
          limit 100
        ) as listed
      ),
      '[]'::jsonb
    ),
    'pendingCount',
    (
      select count(*)
      from public.meeting_bookings as booking
      where booking.status = 'pending'
        and (v_tower = '' or booking.tower = v_tower)
    ),
    -- Counts for the Approved and Closed tabs on the Meetings page; they
    -- use the same rules as the lists above.
    'approvedCount',
    (
      select count(*)
      from public.meeting_bookings as booking
      where booking.status = 'approved'
        and coalesce(booking.ends_on, booking.meeting_date) >= v_today
        and (v_tower = '' or booking.tower = v_tower)
    ),
    'closedCount',
    (
      select count(*)
      from public.meeting_bookings as booking
      where (v_tower = '' or booking.tower = v_tower)
        and (
          booking.status in ('rejected', 'cancelled', 'expired')
          or (
            booking.status = 'approved'
            and coalesce(booking.ends_on, booking.meeting_date) < v_today
          )
        )
        and booking.updated_at >= now() - interval '60 days'
    ),
    'scope', jsonb_build_object('role', v_role, 'tower', nullif(v_tower, ''))
  );
end;
$function$;
