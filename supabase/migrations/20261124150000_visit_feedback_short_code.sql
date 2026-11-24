-- A short code for the SMS feedback link (mofv.vercel.app/f/<code>), so
-- the message carries 8 characters instead of the 43-character token.
-- The code opens the same feedback form; one answer per visit and the
-- 7-day expiry still apply. Codes avoid look-alike characters.

alter table public.visit_feedback
  add column short_code text
    check (short_code is null or short_code ~ '^[A-HJ-NP-Za-km-z2-9]{8}$');

alter table public.visit_feedback
  add constraint visit_feedback_short_code_key unique (short_code);
