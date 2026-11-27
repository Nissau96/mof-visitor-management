-- Staff sign-in methods: Microsoft (Entra ID) or password.
--
-- Receptionists and administrators move to "Sign in with Microsoft".
-- Intern/NSP accounts and one emergency administrator keep email and password.
-- requireActiveStaff (api/_lib/staffAuth.js) refuses a session whose
-- sign-in method does not match the profile, and refuses password
-- accounts after access_expires_at.
--
-- Every existing account starts as 'password', so nothing changes
-- until an administrator switches a person to Microsoft.

begin;

-- is_nsp marks Intern/NSP accounts: receptionist duties, but no
-- Analytics & Reports. It is explicit rather than inferred from a
-- password sign-in, because existing receptionists stay on password
-- until each one is switched to Microsoft.
alter table public.staff_profiles
  add column if not exists sign_in_method text not null default 'password',
  add column if not exists access_expires_at timestamptz,
  add column if not exists is_nsp boolean not null default false;

alter table public.staff_profiles
  drop constraint if exists staff_profiles_sign_in_method_check;

alter table public.staff_profiles
  add constraint staff_profiles_sign_in_method_check
  check (sign_in_method in ('password', 'microsoft'));

comment on column public.staff_profiles.sign_in_method is
  'How this person signs in: microsoft (Entra ID) or password (Intern/NSP accounts and the emergency administrator).';

comment on column public.staff_profiles.access_expires_at is
  'Staff access ends at this time (00:00 Accra on the end date). Required for Intern/NSP password accounts.';

comment on column public.staff_profiles.is_nsp is
  'Intern/NSP account: receptionist duties without Analytics & Reports.';

notify pgrst, 'reload schema';

commit;
