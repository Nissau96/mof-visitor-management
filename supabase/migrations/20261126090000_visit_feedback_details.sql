-- Richer visitor feedback. Besides the 1-5 rating and comment, the
-- feedback form now asks:
--   * what stood out (or went wrong): up to 7 fixed choices;
--   * thumbs up or down for check-in speed, staff courtesy and finding
--     the way (each may be skipped, so null means "not answered");
--   * whether the Client Service Unit may contact the visitor about it.

alter table public.visit_feedback
  add column highlights text[] not null default '{}',
  add column check_in_ok boolean,
  add column courtesy_ok boolean,
  add column wayfinding_ok boolean,
  add column contact_ok boolean not null default false;

alter table public.visit_feedback
  add constraint visit_feedback_highlights_check check (
    cardinality(highlights) <= 7
    and highlights <@ array[
      'quick_check_in', 'friendly_staff', 'easy_to_find', 'card_ready',
      'on_time', 'clean', 'clear_directions',
      'long_wait', 'unhelpful_staff', 'hard_to_find', 'card_slow',
      'meeting_late', 'uncomfortable', 'unclear_directions'
    ]::text[]
  );

drop function if exists public.submit_visit_feedback(text, integer, text);

-- One answer per link, before it expires. Returns the visit reference on
-- success; raises P0002 for an unknown link, 55000 when it was already
-- used or has expired, 22023 for an invalid answer.
create or replace function public.submit_visit_feedback(
  p_token_hash text,
  p_rating integer,
  p_comment text,
  p_highlights text[] default '{}',
  p_check_in_ok boolean default null,
  p_courtesy_ok boolean default null,
  p_wayfinding_ok boolean default null,
  p_contact_ok boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.visit_feedback;
  v_comment text := nullif(btrim(regexp_replace(coalesce(p_comment, ''), '\s+', ' ', 'g')), '');
  v_highlights text[] := coalesce(
    (select array_agg(distinct item order by item) from unnest(coalesce(p_highlights, '{}')) as item),
    '{}'
  );
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception using errcode = '22023', message = 'Choose a rating from 1 to 5.';
  end if;

  if v_comment is not null and char_length(v_comment) > 1000 then
    raise exception using errcode = '22023', message = 'Keep the comment under 1000 characters.';
  end if;

  if not v_highlights <@ array[
      'quick_check_in', 'friendly_staff', 'easy_to_find', 'card_ready',
      'on_time', 'clean', 'clear_directions',
      'long_wait', 'unhelpful_staff', 'hard_to_find', 'card_slow',
      'meeting_late', 'uncomfortable', 'unclear_directions'
    ]::text[]
    or cardinality(v_highlights) > 7 then
    raise exception using errcode = '22023', message = 'Choose from the listed options.';
  end if;

  select * into v_row
  from public.visit_feedback as feedback
  where feedback.token_hash = p_token_hash
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Feedback link not found.';
  end if;

  if v_row.submitted_at is not null or v_row.expires_at < now() then
    raise exception using errcode = '55000', message = 'Feedback link already used or expired.';
  end if;

  update public.visit_feedback
  set rating = p_rating,
      comment = v_comment,
      highlights = v_highlights,
      check_in_ok = p_check_in_ok,
      courtesy_ok = p_courtesy_ok,
      wayfinding_ok = p_wayfinding_ok,
      contact_ok = coalesce(p_contact_ok, false),
      submitted_at = now()
  where id = v_row.id;

  return jsonb_build_object(
    'reference', (select visit.reference_code from public.visits as visit where visit.id = v_row.visit_id)
  );
end;
$function$;

revoke all on function public.submit_visit_feedback(text, integer, text, text[], boolean, boolean, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.submit_visit_feedback(text, integer, text, text[], boolean, boolean, boolean, boolean)
  to service_role;
