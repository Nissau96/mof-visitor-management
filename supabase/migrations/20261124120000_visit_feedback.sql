-- Visitor feedback after check-out. Reception's check-out creates one
-- row per visit with the hash of a random link token; the visitor gets
-- the link on WhatsApp and rates the visit (1-5) with an optional
-- comment. Only the token's hash is stored. Rows go with the visit, so
-- they follow the two-year visitor-record retention.

create table public.visit_feedback (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null unique references public.visits (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  rating smallint check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1000),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  check ((rating is null) = (submitted_at is null))
);

create index visit_feedback_submitted_idx
  on public.visit_feedback (submitted_at desc)
  where submitted_at is not null;

alter table public.visit_feedback enable row level security;

revoke all on public.visit_feedback from anon, authenticated;

-- The feedback request is a new kind of logged message.
alter table public.notification_log
  drop constraint notification_log_purpose_check;

alter table public.notification_log
  add constraint notification_log_purpose_check
  check (purpose in ('booking_confirmation', 'visit_reminder', 'wifi_details', 'visit_feedback'));

-- One answer per link, before it expires. Returns the visit reference on
-- success; raises P0002 for an unknown link, 55000 when it was already
-- used or has expired.
create or replace function public.submit_visit_feedback(
  p_token_hash text,
  p_rating integer,
  p_comment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.visit_feedback;
  v_comment text := nullif(btrim(regexp_replace(coalesce(p_comment, ''), '\s+', ' ', 'g')), '');
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception using errcode = '22023', message = 'Choose a rating from 1 to 5.';
  end if;

  if v_comment is not null and char_length(v_comment) > 1000 then
    raise exception using errcode = '22023', message = 'Keep the comment under 1000 characters.';
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
      submitted_at = now()
  where id = v_row.id;

  return jsonb_build_object(
    'reference', (select visit.reference_code from public.visits as visit where visit.id = v_row.visit_id)
  );
end;
$function$;

revoke all on function public.submit_visit_feedback(text, integer, text)
  from public, anon, authenticated;
grant execute on function public.submit_visit_feedback(text, integer, text)
  to service_role;
