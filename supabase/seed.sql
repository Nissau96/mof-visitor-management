-- Development data only.
-- Replace these invented records before user acceptance testing.
-- Never add real visitor information to a repository seed file.

insert into public.hosts (full_name, department)
values
  ('Test Host One', 'ICT Directorate'),
  ('Test Host Two', 'Administration Division'),
  ('Test Host Three', 'Finance Division')
on conflict do nothing;

-- Staff accounts must first be created in Supabase Authentication.
-- After creating an authorised test user, copy the auth.users UUID and run:
--
-- insert into public.staff_profiles (user_id, full_name, role)
-- values ('PASTE-AUTH-USER-UUID', 'Test Administrator', 'admin');
