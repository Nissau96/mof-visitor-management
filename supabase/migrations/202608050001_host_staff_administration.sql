begin;

-- =========================================================
-- Stage 11: Host and staff administration
-- =========================================================

-- Staff names should follow the same limits used elsewhere.
do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname =
      'staff_profiles_full_name_check'
      and conrelid =
        'public.staff_profiles'::regclass
  ) then
    alter table public.staff_profiles
      add constraint
        staff_profiles_full_name_check
      check (
        char_length(btrim(full_name))
          between 2 and 120
      );
  end if;
end;
$block$;

-- Administrative changes must pass through trusted
-- service-role functions rather than direct browser writes.
drop policy if exists "admins manage hosts"
  on public.hosts;

revoke insert, update, delete
  on table public.hosts
  from public, anon, authenticated;

revoke insert, update, delete
  on table public.staff_profiles
  from public, anon, authenticated;

grant select, insert, update
  on table public.hosts
  to service_role;

grant select, insert, update
  on table public.staff_profiles
  to service_role;

-- =========================================================
-- Supporting indexes
-- =========================================================

create index if not exists
  hosts_full_name_lower_idx
on public.hosts (
  lower(full_name),
  id
);

create index if not exists
  hosts_active_full_name_idx
on public.hosts (
  active,
  lower(full_name),
  id
);

create index if not exists
  staff_profiles_full_name_lower_idx
on public.staff_profiles (
  lower(full_name),
  user_id
);

create index if not exists
  staff_profiles_role_active_idx
on public.staff_profiles (
  role,
  active
);

-- =========================================================
-- Paginated host administration
-- =========================================================

create or replace function public.get_admin_hosts(
  p_page integer default 1,
  p_page_size integer default 10,
  p_search text default '',
  p_active text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_page integer := p_page;
  v_page_size integer := p_page_size;

  v_search text :=
    lower(btrim(coalesce(p_search, '')));

  v_active text :=
    lower(btrim(coalesce(p_active, 'all')));

  v_offset integer;
  v_total_count bigint := 0;
  v_total_pages integer := 0;
  v_hosts jsonb := '[]'::jsonb;
begin
  if v_page is null
    or v_page < 1
    or v_page > 10000
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid host page';
  end if;

  if v_page_size is null
    or v_page_size < 1
    or v_page_size > 10
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid host page size';
  end if;

  if char_length(v_search) > 80 then
    raise exception using
      errcode = '22023',
      message = 'Host search is too long';
  end if;

  if v_active not in (
    'all',
    'active',
    'inactive'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid host status filter';
  end if;

  v_offset := (v_page - 1) * v_page_size;

  select count(*)
  into v_total_count
  from public.hosts as host
  where (
      v_search = ''
      or strpos(
        lower(host.full_name),
        v_search
      ) > 0
      or strpos(
        lower(host.department),
        v_search
      ) > 0
    )
    and (
      v_active = 'all'
      or (
        v_active = 'active'
        and host.active = true
      )
      or (
        v_active = 'inactive'
        and host.active = false
      )
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
      jsonb_build_object(
        'hostId',
        admin_host.id,
        'fullName',
        admin_host.full_name,
        'department',
        admin_host.department,
        'active',
        admin_host.active,
        'createdAt',
        admin_host.created_at
      )
      order by
        lower(admin_host.full_name),
        admin_host.id
    ),
    '[]'::jsonb
  )
  into v_hosts
  from (
    select
      host.id,
      host.full_name,
      host.department,
      host.active,
      host.created_at
    from public.hosts as host
    where (
        v_search = ''
        or strpos(
          lower(host.full_name),
          v_search
        ) > 0
        or strpos(
          lower(host.department),
          v_search
        ) > 0
      )
      and (
        v_active = 'all'
        or (
          v_active = 'active'
          and host.active = true
        )
        or (
          v_active = 'inactive'
          and host.active = false
        )
      )
    order by
      lower(host.full_name),
      host.id
    limit v_page_size
    offset v_offset
  ) as admin_host;

  return jsonb_build_object(
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
    'hosts',
    v_hosts
  );
end;
$function$;

-- =========================================================
-- Create or update a host
-- =========================================================

create or replace function public.save_admin_host(
  p_actor_id uuid,
  p_host_id uuid,
  p_full_name text,
  p_department text,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_full_name text :=
    btrim(coalesce(p_full_name, ''));

  v_department text :=
    btrim(coalesce(p_department, ''));

  v_host_id uuid;
  v_created_at timestamp with time zone;

  v_previous_full_name text;
  v_previous_department text;
  v_previous_active boolean;

  v_action text;
  v_changed boolean := true;
begin
  if p_actor_id is null
    or not exists (
      select 1
      from public.staff_profiles as actor
      where actor.user_id = p_actor_id
        and actor.active = true
        and actor.role = 'admin'
    )
  then
    raise exception using
      errcode = '42501',
      message =
        'Administrator account is not authorised';
  end if;

  if char_length(v_full_name)
    not between 2 and 120
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid host name';
  end if;

  if char_length(v_department)
    not between 2 and 120
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid host department';
  end if;

  if p_active is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid host status';
  end if;

  if p_host_id is null then
    insert into public.hosts (
      full_name,
      department,
      active
    )
    values (
      v_full_name,
      v_department,
      p_active
    )
    returning
      id,
      created_at
    into
      v_host_id,
      v_created_at;

    v_action := 'host.created';
  else
    select
      host.full_name,
      host.department,
      host.active,
      host.created_at
    into
      v_previous_full_name,
      v_previous_department,
      v_previous_active,
      v_created_at
    from public.hosts as host
    where host.id = p_host_id
    for update;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'Host was not found';
    end if;

    v_host_id := p_host_id;

    v_changed :=
      v_previous_full_name is distinct from
        v_full_name
      or v_previous_department is distinct from
        v_department
      or v_previous_active is distinct from
        p_active;

    if v_changed then
      update public.hosts
      set
        full_name = v_full_name,
        department = v_department,
        active = p_active
      where id = v_host_id;

      v_action := 'host.updated';
    end if;
  end if;

  if v_changed then
    insert into public.audit_events (
      actor_id,
      action,
      entity_type,
      entity_id,
      details
    )
    values (
      p_actor_id,
      v_action,
      'host',
      v_host_id::text,
      case
        when p_host_id is null then
          jsonb_build_object(
            'active',
            p_active,
            'department',
            v_department
          )
        else
          jsonb_build_object(
            'previousActive',
            v_previous_active,
            'newActive',
            p_active,
            'nameChanged',
            v_previous_full_name
              is distinct from v_full_name,
            'previousDepartment',
            v_previous_department,
            'newDepartment',
            v_department
          )
      end
    );
  end if;

  return jsonb_build_object(
    'hostId',
    v_host_id,
    'fullName',
    v_full_name,
    'department',
    v_department,
    'active',
    p_active,
    'createdAt',
    v_created_at,
    'changed',
    v_changed
  );
end;
$function$;

-- =========================================================
-- Paginated staff administration
-- =========================================================

create or replace function public.get_admin_staff(
  p_page integer default 1,
  p_page_size integer default 10,
  p_search text default '',
  p_role text default 'all',
  p_active text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_page integer := p_page;
  v_page_size integer := p_page_size;

  v_search text :=
    lower(btrim(coalesce(p_search, '')));

  v_role text :=
    lower(btrim(coalesce(p_role, 'all')));

  v_active text :=
    lower(btrim(coalesce(p_active, 'all')));

  v_offset integer;
  v_total_count bigint := 0;
  v_total_pages integer := 0;
  v_staff jsonb := '[]'::jsonb;
begin
  if v_page is null
    or v_page < 1
    or v_page > 10000
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff page';
  end if;

  if v_page_size is null
    or v_page_size < 1
    or v_page_size > 10
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff page size';
  end if;

  if char_length(v_search) > 120 then
    raise exception using
      errcode = '22023',
      message = 'Staff search is too long';
  end if;

  if v_role not in (
    'all',
    'receptionist',
    'admin'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff role filter';
  end if;

  if v_active not in (
    'all',
    'active',
    'inactive'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff status filter';
  end if;

  v_offset := (v_page - 1) * v_page_size;

  select count(*)
  into v_total_count
  from public.staff_profiles as staff
  join auth.users as auth_user
    on auth_user.id = staff.user_id
  where (
      v_search = ''
      or strpos(
        lower(staff.full_name),
        v_search
      ) > 0
      or strpos(
        lower(coalesce(auth_user.email, '')),
        v_search
      ) > 0
    )
    and (
      v_role = 'all'
      or staff.role = v_role
    )
    and (
      v_active = 'all'
      or (
        v_active = 'active'
        and staff.active = true
      )
      or (
        v_active = 'inactive'
        and staff.active = false
      )
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
      jsonb_build_object(
        'userId',
        admin_staff.user_id,
        'fullName',
        admin_staff.full_name,
        'email',
        admin_staff.email,
        'role',
        admin_staff.role,
        'active',
        admin_staff.active,
        'emailConfirmed',
        admin_staff.email_confirmed_at
          is not null,
        'lastSignInAt',
        admin_staff.last_sign_in_at,
        'createdAt',
        admin_staff.created_at
      )
      order by
        lower(admin_staff.full_name),
        admin_staff.user_id
    ),
    '[]'::jsonb
  )
  into v_staff
  from (
    select
      staff.user_id,
      staff.full_name,
      auth_user.email,
      staff.role,
      staff.active,
      auth_user.email_confirmed_at,
      auth_user.last_sign_in_at,
      auth_user.created_at
    from public.staff_profiles as staff
    join auth.users as auth_user
      on auth_user.id = staff.user_id
    where (
        v_search = ''
        or strpos(
          lower(staff.full_name),
          v_search
        ) > 0
        or strpos(
          lower(coalesce(auth_user.email, '')),
          v_search
        ) > 0
      )
      and (
        v_role = 'all'
        or staff.role = v_role
      )
      and (
        v_active = 'all'
        or (
          v_active = 'active'
          and staff.active = true
        )
        or (
          v_active = 'inactive'
          and staff.active = false
        )
      )
    order by
      lower(staff.full_name),
      staff.user_id
    limit v_page_size
    offset v_offset
  ) as admin_staff;

  return jsonb_build_object(
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
    'staff',
    v_staff
  );
end;
$function$;

-- =========================================================
-- Complete a staff invitation
-- =========================================================

create or replace function
  public.create_invited_staff_profile(
    p_actor_id uuid,
    p_user_id uuid,
    p_full_name text,
    p_role text
  )
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_full_name text :=
    btrim(coalesce(p_full_name, ''));

  v_role text :=
    lower(btrim(coalesce(p_role, '')));

  v_email text;
  v_email_confirmed_at timestamp with time zone;
  v_created_at timestamp with time zone;
begin
  if p_actor_id is null
    or not exists (
      select 1
      from public.staff_profiles as actor
      where actor.user_id = p_actor_id
        and actor.active = true
        and actor.role = 'admin'
    )
  then
    raise exception using
      errcode = '42501',
      message =
        'Administrator account is not authorised';
  end if;

  if p_user_id is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid invited user';
  end if;

  if char_length(v_full_name)
    not between 2 and 120
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff name';
  end if;

  if v_role not in (
    'receptionist',
    'admin'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff role';
  end if;

  select
    auth_user.email,
    auth_user.email_confirmed_at,
    auth_user.created_at
  into
    v_email,
    v_email_confirmed_at,
    v_created_at
  from auth.users as auth_user
  where auth_user.id = p_user_id;

  if not found or v_email is null then
    raise exception using
      errcode = 'P0002',
      message = 'Invited Auth user was not found';
  end if;

  if exists (
    select 1
    from public.staff_profiles as staff
    where staff.user_id = p_user_id
  ) then
    raise exception using
      errcode = '23505',
      message =
        'Staff profile already exists';
  end if;

  insert into public.staff_profiles (
    user_id,
    full_name,
    role,
    active
  )
  values (
    p_user_id,
    v_full_name,
    v_role,
    true
  );

  insert into public.audit_events (
    actor_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    p_actor_id,
    'staff.invited',
    'staff_profile',
    p_user_id::text,
    jsonb_build_object(
      'role',
      v_role,
      'active',
      true
    )
  );

  return jsonb_build_object(
    'userId',
    p_user_id,
    'fullName',
    v_full_name,
    'email',
    v_email,
    'role',
    v_role,
    'active',
    true,
    'emailConfirmed',
    v_email_confirmed_at is not null,
    'lastSignInAt',
    null,
    'createdAt',
    v_created_at
  );
end;
$function$;

-- =========================================================
-- Update an existing staff profile
-- =========================================================

create or replace function public.update_admin_staff(
  p_actor_id uuid,
  p_user_id uuid,
  p_full_name text,
  p_role text,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_full_name text :=
    btrim(coalesce(p_full_name, ''));

  v_role text :=
    lower(btrim(coalesce(p_role, '')));

  v_previous_full_name text;
  v_previous_role text;
  v_previous_active boolean;

  v_email text;
  v_email_confirmed_at timestamp with time zone;
  v_last_sign_in_at timestamp with time zone;
  v_created_at timestamp with time zone;

  v_changed boolean;
begin
  if p_actor_id is null
    or not exists (
      select 1
      from public.staff_profiles as actor
      where actor.user_id = p_actor_id
        and actor.active = true
        and actor.role = 'admin'
    )
  then
    raise exception using
      errcode = '42501',
      message =
        'Administrator account is not authorised';
  end if;

  if p_user_id is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff user';
  end if;

  if char_length(v_full_name)
    not between 2 and 120
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff name';
  end if;

  if v_role not in (
    'receptionist',
    'admin'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff role';
  end if;

  if p_active is null then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff status';
  end if;

  select
    staff.full_name,
    staff.role,
    staff.active,
    auth_user.email,
    auth_user.email_confirmed_at,
    auth_user.last_sign_in_at,
    auth_user.created_at
  into
    v_previous_full_name,
    v_previous_role,
    v_previous_active,
    v_email,
    v_email_confirmed_at,
    v_last_sign_in_at,
    v_created_at
  from public.staff_profiles as staff
  join auth.users as auth_user
    on auth_user.id = staff.user_id
  where staff.user_id = p_user_id
  for update of staff;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Staff profile was not found';
  end if;

  -- Administrators cannot remove their own administrative
  -- access or deactivate their own account.
  if p_user_id = p_actor_id
    and (
      v_role <> 'admin'
      or p_active = false
    )
  then
    raise exception using
      errcode = '55000',
      message =
        'Administrators cannot remove their own access';
  end if;

  -- Preserve at least one active administrator.
  if v_previous_role = 'admin'
    and v_previous_active = true
    and (
      v_role <> 'admin'
      or p_active = false
    )
    and not exists (
      select 1
      from public.staff_profiles as other_admin
      where other_admin.user_id <> p_user_id
        and other_admin.role = 'admin'
        and other_admin.active = true
    )
  then
    raise exception using
      errcode = '55000',
      message =
        'At least one active administrator is required';
  end if;

  v_changed :=
    v_previous_full_name is distinct from
      v_full_name
    or v_previous_role is distinct from
      v_role
    or v_previous_active is distinct from
      p_active;

  if v_changed then
    update public.staff_profiles
    set
      full_name = v_full_name,
      role = v_role,
      active = p_active
    where user_id = p_user_id;

    insert into public.audit_events (
      actor_id,
      action,
      entity_type,
      entity_id,
      details
    )
    values (
      p_actor_id,
      'staff.updated',
      'staff_profile',
      p_user_id::text,
      jsonb_build_object(
        'nameChanged',
        v_previous_full_name
          is distinct from v_full_name,
        'previousRole',
        v_previous_role,
        'newRole',
        v_role,
        'previousActive',
        v_previous_active,
        'newActive',
        p_active
      )
    );
  end if;

  return jsonb_build_object(
    'userId',
    p_user_id,
    'fullName',
    v_full_name,
    'email',
    v_email,
    'role',
    v_role,
    'active',
    p_active,
    'emailConfirmed',
    v_email_confirmed_at is not null,
    'lastSignInAt',
    v_last_sign_in_at,
    'createdAt',
    v_created_at,
    'changed',
    v_changed
  );
end;
$function$;

-- =========================================================
-- Function permissions
-- =========================================================

revoke all
  on function public.get_admin_hosts(
    integer,
    integer,
    text,
    text
  )
  from public, anon, authenticated;

grant execute
  on function public.get_admin_hosts(
    integer,
    integer,
    text,
    text
  )
  to service_role;

revoke all
  on function public.save_admin_host(
    uuid,
    uuid,
    text,
    text,
    boolean
  )
  from public, anon, authenticated;

grant execute
  on function public.save_admin_host(
    uuid,
    uuid,
    text,
    text,
    boolean
  )
  to service_role;

revoke all
  on function public.get_admin_staff(
    integer,
    integer,
    text,
    text,
    text
  )
  from public, anon, authenticated;

grant execute
  on function public.get_admin_staff(
    integer,
    integer,
    text,
    text,
    text
  )
  to service_role;

revoke all
  on function
    public.create_invited_staff_profile(
      uuid,
      uuid,
      text,
      text
    )
  from public, anon, authenticated;

grant execute
  on function
    public.create_invited_staff_profile(
      uuid,
      uuid,
      text,
      text
    )
  to service_role;

revoke all
  on function public.update_admin_staff(
    uuid,
    uuid,
    text,
    text,
    boolean
  )
  from public, anon, authenticated;

grant execute
  on function public.update_admin_staff(
    uuid,
    uuid,
    text,
    text,
    boolean
  )
  to service_role;

comment on function public.get_admin_hosts(
  integer,
  integer,
  text,
  text
)
is
  'Returns protected and paginated host administration records.';

comment on function public.save_admin_host(
  uuid,
  uuid,
  text,
  text,
  boolean
)
is
  'Creates or updates a host and records the administrator action.';

comment on function public.get_admin_staff(
  integer,
  integer,
  text,
  text,
  text
)
is
  'Returns protected and paginated staff administration records.';

comment on function
  public.create_invited_staff_profile(
    uuid,
    uuid,
    text,
    text
  )
is
  'Creates the authorised staff profile for a newly invited Auth user.';

comment on function public.update_admin_staff(
  uuid,
  uuid,
  text,
  text,
  boolean
)
is
  'Updates a staff profile while protecting administrator continuity.';

commit;