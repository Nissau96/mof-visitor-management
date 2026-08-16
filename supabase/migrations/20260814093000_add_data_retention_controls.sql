begin;

-- ============================================================
-- Stage 12: Data-retention and defensible-disposal controls
-- ============================================================
-- Approved project policy:
--
-- - completed visitor records: 2 years;
-- - application audit events: 2 years;
-- - expired verification tokens: 24 hours after expiry;
-- - inactive rate-limit counters: 24 hours after last update;
-- - open visits: never automatically deleted;
-- - legal, security, regulatory and investigation holds:
--   override ordinary deletion deadlines.
--
-- Permanent cleanup remains manually invoked. This migration
-- does not install pg_cron or introduce a Vercel Function.
-- ============================================================


-- ============================================================
-- 1. Versioned retention-policy configuration
-- ============================================================

create table public.data_retention_policies (
  policy_version text primary key,
  visitor_record_retention interval not null,
  audit_event_retention interval not null,
  transient_record_retention interval not null,
  stale_open_visit_review interval not null,
  adopted_on date not null,
  active boolean not null default false,
  notes text not null default '',
  created_at timestamp with time zone not null default now(),

  constraint data_retention_policy_version_length
    check (
      char_length(policy_version) between 3 and 100
    ),

  constraint data_retention_visitor_period_positive
    check (
      visitor_record_retention > interval '0 seconds'
    ),

  constraint data_retention_audit_period_positive
    check (
      audit_event_retention > interval '0 seconds'
    ),

  constraint data_retention_transient_period_positive
    check (
      transient_record_retention > interval '0 seconds'
    ),

  constraint data_retention_stale_review_positive
    check (
      stale_open_visit_review > interval '0 seconds'
    )
);

create unique index data_retention_one_active_policy_idx
  on public.data_retention_policies (active)
  where active;

alter table public.data_retention_policies
  enable row level security;

insert into public.data_retention_policies (
  policy_version,
  visitor_record_retention,
  audit_event_retention,
  transient_record_retention,
  stale_open_visit_review,
  adopted_on,
  active,
  notes
)
values (
  'mof-visitor-retention-v1',
  interval '2 years',
  interval '2 years',
  interval '24 hours',
  interval '24 hours',
  date '2026-08-14',
  true,
  'Project-approved retention baseline. Formal organisational governance requirements and active legal or security holds continue to apply.'
);


-- ============================================================
-- 2. Retention and legal holds
-- ============================================================
-- A hold can protect:
--
-- - one visitor profile and all its visits;
-- - one visit;
-- - one audit event;
-- - audit events belonging to a host or staff profile.
--
-- Holds are released by setting released_at and documenting the
-- release reason. Rows must not be deleted merely to release a
-- hold.
-- ============================================================

create table public.data_retention_holds (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id text not null,
  reason text not null,
  placed_by uuid,
  placed_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone,
  released_at timestamp with time zone,
  released_by uuid,
  release_reason text,

  constraint data_retention_hold_target_type
    check (
      target_type in (
        'audit_event',
        'host',
        'staff_profile',
        'visit',
        'visitor_profile'
      )
    ),

  constraint data_retention_hold_target_id_length
    check (
      char_length(target_id) between 1 and 200
    ),

  constraint data_retention_hold_reason_length
    check (
      char_length(reason) between 10 and 1000
    ),

  constraint data_retention_hold_expiry
    check (
      expires_at is null
      or expires_at > placed_at
    ),

  constraint data_retention_hold_release_time
    check (
      released_at is null
      or released_at >= placed_at
    ),

  constraint data_retention_hold_release_documentation
    check (
      (
        released_at is null
        and released_by is null
        and release_reason is null
      )
      or
      (
        released_at is not null
        and release_reason is not null
        and char_length(release_reason) between 10 and 1000
      )
    )
);

create index data_retention_holds_active_target_idx
  on public.data_retention_holds (
    target_type,
    target_id
  )
  where released_at is null;

create index data_retention_holds_expiry_idx
  on public.data_retention_holds (expires_at)
  where released_at is null
    and expires_at is not null;

alter table public.data_retention_holds
  enable row level security;


-- ============================================================
-- 3. Cleanup-supporting indexes
-- ============================================================

create index public_request_limits_updated_at_idx
  on public.public_request_limits (updated_at);

create index audit_events_created_at_idx
  on public.audit_events (created_at);

create index visitor_profiles_updated_at_idx
  on public.visitor_profiles (updated_at);


-- ============================================================
-- 4. Read-only cleanup preview
-- ============================================================

create or replace function public.preview_data_retention_cleanup()
returns table (
  record_category text,
  eligible_records bigint
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamp with time zone := now();
  v_visitor_cutoff timestamp with time zone;
  v_audit_cutoff timestamp with time zone;
  v_transient_cutoff timestamp with time zone;
  v_stale_visit_cutoff timestamp with time zone;
begin
  select
    v_now - policy.visitor_record_retention,
    v_now - policy.audit_event_retention,
    v_now - policy.transient_record_retention,
    v_now - policy.stale_open_visit_review
  into
    v_visitor_cutoff,
    v_audit_cutoff,
    v_transient_cutoff,
    v_stale_visit_cutoff
  from public.data_retention_policies policy
  where policy.active;

  if not found then
    raise exception
      'No active data-retention policy is configured.';
  end if;

  return query
  select
    'expired verification tokens'::text,
    count(*)::bigint
  from public.used_visitor_verification_tokens token
  where token.expires_at < v_transient_cutoff

  union all

  select
    'inactive rate-limit counters'::text,
    count(*)::bigint
  from public.public_request_limits request_limit
  where request_limit.updated_at < v_transient_cutoff

  union all

  select
    'completed visits eligible for deletion'::text,
    count(*)::bigint
  from public.visits visit
  where visit.checked_out_at is not null
    and visit.checked_out_at < v_visitor_cutoff
    and not exists (
      select 1
      from public.data_retention_holds retention_hold
      where retention_hold.released_at is null
        and (
          retention_hold.expires_at is null
          or retention_hold.expires_at > v_now
        )
        and (
          (
            retention_hold.target_type = 'visit'
            and retention_hold.target_id = visit.id::text
          )
          or
          (
            retention_hold.target_type = 'visitor_profile'
            and retention_hold.target_id =
              visit.visitor_id::text
          )
        )
    )

  union all

  select
    'visitor profiles potentially eligible for deletion'::text,
    count(*)::bigint
  from public.visitor_profiles visitor_profile
  where coalesce(
      (
        select max(
          coalesce(
            visit.checked_out_at,
            visit.checked_in_at
          )
        )
        from public.visits visit
        where visit.visitor_id = visitor_profile.id
      ),
      visitor_profile.updated_at
    ) < v_visitor_cutoff

    and not exists (
      select 1
      from public.visits retained_visit
      where retained_visit.visitor_id =
        visitor_profile.id
        and (
          retained_visit.checked_out_at is null
          or retained_visit.checked_out_at >=
            v_visitor_cutoff
          or exists (
            select 1
            from public.data_retention_holds visit_hold
            where visit_hold.released_at is null
              and (
                visit_hold.expires_at is null
                or visit_hold.expires_at > v_now
              )
              and visit_hold.target_type = 'visit'
              and visit_hold.target_id =
                retained_visit.id::text
          )
        )
    )

    and not exists (
      select 1
      from public.data_retention_holds profile_hold
      where profile_hold.released_at is null
        and (
          profile_hold.expires_at is null
          or profile_hold.expires_at > v_now
        )
        and profile_hold.target_type =
          'visitor_profile'
        and profile_hold.target_id =
          visitor_profile.id::text
    )

  union all

  select
    'audit events eligible for deletion'::text,
    count(*)::bigint
  from public.audit_events audit_event
  where audit_event.created_at < v_audit_cutoff
    and not exists (
      select 1
      from public.data_retention_holds audit_hold
      where audit_hold.released_at is null
        and (
          audit_hold.expires_at is null
          or audit_hold.expires_at > v_now
        )
        and (
          (
            audit_hold.target_type = 'audit_event'
            and audit_hold.target_id =
              audit_event.id::text
          )
          or
          (
            audit_hold.target_type =
              audit_event.entity_type
            and audit_hold.target_id =
              audit_event.entity_id
          )
        )
    )

  union all

  select
    'open visits requiring staff review'::text,
    count(*)::bigint
  from public.visits visit
  where visit.checked_out_at is null
    and visit.checked_in_at < v_stale_visit_cutoff;
end;
$function$;


-- ============================================================
-- 5. Batched cleanup execution
-- ============================================================
-- Safeguards:
--
-- - requires exact active policy-version confirmation;
-- - accepts only controlled batch sizes;
-- - serializes cleanup executions with an advisory lock;
-- - deletes transient records first;
-- - never deletes open visits;
-- - skips active holds;
-- - deletes visits before orphaned profiles;
-- - excludes visits still referenced by token records;
-- - records aggregate cleanup results in audit_events;
-- - exposes no deleted personal information in its response.
-- ============================================================

create or replace function public.execute_data_retention_cleanup(
  p_policy_version text,
  p_batch_size integer default 1000,
  p_actor_id uuid default null
)
returns table (
  deleted_verification_tokens bigint,
  deleted_rate_limit_counters bigint,
  deleted_completed_visits bigint,
  deleted_visitor_profiles bigint,
  deleted_audit_events bigint,
  stale_open_visits bigint
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamp with time zone := now();
  v_visitor_cutoff timestamp with time zone;
  v_audit_cutoff timestamp with time zone;
  v_transient_cutoff timestamp with time zone;
  v_stale_visit_cutoff timestamp with time zone;
  v_active_policy_version text;

  v_deleted_verification_tokens bigint := 0;
  v_deleted_rate_limit_counters bigint := 0;
  v_deleted_completed_visits bigint := 0;
  v_deleted_visitor_profiles bigint := 0;
  v_deleted_audit_events bigint := 0;
  v_stale_open_visits bigint := 0;
begin
  if p_policy_version is null
    or char_length(p_policy_version) > 100
  then
    raise exception
      'A valid policy version must be supplied.';
  end if;

  if p_batch_size is null
    or p_batch_size < 1
    or p_batch_size > 10000
  then
    raise exception
      'Batch size must be between 1 and 10000.';
  end if;

  select
    policy.policy_version,
    v_now - policy.visitor_record_retention,
    v_now - policy.audit_event_retention,
    v_now - policy.transient_record_retention,
    v_now - policy.stale_open_visit_review
  into
    v_active_policy_version,
    v_visitor_cutoff,
    v_audit_cutoff,
    v_transient_cutoff,
    v_stale_visit_cutoff
  from public.data_retention_policies policy
  where policy.active;

  if not found then
    raise exception
      'No active data-retention policy is configured.';
  end if;

  if p_policy_version <> v_active_policy_version then
    raise exception
      'Policy confirmation does not match the active retention policy.';
  end if;

  -- Prevent two cleanup executions from running concurrently.
  perform pg_catalog.pg_advisory_xact_lock(
    12012,
    20260814
  );

  with token_candidates as (
    select token.token_id
    from public.used_visitor_verification_tokens token
    where token.expires_at < v_transient_cutoff
    order by token.expires_at, token.token_id
    for update of token skip locked
    limit p_batch_size
  )
  delete from public.used_visitor_verification_tokens token
  using token_candidates candidate
  where token.token_id = candidate.token_id;

  get diagnostics
    v_deleted_verification_tokens = row_count;

  with rate_limit_candidates as (
    select request_limit.request_key
    from public.public_request_limits request_limit
    where request_limit.updated_at < v_transient_cutoff
    order by
      request_limit.updated_at,
      request_limit.request_key
    for update of request_limit skip locked
    limit p_batch_size
  )
  delete from public.public_request_limits request_limit
  using rate_limit_candidates candidate
  where request_limit.request_key =
    candidate.request_key;

  get diagnostics
    v_deleted_rate_limit_counters = row_count;

  with visit_candidates as (
    select visit.id
    from public.visits visit
    where visit.checked_out_at is not null
      and visit.checked_out_at < v_visitor_cutoff

      and not exists (
        select 1
        from public.used_visitor_verification_tokens token
        where token.visit_id = visit.id
      )

      and not exists (
        select 1
        from public.data_retention_holds retention_hold
        where retention_hold.released_at is null
          and (
            retention_hold.expires_at is null
            or retention_hold.expires_at > v_now
          )
          and (
            (
              retention_hold.target_type = 'visit'
              and retention_hold.target_id =
                visit.id::text
            )
            or
            (
              retention_hold.target_type =
                'visitor_profile'
              and retention_hold.target_id =
                visit.visitor_id::text
            )
          )
      )

    order by visit.checked_out_at, visit.id
    for update of visit skip locked
    limit p_batch_size
  )
  delete from public.visits visit
  using visit_candidates candidate
  where visit.id = candidate.id;

  get diagnostics
    v_deleted_completed_visits = row_count;

  with profile_candidates as (
    select visitor_profile.id
    from public.visitor_profiles visitor_profile
    where visitor_profile.updated_at <
      v_visitor_cutoff

      and not exists (
        select 1
        from public.visits visit
        where visit.visitor_id = visitor_profile.id
      )

      and not exists (
        select 1
        from public.data_retention_holds profile_hold
        where profile_hold.released_at is null
          and (
            profile_hold.expires_at is null
            or profile_hold.expires_at > v_now
          )
          and profile_hold.target_type =
            'visitor_profile'
          and profile_hold.target_id =
            visitor_profile.id::text
      )

    order by
      visitor_profile.updated_at,
      visitor_profile.id
    for update of visitor_profile skip locked
    limit p_batch_size
  )
  delete from public.visitor_profiles visitor_profile
  using profile_candidates candidate
  where visitor_profile.id = candidate.id;

  get diagnostics
    v_deleted_visitor_profiles = row_count;

  with audit_candidates as (
    select audit_event.id
    from public.audit_events audit_event
    where audit_event.created_at < v_audit_cutoff

      and not exists (
        select 1
        from public.data_retention_holds audit_hold
        where audit_hold.released_at is null
          and (
            audit_hold.expires_at is null
            or audit_hold.expires_at > v_now
          )
          and (
            (
              audit_hold.target_type = 'audit_event'
              and audit_hold.target_id =
                audit_event.id::text
            )
            or
            (
              audit_hold.target_type =
                audit_event.entity_type
              and audit_hold.target_id =
                audit_event.entity_id
            )
          )
      )

    order by audit_event.created_at, audit_event.id
    for update of audit_event skip locked
    limit p_batch_size
  )
  delete from public.audit_events audit_event
  using audit_candidates candidate
  where audit_event.id = candidate.id;

  get diagnostics
    v_deleted_audit_events = row_count;

  select count(*)::bigint
  into v_stale_open_visits
  from public.visits visit
  where visit.checked_out_at is null
    and visit.checked_in_at < v_stale_visit_cutoff;

  insert into public.audit_events (
    actor_id,
    action,
    entity_type,
    entity_id,
    details,
    created_at
  )
  values (
    p_actor_id,
    'retention.cleanup',
    'retention',
    v_active_policy_version,
    pg_catalog.jsonb_build_object(
      'policyVersion',
      v_active_policy_version,
      'batchSize',
      p_batch_size,
      'deletedVerificationTokens',
      v_deleted_verification_tokens,
      'deletedRateLimitCounters',
      v_deleted_rate_limit_counters,
      'deletedCompletedVisits',
      v_deleted_completed_visits,
      'deletedVisitorProfiles',
      v_deleted_visitor_profiles,
      'deletedAuditEvents',
      v_deleted_audit_events,
      'staleOpenVisits',
      v_stale_open_visits
    ),
    v_now
  );

  return query
  select
    v_deleted_verification_tokens,
    v_deleted_rate_limit_counters,
    v_deleted_completed_visits,
    v_deleted_visitor_profiles,
    v_deleted_audit_events,
    v_stale_open_visits;
end;
$function$;


-- ============================================================
-- 6. Privilege hardening
-- ============================================================

revoke all privileges
  on table public.data_retention_policies
  from public, anon, authenticated, service_role;

grant select
  on table public.data_retention_policies
  to service_role;

revoke all privileges
  on table public.data_retention_holds
  from public, anon, authenticated, service_role;

grant select, insert, update
  on table public.data_retention_holds
  to service_role;

revoke execute
  on function public.preview_data_retention_cleanup()
  from public, anon, authenticated;

revoke execute
  on function public.execute_data_retention_cleanup(
    text,
    integer,
    uuid
  )
  from public, anon, authenticated;

grant execute
  on function public.preview_data_retention_cleanup()
  to service_role;

grant execute
  on function public.execute_data_retention_cleanup(
    text,
    integer,
    uuid
  )
  to service_role;

commit;