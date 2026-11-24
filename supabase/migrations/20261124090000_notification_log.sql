-- Every WhatsApp and SMS message sent to a visitor, and how far it got.
-- No message text and no full phone number: the Wi-Fi message carries
-- the network password, and a second copy of it here would be a leak.
-- Rows are transient records and are removed after the active
-- transient_record_retention period.

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  reference_code text,
  meeting_id uuid references public.meetings (id) on delete cascade,
  purpose text not null
    check (purpose in ('booking_confirmation', 'visit_reminder', 'wifi_details')),
  channel text not null
    check (channel in ('whatsapp', 'sms')),
  provider text not null
    check (provider in ('meta', 'arkesel', 'sasusync', 'hubtel', 'log')),
  template text,
  provider_message_id text,
  status text not null
    check (status in ('accepted', 'sent', 'delivered', 'read', 'failed', 'expired')),
  error text check (error is null or char_length(error) <= 300),
  phone_last4 text not null check (phone_last4 ~ '^[0-9]{0,4}$'),
  fallback_of uuid references public.notification_log (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_message_id)
);

create index notification_log_reference_idx
  on public.notification_log (reference_code, created_at);

create index notification_log_created_at_idx
  on public.notification_log (created_at);

create unique index notification_log_one_fallback_idx
  on public.notification_log (fallback_of)
  where fallback_of is not null;

alter table public.notification_log enable row level security;

revoke all on public.notification_log from anon, authenticated;

-- Status only moves forward, so duplicate and out-of-order webhook
-- events are harmless. failed and expired are final and can only
-- replace accepted or sent.
create or replace function public.advance_notification_status(
  p_provider text,
  p_provider_message_id text,
  p_status text,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.notification_log;
  v_rank_old integer;
  v_rank_new integer;
begin
  if p_status not in ('sent', 'delivered', 'read', 'failed', 'expired') then
    return null;
  end if;

  select * into v_row
  from public.notification_log as log
  where log.provider = p_provider
    and log.provider_message_id = p_provider_message_id
  for update;

  if not found then
    return null;
  end if;

  v_rank_old := case v_row.status
    when 'accepted' then 1 when 'sent' then 2 when 'delivered' then 3
    when 'read' then 4 else 9 end;
  v_rank_new := case p_status
    when 'sent' then 2 when 'delivered' then 3 when 'read' then 4
    else case when v_rank_old <= 2 then 5 else 0 end end;

  if v_rank_old = 9 or v_rank_new <= v_rank_old then
    return jsonb_build_object('id', v_row.id, 'changed', false, 'status', v_row.status);
  end if;

  update public.notification_log
  set status = p_status,
      error = case when p_status in ('failed', 'expired')
                then left(nullif(btrim(coalesce(p_error, '')), ''), 300)
                else error end,
      updated_at = now()
  where id = v_row.id;

  return jsonb_build_object(
    'id', v_row.id,
    'changed', true,
    'status', p_status,
    'channel', v_row.channel,
    'purpose', v_row.purpose,
    'referenceCode', v_row.reference_code,
    'hasFallback', exists (
      select 1 from public.notification_log as fallback
      where fallback.fallback_of = v_row.id
    )
  );
end;
$function$;

revoke all on function public.advance_notification_status(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.advance_notification_status(text, text, text, text)
  to service_role;

-- Transient cleanup: each new row removes rows older than the active
-- transient retention period. Cheap (indexed) and needs no scheduler.
create or replace function public.purge_old_notification_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_cutoff timestamptz;
begin
  select now() - policy.transient_record_retention
  into v_cutoff
  from public.data_retention_policies as policy
  where policy.active;

  if v_cutoff is not null then
    delete from public.notification_log as log
    where log.created_at < v_cutoff;
  end if;

  return null;
end;
$function$;

revoke all on function public.purge_old_notification_log() from public, anon, authenticated;

create trigger notification_log_purge
  after insert on public.notification_log
  for each statement
  execute function public.purge_old_notification_log();
