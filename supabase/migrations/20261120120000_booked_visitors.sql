-- ============================================================
-- Booked visitors view on the reception dashboard
-- ============================================================
-- Visitors who booked through a visitor link, for the dashboard's
-- "Booked visitors" view: today's bookings, or the next 30 days.
-- Receptionists see their own tower; administrators pass null for
-- both towers. todayCount is today's bookings not yet arrived (the
-- number on the tab).

create or replace function public.get_booked_visitors(
  p_actor_id uuid,
  p_tower text,
  p_view text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_today date := (now() at time zone 'Africa/Accra')::date;
  v_tower text := nullif(btrim(coalesce(p_tower, '')), '');
  v_view text := coalesce(p_view, 'today');
begin
  perform 1
  from public.staff_profiles as staff
  where staff.user_id = p_actor_id
    and staff.active = true
    and staff.role in ('receptionist', 'admin');

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Staff role is not authorised';
  end if;

  if v_view not in ('today', 'upcoming') then
    raise exception using
      errcode = '22023',
      message = 'Choose Today or Upcoming.';
  end if;

  -- Opens today's bookings as pending admissions first.
  perform public.expire_pending_visitor_admissions();

  return jsonb_build_object(
    'bookings',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', invite.id,
            'referenceCode', invite.reference_code,
            'visitorName', invite.full_name,
            'organization', invite.organization,
            'phone', invite.phone,
            'purpose', invite.purpose,
            'hostName', invite.host_name,
            'agency', invite.destination_agency,
            'division', invite.destination_division,
            'tower', invite.tower,
            'floor', invite.floor,
            'visitDate', invite.visit_date,
            'visitId', invite.visit_id,
            'status',
              case
                when invite.status = 'cancelled' then 'cancelled'
                else public.visitor_invite_visit_state(invite)
              end
          )
          order by invite.visit_date, invite.submitted_at
        )
        from public.visitor_invites as invite
        where invite.reference_code is not null
          and (v_tower is null or invite.tower = v_tower)
          and (
            (v_view = 'today' and invite.visit_date = v_today)
            or (
              v_view = 'upcoming'
              and invite.visit_date > v_today
              and invite.visit_date <= v_today + 30
            )
          )
      ),
      '[]'::jsonb
    ),
    'todayCount',
    (
      select count(*)::integer
      from public.visitor_invites as invite
      where invite.status = 'used'
        and invite.visit_date = v_today
        and (v_tower is null or invite.tower = v_tower)
        and public.visitor_invite_visit_state(invite) in ('upcoming', 'waiting')
    )
  );
end;
$function$;

revoke all on function public.get_booked_visitors(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.get_booked_visitors(uuid, text, text)
  to service_role;
