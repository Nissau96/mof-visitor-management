# WhatsApp and SMS visitor notifications — design

Date: 2026-11-22
Status: approved in conversation, ready for planning

## Intent

Visitors miss SMS and email. Most visitors in Ghana use WhatsApp, so the
messages that matter most to a visitor should arrive there, with SMS as a
safety net so nobody is left without their booking confirmation or Wi-Fi
details. At the same time, SMS moves to SasuSync, a Ghanaian provider
that bills in cedis, costs GHS 0.034–0.050 per SMS, and offers an
idempotency key and a sandbox that the current Hubtel integration lacks.

## Goals

1. Send three visitor messages on WhatsApp first:
   - booking confirmation,
   - reminder the day before the visit,
   - guest Wi-Fi details.
2. Fall back to SMS when WhatsApp cannot deliver (rules below).
3. Make SasuSync the Production SMS provider. Hubtel and Arkesel stay
   selectable through `SMS_PROVIDER`.
4. Record every outbound WhatsApp and SMS message and its delivery status.
5. Show reception whether each message reached the visitor.

## Non-goals (first version)

- A resend button for staff.
- SMS fallback for WhatsApp messages that are merely slow (no delivery
  receipt after N minutes). Vercel Hobby cron runs only daily, and a slow
  message usually arrives once the phone is back online.
- Moving the returning-visitor one-time code to WhatsApp. It stays on
  plain SMS.
- SasuSync's own OTP product (GHS 0.08). The app already generates and
  verifies codes; plain SMS (GHS 0.05) is enough.
- Marketing or broadcast messages of any kind.

## Anti-goals

- Storing message bodies. The Wi-Fi message contains the network
  password; a second copy of it in a log table is a failure even if
  everything else works.
- A notification failure breaking a booking, registration or Wi-Fi grant.
  The existing rule in `notifyInviteBooked` ("Nothing here can fail the
  booking") holds for every new path.
- Any visitor receiving the same message twice because of a retry.
- Secrets in git. `.env.example` carries empty placeholders only.

## Constraints

- **Purchasing:** the provider must bill in Ghana cedis. This favours
  SasuSync, Hubtel and Arkesel. Meta bills WhatsApp in USD by card; if
  Ministry finance cannot approve that, WhatsApp goes through Arkesel
  instead (see Decisions).
- **Hosting:** Vercel serverless functions in `api/`. No fixed outbound
  IP, so SasuSync keys must not use an IP allowlist.
- **Cron:** Vercel Hobby allows daily cron jobs only. The project has no
  cron yet; the reminder job is the first.
- **Time zone:** Africa/Accra is UTC+0 with no daylight saving.
  `api/_lib/staffNotifications.js` already relies on this.
- **WhatsApp rules:** a business can start a conversation only with a
  Meta-approved template. All three templates are Utility category.
  Promotional wording gets reclassified and billed as Marketing.
- **Data protection (Act 843):** visitors must be told that their number
  is shared with Meta/WhatsApp and SasuSync. The privacy notice is updated
  accordingly.
- **Retention:** the new log table is a transient record and is purged by
  the existing `transient_record_retention` policy in
  `supabase/migrations/20260814093000_add_data_retention_controls.sql`.

## Current state (as of this design)

- `src/server/smsSender.js` — provider switch (`hubtel`, `arkesel`) via
  `SMS_PROVIDER`; with no provider outside Production it logs instead of
  sending; 10-second timeout; `sendSms()` and `sendVisitorCodeSms()`.
- `src/server/visitorInviteEmail.js` — `notifyInviteBooked()` sends host
  email, visitor email and visitor SMS with `Promise.allSettled`; called
  from `api/register.js`.
- `src/server/wifiCredentials.js` — `deliverWifiCredentials()` sends by
  the chosen channels (`sms`, `email`); called from `api/meetings.js`.
- `api/returning/verify.js` — sends the returning-visitor code by SMS.
- Phone fields labelled "Phone number" in `src/pages/NewVisitorPage.jsx`
  and `src/pages/VisitorInvitePage.jsx`, and "Mobile number" in
  `src/components/BookingGuestFields.jsx` and
  `src/components/BookingGuestRoster.jsx`.
- No record of delivery outcomes, no scheduled jobs.

## Decisions (made by the product owner)

| # | Decision |
|---|---|
| D1 | WhatsApp carries booking confirmation, day-before reminder and Wi-Fi details. The returning code stays on SMS. |
| D2 | If WhatsApp fails, send SMS. |
| D3 | WhatsApp goes direct to Meta's Cloud API. If Meta Business verification is blocked, or USD card billing is refused, use Arkesel's WhatsApp API (already an SMS provider in the code). |
| D4 | Consent is a clear notice on the phone field, no checkbox. Label: "Phone/WhatsApp number". |
| D5 | Providers must bill in cedis. |
| D6 | SasuSync is the Production SMS provider; Hubtel and Arkesel stay available. |
| D7 | Build with log-only mode until Meta credentials exist. The product owner's side sets up the Meta account (Appendix A). |
| D8 | Every WhatsApp and SMS message is logged with delivery status, updated by signed webhooks. |
| D9 | Reminder at 16:00 Accra the day before, only for visits booked at least one day ahead. |
| D10 | Returning code uses plain SasuSync SMS, not SasuSync OTP. |
| D11 | SMS fallback happens in two cases only: WhatsApp rejects at send time, or a WhatsApp webhook later reports `failed`. |
| D12 | The log keeps visit, channel, template, provider message id, status, error and last four phone digits. No message text. |
| D13 | Reception sees a read-only delivery line per message in visit details. No resend button. |
| D14 | Ship as three PRs: (1) SasuSync, (2) log + `notify()` + WhatsApp + webhooks, (3) reminder cron. Order superseded by P7 (Demo phase). |
| D15 | SMS sender ID: `MoFVisitor`. |

## Design

### PR 1 — SasuSync SMS provider

Add a `sasusync` entry to `PROVIDERS` in `src/server/smsSender.js`.

- `POST https://sms.sasusync.com/api/v1/send`
- Header `X-API-Key: ${SASUSYNC_API_KEY}`
- Header `Idempotency-Key`: supplied by the caller (see below); falls
  back to a random UUID when the caller gives none.
- Body: `{ "sender": SMS_SENDER_ID, "recipients": ["233…"], "message": "…", "metadata": { … } }`
- Success: `success: true` and `data.status` of `queued`. A response with
  `queued: true` is accepted, not failed, and must not be resent.
- The provider returns `data.task_id`. `sendSms()` changes to return
  `{ provider, providerMessageId }` (currently returns nothing) so PR 2
  can log it. Existing callers ignore the return value, so this is
  backward compatible.
- Error mapping: 401/403 → `SmsUnavailableError` (configuration problem);
  402 → error with a clear "SasuSync credit exhausted" message so
  operators can top up; other non-2xx → generic provider error as today.
- Sandbox: when `SASUSYNC_SANDBOX=true`, post to
  `https://sms.sasusync.com/smssandbox/v1/send` instead. Used in Preview
  deployments and manual testing.

Configuration changes:

- `SMS_PROVIDER` comment lists `sasusync`, `hubtel`, `arkesel`.
- `SMS_SENDER_ID` default changes from `MoF-Visitor` to `MoFVisitor`
  (`DEFAULT_SMS_SENDER_ID` and `.env.example`). The existing validator
  already accepts it.
- New placeholders in `.env.example`: `SASUSYNC_API_KEY=`,
  `SASUSYNC_WEBHOOK_SECRET=`, `SASUSYNC_SANDBOX=`.

Tests: unit tests in `tests/unit` alongside existing SMS tests, using the
injected `fetchImplementation`: request shape, headers, sandbox URL,
`queued` handling, 402 and 403 mapping.

### PR 2 — notification log, `notify()`, WhatsApp, webhooks

#### Migration: `notification_log`

```sql
create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references public.visits(id) on delete cascade,
  purpose text not null,            -- 'booking_confirmation' | 'visit_reminder' | 'wifi_details'
  channel text not null,            -- 'whatsapp' | 'sms'
  provider text not null,           -- 'meta' | 'arkesel' | 'sasusync' | 'hubtel' | 'log'
  template text,                    -- WhatsApp template name; null for SMS
  provider_message_id text,
  status text not null,             -- 'accepted' | 'sent' | 'delivered' | 'read' | 'failed' | 'expired'
  error text,                       -- provider error code/description, no PII
  phone_last4 text not null,
  fallback_of uuid references public.notification_log(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_message_id)
);
```

- Row-level security on; no access for `anon` or `authenticated`. All
  reads and writes go through the service role in `api/`, as the rest of
  the server-side tables do.
- The existing purge function deletes rows older than
  `transient_record_retention`, the same as other transient records.
- `visit_id` is nullable only if a booking can exist before its visit row;
  the planner confirms against `api/register.js` and `api/meetings.js`.
- Status only moves forward (`accepted < sent < delivered < read`;
  `failed` and `expired` are terminal). Webhook updates that would move a
  status backwards are ignored, so duplicate and out-of-order events are
  safe.
- The visit's own row is not changed.

#### `src/server/whatsappSender.js`

Mirrors `smsSender.js`:

- `WHATSAPP_PROVIDER`: `meta` or `arkesel`. Empty outside Production →
  log mode (writes `[whatsapp:development] To … template …` to the server
  log). Empty in Production → `WhatsappUnavailableError`, and `notify()`
  goes straight to SMS.
- `meta`: `POST https://graph.facebook.com/v{WHATSAPP_GRAPH_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages`,
  `Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}`, body
  `{ messaging_product: "whatsapp", to, type: "template", template: { name, language: { code: "en" }, components: [ { type: "body", parameters: [...] } ] } }`.
  Returns `messages[0].id` as the provider message id.
- `arkesel`: Arkesel WhatsApp template endpoint. Exact request shape is
  left to the builder from Arkesel's current WhatsApp API docs; it must
  return a message id and accept a status webhook, or it does not qualify.
- 10-second timeout, same as SMS.

#### `src/server/notify.js`

One function every visitor-facing message goes through:

```js
notify({ purpose, visitId, phone, whatsapp: { template, parameters }, sms: { message } })
// → { channel, status }   never throws
```

1. If WhatsApp is configured (or in log mode), send the template.
   - Accepted → insert log row `channel='whatsapp', status='accepted'`, return.
   - Rejected at send time (any error, including Meta "not a WhatsApp
     user" and `WhatsappUnavailableError`) → insert a `failed` row, then
     go to step 2.
2. Send SMS with `Idempotency-Key = <whatsapp log row id or a new uuid>`.
   Insert a log row `channel='sms'` with `fallback_of` pointing at the
   WhatsApp row.
3. Logging failures are caught and written to the server log; they never
   fail the caller.

The SMS text for each purpose is kept beside the template definition so
WhatsApp and SMS say the same thing.

Callers change:

- `notifyInviteBooked()` in `src/server/visitorInviteEmail.js`: the
  `visitorSms` task becomes `notify({ purpose: 'booking_confirmation', … })`.
  Email tasks are unchanged.
- `deliverWifiCredentials()` in `src/server/wifiCredentials.js`: the `sms`
  channel becomes "phone" and goes through `notify({ purpose: 'wifi_details', … })`.
  Email is unchanged. The `delivered` list reports `whatsapp` or `sms`
  according to what went out.
- `api/returning/verify.js` is not changed (D1, D10).

#### Webhooks

`api/webhooks/whatsapp.js`

- `GET`: Meta verification handshake. Return `hub.challenge` only when
  `hub.verify_token` equals `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
- `POST`: read the raw body; verify `X-Hub-Signature-256` as
  `sha256=` + hex HMAC-SHA256 of the raw body with `WHATSAPP_APP_SECRET`,
  compared in constant time. Reject with 401 on mismatch.
- For each `entry[].changes[].value.statuses[]`, update the log row
  matching `(provider='meta', provider_message_id=status.id)`.
- When a status becomes `failed` and that row has no SMS fallback yet,
  run the SMS fallback (D11). The idempotency key is the WhatsApp log row
  id, so a duplicate webhook cannot send a second SMS.
- Respond 200 quickly. Unknown message ids are ignored, still 200.

`api/webhooks/sasusync.js`

- `POST` only. Verify `X-Webhook-Signature` = hex HMAC-SHA256 of the raw
  body with `SASUSYNC_WEBHOOK_SECRET`, constant-time compare.
- Events `sent`, `delivered`, `failed`, `expired` update the row matching
  `(provider='sasusync', provider_message_id=data.message_id)`.
  `low_balance` is written to the server log as a warning;
  `topup_succeeded` is ignored.
- Respond 200 within 10 seconds. Duplicates and out-of-order events are
  handled by the forward-only status rule.

Both endpoints are excluded from the staff-auth and public rate-limit
middleware in a way that keeps signature checking as the gate. They
must keep the existing security headers (`vercel.json`). Both need raw
body access; the builder confirms how Vercel functions in this project
expose it (disable the body parser for these routes if needed).

#### Form and privacy notice

- Rename the phone field label to "Phone/WhatsApp number" in
  `NewVisitorPage.jsx` (both occurrences), `VisitorInvitePage.jsx`,
  `BookingGuestFields.jsx` and `BookingGuestRoster.jsx`.
  `ReturningCodeLookup.jsx` keeps "Mobile number" because that flow is
  SMS-only.
- Helper text under the field where booking or Wi-Fi messages apply:
  "Ministry of Finance will send your booking and Wi-Fi details on
  WhatsApp, or by SMS if WhatsApp isn't available."
- `src/components/PrivacyNotice.jsx`: add that the mobile number is
  shared with Meta (WhatsApp) and the SMS provider to deliver booking,
  reminder and Wi-Fi messages, and that delivery records are kept for the
  transient retention period. Bump the privacy notice version the way the
  project already versions it, so new acknowledgements record the new
  text.

#### Reception view

- `src/components/history/VisitDetailDrawer.jsx` gets a read-only
  "Messages" section: one line per log row for that visit, for example
  "Booking confirmation — delivered on WhatsApp" or
  "Wi-Fi details — WhatsApp failed, SMS delivered".
- Data comes from the existing visit-details API path
  (`api/_lib/visitDetails.js`), scoped by the same tower authorisation as
  the rest of the visit.
- No resend button (D13).

### PR 3 — day-before reminder

- `vercel.json` gets `"crons": [{ "path": "/api/cron/visit-reminders", "schedule": "0 16 * * *" }]`.
  16:00 UTC is 16:00 Accra.
- `api/cron/visit-reminders.js`:
  - Accepts only requests with `Authorization: Bearer ${CRON_SECRET}`
    (Vercel sends this automatically when `CRON_SECRET` is set).
  - Selects visits scheduled for tomorrow (Accra date), whose booking was
    created before today (Accra date), with a visitor phone, not
    cancelled, and with no existing `visit_reminder` log row.
  - Calls `notify({ purpose: 'visit_reminder', … })` for each, one at a
    time or in small batches, inside the function time limit.
- The "no existing log row" check makes reruns safe.

## Configuration summary (all Vercel settings; empty placeholders in `.env.example`)

| Name | PR | Purpose |
|---|---|---|
| `SMS_PROVIDER` | 1 | `sasusync` in Production |
| `SMS_SENDER_ID` | 1 | `MoFVisitor` |
| `SASUSYNC_API_KEY` | 1 | SasuSync API key |
| `SASUSYNC_SANDBOX` | 1 | `true` on Preview |
| `SASUSYNC_WEBHOOK_SECRET` | 2 | Verifies SasuSync webhooks |
| `WHATSAPP_PROVIDER` | 2 | `meta` or `arkesel` |
| `WHATSAPP_PHONE_NUMBER_ID` | 2 | Meta phone number id |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | 2 | Meta WhatsApp Business account id |
| `WHATSAPP_ACCESS_TOKEN` | 2 | System-user token |
| `WHATSAPP_APP_SECRET` | 2 | Verifies Meta webhooks |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | 2 | Meta webhook handshake |
| `WHATSAPP_GRAPH_VERSION` | 2 | Graph API version, pinned |
| `CRON_SECRET` | 3 | Authenticates the cron call |

## WhatsApp templates (Utility, English)

| Name | Body (draft) | Parameters |
|---|---|---|
| `visit_booked` | Ministry of Finance: your visit on {{1}} with {{2}} is booked. Show code {{3}} at reception. | date, host, reference code |
| `visit_reminder` | Ministry of Finance: reminder of your visit tomorrow, {{1}} at {{2}}. Show code {{3}} at reception. | date, time, reference code |
| `wifi_details` | Ministry of Finance guest Wi-Fi. Network: {{1}}. Password: {{2}}. Valid until {{3}}. | network, password, expiry |

The SMS fallback texts match these, filled in.

## Testing

- Unit (Vitest, `tests/unit`): SasuSync provider; Meta and Arkesel
  WhatsApp senders; `notify()` fallback paths (accepted, rejected,
  not configured, log mode); webhook signature verification (valid,
  tampered body, missing header); forward-only status updates; duplicate
  `failed` webhook sends one SMS only; cron selection rules (same-day
  booking excluded, already-reminded excluded).
- Validation scripts: add a `check:notifications` script in the style of
  the existing `scripts/check-*-validation.mjs`, and add it to
  `check:validation`.
- E2E (Playwright): the phone label and helper text, and the Messages
  section in the visit detail drawer, against log-mode providers.

## Rollout

1. Merge PR 1. Set `SMS_PROVIDER=sasusync`, `SASUSYNC_SANDBOX=true` on
   Preview; verify; then set Production values once `MoFVisitor` is
   approved.
2. Merge PR 2 with `WHATSAPP_PROVIDER` empty in Production. Everything
   goes to SMS through `notify()` and is logged. Turn on WhatsApp when
   Appendix A is complete.
3. Merge PR 3 after PR 2 has run in Production for a few days.

## Left to the builder

- Exact module boundaries inside `api/` and naming of helper functions.
- How raw request bodies are read for webhook signature checks on Vercel.
- Arkesel WhatsApp request details, if that path is needed.
- The exact SQL for the cron selection, against the real `visits` and
  booking columns.
- Batch size for the cron job.

## Calls made by the designer (not explicitly decided by the product owner)

- No IP allowlist on SasuSync keys, because Vercel has no fixed IP.
- `sendSms()` starts returning `{ provider, providerMessageId }`.
- `SASUSYNC_SANDBOX` flag for Preview deployments.
- Webhook-reported WhatsApp failures trigger the SMS fallback from the
  webhook handler, keyed on the WhatsApp log row id for idempotency.
- Reminders cover both visitor invites (`api/register.js`) and meeting
  booking guests (`api/meetings.js`) with a phone number.
- `ReturningCodeLookup.jsx` keeps the "Mobile number" label.
- Privacy notice updated and version bumped (required by Act 843).
- Rollout runs PR 2 with WhatsApp off first.

---

## Demo phase (product owner's company account)

Added 2026-11-23. The Ministry has no Meta or SMS account yet. Until it
does, development and demos run on the product owner's company accounts.
The Ministry setup in Appendices A and B still applies later. Moving to the
Ministry changes environment variables and templates only, not code.

### Decisions

| # | Decision |
|---|---|
| P1 | WhatsApp is sent from Meta's free Cloud API **test number**, under the company's Meta Business portfolio. The company mobile is one of the allowed recipients, not the sender. A real sender number is registered only under the Ministry's account. |
| P2 | Demo templates are created in the company's WhatsApp Business account with the same names and parameters (`visit_booked`, `visit_reminder`, `wifi_details`) and **neutral wording**. The fixed text does not claim to be the Ministry. The Ministry account later re-creates the same names with official wording. |
| P3 | Demo SMS uses **Arkesel** (`SMS_PROVIDER=arkesel`, already supported): the 10 free sign-up credits first, then Arkesel top-ups. The no-expiry plan is GHS 20 = 645 SMS (≈ GHS 0.031 each, cheaper than SasuSync's GHS 0.05 at that size; Arkesel price list, 2026-11-23). The demo sender ID is `MOFVMSDEMO`, requested 2026-11-23. Set `SMS_SENDER_ID=MOFVMSDEMO` once Arkesel approves it, because the code default `MoF-Visitor` is not registered there. SasuSync remains the planned Ministry Production provider (D6). |
| P4 | Company credentials go only into Vercel **Development and Preview** environments. Production stays empty, so it remains in log mode or later uses the Ministry's own keys. |
| P5 | The dev deployment is behind Vercel Standard Protection (`all_except_custom_domains`, checked 2026-11-23). Meta's webhook callback is the dev branch's stable alias with Vercel's protection-bypass secret as a query parameter: `https://<dev-alias>/api/webhooks/whatsapp?x-vercel-protection-bypass=<secret>`. The secret goes into Meta's dashboard only, never into git. The `X-Hub-Signature-256` check stays the real gate. |
| P6 | Demos use only consenting staff or test numbers on the test number's 5-recipient allowlist. No real visitor data is sent through the company accounts (Act 843). |
| P7 | Build order changes from D14. (1) Notification log, `notify()`, Meta WhatsApp and webhooks; SMS fallback goes through the existing Arkesel provider, and `sendSms()` returns `{ provider, providerMessageId }`. (2) SasuSync provider. (3) Reminder cron. |

### Demo setup (done by the product owner)

1. At business.facebook.com, use or create the company's business
   portfolio.
2. At developers.facebook.com, create a "Business" app linked to it and
   add the WhatsApp product. Meta creates a test WhatsApp Business
   account and test number. Test numbers need no payment method and no
   business verification.
3. Under API Setup, add up to 5 recipient numbers (the company mobile
   and demo staff phones). Each recipient confirms by code.
4. Send the pre-approved `hello_world` template once to confirm the
   setup works.
5. In WhatsApp Manager, create the three Utility templates with neutral
   wording (P2) and wait for approval.
6. Create a system user and a long-lived token (Appendix A, step 6). The
   24-hour token from API Setup is for a first try only.
7. Put the values into Vercel's Development and Preview environments
   only: `WHATSAPP_PROVIDER=meta`, `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_ACCESS_TOKEN`,
   `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`,
   `WHATSAPP_GRAPH_VERSION`.
8. After the first build is deployed to dev, set the webhook (P5) and
   subscribe to `messages`.
9. Arkesel: account created and sender ID `MOFVMSDEMO` requested
   (2026-11-23). Once Arkesel shows it as Approved, set
   `SMS_PROVIDER=arkesel`, `ARKESEL_API_KEY` and
   `SMS_SENDER_ID=MOFVMSDEMO` in Development and Preview only. Top up on
   the no-expiry plan when the balance runs low. If messages to
   AirtelTigo numbers fail, submit the "AT whitelisted" documents in
   Arkesel's Sender ID page.

### Draft neutral templates

| Name | Body (demo) |
|---|---|
| `visit_booked` | Visitor booking: your visit on {{1}} with {{2}} is booked. Show code {{3}} at reception. |
| `visit_reminder` | Visitor reminder: your visit is tomorrow, {{1}} at {{2}}. Show code {{3}} at reception. |
| `wifi_details` | Guest Wi-Fi details. Network: {{1}}. Password: {{2}}. Valid until {{3}}. |

### Moving to the Ministry

1. The Ministry completes Appendix A (verified portfolio, real number,
   payment method) and Appendix B (SasuSync, `MoFVisitor`).
2. Re-create the three templates under the Ministry's account with the
   official wording from "WhatsApp templates".
3. Replace the environment values, set Production for the first time, and
   point the webhooks at the production domain (no bypass secret needed
   on a custom domain).
4. Remove the company credentials from Vercel and revoke the company
   system-user token.

### Build notes (first build, 2026-11-24)

Where the first build differs from the design above:

- **Log link.** `notification_log` has `reference_code` and `meeting_id`
  instead of `visit_id`. An invite booking has no visit row until its
  day, but it shares its `VIS-` code with the visit created later.
  Meeting guests without a visit row are linked by `meeting_id`.
- **Cleanup.** The log is purged by a trigger on insert, which deletes
  rows older than `transient_record_retention`. This avoids rewriting
  `execute_data_retention_cleanup`. The privacy notice says "about 24
  hours" because cleanup runs when the next message is logged.
- **Webhook fallback.** A WhatsApp `failed` webhook re-sends by SMS only
  for booking confirmations, rebuilt from `visitor_invites`. A failed
  Wi-Fi message is shown as failed in the drawer, and staff resend it
  from the Wi-Fi page. Rebuilding it would need the password, which is
  never logged. Send-time WhatsApp failures fall back to SMS for every
  purpose.
- **Template language** is `en_US`, matching the Meta account.
- **Wi-Fi details go by SMS only (decided 2026-11-24).** Meta rejected
  `wifi_details` twice as "incorrect category": a password reads as
  Authentication content, which only allows Meta's one-time-code format.
  The product owner chose SMS only, so the password never passes through
  Meta. D1 now applies to booking confirmation and reminder only. The
  rejected template was deleted. `visit_booked` and `visit_reminder` were
  created on the test account through Meta's WhatsApp Business Tools MCP.
- **Endpoints.** The webhook is `api/webhooks.js` (Vercel function 11 of
  12), reached as `/api/webhooks/whatsapp`. The drawer reads
  `/api/staff/history/messages`, which goes to the history function.
- **Privacy notice version** is not bumped yet. `2.1` is hard-coded in the
  returning-visitor and meeting-guest database functions, so the bump
  needs its own migration.

### Visit feedback (added 2026-11-24)

- After a normal check-out (not lost-card or incident closures), the
  visitor gets one WhatsApp template, `visit_feedback`, with a "Rate your
  visit" URL button to `https://mof-visitor-management.vercel.app/feedback/<token>`.
  WhatsApp only, no SMS fallback.
- The token is 32 random bytes; only its SHA-256 hash is stored in
  `visit_feedback` (one row per visit, cascades with the visit, so it
  follows the two-year visitor-record retention). Links expire after
  7 days and take one answer: 1-5 stars and an optional comment of up
  to 1000 characters. The public endpoints are rate-limited.
- Administrators and the client service head see the results on
  **Visitor Feedback** (`/staff/feedback`): average, count per star,
  response rate, comments with the visit reference, and a CSV export.
  It is a separate page because the client service head has no access
  to Analytics & Reports.
- The privacy notice mentions the feedback message and the retention.

### Demo-phase sources (checked 2026-11-23)

- Meta test number, 5 free recipients, no payment method for test
  numbers:
  https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started
  and
  https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform
- Arkesel free sign-up (trial credit amount not published; check the
  dashboard): https://arkesel.com/?p=7091

---

## Appendix A — Setting up Meta's WhatsApp Cloud API

Done by the Ministry's IT or communications team. Check Meta's current
pages while doing this; the flow changes.

1. **Business portfolio.** At business.facebook.com, sign in with a
   Ministry account (not a personal one). Create a portfolio under the
   Ministry's legal name. Add at least two administrators.
2. **Business verification.** Business Settings → Security Centre →
   Start verification. Provide the legal name, address and phone, an
   official document showing them, and a `mofep.gov.gh` email or website
   ownership proof. Expect days, possibly longer for a government body.
3. **Phone number.** Choose a number that can receive an SMS or call for
   verification and is not registered on the WhatsApp or WhatsApp
   Business phone apps (delete that account first if it is). Use a
   dedicated landline or new SIM, not a staff member's number.
4. **Developer app.** At developers.facebook.com, create a "Business"
   app linked to the portfolio and add the WhatsApp product. Meta's free
   test number (up to 5 recipients) is used during development.
5. **Register the real number.** App → WhatsApp → API Setup → Add phone
   number. Enter the display name (for example "Ministry of Finance
   Ghana"); Meta reviews it. Verify the number by code. Set a two-step
   verification PIN and store it safely.
6. **Long-lived token.** Business Settings → System users → add an Admin
   system user, assign the app and the WhatsApp account, generate a token
   with `whatsapp_business_messaging` and `whatsapp_business_management`.
   The API Setup page's temporary token expires after 24 hours and must
   not be used in Production.
7. **Payment method.** In WhatsApp Manager. Meta bills in USD by card. If
   finance cannot approve this, switch to Arkesel (D3).
8. **Templates.** WhatsApp Manager → Message templates → create
   `visit_booked`, `visit_reminder` and `wifi_details` as Utility,
   English, using the drafts above. Keep wording factual.
9. **Webhook.** After PR 2 is deployed: app → WhatsApp → Configuration.
   Callback URL `https://<domain>/api/webhooks/whatsapp`, verify token
   = `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, subscribe to the `messages` field.
10. **Hand over** as Vercel environment variables (never in git): phone
    number id, WhatsApp Business account id, system-user token, app
    secret, verify token.

References:
- https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started
- https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration/
- https://developers.facebook.com/docs/whatsapp/pricing

## Appendix B — Getting the SasuSync sender ID approved

1. **Account.** Sign up at https://sms.sasusync.com with a Ministry email.
   Buy a small non-expiring bundle (GHS 20 = 400 SMS).
2. **Name.** `MoFVisitor` (D15): letters only, 10 characters, no space or
   hyphen.
3. **Authorisation letter.** SasuSync refuses names resembling government
   bodies without authorisation. Prepare a short letter on Ministry
   letterhead, signed by an authorised officer, using SasuSync's template
   (ask their support).
4. **Apply** in the portal with the name, the letter, and a use
   description: "Visitor booking confirmations, visit codes and guest
   Wi-Fi details for Ministry of Finance visitors." SasuSync quotes
   5–10 minutes; allow longer with a letter.
5. **API keys.** Create one Production key and one test key. Do not set
   an IP allowlist. When PR 2 is live, set the Production key's webhook
   URL to `https://<domain>/api/webhooks/sasusync` and copy the signing
   secret immediately (shown once).
6. **Hand over** as Vercel environment variables: `SASUSYNC_API_KEY`,
   `SASUSYNC_WEBHOOK_SECRET`, `SMS_SENDER_ID=MoFVisitor`.

References:
- https://sms.sasusync.com/guides/sender-id-ghana
- https://sms.sasusync.com/docs/api
- https://sms.sasusync.com/pricing

## Appendix C — Provider comparison

| | SasuSync | Hubtel | Twilio | Meta direct (WhatsApp) | Arkesel |
|---|---|---|---|---|---|
| SMS price, Ghana | GHS 0.034–0.050 | Quote needed | USD 0.3741 per segment (Twilio page, undated) | — | Quote needed |
| WhatsApp | No | Not confirmed | Yes (Meta fee + Twilio fee) | ~USD 0.004 per utility message (third-party list, May 2026) | Yes, GHS 300/month platform fee |
| Billing | GHS prepaid, no contract | GHS invoice | USD card | USD card | GHS |
| In code today | No | Yes (SMS) | No | No | Yes (SMS) |
| Idempotency | Yes | No | Yes | — | Unknown |
| Sandbox | Yes | No | Yes | Test number | Yes |
| Delivery status | Webhook (HMAC-SHA256) or polling | Limited | Webhook | Webhook (HMAC-SHA256) | Webhook |
| Meets cedi constraint | Yes | Yes | No | Unclear | Yes |

Recommendation: SasuSync for SMS, Meta direct for WhatsApp, Arkesel as
the WhatsApp fallback route.
