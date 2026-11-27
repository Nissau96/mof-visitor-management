-- Booked guests: tell "checked out" apart from "checked in".
--
-- meeting_booking_guest_status used to report both as 'arrived'. The
-- booker's "My bookings" page now shows past meetings with
-- "Checked out", so a guest whose visit has ended gets 'checked_out'.
-- 'arrived' keeps meaning the guest is in the building now.

create or replace function public.meeting_booking_guest_status(
  p_visit_status text,
  p_has_visit boolean,
  p_meeting_date date
)
returns text
language sql
stable
set search_path = ''
as $function$
  select case
    when not p_has_visit then
      case
        when p_meeting_date < (now() at time zone 'Africa/Accra')::date
          then 'did_not_arrive'
        else 'expected'
      end
    when p_visit_status = 'pending_admission' then 'waiting'
    when p_visit_status = 'checked_in' then 'arrived'
    when p_visit_status = 'checked_out' then 'checked_out'
    else 'did_not_arrive'
  end;
$function$;
