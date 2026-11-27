-- Who registered for a meeting, for the meeting details dialog on the
-- staff Meetings page. Read-only; the same roles and tower rules as
-- get_staff_meetings apply.

begin;

create or replace function public.get_staff_meeting_visitors(
  p_actor_id uuid,
  p_tower text,
  p_meeting_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_scope jsonb;
  v_tower text;
  v_meeting_tower text;
begin
  v_scope := public.resolve_visitor_card_actor_scope(
    p_actor_id,
    p_tower
  );

  v_tower := coalesce(v_scope ->> 'tower', '');

  select meeting.tower
  into v_meeting_tower
  from public.meetings as meeting
  where meeting.id = p_meeting_id;

  -- A meeting outside the actor's tower reads as missing.
  if not found
    or (v_tower <> '' and v_meeting_tower is distinct from v_tower)
  then
    raise exception using
      errcode = 'P0002',
      message = 'Meeting not found';
  end if;

  return jsonb_build_object(
    'meetingId', p_meeting_id,
    'visitors',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'visitId', listed.id,
            'fullName', listed.full_name,
            'organization', listed.organization,
            'status', listed.status
          )
          order by lower(listed.full_name), listed.id
        )
        from (
          select visit.id, profile.full_name, profile.organization, visit.status
          from public.visits as visit
          join public.visitor_profiles as profile on profile.id = visit.visitor_id
          where visit.meeting_id = p_meeting_id
          order by lower(profile.full_name), visit.id
          limit 200
        ) as listed
      ),
      '[]'::jsonb
    )
  );
end;
$function$;

revoke all on function public.get_staff_meeting_visitors(uuid, text, uuid)
  from public, anon, authenticated;

grant execute on function public.get_staff_meeting_visitors(uuid, text, uuid)
  to service_role;

notify pgrst, 'reload schema';

commit;
