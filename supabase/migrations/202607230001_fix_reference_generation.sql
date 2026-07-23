begin;

alter function public.register_first_visit(
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
set search_path = public, extensions;

commit;