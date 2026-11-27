begin;

-- ============================================================
-- Host and staff administration summaries
-- ============================================================
-- Adds whole-table summaries (not page counts) for the stat cards,
-- the department list used for suggestions, the Setup pending and
-- Setup expired staff filters, and the Client Service Head role filter.

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
set search_path = pg_catalog, public, extensions, pg_temp
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

  v_all_count bigint := 0;
  v_active_count bigint := 0;
  v_inactive_count bigint := 0;
  v_departments jsonb := '[]'::jsonb;
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

  select
    count(*),
    count(*) filter (where host.active = true),
    count(*) filter (where host.active = false)
  into
    v_all_count,
    v_active_count,
    v_inactive_count
  from public.hosts as host;

  -- One spelling per department, ignoring case and surrounding spaces.
  select coalesce(
    jsonb_agg(
      department.name
      order by lower(department.name)
    ),
    '[]'::jsonb
  )
  into v_departments
  from (
    select min(btrim(host.department)) as name
    from public.hosts as host
    where btrim(host.department) <> ''
    group by lower(btrim(host.department))
  ) as department;

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
    v_hosts,
    'summary',
    jsonb_build_object(
      'totalCount',
      v_all_count,
      'activeCount',
      v_active_count,
      'inactiveCount',
      v_inactive_count,
      'departmentCount',
      jsonb_array_length(v_departments),
      'departments',
      v_departments
    )
  );
end;
$function$;

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
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_page integer := p_page;
  v_page_size integer := p_page_size;

  v_search text :=
    lower(
      btrim(
        coalesce(p_search, '')
      )
    );

  v_role text :=
    lower(
      btrim(
        coalesce(p_role, 'all')
      )
    );

  v_active text :=
    lower(
      btrim(
        coalesce(p_active, 'all')
      )
    );

  v_offset integer;
  v_total_count bigint := 0;
  v_total_pages integer := 0;
  v_staff jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  if (
    v_page is null
    or v_page < 1
    or v_page > 10000
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff page';
  end if;

  if (
    v_page_size is null
    or v_page_size < 1
    or v_page_size > 10
  ) then
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
    'client_service_head',
    'admin'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff role filter';
  end if;

  -- 'inactive' means a deactivated account. Setup pending and expired
  -- follow the temporary-password expiry, as the onboarding badge does.
  if v_active not in (
    'all',
    'active',
    'inactive',
    'setup_pending',
    'setup_expired'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid staff status filter';
  end if;

  v_offset :=
    (v_page - 1) * v_page_size;

  select jsonb_build_object(
    'totalCount',
    count(*),
    'adminCount',
    count(*) filter (where staff.role = 'admin'),
    'clientServiceHeadCount',
    count(*) filter (
      where staff.role = 'client_service_head'
    ),
    'receptionistCount',
    count(*) filter (
      where staff.role = 'receptionist'
    ),
    'activeCount',
    count(*) filter (where staff.active = true),
    'deactivatedCount',
    count(*) filter (where staff.active = false),
    'setupPendingCount',
    count(*) filter (
      where staff.password_change_required = true
        and (
          staff.temporary_password_expires_at is null
          or staff.temporary_password_expires_at > now()
        )
    ),
    'setupExpiredCount',
    count(*) filter (
      where staff.password_change_required = true
        and staff.temporary_password_expires_at <= now()
    )
  )
  into v_summary
  from public.staff_profiles as staff;

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
        lower(
          coalesce(
            auth_user.email,
            ''
          )
        ),
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
      or (
        v_active = 'setup_pending'
        and staff.password_change_required = true
        and (
          staff.temporary_password_expires_at is null
          or staff.temporary_password_expires_at > now()
        )
      )
      or (
        v_active = 'setup_expired'
        and staff.password_change_required = true
        and staff.temporary_password_expires_at <= now()
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
        admin_staff.created_at,
        'passwordChangeRequired',
        admin_staff.password_change_required,
        'temporaryPasswordExpiresAt',
        admin_staff.temporary_password_expires_at,
        'passwordSetupCompletedAt',
        admin_staff.password_setup_completed_at
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
      auth_user.created_at,
      staff.password_change_required,
      staff.temporary_password_expires_at,
      staff.password_setup_completed_at
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
          lower(
            coalesce(
              auth_user.email,
              ''
            )
          ),
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
        or (
          v_active = 'setup_pending'
          and staff.password_change_required = true
          and (
            staff.temporary_password_expires_at is null
            or staff.temporary_password_expires_at > now()
          )
        )
        or (
          v_active = 'setup_expired'
          and staff.password_change_required = true
          and staff.temporary_password_expires_at <= now()
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
    v_staff,
    'summary',
    v_summary
  );
end;
$function$;

-- create or replace keeps existing grants; restate them so this file
-- stands on its own.
revoke all
  on function public.get_admin_hosts(integer, integer, text, text)
  from public, anon, authenticated;

grant execute
  on function public.get_admin_hosts(integer, integer, text, text)
  to service_role;

revoke all
  on function public.get_admin_staff(integer, integer, text, text, text)
  from public, anon, authenticated;

grant execute
  on function public.get_admin_staff(integer, integer, text, text, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
