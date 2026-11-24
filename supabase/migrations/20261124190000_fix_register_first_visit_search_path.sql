-- First-visit registration failed with "function gen_random_bytes(integer)
-- does not exist": register_first_visit (redefined in
-- 20261119090000_wifi_access_and_floors) runs with search_path = public,
-- but pgcrypto, which provides gen_random_bytes, is installed in the
-- extensions schema. Adding extensions to the function's search path
-- fixes the reference-code generation without changing the function body.

alter function public.register_first_visit(
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
  set search_path = public, extensions;
