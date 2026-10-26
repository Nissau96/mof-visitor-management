-- Checked-in visitor count for the Visitor Cards stat card.
--
-- Client Service Head accounts may not list checked-in visitors
-- (get_checked_in_card_visitors rejects them), but their stat card shows
-- how many visitors are in the building. This returns the count only, in
-- the caller's tower scope, so no visitor details are exposed.

create or replace function
  public.get_checked_in_visitor_count(
    p_actor_id uuid,
    p_tower text default ''
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_scope jsonb;
  v_checked_in bigint := 0;
  v_tower text;
begin
  v_actor_scope :=
    public.resolve_visitor_card_actor_scope(
      p_actor_id,
      p_tower
    );

  v_tower :=
    v_actor_scope ->> 'tower';

  select count(*)
  into v_checked_in
  from public.visits as visit
  where visit.status =
      'checked_in'
    and (
      v_tower = ''
      or visit.tower =
        v_tower
    );

  return jsonb_build_object(
    'checkedIn',
    v_checked_in,
    'scope',
    jsonb_build_object(
      'role',
      v_actor_scope ->> 'role',
      'tower',
      case
        when v_tower = ''
        then null
        else v_tower
      end
    )
  );
end;
$function$;

revoke all
  on function
    public.get_checked_in_visitor_count(
      uuid,
      text
    )
  from public, anon, authenticated;

grant execute
  on function
    public.get_checked_in_visitor_count(
      uuid,
      text
    )
  to service_role;
