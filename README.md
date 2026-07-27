# Visitor Management Application

A simple, secure and mobile-first visitor registration and check-in application built with React.js, JavaScript, Tailwind CSS, Supabase and Vercel.

The implemented stages allow first-time visitors to register and check in. Returning visitors can locate a masked visitor record, verify ownership using their registered mobile number, enter current visit details and receive a new visit reference.

> Project status: Stage 7 returning-visitor check-in completed
>
> Current implementation stage: Stage 8 — Staff authentication and protected routes
>
> Documentation version: 2.2

## Table of contents

- [Project overview](#project-overview)
- [Core visitor workflow](#core-visitor-workflow)
- [Current implementation status](#current-implementation-status)
- [Technology stack](#technology-stack)
- [Project requirements](#project-requirements)
- [Getting started](#getting-started)
- [Available scripts](#available-scripts)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [Database overview](#database-overview)
- [Security and privacy](#security-and-privacy)
- [Mobile and accessibility standards](#mobile-and-accessibility-standards)
- [Testing](#testing)
- [Deployment](#deployment)
- [Development roadmap](#development-roadmap)
- [Git workflow](#git-workflow)
- [Implementation history](#implementation-history)
- [Contributing](#contributing)
- [Licence](#licence)

## Project overview

The Visitor Management Application replaces a manual visitor register with a responsive web application that visitors can open by scanning a shared QR code.

The initial version focuses on:

- first-time visitor registration;
- secure returning-visitor identification;
- repeat visit check-in;
- receptionist access to active and historical visits;
- visitor checkout;
- host and staff administration;
- privacy-aware handling of visitor information; and
- mobile usability on recent iPhone and Android devices.

The shared QR code opens the visitor landing route. Because a shared QR code cannot identify the person who scanned it, the visitor chooses either **This is my first visit** or **I have visited before**.

## Core visitor workflow

### First-time visitor

1. Scan the organisation's shared visitor QR code.
2. Select **This is my first visit**.
3. Enter the required personal and visit information.
4. Review and acknowledge the privacy notice.
5. Submit the form.
6. Receive a unique public visit reference.

### Returning visitor

1. Scan the shared visitor QR code.
2. Select **I have visited before**.
3. Search using at least three characters from the registered name.
4. Select the appropriate masked result.
5. Enter the complete mobile number used during registration.
6. Review the verified visitor profile.
7. Enter the current visit details.
8. Submit the check-in and receive a new visit reference.

### Reception staff

1. Sign in through the protected staff login.
2. Review currently checked-in visitors.
3. Search and filter visit records.
4. Check visitors out when they leave.
5. Review authorised visit history.

## Current implementation status

### Current stage

### Current stage

Stages 1 through 3 established the React, Supabase and secure environment foundation. Stage 4 added the responsive application shell and visitor routes. Stage 5 completed first-time visitor registration. Stage 6 added privacy-aware returning-visitor search and mobile-number verification. Stage 7 completes the returning-visitor workflow by collecting current visit details and creating a new, replay-protected visit check-in.

### Stage 1 completion checklist — completed

- [x] React JavaScript project created with Vite
- [x] Project dependencies installed
- [x] Tailwind CSS v4 configured through the Vite plugin
- [x] Mobile-first global styles added
- [x] Visitor landing interface created
- [x] Safe-area support added for recent mobile devices
- [x] Visible keyboard focus styles added
- [x] Mobile viewport inspection completed
- [x] `npm run lint` completed successfully
- [x] `npm run build` completed successfully
- [x] Stage 1 Git commit created

### Stage 2 completion checklist — completed

- [x] Development Supabase project created
- [x] Supabase region and test-data limitations documented
- [x] `supabase/schema.sql` added to the repository
- [x] `supabase/seed.sql` added with invented development records
- [x] Host, visitor, visit, staff and audit tables created
- [x] Foreign keys, checks and unique constraints verified
- [x] Required indexes created
- [x] Row Level Security enabled on every application table
- [x] Staff-role helper functions created
- [x] Atomic first-registration function created
- [x] Anonymous visitor and visit table access denied
- [x] Development seed data loaded
- [x] All five application tables confirmed with Row Level Security enabled
- [x] Seven expected authenticated staff and administrator policies confirmed
- [x] Required visitor-name and visit-status/time indexes confirmed
- [x] Four required database functions confirmed
- [x] Three invented development hosts confirmed
- [x] Visitor and visit record counts confirmed as zero
- [x] Database verification queries completed successfully
- [x] README updated for Stage 2
- [x] Stage 2 Git commit created

### Stage 3 completion checklist — completed

- [x] `.env.example` added without real credentials
- [x] `.gitignore` protects `.env.local` and other environment files
- [x] `.env.local` created locally and remains untracked
- [x] Browser-safe Supabase client created in `src/lib/supabase.js`
- [x] Server-only Supabase admin client created in `api/_lib/supabase.js`
- [x] `VISITOR_LOOKUP_SECRET` generated locally
- [x] ESLint recognises Node globals only in `api/` and `scripts/`
- [x] `process is not defined` lint error prevented
- [x] Supabase connection-check script added
- [x] `npm run check:supabase` completed successfully
- [x] Secret values confirmed absent from Git changes
- [x] `npm run lint` completed successfully
- [x] `npm run build` completed successfully
- [x] README updated for Stage 3
- [x] Stage 3 Git commit created

### Stage 4 completion checklist — completed

- [x] `BrowserRouter` configured at the React entry point
- [x] Shared `VisitorLayout` created with header, footer and skip link
- [x] `/` redirects to `/visit`
- [x] `/visit` visitor landing route created
- [x] `/visit/new` first-time visitor route created
- [x] `/visit/returning` returning-visitor route created
- [x] Accessible not-found route created
- [x] Reusable action, field, page-header, loading and error components created
- [x] Mobile-first safe-area and reduced-motion styles added
- [x] Vercel SPA rewrite configuration added
- [x] Direct route and refresh validation completed
- [x] Keyboard and mobile viewport validation completed
- [x] `npm run check:supabase` completed successfully
- [x] `npm run lint` completed successfully
- [x] `npm run build` completed successfully
- [x] `git diff --check` completed successfully
- [x] Stage 4 Git commit created and pushed

### Stage 5 completion checklist — completed

- [x] Mobile-first first-time visitor form implemented
- [x] First name and last name collected separately and stored as one full name
- [x] Ghanaian and international telephone numbers normalised
- [x] Optional email and organisation fields implemented
- [x] Controlled agency selection implemented
- [x] Ministry of Finance division selection displayed conditionally
- [x] Controlled purpose-of-visit selection implemented
- [x] Person-being-visited field displayed only for non-meeting visits
- [x] Official meeting selection loaded from Supabase
- [x] Custom meeting-title fallback implemented
- [x] Single-day, multi-day and recurring meetings supported
- [x] Privacy-notice acknowledgement required
- [x] Shared browser and server validation implemented
- [x] Registration and meeting Vercel Functions implemented
- [x] Transactional Supabase registration function updated
- [x] Server-generated visitor reference codes verified
- [x] Node.js 22 local runtime verified
- [x] `npm run check:registration` completed successfully
- [x] `npm run check:supabase` completed successfully
- [x] `npm run lint` completed successfully without warnings
- [x] `npm run build` completed successfully
- [x] `git diff --check` completed successfully

### Stage 6 completion checklist — completed

- [x] Returning-visitor name search implemented
- [x] Minimum three-character search validation implemented
- [x] Search requests sent by `POST` to keep names out of URLs
- [x] Search results limited to six displayed records
- [x] Visitor names, organisations and phone details masked before display
- [x] Opaque lookup tokens used instead of exposing visitor database identifiers
- [x] Full registered-mobile-number verification implemented
- [x] Neutral verification failure messages implemented
- [x] Five-minute lookup tokens implemented
- [x] Ten-minute verified-visitor tokens implemented
- [x] HMAC-SHA-256 token signing implemented with `VISITOR_LOOKUP_SECRET`
- [x] Timing-safe token-signature comparison implemented
- [x] Raw IP addresses excluded from database storage
- [x] HMAC-derived request-limit keys implemented
- [x] Database-backed search and verification throttling implemented
- [x] Anonymous execution of lookup database functions denied
- [x] Service-role-only execution of lookup database functions verified
- [x] Row Level Security enabled on `public_request_limits`
- [x] Trigram visitor-name search index created
- [x] Mobile-first search, selection, verification and profile states implemented
- [x] Incorrect-number and correct-number runtime flows verified
- [x] `npm run check:returning` completed successfully
- [x] `npm run check:registration` completed successfully
- [x] `npm run check:supabase` completed successfully
- [x] `npm run lint` completed successfully without warnings
- [x] `npm run build` completed successfully
- [x] `git diff --check` completed successfully


### Stage 7 completion checklist — completed

- [x] Verified returning visitors can enter current visit details
- [x] Shared visit-detail validation implemented for first-time and returning visitors
- [x] Controlled agency and purpose selections reused
- [x] Ministry of Finance division selection displayed conditionally
- [x] Person-being-visited field displayed only for non-meeting visits
- [x] Official and custom meeting selection supported
- [x] Returning check-in Vercel Function implemented
- [x] Returning check-in database transaction implemented
- [x] Verified visitor tokens assigned unique token identifiers
- [x] Verified visitor tokens consumed once during check-in
- [x] Token replay protection implemented
- [x] Idempotent retry protection links a consumed token to its created visit
- [x] One active check-in per visitor enforced at the database level
- [x] Active check-in conflict displayed with a clear public message
- [x] New visit reference generated for successful returning check-in
- [x] Previous checked-out visits retained as history
- [x] Returning non-meeting visit runtime flow verified
- [x] Active check-in protection verified
- [x] Database function privileges verified for service-role-only execution
- [x] Row Level Security enabled on the consumed-token table
- [x] `npm run check:returning-check-in` completed successfully
- [x] `npm run check:returning` completed successfully
- [x] `npm run check:registration` completed successfully
- [x] `npm run check:supabase` completed successfully
- [x] `npm run lint` completed successfully without warnings
- [x] `npm run build` completed successfully
- [x] `git diff --check` completed successfully





## Technology stack

| Layer          | Technology               | Purpose                                                    |
| -------------- | ------------------------ | ---------------------------------------------------------- |
| Frontend       | React.js with JavaScript | Component-based visitor and staff interfaces               |
| Build tool     | Vite                     | Local development server and production build              |
| Routing        | React Router             | Visitor, login, dashboard and administration routes        |
| Styling        | Tailwind CSS             | Responsive mobile-first interface and design tokens        |
| Forms          | React Hook Form          | Form state, validation feedback and submission handling    |
| Validation     | Zod                      | Browser and server input validation                        |
| Database       | Supabase Postgres        | Visitors, visits, hosts, staff and audit records           |
| Authentication | Supabase Auth            | Receptionist and administrator authentication              |
| Backend        | Vercel Functions         | Protected registration, lookup and verification operations |
| Hosting        | Vercel                   | Frontend and serverless Function deployment                |
| Icons          | Lucide React             | Consistent accessible interface icons                      |

Package versions are controlled by `package.json` and `package-lock.json`. Always commit the lock file and test dependency upgrades before merging them.

## Project requirements

Install the following before starting:

- Node.js 22.x;
- npm;
- Git;
- VS Code or another modern code editor;
- a Supabase account; and
- a Vercel account.

Verify the local tools:

```bash
node --version
npm --version
git --version
```

## Getting started

### 1. Clone the repository

```bash
git clone YOUR_REPOSITORY_URL
cd mof-visitor-management
```

Replace `YOUR_REPOSITORY_URL` with the repository's HTTPS or SSH address.

### 2. Install dependencies

```bash
npm install
```

### 3. Create the local environment file

Copy `.env.example` to `.env.local`, then replace its placeholders with development Supabase values:

```bash
cp .env.example .env.local
```

Windows PowerShell alternative:

```powershell
Copy-Item .env.example .env.local
```

Never commit `.env.local`.

### 4. Start the frontend-only development server

```bash
npm run dev
```

Vite normally displays a local URL similar to:

```text
http://localhost:5173
```

The frontend-only server does not run the Vercel Functions in `api/`.

### 5. Start the complete local application

The registration and meeting endpoints require the Vercel development server. In Git Bash, load `.env.local` into the current shell and start Vercel:

```bash
set -a
source .env.local
set +a
npx vercel dev
```

The complete application is normally available at:

```text
http://localhost:3000
```

### 6. Run the quality checks

```bash
npm run check:returning-check-in
npm run check:returning
npm run check:registration
npm run check:supabase
npm run lint
npm run build
git diff --check
```

All commands must succeed before a development stage is committed.

## Available scripts

| Command                              | Purpose                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `npm run dev`                        | Start the Vite development server                                          |
| `npm run lint`                       | Check the source code with ESLint                                          |
| `npm run build`                      | Create the optimised production build                                      |
| `npm run preview`                    | Preview the production build locally                                       |
| `npm run check:supabase`             | Verify the server-side development connection without printing credentials |
| `npm run check:registration`         | Run visitor registration schema and API contract checks                    |
| `npm run check:returning`            | Run returning-visitor validation, masking, token and API contract checks    |
| `npm run check:returning-check-in`   | Run returning-visit validation, token and check-in API contract checks      |

Additional test coverage will be introduced during the dedicated automated testing stage.

## Environment variables

The application will use separate browser-safe and server-only variables.

### Browser-safe variables

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Only variables intended to be visible in browser code may use the `VITE_` prefix.

### Server-only variables

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
VISITOR_LOOKUP_SECRET
```

Server-only values must be configured in the local server environment and Vercel Project Settings. They must never be placed in `src/`, prefixed with `VITE_` or committed to Git.

## Project structure

The expected project structure will grow as stages are completed:

```text
mof-visitor-management/
├── api/                         # Vercel Functions
│   ├── _lib/                    # Server-only Supabase, HTTP, token and rate-limit helpers
│   ├── returning/
│   │   ├── check-in.js          # Verified returning-visitor check-in
│   │   ├── search.js            # Masked returning-visitor lookup
│   │   └── verify.js            # Registered-mobile-number verificationlookup
│   │   └── verify.js            # Registered-mobile-number verification
│   ├── hosts.js                 # Hosts endpoint
│   ├── meetings.js              # Public available-meetings endpoint
│   └── register.js              # First-time visitor registration endpoint
├── public/                      # Public static files
├── src/
│   ├── components/              # Reusable interface components
│   ├── constants/               # Shared privacy and visitor form options
│   ├── context/                 # Authentication and shared state
│   ├── layouts/                 # Visitor and dashboard layouts
│   ├── lib/                     # Browser-safe API and Supabase utilities
│   ├── pages/                   # Application pages
│   ├── validation/              # Shared browser and server validation
│   ├── App.jsx                  # Routes and application entry component
│   ├── index.css                # Tailwind import and global styles
│   └── main.jsx                 # React browser entry point
├── scripts/
│   ├── check-registration-validation.mjs
│   ├── check-returning-check-in-validation.mjs
│   ├── check-returning-visitor-validation.mjs
│   └── check-supabase.mjs       # Safe development connection check
├── supabase/
│   ├── migrations/              # Version-controlled database migrations
│   ├── schema.sql               # Development schema reference
│   ├── seed.sql                 # Non-sensitive development seed data
│   └── verify.sql               # Read-only database verification queries
├── .env.example                 # Environment variable names only
├── .gitignore                   # Excludes secrets, dependencies and generated files
├── eslint.config.js
├── index.html
├── package.json
├── package-lock.json
├── README.md
├── vercel.json
└── vite.config.js
```

Only directories and files introduced by completed stages should be treated as currently available.

## Database overview

The planned Supabase database contains:

| Table              | Purpose                                                |
| ------------------ | ------------------------------------------------------ |
| `visitor_profiles` | Reusable visitor identity and contact information      |
| `visits`           | One record for each arrival and departure              |
| `meetings`         | Available single-day, multi-day and recurring meetings |
| `hosts`            | Active people or offices that can receive visitors     |
| `staff_profiles`   | Application role attached to a Supabase Auth user      |
| `audit_events`     | Staff actions, access changes, corrections and exports |
| `public_request_limits` | HMAC-keyed public search and verification counters |
| `used_visitor_verification_tokens` | One-time verified-token consumption and check-in retry protection |

The Stage 2 schema introduced the original five application tables, constraints, indexes, role helper functions and first-registration transaction. Stage 5 adds meeting records and visit destination fields for the agency, Ministry division, person being visited, official meeting and custom meeting title.

The Stage 5 migration also updates the registration transaction so the visitor profile and visit are created together. Meeting visits must reference either an available official meeting or a valid custom meeting title. Non-meeting visits require the person being visited.

Stage 6 adds a case-insensitive trigram index for partial visitor-name lookup and the following protected database functions:

- `search_returning_visitors(text, integer)`;
- `verify_returning_visitor(uuid, text)`; and
- `consume_public_rate_limit(text, integer, integer)`.

Stage 7 adds the `used_visitor_verification_tokens` table. The table records a cryptographically random token identifier, its expiry time, consumption time and the visit created from it. Row Level Security is enabled, and direct anonymous access is not permitted.

The `register_return_visit` database function performs the returning check-in transaction. It:

- verifies the short-lived token identifier and expiry;
- locks the visitor record during check-in;
- rejects a new check-in when the visitor already has an active visit;
- validates the agency, division, purpose, meeting and person-being-visited values;
- consumes the verified token;
- creates the visit and reference code; and
- links the consumed token to the created visit.

A partial unique index on `visits(visitor_id)` where the status is `checked_in` provides database-level enforcement of one active check-in per visitor.

The consumed-token-to-visit relationship makes retrying the same successful request idempotent within the verified token’s validity period. A retry returns the original visit reference instead of creating another visit.

Stage 7 introduces the following protected function:

- `register_return_visit(uuid, uuid, timestamp with time zone, text, text, text, text, uuid, text)`.

Execution is revoked from anonymous users and granted only to the trusted server-side service role.

Stage 7 database migrations:

- `supabase/migrations/202607270002_returning_visitor_check_in.sql`;
- `supabase/migrations/202607270003_return_check_in_idempotency.sql`.


Execution is revoked from `public`, `anon` and `authenticated`. The trusted server-side `service_role` is granted execution. The `public_request_limits` table has Row Level Security enabled and stores only HMAC-derived request keys, timestamps and counters—not raw visitor IP addresses.

Anonymous browser users must not receive direct access to visitor or visit tables. Public visitor operations will pass through protected Vercel Functions.

## Security and privacy

This application processes personal information. Development and deployment must follow the approved privacy notice, retention schedule, Data Protection Impact Assessment and organisational security requirements.

The implementation must:

- enable Row Level Security on every exposed Supabase table;
- keep the Supabase secret key outside browser code;
- validate every public request on the server;
- mask returning-visitor search results;
- require mobile-number verification before returning profile details;
- use short-lived, signed and purpose-scoped verification tokens;
- rate-limit public search, verification and registration endpoints;
- avoid personal data in URLs, routine logs and analytics;
- return neutral public error messages;
- restrict staff features by authenticated role;
- record privileged actions in the audit trail; and
- complete privacy, accessibility and security review before production use.
- consume verified returning-visitor tokens only once;
- prevent token replay from creating duplicate visits;
- enforce one active checked-in visit per visitor at the database level;
- perform returning check-in through a single protected database transaction; and
- preserve successful check-in results for safe idempotent retries.

Never commit:

- `.env.local`;
- Supabase secret or legacy service-role keys;
- lookup signing secrets;
- database passwords;
- exported visitor records;
- screenshots containing real visitor information;
- production access tokens; or
- unencrypted database backups.

## Mobile and accessibility standards

The application is designed mobile first and targets WCAG 2.2 Level AA.

The interface should:

- work without horizontal page scrolling at 320 CSS pixels;
- use 16-pixel or larger form-control text;
- use at least 44-pixel product touch targets;
- support device safe-area insets;
- provide visible associated form labels;
- provide field-level errors and an error summary;
- maintain visible keyboard focus;
- use logical focus order;
- avoid using colour as the only status indicator;
- support keyboard-only completion; and
- be tested with recent iOS Safari, Android Chrome and desktop Edge or Chrome.

## Testing

### Current required checks

```bash
npm run check:returning-check-in
npm run check:returning
npm run check:registration
npm run check:supabase
npm run lint
npm run build
git diff --check
```

### Implemented automated checks

- Returning-visitor search validation
- Mobile-number normalisation and validation
- Visitor-name, organisation and phone masking
- Lookup and verified-token creation and validation
- Tampered-token rejection
- Token-purpose separation
- API method restrictions
- Invalid-request rejection
- Shared first-time and returning-visit detail validation
- Returning check-in request validation
- Verified-token unique identifier validation
- Verified-token audience and expiry validation
- Returning check-in API method restrictions
- Invalid and missing verified-token rejection

### Planned test coverage

- Expanded database-connected API integration tests for registration, lookup, verification and check-in
- RLS tests for anonymous, receptionist and administrator access
- End-to-end tests for first-time and returning visitors
- Pagination and checkout tests
- Mobile viewport tests
- Automated accessibility checks
- Manual keyboard and screen-reader testing
- Security and penetration testing before production launch

## Deployment

The application will be deployed through Vercel.

The repository pins the server and build runtime to Node.js 22.x. Local development and validation must also use Node.js 22.x.

The planned deployment environments are:

| Environment | Purpose                       | Database                             |
| ----------- | ----------------------------- | ------------------------------------ |
| Development | Local implementation          | Development Supabase project         |
| Preview     | Pull-request review and UAT   | Staging/development Supabase project |
| Production  | Approved live visitor service | Production Supabase project          |

Preview deployments must never connect to the production visitor database.

The final visitor QR code must contain only the stable production HTTPS visitor URL. Do not print a QR code that points to a temporary Vercel preview address.

## Development roadmap

- [x] Stage 1 — React, Vite and Tailwind foundation
- [x] Stage 2 — Supabase database schema and Row Level Security
- [x] Stage 3 — Environment configuration and Supabase clients
- [x] Stage 4 — Application routing and shared layout
- [x] Stage 5 — First-time visitor registration
- [x] Stage 6 — Returning-visitor search and verification
- [x] Stage 7 — Returning-visitor check-in
- [ ] Stage 8 — Staff authentication and protected routes
- [ ] Stage 9 — Reception dashboard and pagination
- [ ] Stage 10 — Visitor checkout and visit history
- [ ] Stage 11 — Host and staff administration
- [ ] Stage 12 — Security, privacy and abuse controls
- [ ] Stage 13 — Automated testing and accessibility
- [ ] Stage 14 — Vercel deployment and environments
- [ ] Stage 15 — Production readiness and visitor QR code

The roadmap checkboxes must be updated only after the relevant validation and commit have been completed.

## Git workflow

Create a separate branch for every implementation stage:

```bash
git switch main
git pull origin main
git switch -c feature/01-project-foundation
```

Review and validate before committing:

```bash
git status
git diff
npm run lint
npm run build
```

Stage only the files changed by the current development stage. Do not use `git add .` without reviewing every untracked and modified file.

Example:

```bash
git add src/pages/ReturningVisitorPage.jsx
git add api/returning/search.js api/returning/verify.js
git add src/validation/returningVisitor.js
git add README.md
git diff --cached
git commit -m "feat: add returning visitor verification"
```

Push the branch:

```bash
git push -u origin feature/01-project-foundation
```

The README update should normally be included in the same commit as the feature it documents. A separate documentation commit is appropriate only when correcting or expanding documentation without changing the implementation.

## Implementation history

### Stage 1 — Project foundation

Status: Completed

Implemented:

- Create the React JavaScript application with Vite.
- Install the shared project dependencies.
- Configure Tailwind CSS v4.
- Add the responsive visitor landing page.
- Establish mobile safe-area and focus styles.
- Validate linting, production build and supported mobile widths.

Validation completed:

- `npm run lint`
- `npm run build`
- Mobile viewport inspection

### Stage 2 — Supabase database and Row Level Security

Status: Completed

Implemented:

- Create the development Supabase project.
- Add the version-controlled database schema and invented seed data.
- Create visitor, visit, host, staff and audit tables.
- Add relational and data-integrity constraints.
- Enable Row Level Security on all application tables.
- Add staff-role helper functions and policies.
- Add an atomic first-registration function.
- Verify the schema without entering real visitor information.

Validation completed:

- Five application tables were returned with Row Level Security enabled: `audit_events`, `hosts`, `staff_profiles`, `visitor_profiles` and `visits`.
- Seven policies were returned for authenticated staff and administrator operations.
- The required `visitor_profiles_name_idx`, `visits_checked_in_at_idx` and `visits_status_idx` indexes were returned. Primary-key and unique-constraint indexes were also present.
- Four required functions were returned: `is_active_staff`, `is_admin`, `register_first_visit` and `set_updated_at`.
- Three invented development hosts were returned as active records.
- `visitor_profiles` and `visits` each returned a record count of `0`, confirming that no visitor test records were added during setup.

### Stage 3 — Environment configuration and Supabase clients

Status: Completed

Implemented:

- Add `.env.example` containing names and placeholders only.
- Protect local environment files with `.gitignore`.
- Configure the browser-safe Supabase publishable client.
- Configure the server-only Supabase secret client.
- Generate a signing secret for returning-visitor verification tokens.
- Configure ESLint Node globals for server and script files only.
- Add and run the Supabase development connection check.

Validation completed:

- `npm run check:supabase`
- `npm run lint`
- `npm run build`
- Secret and generated-output inspection

### Stage 4 — Application routing and shared layout

Status: Completed

Implemented:

- Configure `BrowserRouter` at the React entry point.
- Add the shared visitor layout, header, footer and keyboard skip link.
- Add visitor landing, first-time visitor and returning-visitor routes.
- Add an accessible not-found route.
- Add reusable action, field, page-header, loading and error components.
- Add mobile safe-area, keyboard-focus and reduced-motion support.
- Add Vercel rewrites for direct application-route access and browser refreshes.

Validation completed:

- Direct visitor-route and browser-refresh checks
- Keyboard navigation and mobile viewport checks
- `npm run check:supabase`
- `npm run lint`
- `npm run build`
- `git diff --check`

### Stage 5 — First-time visitor registration

Status: Completed

Implemented:

- Add separate first-name and last-name inputs that produce one normalised full name.
- Add E.164-compatible Ghanaian and international telephone-number normalisation.
- Add optional email and organisation details.
- Add controlled agency and purpose-of-visit options.
- Display Ministry of Finance divisions only when the Ministry is selected.
- Display the person-being-visited field only for non-meeting purposes.
- Load currently available official meetings from Supabase.
- Allow a visitor to enter a custom meeting title when the required meeting is unavailable.
- Support single-day, multi-day and weekly recurring meeting records.
- Require acknowledgement of the versioned privacy notice.
- Share Zod validation between the React form and registration Function.
- Add protected Vercel Functions for available meetings and registration.
- Update the transactional Supabase registration function and reference-code generation.
- Pin the project runtime to Node.js 22.x for consistent local and Vercel execution.

Database migrations:

- `supabase/migrations/202607220001_update_first_visit_registration.sql`
- `supabase/migrations/202607230001_fix_reference_generation.sql`

Validation completed:

- First-time registration with every supported agency and purpose option
- Official meeting registration
- Custom meeting-title registration
- Conditional Ministry division and person-being-visited behaviour
- Successful Supabase registration and visitor reference generation
- `npm run check:registration`
- `npm run check:supabase`
- `npm run lint`
- `npm run build`
- `git diff --check`

### Stage 6 — Returning-visitor search and verification

Status: Completed

Implemented:

- Add server-validated name search with a three-character minimum.
- Send search data in a `POST` request instead of placing names in URLs.
- Return no more than six masked results to the browser.
- Mask visitor names, organisations and phone details before display.
- Use signed, purpose-scoped lookup tokens instead of exposing visitor UUIDs.
- Verify the complete normalised mobile number on the trusted server.
- Return generic verification failures to reduce record enumeration.
- Issue five-minute lookup tokens and ten-minute verified-visitor tokens.
- Sign tokens with HMAC-SHA-256 and compare signatures using a timing-safe operation.
- Derive request-limit keys with HMAC so raw IP addresses are not stored.
- Add database-backed throttling for search and verification.
- Add a trigram index for case-insensitive partial-name search.
- Restrict lookup database functions to the server-side service role.
- Add accessible mobile-first search, result-selection, verification and verified-profile states.

Database migration:

- `supabase/migrations/202607270001_returning_visitor_lookup.sql`

API endpoints:

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/returning/search` | `POST` | Return a limited set of masked visitor matches |
| `/api/returning/verify` | `POST` | Verify the registered mobile number and issue a short-lived token |

Configured request limits:

- Search: 10 requests per keyed client in 10 minutes.
- Verification: 20 attempts per keyed client in 10 minutes.
- Record verification: 5 attempts per keyed client and visitor record in 10 minutes.

These limits are initial application settings, not universal security standards. They must be reviewed during the security and abuse-control stage using approved risk, privacy and operational requirements.

Validation completed:

- Database table, RLS, functions, privileges and search-index verification
- Masked-result runtime verification
- Incorrect-mobile-number neutral error verification
- Correct-mobile-number profile-release verification
- Mobile-width and refresh-state verification
- `npm run check:returning`
- `npm run check:registration`
- `npm run check:supabase`
- `npm run lint`
- `npm run build`
- `git diff --check`


### Stage 7 — Returning-visitor check-in

Status: Completed

Implemented:

- Add a mobile-first current-visit form after successful visitor verification.
- Reuse controlled agency, Ministry division, purpose and meeting options.
- Display the person-being-visited field only for non-meeting visits.
- Support official meetings and visitor-supplied meeting titles.
- Share visit-detail validation between first-time and returning-visitor workflows.
- Add unique identifiers to verified visitor tokens.
- Add a protected returning check-in Vercel Function.
- Add a transactional `register_return_visit` database function.
- Consume verified tokens once to prevent replay.
- Enforce one active checked-in visit per visitor.
- Link consumed tokens to created visits for idempotent request retries.
- Preserve completed visit records while creating a new visit for each return.
- Generate a new public reference for each successful return visit.

Database migrations:

- `supabase/migrations/202607270002_returning_visitor_check_in.sql`
- `supabase/migrations/202607270003_return_check_in_idempotency.sql`

API endpoint:

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/returning/check-in` | `POST` | Validate a verified visitor token and create the return visit |

Validation completed:

- Returning non-meeting check-in
- Successful new visit-reference generation
- Existing active check-in rejection
- Checkout followed by successful return check-in
- Consumed-token table, constraints, indexes and Row Level Security verification
- Service-role and anonymous function privilege verification
- `npm run check:returning-check-in`
- `npm run check:returning`
- `npm run check:registration`
- `npm run check:supabase`
- `npm run lint`
- `npm run build`
- `git diff --check`


Future stages will add a new entry under this section describing:

- what was implemented;
- important architectural decisions;
- new environment variables;
- database changes;
- new routes and APIs;
- validation completed; and
- the associated Git commit.

## README update policy

The README is a required deliverable for every development stage.

For each completed stage, update:

1. **Project status** — show the latest completed and current stage.
2. **Current implementation status** — replace the stage checklist and mark verified work.
3. **Technology stack** — add or change only technologies actually introduced.
4. **Getting started** — include new installation or configuration requirements.
5. **Available scripts** — document new test, database or deployment commands.
6. **Environment variables** — add variable names and purposes without including values.
7. **Project structure** — add new important files and folders.
8. **Database overview** — document new tables, functions, constraints and RLS changes.
9. **Testing** — document the checks added or completed.
10. **Development roadmap** — mark a stage complete only after verification.
11. **Implementation history** — add a factual summary of the completed stage.
12. **Git workflow** — include the exact commit used for the stage when useful.

README statements must describe the current repository truth. Do not document a feature as completed before its code and tests exist.

## Contributing

1. Create a branch for one development stage or focused correction.
2. Keep changes limited to the branch objective.
3. Update this README when the implementation changes setup, behaviour, architecture or progress.
4. Run lint, build and all relevant tests.
5. Review the diff for secrets and personal data.
6. Use a clear Conventional Commit-style message.
7. Push the branch and create a reviewed pull request.

## Licence

The project licence has not yet been confirmed.

Before publishing or distributing the source code, the repository owner must add an approved `LICENSE` file and update this section. Until then, no open-source licence should be assumed.
