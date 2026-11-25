-- Visitors now get an SMS when they register and when reception issues
-- their visitor card. Both are logged in notification_log like the
-- other visitor messages.

alter table public.notification_log
  drop constraint notification_log_purpose_check;

alter table public.notification_log
  add constraint notification_log_purpose_check
  check (
    purpose in (
      'booking_confirmation',
      'visit_reminder',
      'wifi_details',
      'visit_feedback',
      'registration_success',
      'card_issued'
    )
  );
