begin;

-- ============================================================
-- Expand the inventory model for Regular and VIP cards
-- ============================================================

alter table public.visitor_cards
  add column card_type text
    not null
    default 'regular';

alter table public.visitor_cards
  alter column card_number
    drop expression;

alter table public.visitor_cards
  alter column tower
    drop expression;

alter table public.visitor_cards
  alter column tower
    set not null;

alter table public.visitor_cards
  drop constraint
    visitor_cards_base_number_check;

alter table public.visitor_cards
  add constraint
    visitor_cards_base_number_check
  check (
    base_number
      between 1 and 999
  );

alter table public.visitor_cards
  add constraint
    visitor_cards_card_type_check
  check (
    card_type in (
      'regular',
      'vip'
    )
  );

alter table public.visitor_cards
  add constraint
    visitor_cards_tower_check
  check (
    tower in (
      'tower_1',
      'tower_2'
    )
  );

alter table public.visitor_cards
  drop constraint
    visitor_cards_base_replacement_key;

alter table public.visitor_cards
  add constraint
    visitor_cards_type_base_replacement_key
  unique (
    card_type,
    base_number,
    replacement_sequence
  );

drop index
  public.visitor_cards_current_base_idx;

create unique index
  visitor_cards_current_type_base_idx
on public.visitor_cards (
  card_type,
  base_number
)
where status <> 'deactivated';

drop index
  public.visitor_cards_tower_status_number_idx;

create index
  visitor_cards_tower_type_status_number_idx
on public.visitor_cards (
  tower,
  card_type,
  status,
  base_number,
  replacement_sequence desc
);

-- ============================================================
-- Controlled card-number generation and immutable identity
-- ============================================================

create or replace function
  public.set_visitor_card_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' then
    if (
      new.card_type is distinct
        from old.card_type
      or new.base_number is distinct
        from old.base_number
      or new.replacement_sequence
        is distinct from
          old.replacement_sequence
      or new.replaces_card_id
        is distinct from
          old.replaces_card_id
    ) then
      raise exception using
        errcode = '55000',
        message =
          'An existing visitor-card identity cannot be changed';
    end if;

    if (
      new.tower is distinct
        from old.tower
      and old.status <>
        'available'
    ) then
      raise exception using
        errcode = '55000',
        message =
          'Only an available visitor card can change towers';
    end if;
  end if;

  new.card_number :=
    case new.card_type
      when 'vip' then
        'MOF-VIP'
      else
        'MOF-V'
    end ||
    lpad(
      new.base_number::text,
      3,
      '0'
    ) ||
    case
      when new.replacement_sequence >
        0
      then
        '-R' ||
        new.replacement_sequence::text
      else ''
    end;

  return new;
end;
$function$;

drop trigger if exists
  visitor_cards_set_identity
on public.visitor_cards;

create trigger
  visitor_cards_set_identity
before insert or update
on public.visitor_cards
for each row
execute function
  public.set_visitor_card_identity();

alter table public.visitor_cards
  add constraint
    visitor_cards_number_matches_identity_check
  check (
    card_number =
      (
        case card_type
          when 'vip' then
            'MOF-VIP'
          else
            'MOF-V'
        end ||
        lpad(
          base_number::text,
          3,
          '0'
        ) ||
        case
          when replacement_sequence >
            0
          then
            '-R' ||
            replacement_sequence::text
          else ''
        end
      )
  );

comment on column
  public.visitor_cards.card_type
is
  'Physical card category: regular or vip.';

comment on column
  public.visitor_cards.card_number
is
  'Trigger-controlled identifier such as MOF-V168, MOF-VIP025 or MOF-VIP025-R1.';

comment on column
  public.visitor_cards.tower
is
  'Administrative tower assignment controlling which reception can issue the physical card.';

-- ============================================================
-- Seed the initial Tower 2 VIP inventory
-- ============================================================

insert into public.visitor_cards (
  card_type,
  base_number,
  replacement_sequence,
  tower,
  status,
  created_by
)
select
  'vip',
  vip_number,
  0,
  'tower_2',
  'available',
  null
from generate_series(
  1,
  50
) as vip_number;

-- ============================================================
-- Replace card search with a card-type-aware version
-- ============================================================

drop function
  public.get_available_visitor_cards(
    uuid,
    text,
    text
  );

create or replace function
  public.get_available_visitor_cards(
    p_actor_id uuid,
    p_tower text,
    p_card_type text,
    p_last_three_digits text
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_scope jsonb;
  v_base_number integer;
  v_card_type text :=
    lower(
      btrim(
        coalesce(
          p_card_type,
          ''
        )
      )
    );
  v_cards jsonb := '[]'::jsonb;
  v_digits text :=
    btrim(
      coalesce(
        p_last_three_digits,
        ''
      )
    );
  v_tower text;
begin
  v_actor_scope :=
    public.resolve_visitor_card_actor_scope(
      p_actor_id,
      p_tower
    );

  v_tower :=
    v_actor_scope ->> 'tower';

  if v_tower = '' then
    raise exception using
      errcode = '22023',
      message =
        'A tower is required when searching for visitor cards';
  end if;

  if v_card_type not in (
    'regular',
    'vip'
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Select Regular or VIP card type';
  end if;

  if v_digits !~ '^[0-9]{3}$' then
    raise exception using
      errcode = '22023',
      message =
        'Enter exactly the last three card digits';
  end if;

  v_base_number :=
    v_digits::integer;

  if v_base_number
    not between 1 and 999
  then
    raise exception using
      errcode = '22023',
      message =
        'Invalid visitor-card number';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cardId',
        card.id,
        'cardType',
        card.card_type,
        'cardNumber',
        card.card_number,
        'baseNumber',
        card.base_number,
        'replacementSequence',
        card.replacement_sequence,
        'tower',
        card.tower,
        'status',
        card.status
      )
      order by
        card.replacement_sequence
          desc
    ),
    '[]'::jsonb
  )
  into v_cards
  from public.visitor_cards as card
  where card.card_type =
      v_card_type
    and card.base_number =
      v_base_number
    and card.tower =
      v_tower
    and card.status =
      'available';

  return jsonb_build_object(
    'cards',
    v_cards,
    'cardType',
    v_card_type,
    'lastThreeDigits',
    v_digits,
    'tower',
    v_tower
  );
end;
$function$;

-- ============================================================
-- Super Administrator: add individual cards or ranges
-- ============================================================

create or replace function
  public.create_admin_visitor_cards(
    p_actor_id uuid,
    p_card_type text,
    p_start_number integer,
    p_end_number integer,
    p_tower text
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_scope jsonb;
  v_card_count integer;
  v_card_type text :=
    lower(
      btrim(
        coalesce(
          p_card_type,
          ''
        )
      )
    );
  v_cards jsonb := '[]'::jsonb;
  v_role text;
  v_tower text :=
    lower(
      btrim(
        coalesce(
          p_tower,
          ''
        )
      )
    );
begin
  v_actor_scope :=
    public.resolve_visitor_card_actor_scope(
      p_actor_id,
      ''
    );

  v_role :=
    v_actor_scope ->> 'role';

  if v_role <> 'admin' then
    raise exception using
      errcode = '42501',
      message =
        'Only a Super Administrator can add visitor cards';
  end if;

  if v_card_type not in (
    'regular',
    'vip'
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Select Regular or VIP card type';
  end if;

  if v_tower not in (
    'tower_1',
    'tower_2'
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Select Tower 1 or Tower 2';
  end if;

  if (
    p_start_number is null
    or p_end_number is null
    or p_start_number < 1
    or p_end_number > 999
    or p_end_number <
      p_start_number
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Card numbers must form a valid range between 001 and 999';
  end if;

  v_card_count :=
    p_end_number -
    p_start_number + 1;

  if v_card_count > 100 then
    raise exception using
      errcode = '22023',
      message =
        'A maximum of 100 visitor cards can be added at once';
  end if;

  if exists (
    select 1
    from public.visitor_cards as card
    where card.card_type =
        v_card_type
      and card.base_number
        between p_start_number
          and p_end_number
  ) then
    raise exception using
      errcode = '23505',
      message =
        'One or more visitor-card numbers already exist';
  end if;

  with inserted_cards as (
    insert into public.visitor_cards (
      card_type,
      base_number,
      replacement_sequence,
      tower,
      status,
      created_by
    )
    select
      v_card_type,
      card_number,
      0,
      v_tower,
      'available',
      p_actor_id
    from generate_series(
      p_start_number,
      p_end_number
    ) as card_number
    returning *
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'cardId',
          inserted_card.id,
          'cardType',
          inserted_card.card_type,
          'cardNumber',
          inserted_card.card_number,
          'baseNumber',
          inserted_card.base_number,
          'tower',
          inserted_card.tower,
          'status',
          inserted_card.status
        )
        order by
          inserted_card.base_number
      ),
      '[]'::jsonb
    )
  into v_cards
  from inserted_cards
    as inserted_card;

  insert into public.audit_events (
    actor_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    p_actor_id,
    'visitor_card.inventory_added',
    'visitor_card_inventory',
    v_card_type ||
      ':' ||
      p_start_number::text ||
      '-' ||
      p_end_number::text,
    jsonb_build_object(
      'cardType',
      v_card_type,
      'startNumber',
      p_start_number,
      'endNumber',
      p_end_number,
      'cardCount',
      v_card_count,
      'tower',
      v_tower
    )
  );

  return jsonb_build_object(
    'cardsCreated',
    true,
    'cardCount',
    v_card_count,
    'cardType',
    v_card_type,
    'tower',
    v_tower,
    'cards',
    v_cards
  );
end;
$function$;

-- ============================================================
-- Super Administrator: change an available card's tower
-- ============================================================

create or replace function
  public.assign_admin_visitor_card_tower(
    p_actor_id uuid,
    p_card_id uuid,
    p_tower text
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_scope jsonb;
  v_card public.visitor_cards%rowtype;
  v_new_tower text :=
    lower(
      btrim(
        coalesce(
          p_tower,
          ''
        )
      )
    );
  v_old_tower text;
  v_role text;
begin
  if p_card_id is null then
    raise exception using
      errcode = '22023',
      message =
        'Invalid visitor-card identifier';
  end if;

  v_actor_scope :=
    public.resolve_visitor_card_actor_scope(
      p_actor_id,
      ''
    );

  v_role :=
    v_actor_scope ->> 'role';

  if v_role <> 'admin' then
    raise exception using
      errcode = '42501',
      message =
        'Only a Super Administrator can assign visitor-card towers';
  end if;

  if v_new_tower not in (
    'tower_1',
    'tower_2'
  ) then
    raise exception using
      errcode = '22023',
      message =
        'Select Tower 1 or Tower 2';
  end if;

  select card.*
  into v_card
  from public.visitor_cards
    as card
  where card.id =
    p_card_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message =
        'Visitor card was not found';
  end if;

  if v_card.status <>
    'available'
  then
    raise exception using
      errcode = '55000',
      message =
        'Only an available visitor card can change towers';
  end if;

  v_old_tower :=
    v_card.tower;

  if v_old_tower =
    v_new_tower
  then
    return jsonb_build_object(
      'towerAssigned',
      true,
      'alreadyAssigned',
      true,
      'cardId',
      v_card.id,
      'cardType',
      v_card.card_type,
      'cardNumber',
      v_card.card_number,
      'tower',
      v_card.tower
    );
  end if;

  update public.visitor_cards
  set
    tower = v_new_tower,
    updated_at = now()
  where id =
    v_card.id;

  insert into public.audit_events (
    actor_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    p_actor_id,
    'visitor_card.tower_assigned',
    'visitor_card',
    v_card.id::text,
    jsonb_build_object(
      'cardType',
      v_card.card_type,
      'cardNumber',
      v_card.card_number,
      'previousTower',
      v_old_tower,
      'newTower',
      v_new_tower
    )
  );

  return jsonb_build_object(
    'towerAssigned',
    true,
    'alreadyAssigned',
    false,
    'cardId',
    v_card.id,
    'cardType',
    v_card.card_type,
    'cardNumber',
    v_card.card_number,
    'previousTower',
    v_old_tower,
    'tower',
    v_new_tower
  );
end;
$function$;

-- ============================================================
-- Type-aware replacement-card registration
-- ============================================================

create or replace function
  public.reprint_deactivated_visitor_card(
    p_actor_id uuid,
    p_card_id uuid,
    p_notes text,
    p_tower text default ''
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_scope jsonb;
  v_existing_replacement
    public.visitor_cards%rowtype;
  v_new_card
    public.visitor_cards%rowtype;
  v_next_sequence integer;
  v_notes text :=
    btrim(
      coalesce(
        p_notes,
        ''
      )
    );
  v_old_card
    public.visitor_cards%rowtype;
  v_role text;
  v_tower_scope text;
begin
  if p_card_id is null then
    raise exception using
      errcode = '22023',
      message =
        'Invalid visitor-card identifier';
  end if;

  if char_length(v_notes)
    not between 5 and 1000
  then
    raise exception using
      errcode = '22023',
      message =
        'Reprint notes must contain between 5 and 1000 characters';
  end if;

  v_actor_scope :=
    public.resolve_visitor_card_actor_scope(
      p_actor_id,
      p_tower
    );

  v_role :=
    v_actor_scope ->> 'role';

  v_tower_scope :=
    v_actor_scope ->> 'tower';

  if v_role not in (
    'client_service_head',
    'admin'
  ) then
    raise exception using
      errcode = '42501',
      message =
        'Only the Client Service Head or Super Administrator can register replacement cards';
  end if;

  select card.*
  into v_old_card
  from public.visitor_cards
    as card
  where card.id =
    p_card_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message =
        'Visitor card was not found';
  end if;

  if (
    v_tower_scope <> ''
    and v_old_card.tower <>
      v_tower_scope
  ) then
    raise exception using
      errcode = '42501',
      message =
        'The visitor card does not belong to the selected tower';
  end if;

  if v_old_card.status <>
    'deactivated'
  then
    raise exception using
      errcode = '55000',
      message =
        'Only a permanently deactivated card can be reprinted';
  end if;

  select replacement.*
  into v_existing_replacement
  from public.visitor_cards
    as replacement
  where replacement.replaces_card_id =
    v_old_card.id;

  if found then
    return jsonb_build_object(
      'replacementRegistered',
      true,
      'alreadyRegistered',
      true,
      'oldCardNumber',
      v_old_card.card_number,
      'replacementCard',
      jsonb_build_object(
        'cardId',
        v_existing_replacement.id,
        'cardType',
        v_existing_replacement.card_type,
        'cardNumber',
        v_existing_replacement.card_number,
        'tower',
        v_existing_replacement.tower,
        'status',
        v_existing_replacement.status
      )
    );
  end if;

  if exists (
    select 1
    from public.visitor_cards
      as current_card
    where current_card.card_type =
        v_old_card.card_type
      and current_card.base_number =
        v_old_card.base_number
      and current_card.status <>
        'deactivated'
  ) then
    raise exception using
      errcode = '55000',
      message =
        'An active card already exists for this card type and base number';
  end if;

  select
    coalesce(
      max(
        card.replacement_sequence
      ),
      0
    ) + 1
  into v_next_sequence
  from public.visitor_cards as card
  where card.card_type =
      v_old_card.card_type
    and card.base_number =
      v_old_card.base_number;

  if v_next_sequence > 999 then
    raise exception using
      errcode = '22003',
      message =
        'The visitor-card replacement sequence is exhausted';
  end if;

  insert into public.visitor_cards (
    card_type,
    base_number,
    replacement_sequence,
    tower,
    status,
    replaces_card_id,
    created_by
  )
  values (
    v_old_card.card_type,
    v_old_card.base_number,
    v_next_sequence,
    v_old_card.tower,
    'available',
    v_old_card.id,
    p_actor_id
  )
  returning *
  into v_new_card;

  insert into public.audit_events (
    actor_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    p_actor_id,
    'visitor_card.replacement_registered',
    'visitor_card',
    v_new_card.id::text,
    jsonb_build_object(
      'cardType',
      v_new_card.card_type,
      'oldCardId',
      v_old_card.id,
      'oldCardNumber',
      v_old_card.card_number,
      'replacementCardId',
      v_new_card.id,
      'replacementCardNumber',
      v_new_card.card_number,
      'baseNumber',
      v_new_card.base_number,
      'replacementSequence',
      v_new_card.replacement_sequence,
      'tower',
      v_new_card.tower,
      'notes',
      v_notes
    )
  );

  return jsonb_build_object(
    'replacementRegistered',
    true,
    'alreadyRegistered',
    false,
    'oldCardNumber',
    v_old_card.card_number,
    'replacementCard',
    jsonb_build_object(
      'cardId',
      v_new_card.id,
      'cardType',
      v_new_card.card_type,
      'cardNumber',
      v_new_card.card_number,
      'baseNumber',
      v_new_card.base_number,
      'replacementSequence',
      v_new_card.replacement_sequence,
      'tower',
      v_new_card.tower,
      'status',
      v_new_card.status
    )
  );
end;
$function$;

-- ============================================================
-- Function permissions
-- ============================================================

revoke all
  on function
    public.set_visitor_card_identity()
  from public, anon, authenticated;

revoke all
  on function
    public.get_available_visitor_cards(
      uuid,
      text,
      text,
      text
    )
  from public, anon, authenticated;

revoke all
  on function
    public.create_admin_visitor_cards(
      uuid,
      text,
      integer,
      integer,
      text
    )
  from public, anon, authenticated;

revoke all
  on function
    public.assign_admin_visitor_card_tower(
      uuid,
      uuid,
      text
    )
  from public, anon, authenticated;

revoke all
  on function
    public.reprint_deactivated_visitor_card(
      uuid,
      uuid,
      text,
      text
    )
  from public, anon, authenticated;

grant execute
  on function
    public.get_available_visitor_cards(
      uuid,
      text,
      text,
      text
    )
  to service_role;

grant execute
  on function
    public.create_admin_visitor_cards(
      uuid,
      text,
      integer,
      integer,
      text
    )
  to service_role;

grant execute
  on function
    public.assign_admin_visitor_card_tower(
      uuid,
      uuid,
      text
    )
  to service_role;

grant execute
  on function
    public.reprint_deactivated_visitor_card(
      uuid,
      uuid,
      text,
      text
    )
  to service_role;

comment on function
  public.create_admin_visitor_cards(
    uuid,
    text,
    integer,
    integer,
    text
  )
is
  'Allows a Super Administrator to add one visitor card or a range of up to 100 Regular or VIP cards and assign their reception tower.';

comment on function
  public.assign_admin_visitor_card_tower(
    uuid,
    uuid,
    text
  )
is
  'Allows a Super Administrator to move an available visitor card between Tower 1 and Tower 2.';

notify pgrst, 'reload schema';

commit;