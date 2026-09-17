begin;

-- ============================================================
-- Phase 1: Authoritative visit tower routing
-- ============================================================
--
-- Routing rules:
--
-- - Ministry of Finance + PFM Systems Division -> Tower 1
-- - Ministry of Finance + every other division -> Tower 2
-- - Every other agency -> Tower 1
--
-- The generated column prevents browser or API input from
-- overriding the routing decision.
-- ============================================================

alter table public.visits
  add column tower text
  generated always as (
    case
      when destination_agency = 'Ministry of Finance (MoF)'
        and destination_division <> 'PFM Systems Division'
      then 'tower_2'
      else 'tower_1'
    end
  ) stored;

alter table public.visits
  add constraint visits_tower_check
  check (
    tower in (
      'tower_1',
      'tower_2'
    )
  );

create index visits_tower_status_checked_in_at_idx
  on public.visits (
    tower,
    status,
    checked_in_at desc,
    id desc
  );

create index visits_tower_checked_out_at_idx
  on public.visits (
    tower,
    checked_out_at desc,
    id desc
  )
  where checked_out_at is not null;

comment on column public.visits.tower is
  'Authoritatively generated reception tower: PFM Systems Division and non-Ministry agencies use Tower 1; other Ministry of Finance divisions use Tower 2.';

commit;