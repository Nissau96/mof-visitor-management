begin;

-- ============================================================
-- Group registration: visitors bring guests
-- ============================================================
-- A first-time visitor can register up to nine guests with one
-- form. Each guest gets their own pending visit, so reception
-- admits them, assigns a card and checks them out one by one
-- through the existing card workflow.
--
-- Guest visits point at the lead visit and reuse its reference
-- with a suffix: VIS-A1B2C3-2, VIS-A1B2C3-3 and so on, so a
-- search for the lead reference finds the whole group.
--
-- A guest phone that is already registered reuses that visitor
-- profile without changing it. Consent for guests is given by the
-- lead visitor and recorded against new guest profiles.

alter table public.visits
  add column if not exists group_lead_visit_id uuid
    references public.visits(id)
    on delete set null;

alter table public.visits
  drop constraint if exists visits_group_lead_not_self_check;

alter table public.visits
  add constraint visits_group_lead_not_self_check
    check (
      group_lead_visit_id is null
      or group_lead_visit_id <> id
    );

create index if not exists visits_group_lead_visit_id_idx
  on public.visits (group_lead_visit_id)
  where group_lead_visit_id is not null;

comment on column public.visits.group_lead_visit_id is
  'Lead visit for a guest registered as part of a group. Null for the lead and for individual visits.';

-- ------------------------------------------------------------
-- Register a first visit with optional guests
-- ------------------------------------------------------------

create or replace function public.register_first_visit_with_guests(
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
  p_consent_version text,
  p_guests jsonb default '[]'::jsonb
)
returns table (
  visitor_id uuid,
  reference_code text,
  guest_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_guests jsonb := coalesce(p_guests, '[]'::jsonb);
  v_guest jsonb;
  v_guest_number integer;
  v_guest_name text;
  v_guest_phone text;
  v_guest_profile_id uuid;
  v_lead_visitor_id uuid;
  v_lead_reference text;
  v_lead_visit public.visits%rowtype;
begin
  if jsonb_typeof(v_guests) <> 'array'
    or jsonb_array_length(v_guests) > 9
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid guest list';
  end if;

  -- Validate every guest before anything is written.
  for v_guest, v_guest_number in
    select guest.value, guest.ordinality::integer + 1
    from jsonb_array_elements(v_guests)
      with ordinality as guest(value, ordinality)
  loop
    v_guest_name := btrim(coalesce(v_guest ->> 'fullName', ''));
    v_guest_phone := btrim(coalesce(v_guest ->> 'phone', ''));

    if char_length(v_guest_name) not between 2 and 120 then
      raise exception using
        errcode = '22023',
        message = 'Invalid guest name';
    end if;

    if v_guest_phone !~ '^\+[1-9][0-9]{7,14}$'
      or v_guest_phone = p_phone
    then
      raise exception using
        errcode = '22023',
        message = 'Invalid guest phone';
    end if;
  end loop;

  if (
    select count(distinct guest ->> 'phone')
    from jsonb_array_elements(v_guests) as guest
  ) <> jsonb_array_length(v_guests) then
    raise exception using
      errcode = '22023',
      message = 'Duplicate guest phone';
  end if;

  select registered.visitor_id, registered.reference_code
  into v_lead_visitor_id, v_lead_reference
  from public.register_first_visit(
    p_full_name,
    p_phone,
    p_email,
    p_organization,
    p_destination_agency,
    p_destination_division,
    p_person_visiting,
    p_purpose,
    p_meeting_id,
    p_custom_meeting_title,
    p_consent_version
  ) as registered;

  select *
  into v_lead_visit
  from public.visits as visit
  where visit.reference_code = v_lead_reference;

  for v_guest, v_guest_number in
    select guest.value, guest.ordinality::integer + 1
    from jsonb_array_elements(v_guests)
      with ordinality as guest(value, ordinality)
  loop
    v_guest_name := btrim(v_guest ->> 'fullName');
    v_guest_phone := btrim(v_guest ->> 'phone');

    insert into public.visitor_profiles (
      full_name,
      phone,
      consent_version,
      consented_at
    )
    values (
      v_guest_name,
      v_guest_phone,
      p_consent_version,
      now()
    )
    on conflict (phone) do nothing
    returning id into v_guest_profile_id;

    if v_guest_profile_id is null then
      select profile.id
      into v_guest_profile_id
      from public.visitor_profiles as profile
      where profile.phone = v_guest_phone;
    end if;

    if exists (
      select 1
      from public.visits as active_visit
      where active_visit.visitor_id = v_guest_profile_id
        and active_visit.status in (
          'pending_admission',
          'checked_in'
        )
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'GUEST_ALREADY_CHECKED_IN:' || v_guest_number;
    end if;

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
      status,
      group_lead_visit_id
    )
    values (
      v_guest_profile_id,
      null,
      v_lead_visit.destination_agency,
      v_lead_visit.destination_division,
      v_lead_visit.person_visiting,
      v_lead_visit.purpose,
      v_lead_visit.meeting_id,
      v_lead_visit.custom_meeting_title,
      v_lead_reference || '-' || v_guest_number,
      'checked_in',
      v_lead_visit.id
    );
  end loop;

  return query
  select
    v_lead_visitor_id,
    v_lead_reference,
    jsonb_array_length(v_guests);
end;
$function$;

revoke all on function
  public.register_first_visit_with_guests(
    text, text, text, text, text, text, text, text, uuid, text, text, jsonb
  )
  from public, anon, authenticated;

grant execute on function
  public.register_first_visit_with_guests(
    text, text, text, text, text, text, text, text, uuid, text, text, jsonb
  )
  to service_role;

-- ------------------------------------------------------------
-- Pending admissions: name the lead visitor for guests
-- ------------------------------------------------------------

create or replace function
  public.get_pending_visitor_admissions(
    p_actor_id uuid,
    p_tower text default '',
    p_page integer default 1,
    p_page_size integer default 10,
    p_search text default ''
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_scope jsonb;
  v_page integer := p_page;
  v_page_size integer := p_page_size;
  v_search text :=
    lower(
      btrim(
        coalesce(
          p_search,
          ''
        )
      )
    );
  v_offset integer;
  v_role text;
  v_tower text;
  v_total_count bigint := 0;
  v_total_pages integer := 0;
  v_admissions jsonb := '[]'::jsonb;
begin
  v_actor_scope :=
    public.resolve_visitor_card_actor_scope(
      p_actor_id,
      p_tower
    );

  v_role :=
    v_actor_scope ->> 'role';

  v_tower :=
    v_actor_scope ->> 'tower';

  if (
    v_page is null
    or v_page < 1
    or v_page > 10000
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Invalid admissions page';
  end if;

  if (
    v_page_size is null
    or v_page_size < 1
    or v_page_size > 50
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Invalid admissions page size';
  end if;

  if char_length(v_search) > 120 then
    raise exception using
      errcode = '22023',
      message =
        'Admission search is too long';
  end if;

  perform
    public.expire_pending_visitor_admissions();

  v_offset :=
    (v_page - 1) *
    v_page_size;

  select count(*)
  into v_total_count
  from public.visits as visit
  join public.visitor_profiles
    as visitor
    on visitor.id =
      visit.visitor_id
  where visit.status =
      'pending_admission'
    and (
      v_tower = ''
      or visit.tower =
        v_tower
    )
    and (
      v_search = ''
      or strpos(
        lower(
          visitor.full_name
        ),
        v_search
      ) > 0
      or strpos(
        lower(
          coalesce(
            visitor.phone,
            ''
          )
        ),
        v_search
      ) > 0
      or strpos(
        lower(
          coalesce(
            visit.reference_code,
            ''
          )
        ),
        v_search
      ) > 0
    );

  if v_total_count > 0 then
    v_total_pages :=
      ceil(
        v_total_count::numeric /
        v_page_size::numeric
      )::integer;
  end if;

  select coalesce(
    jsonb_agg(
      admission_row.payload
      order by
        admission_row.created_at
          desc,
        admission_row.visit_id
          desc
    ),
    '[]'::jsonb
  )
  into v_admissions
  from (
    select
      visit.created_at,
      visit.id as visit_id,
      jsonb_build_object(
        'visitId',
        visit.id,
        'visitorId',
        visitor.id,
        'referenceCode',
        visit.reference_code,
        'fullName',
        visitor.full_name,
        'phone',
        visitor.phone,
        'email',
        visitor.email,
        'organization',
        visitor.organization,
        'destinationAgency',
        visit.destination_agency,
        'destinationDivision',
        visit.destination_division,
        'personVisiting',
        visit.person_visiting,
        'purpose',
        visit.purpose,
        'tower',
        visit.tower,
        'submittedAt',
        visit.created_at,
        'admissionExpiresAt',
        visit.admission_expires_at,
        'status',
        visit.status,
        'groupLeadName',
        (
          select lead_visitor.full_name
          from public.visits as lead_visit
          join public.visitor_profiles
            as lead_visitor
            on lead_visitor.id =
              lead_visit.visitor_id
          where lead_visit.id =
            visit.group_lead_visit_id
        )
      ) as payload
    from public.visits as visit
    join public.visitor_profiles
      as visitor
      on visitor.id =
        visit.visitor_id
    where visit.status =
        'pending_admission'
      and (
        v_tower = ''
        or visit.tower =
          v_tower
      )
      and (
        v_search = ''
        or strpos(
          lower(
            visitor.full_name
          ),
          v_search
        ) > 0
        or strpos(
          lower(
            coalesce(
              visitor.phone,
              ''
            )
          ),
          v_search
        ) > 0
        or strpos(
          lower(
            coalesce(
              visit.reference_code,
              ''
            )
          ),
          v_search
        ) > 0
      )
    order by
      visit.created_at desc,
      visit.id desc
    limit v_page_size
    offset v_offset
  ) as admission_row;

  return jsonb_build_object(
    'admissions',
    v_admissions,
    'pagination',
    jsonb_build_object(
      'page',
      v_page,
      'pageSize',
      v_page_size,
      'totalCount',
      v_total_count,
      'totalPages',
      v_total_pages
    ),
    'scope',
    jsonb_build_object(
      'role',
      v_role,
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

notify pgrst, 'reload schema';

commit;
