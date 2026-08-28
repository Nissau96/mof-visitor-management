begin;

-- ============================================================
-- Stage 16: Visitor-card control foundation
-- ============================================================
--
-- This migration:
--
-- - introduces pending visitor admission status;
-- - adds the Client Service Head staff role;
-- - creates the visitor-card inventory;
-- - creates immutable card-assignment history;
-- - creates visitor-card incident records;
-- - seeds the approved 299 original physical cards;
-- - preserves service-role-only mutation boundaries.
--
-- It does not change the public visitor-registration functions.
-- Those functions are changed atomically in the next migration.
-- ============================================================

-- ============================================================
-- Pending-admission visit status
-- ============================================================

alter type public.visit_status
  add value if not exists
    'pending_admission'
  before 'checked_in';

-- ============================================================
-- Client Service Head role
-- ============================================================

alter table public.staff_profiles
  drop constraint if exists
    staff_profiles_role_check;

alter table public.staff_profiles
  add constraint
    staff_profiles_role_check
  check (
    role in (
      'receptionist',
      'client_service_head',
      'admin'
    )
  )
  not valid;

alter table public.staff_profiles
  validate constraint
    staff_profiles_role_check;

comment on column
  public.staff_profiles.role
is
  'Authorized staff role: receptionist, client_service_head or admin. The admin role is displayed as Super Administrator in the interface.';

-- ============================================================
-- Admission lifecycle metadata
-- ============================================================

alter table public.visits
  add column admission_expires_at
    timestamp with time zone,
  add column admitted_at
    timestamp with time zone,
  add column admitted_by
    uuid references auth.users(id)
      on delete set null,
  add column admission_cancelled_at
    timestamp with time zone,
  add column admission_cancelled_by
    uuid references auth.users(id)
      on delete set null,
  add column admission_cancellation_reason
    text;

alter table public.visits
  add constraint
    visits_admission_expiry_after_creation_check
  check (
    admission_expires_at is null
    or admission_expires_at >
      created_at
  );

alter table public.visits
  add constraint
    visits_admitted_after_creation_check
  check (
    admitted_at is null
    or admitted_at >= created_at
  );

alter table public.visits
  add constraint
    visits_admission_cancelled_after_creation_check
  check (
    admission_cancelled_at is null
    or admission_cancelled_at >=
      created_at
  );

alter table public.visits
  add constraint
    visits_admission_cancellation_reason_check
  check (
    admission_cancellation_reason
      is null
    or char_length(
      btrim(
        admission_cancellation_reason
      )
    ) between 5 and 500
  );

-- Existing visits were admitted immediately under the
-- previous workflow. Preserve that meaning by using their
-- recorded check-in time as the admission time.

update public.visits
set admitted_at = checked_in_at
where admitted_at is null
  and checked_in_at is not null;

create index
  visits_admission_expires_at_idx
on public.visits (
  admission_expires_at
)
where admission_expires_at
  is not null;

create index
  visits_admitted_by_idx
on public.visits (
  admitted_by,
  admitted_at desc
)
where admitted_by is not null;

create index
  visits_admission_cancelled_by_idx
on public.visits (
  admission_cancelled_by,
  admission_cancelled_at desc
)
where admission_cancelled_by
  is not null;

comment on column
  public.visits.admission_expires_at
is
  'End-of-day Africa/Accra deadline for a pending admission request. Null after admission or cancellation.';

comment on column
  public.visits.admitted_at
is
  'Time when reception assigned a visitor card and confirmed admission.';

comment on column
  public.visits.admitted_by
is
  'Staff account that assigned the visitor card and confirmed admission.';

comment on column
  public.visits.admission_cancelled_at
is
  'Time when a pending admission was manually or automatically cancelled.';

comment on column
  public.visits.admission_cancelled_by
is
  'Staff account that manually cancelled a pending admission. Null for automatic expiry.';

comment on column
  public.visits.admission_cancellation_reason
is
  'Controlled reason for manual cancellation or automatic end-of-day expiry.';

-- ============================================================
-- Visitor-card inventory
-- ============================================================

create table
  public.visitor_cards (
    id uuid primary key
      default gen_random_uuid(),

    base_number smallint
      not null,

    replacement_sequence integer
      not null
      default 0,

    card_number text
      generated always as (
        'MOF-V' ||
        lpad(
          base_number::text,
          3,
          '0'
        ) ||
        case
          when replacement_sequence > 0
          then
            '-R' ||
            replacement_sequence::text
          else ''
        end
      ) stored,

    tower text
      generated always as (
        case
          when base_number
            between 1 and 199
          then 'tower_2'
          else 'tower_1'
        end
      ) stored,

    status text
      not null
      default 'available',

    replaces_card_id uuid
      references public.visitor_cards(id)
      on delete restrict,

    deactivation_reason text,
    deactivation_notes text,

    deactivated_at
      timestamp with time zone,

    deactivated_by uuid
      references auth.users(id)
      on delete set null,

    created_by uuid
      references auth.users(id)
      on delete set null,

    created_at
      timestamp with time zone
      not null
      default now(),

    updated_at
      timestamp with time zone
      not null
      default now(),

    constraint
      visitor_cards_base_number_check
    check (
      base_number
        between 1 and 299
    ),

    constraint
      visitor_cards_replacement_sequence_check
    check (
      replacement_sequence
        between 0 and 999
    ),

    constraint
      visitor_cards_status_check
    check (
      status in (
        'available',
        'assigned',
        'not_returned',
        'investigating',
        'deactivated'
      )
    ),

    constraint
      visitor_cards_replacement_state_check
    check (
      (
        replacement_sequence = 0
        and replaces_card_id is null
      )
      or
      (
        replacement_sequence > 0
        and replaces_card_id is not null
      )
    ),

    constraint
      visitor_cards_not_self_replacing_check
    check (
      replaces_card_id is null
      or replaces_card_id <> id
    ),

    constraint
      visitor_cards_deactivation_reason_check
    check (
      deactivation_reason is null
      or deactivation_reason in (
        'lost',
        'damaged',
        'unusable'
      )
    ),

    constraint
      visitor_cards_deactivation_notes_check
    check (
      deactivation_notes is null
      or char_length(
        btrim(
          deactivation_notes
        )
      ) between 5 and 1000
    ),

    constraint
      visitor_cards_deactivation_state_check
    check (
      (
        status = 'deactivated'
        and deactivated_at is not null
        and deactivation_reason
          is not null
      )
      or
      (
        status <> 'deactivated'
        and deactivated_at is null
        and deactivation_reason
          is null
        and deactivation_notes
          is null
      )
    ),

    constraint
      visitor_cards_base_replacement_key
    unique (
      base_number,
      replacement_sequence
    ),

    constraint
      visitor_cards_card_number_key
    unique (
      card_number
    ),

    constraint
      visitor_cards_replaces_card_key
    unique (
      replaces_card_id
    )
  );

-- Only one non-deactivated physical card can exist for a
-- base number at a time. A replacement is inserted only
-- after its predecessor is permanently deactivated.

create unique index
  visitor_cards_current_base_idx
on public.visitor_cards (
  base_number
)
where status <> 'deactivated';

create index
  visitor_cards_tower_status_number_idx
on public.visitor_cards (
  tower,
  status,
  base_number,
  replacement_sequence desc
);

create index
  visitor_cards_status_updated_idx
on public.visitor_cards (
  status,
  updated_at desc
);

create index
  visitor_cards_replaces_card_idx
on public.visitor_cards (
  replaces_card_id
)
where replaces_card_id is not null;

create trigger
  visitor_cards_set_updated_at
before update
on public.visitor_cards
for each row
execute function
  public.set_updated_at();

comment on table
  public.visitor_cards
is
  'Authoritative inventory and replacement lineage for physical Ministry visitor access cards.';

comment on column
  public.visitor_cards.base_number
is
  'Permanent numeric identity of the physical-card lineage. Values 001-199 belong to Tower 2 and 200-299 belong to Tower 1.';

comment on column
  public.visitor_cards.replacement_sequence
is
  'Zero for the original card and incremented for replacement cards such as R1 and R2.';

comment on column
  public.visitor_cards.card_number
is
  'System-generated physical identifier such as MOF-V168 or MOF-V168-R1.';

comment on column
  public.visitor_cards.tower
is
  'System-generated tower ownership derived from the approved base-number range.';

comment on column
  public.visitor_cards.status
is
  'Current card state: available, assigned, not_returned, investigating or deactivated.';

comment on column
  public.visitor_cards.replaces_card_id
is
  'Immediately preceding permanently deactivated card in the replacement chain.';

-- ============================================================
-- Visitor-card assignment history
-- ============================================================

create table
  public.visitor_card_assignments (
    id uuid primary key
      default gen_random_uuid(),

    card_id uuid
      not null
      references public.visitor_cards(id)
      on delete restrict,

    visit_id uuid
      not null
      references public.visits(id)
      on delete restrict,

    assigned_by uuid
      references auth.users(id)
      on delete set null,

    assigned_at
      timestamp with time zone
      not null
      default now(),

    return_due_at
      timestamp with time zone
      not null,

    status text
      not null
      default 'assigned',

    returned_at
      timestamp with time zone,

    returned_by uuid
      references auth.users(id)
      on delete set null,

    return_notes text,

    created_at
      timestamp with time zone
      not null
      default now(),

    updated_at
      timestamp with time zone
      not null
      default now(),

    constraint
      visitor_card_assignments_visit_key
    unique (
      visit_id
    ),

    constraint
      visitor_card_assignments_status_check
    check (
      status in (
        'assigned',
        'returned',
        'not_returned',
        'deactivated'
      )
    ),

    constraint
      visitor_card_assignments_due_after_assignment_check
    check (
      return_due_at >
        assigned_at
    ),

    constraint
      visitor_card_assignments_return_after_assignment_check
    check (
      returned_at is null
      or returned_at >=
        assigned_at
    ),

    constraint
      visitor_card_assignments_return_notes_check
    check (
      return_notes is null
      or char_length(
        btrim(
          return_notes
        )
      ) between 5 and 1000
    ),

    constraint
      visitor_card_assignments_return_state_check
    check (
      (
        status = 'returned'
        and returned_at is not null
      )
      or
      (
        status in (
          'assigned',
          'not_returned',
          'deactivated'
        )
        and returned_at is null
      )
    )
  );

-- A card can have only one unresolved assignment.
-- Historical returned and deactivated assignments remain
-- available for audit and reporting.

create unique index
  visitor_card_assignments_active_card_idx
on public.visitor_card_assignments (
  card_id
)
where status in (
  'assigned',
  'not_returned'
);

create index
  visitor_card_assignments_card_history_idx
on public.visitor_card_assignments (
  card_id,
  assigned_at desc
);

create index
  visitor_card_assignments_due_status_idx
on public.visitor_card_assignments (
  return_due_at,
  id
)
where status = 'assigned';

create index
  visitor_card_assignments_status_updated_idx
on public.visitor_card_assignments (
  status,
  updated_at desc
);

create index
  visitor_card_assignments_assigned_by_idx
on public.visitor_card_assignments (
  assigned_by,
  assigned_at desc
)
where assigned_by is not null;

create trigger
  visitor_card_assignments_set_updated_at
before update
on public.visitor_card_assignments
for each row
execute function
  public.set_updated_at();

comment on table
  public.visitor_card_assignments
is
  'Immutable visit-to-card assignment history with the current return state recorded on each assignment.';

comment on column
  public.visitor_card_assignments.return_due_at
is
  'Time when an unreturned assigned card becomes overdue, normally 24 hours after assignment.';

comment on column
  public.visitor_card_assignments.status
is
  'Assignment state: assigned, returned, not_returned or deactivated.';

-- ============================================================
-- Visitor-card incidents
-- ============================================================

create table
  public.visitor_card_incidents (
    id uuid primary key
      default gen_random_uuid(),

    assignment_id uuid
      not null
      references
        public.visitor_card_assignments(id)
      on delete restrict,

    opened_reason text
      not null,

    status text
      not null
      default 'open',

    opened_at
      timestamp with time zone
      not null
      default now(),

    assigned_to uuid
      references auth.users(id)
      on delete set null,

    investigation_started_at
      timestamp with time zone,

    investigation_started_by uuid
      references auth.users(id)
      on delete set null,

    investigation_notes text,

    resolution text,
    resolution_notes text,

    resolved_at
      timestamp with time zone,

    resolved_by uuid
      references auth.users(id)
      on delete set null,

    created_at
      timestamp with time zone
      not null
      default now(),

    updated_at
      timestamp with time zone
      not null
      default now(),

    constraint
      visitor_card_incidents_assignment_key
    unique (
      assignment_id
    ),

    constraint
      visitor_card_incidents_opened_reason_check
    check (
      opened_reason in (
        'overdue',
        'reported_not_returned'
      )
    ),

    constraint
      visitor_card_incidents_status_check
    check (
      status in (
        'open',
        'investigating',
        'resolved'
      )
    ),

    constraint
      visitor_card_incidents_resolution_check
    check (
      resolution is null
      or resolution in (
        'late_return',
        'lost',
        'damaged',
        'unusable'
      )
    ),

    constraint
      visitor_card_incidents_investigation_notes_check
    check (
      investigation_notes is null
      or char_length(
        btrim(
          investigation_notes
        )
      ) between 5 and 2000
    ),

    constraint
      visitor_card_incidents_resolution_notes_check
    check (
      resolution_notes is null
      or char_length(
        btrim(
          resolution_notes
        )
      ) between 5 and 2000
    ),

    constraint
      visitor_card_incidents_investigation_after_open_check
    check (
      investigation_started_at
        is null
      or investigation_started_at >=
        opened_at
    ),

    constraint
      visitor_card_incidents_resolution_after_open_check
    check (
      resolved_at is null
      or resolved_at >= opened_at
    ),

    constraint
      visitor_card_incidents_state_check
    check (
      (
        status = 'open'
        and investigation_started_at
          is null
        and investigation_notes
          is null
        and resolution is null
        and resolution_notes is null
        and resolved_at is null
      )
      or
      (
        status = 'investigating'
        and investigation_started_at
          is not null
        and investigation_notes
          is not null
        and resolution is null
        and resolution_notes is null
        and resolved_at is null
      )
      or
      (
        status = 'resolved'
        and resolution is not null
        and resolution_notes is not null
        and resolved_at is not null
      )
    )
  );

create index
  visitor_card_incidents_status_opened_idx
on public.visitor_card_incidents (
  status,
  opened_at desc
);

create index
  visitor_card_incidents_assigned_to_idx
on public.visitor_card_incidents (
  assigned_to,
  status,
  opened_at desc
)
where assigned_to is not null;

create index
  visitor_card_incidents_resolution_idx
on public.visitor_card_incidents (
  resolution,
  resolved_at desc
)
where status = 'resolved';

create trigger
  visitor_card_incidents_set_updated_at
before update
on public.visitor_card_incidents
for each row
execute function
  public.set_updated_at();

comment on table
  public.visitor_card_incidents
is
  'Client Service investigation and resolution records for overdue or explicitly unreturned visitor cards.';

comment on column
  public.visitor_card_incidents.opened_reason
is
  'Reason the incident was created: overdue or reported_not_returned.';

comment on column
  public.visitor_card_incidents.assigned_to
is
  'Client Service Head or Super Administrator currently responsible for the incident.';

comment on column
  public.visitor_card_incidents.resolution
is
  'Final outcome: late_return, lost, damaged or unusable.';

-- ============================================================
-- Row-level security and privileges
-- ============================================================

alter table
  public.visitor_cards
enable row level security;

alter table
  public.visitor_card_assignments
enable row level security;

alter table
  public.visitor_card_incidents
enable row level security;

-- Browser clients do not receive direct table privileges.
-- All operations pass through validated server endpoints
-- using service-role-only security-definer functions.

revoke all
  on table public.visitor_cards
  from public, anon, authenticated;

revoke all
  on table
    public.visitor_card_assignments
  from public, anon, authenticated;

revoke all
  on table
    public.visitor_card_incidents
  from public, anon, authenticated;

grant all
  on table public.visitor_cards
  to service_role;

grant all
  on table
    public.visitor_card_assignments
  to service_role;

grant all
  on table
    public.visitor_card_incidents
  to service_role;

-- ============================================================
-- Seed the approved original physical-card inventory
-- ============================================================
--
-- MOF-V001 through MOF-V199 -> Tower 2
-- MOF-V200 through MOF-V299 -> Tower 1
--
-- card_number and tower are generated columns and cannot be
-- overridden by a browser, API request or administrator.
-- ============================================================

insert into public.visitor_cards (
  base_number,
  replacement_sequence,
  status
)
select
  card_number,
  0,
  'available'
from generate_series(
  1,
  299
) as generated_card(
  card_number
)
on conflict (
  base_number,
  replacement_sequence
)
do nothing;

-- ============================================================
-- Verify seeded invariants during migration
-- ============================================================

do $block$
declare
  v_total_cards integer;
  v_tower_1_cards integer;
  v_tower_2_cards integer;
begin
  select count(*)
  into v_total_cards
  from public.visitor_cards
  where replacement_sequence = 0;

  select count(*)
  into v_tower_1_cards
  from public.visitor_cards
  where replacement_sequence = 0
    and tower = 'tower_1';

  select count(*)
  into v_tower_2_cards
  from public.visitor_cards
  where replacement_sequence = 0
    and tower = 'tower_2';

  if v_total_cards <> 299 then
    raise exception using
      errcode = '23514',
      message =
        'Visitor-card inventory must contain 299 original cards';
  end if;

  if v_tower_1_cards <> 100 then
    raise exception using
      errcode = '23514',
      message =
        'Tower 1 must contain 100 original visitor cards';
  end if;

  if v_tower_2_cards <> 199 then
    raise exception using
      errcode = '23514',
      message =
        'Tower 2 must contain 199 original visitor cards';
  end if;
end;
$block$;

notify pgrst, 'reload schema';

commit;