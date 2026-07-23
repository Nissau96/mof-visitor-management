begin;

-- ============================================================
-- 1. Meetings catalogue
-- ============================================================

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  schedule_type text not null,
  starts_on date not null,
  ends_on date,
  recurrence_days smallint[] not null
    default array[]::smallint[],
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint meetings_title_check
    check (
      char_length(btrim(title)) between 2 and 160
    ),

  constraint meetings_schedule_type_check
    check (
      schedule_type in (
        'single',
        'continuous',
        'weekly'
      )
    ),

  constraint meetings_date_range_check
    check (
      ends_on is null
      or ends_on >= starts_on
    ),

  constraint meetings_recurrence_days_check
    check (
      recurrence_days <@
        array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    ),

  constraint meetings_schedule_configuration_check
    check (
      (
        schedule_type = 'single'
        and ends_on is not null
        and ends_on = starts_on
        and cardinality(recurrence_days) = 0
      )
      or
      (
        schedule_type = 'continuous'
        and cardinality(recurrence_days) = 0
      )
      or
      (
        schedule_type = 'weekly'
        and cardinality(recurrence_days)
          between 1 and 7
      )
    )
);

alter table public.meetings
  enable row level security;

revoke all on table public.meetings
  from anon, authenticated;

grant select, insert, update, delete
  on table public.meetings
  to service_role;

drop trigger if exists meetings_set_updated_at
  on public.meetings;

create trigger meetings_set_updated_at
before update on public.meetings
for each row
execute function public.set_updated_at();

create index if not exists meetings_active_dates_idx
  on public.meetings (
    active,
    starts_on,
    ends_on
  );

create index if not exists meetings_title_idx
  on public.meetings (
    lower(title)
  );

-- ============================================================
-- 2. Visit destination and meeting fields
-- ============================================================

alter table public.visits
  add column if not exists destination_agency text,
  add column if not exists destination_division text,
  add column if not exists person_visiting text,
  add column if not exists meeting_id uuid,
  add column if not exists custom_meeting_title text;

-- Preserve existing host information as historical visit data.
update public.visits as visit
set
  destination_agency = coalesce(
    visit.destination_agency,
    'Ministry of Finance (MoF)'
  ),
  destination_division = coalesce(
    visit.destination_division,
    host.department
  ),
  person_visiting = coalesce(
    visit.person_visiting,
    host.full_name
  )
from public.hosts as host
where visit.host_id = host.id
  and (
    visit.destination_agency is null
    or visit.destination_division is null
    or visit.person_visiting is null
  );

alter table public.visits
  alter column destination_agency set not null,
  alter column host_id drop not null;

alter table public.visits
  drop constraint if exists visits_destination_agency_check,
  drop constraint if exists visits_destination_division_check,
  drop constraint if exists visits_person_visiting_check,
  drop constraint if exists visits_allowed_purpose_check,
  drop constraint if exists visits_meeting_purpose_check,
  drop constraint if exists visits_meeting_id_fkey;

alter table public.visits
  add constraint visits_meeting_id_fkey
    foreign key (meeting_id)
    references public.meetings(id)
    on delete restrict,

  add constraint visits_destination_agency_check
    check (
      destination_agency in (
        'Ministry of Finance (MoF)',
        'IAA',
        'ITAB',
        'GIPC',
        'GCX',
        'GIFMIS',
        'GIIF',
        'MIIF',
        'PPA'
      )
    ),

  add constraint visits_destination_division_check
    check (
      (
        destination_agency = 'Ministry of Finance (MoF)'
        and destination_division is not null
        and destination_division in (
          'Budget Office',
          'External Resource Mobilisation Division',
          'Financial Sector Division',
          'Finance Division',
          'Human Capital & General Administration Division',
          'Internal Audit Directorate',
          'Legal Directorate',
          'PFM Compliance Division',
          'PFM Systems Division',
          'Policy Coordination Monitoring & Evaluation Division',
          'Procurement Division',
          'Public Debt Management Office',
          'Public Investment & Asset Division',
          'Real Sector Division',
          'Research Division',
          'Revenue Policy Division',
          'Unclaimed Fund Division'
        )
      )
      or
      (
        destination_agency <> 'Ministry of Finance (MoF)'
        and destination_division is null
      )
    )
    not valid,

  add constraint visits_person_visiting_check
    check (
      (
        purpose = 'Meeting'
        and person_visiting is null
      )
      or
      (
        purpose <> 'Meeting'
        and person_visiting is not null
        and char_length(btrim(person_visiting))
          between 2 and 120
      )
    )
    not valid,

  add constraint visits_allowed_purpose_check
    check (
      purpose in (
        'Meeting',
        'Follow up',
        'SOD / SOL',
        'PUD / Delivery',
        'Personal',
        'Visit',
        'Official'
      )
    )
    not valid,

  add constraint visits_meeting_purpose_check
    check (
      (
        purpose = 'Meeting'
        and (
          (
            meeting_id is not null
            and custom_meeting_title is null
          )
          or
          (
            meeting_id is null
            and custom_meeting_title is not null
            and char_length(
              btrim(custom_meeting_title)
            ) between 2 and 160
          )
        )
      )
      or
      (
        purpose <> 'Meeting'
        and meeting_id is null
        and custom_meeting_title is null
      )
    )
    not valid;

create index if not exists visits_destination_agency_idx
  on public.visits (destination_agency);

create index if not exists visits_destination_division_idx
  on public.visits (destination_division)
  where destination_division is not null;

create index if not exists visits_meeting_id_idx
  on public.visits (meeting_id)
  where meeting_id is not null;

-- ============================================================
-- 3. Available-meetings function
-- ============================================================

create or replace function public.get_available_meetings(
  p_on_date date default current_date
)
returns table (
  id uuid,
  title text
)
language sql
stable
security definer
set search_path = public
as $function$
  select
    meeting.id,
    meeting.title
  from public.meetings as meeting
  where meeting.active = true
    and meeting.starts_on <= p_on_date
    and (
      meeting.ends_on is null
      or meeting.ends_on >= p_on_date
    )
    and (
      (
        meeting.schedule_type = 'single'
        and meeting.starts_on = p_on_date
      )
      or meeting.schedule_type = 'continuous'
      or (
        meeting.schedule_type = 'weekly'
        and extract(dow from p_on_date)::smallint
          = any(meeting.recurrence_days)
      )
    )
  order by
    lower(meeting.title),
    meeting.id;
$function$;

revoke all on function
  public.get_available_meetings(date)
  from public, anon, authenticated;

grant execute on function
  public.get_available_meetings(date)
  to service_role;

-- ============================================================
-- 4. Replace the old first-visit function
-- ============================================================

drop function if exists public.register_first_visit(
  text,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text
);

create or replace function public.register_first_visit(
  p_full_name text,
  p_phone text,
  p_email text,
  p_organization text,
  p_destination_agency text,
  p_destination_division text,
  p_person_visiting text,
  p_purpose text,
  p_meeting_id uuid,
  p_custom_meeting_title text,
  p_consent_version text
)
returns table (
  visitor_id uuid,
  reference_code text
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  new_visitor_id uuid;

  new_reference text :=
    'VIS-' || upper(
      encode(gen_random_bytes(3), 'hex')
    );

  normalized_division text :=
    nullif(
      btrim(p_destination_division),
      ''
    );

  normalized_person_visiting text :=
    nullif(
      btrim(p_person_visiting),
      ''
    );

  normalized_custom_meeting_title text :=
    nullif(
      btrim(p_custom_meeting_title),
      ''
    );
begin
  if char_length(btrim(p_full_name))
    not between 2 and 120
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid visitor name';
  end if;

  if p_destination_agency not in (
    'Ministry of Finance (MoF)',
    'IAA',
    'ITAB',
    'GIPC',
    'GCX',
    'GIFMIS',
    'GIIF',
    'MIIF',
    'PPA'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid destination agency';
  end if;

  if p_destination_agency =
    'Ministry of Finance (MoF)'
  then
    if normalized_division is null
      or normalized_division not in (
        'Budget Office',
        'External Resource Mobilisation Division',
        'Financial Sector Division',
        'Finance Division',
        'Human Capital & General Administration Division',
        'Internal Audit Directorate',
        'Legal Directorate',
        'PFM Compliance Division',
        'PFM Systems Division',
        'Policy Coordination Monitoring & Evaluation Division',
        'Procurement Division',
        'Public Debt Management Office',
        'Public Investment & Asset Division',
        'Real Sector Division',
        'Research Division',
        'Revenue Policy Division',
        'Unclaimed Fund Division'
      )
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid Ministry division';
    end if;
  else
    normalized_division := null;
  end if;

  if p_purpose not in (
    'Meeting',
    'Follow up',
    'SOD / SOL',
    'PUD / Delivery',
    'Personal',
    'Visit',
    'Official'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid visit purpose';
  end if;

  if p_purpose = 'Meeting' then
    if normalized_person_visiting is not null then
      raise exception using
        errcode = '22023',
        message = 'Unexpected person being visited';
    end if;

    if p_meeting_id is not null
      and normalized_custom_meeting_title is not null
    then
      raise exception using
        errcode = '22023',
        message =
          'Select either an official or custom meeting';
    end if;

    if p_meeting_id is not null then
      if not exists (
        select 1
        from public.get_available_meetings(
          current_date
        ) as available_meeting
        where available_meeting.id = p_meeting_id
      ) then
        raise exception using
          errcode = '22023',
          message = 'Meeting is unavailable';
      end if;
    elsif normalized_custom_meeting_title is null
      or char_length(
        normalized_custom_meeting_title
      ) not between 2 and 160
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid custom meeting title';
    end if;
  else
    if normalized_person_visiting is null
      or char_length(
        normalized_person_visiting
      ) not between 2 and 120
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid person being visited';
    end if;

    if p_meeting_id is not null
      or normalized_custom_meeting_title is not null
    then
      raise exception using
        errcode = '22023',
        message = 'Unexpected meeting information';
    end if;
  end if;

  insert into public.visitor_profiles (
    full_name,
    phone,
    email,
    organization,
    consent_version,
    consented_at
  )
  values (
    btrim(p_full_name),
    p_phone,
    nullif(btrim(p_email), ''),
    nullif(btrim(p_organization), ''),
    p_consent_version,
    now()
  )
  returning id into new_visitor_id;

  insert into public.visits (
    visitor_id,
    host_id,
    destination_agency,
    destination_division,
    person_visiting,
    purpose,
    meeting_id,
    custom_meeting_title,
    reference_code,
    status
  )
  values (
    new_visitor_id,
    null,
    p_destination_agency,
    normalized_division,
    normalized_person_visiting,
    p_purpose,
    p_meeting_id,
    normalized_custom_meeting_title,
    new_reference,
    'checked_in'
  );

  return query
  select
    new_visitor_id,
    new_reference;
end;
$function$;

revoke all on function
  public.register_first_visit(
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    uuid,
    text,
    text
  )
  from public, anon, authenticated;

grant execute on function
  public.register_first_visit(
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    uuid,
    text,
    text
  )
  to service_role;

commit;