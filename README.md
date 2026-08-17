# Visitor Management Application

A simple, secure and mobile-first visitor registration and check-in application built with React.js, JavaScript, Tailwind CSS, Supabase and Vercel.

The implemented stages allow first-time visitors to register and check in. Returning visitors can locate a masked visitor record, verify ownership using their registered mobile number, enter current visit details and receive a new visit reference.

> Project status: Stage 13 automated testing and accessibility completed
>
> Current implementation stage: Stage 14 — Vercel deployment and environments
>
> Documentation version: 2.9

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

Stages 1 through 3 established the React, Supabase and secure environment foundation. Stage 4 added the responsive application shell and visitor routes. Stage 5 completed first-time visitor registration. Stage 6 added privacy-aware returning-visitor search and mobile-number verification. Stage 7 completed replay-protected returning-visitor check-in. Stage 8 added Supabase staff authentication, server-verified sessions and protected routes. Stage 9 added the protected reception dashboard, active-visitor metrics, staff search, filtering and server-side pagination. Stage 10 added transactional visitor checkout, audit recording, retry-safe status handling and protected paginated visit history. Stage 11 added administrator-only host and staff management, email-based staff invitations, role and status controls, protected setup and administration routes, audit recording and server-side pagination. Stage 12 added database privilege hardening, request-boundary protection, security headers, data retention controls, rate limiting and privacy notice version 2.0. Stage 13 added automated unit, component, browser, accessibility, responsive-layout and CI quality checks.

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
- [x] `supabase/migrations/202607210001_initial_schema.sql` added as the initial database migration
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


### Stage 8 completion checklist — completed

- [x] Development receptionist linked to Supabase Auth
- [x] Existing receptionist and administrator roles verified
- [x] Inactive staff-account enforcement verified
- [x] Anonymous staff-profile table privileges removed
- [x] Anonymous staff-role function execution removed
- [x] Authenticated and service-role permissions preserved
- [x] Row Level Security confirmed on `staff_profiles`
- [x] Shared staff-login validation implemented
- [x] Server-side bearer-token validation implemented
- [x] Supabase Auth user verification implemented
- [x] Active staff-profile verification implemented
- [x] Staff session endpoint implemented
- [x] Neutral invalid-credential response implemented
- [x] Unauthorised and inactive staff accounts rejected
- [x] React authentication provider implemented
- [x] Persistent staff-session handling implemented
- [x] Protected route component implemented
- [x] Mobile-first staff login page implemented
- [x] Shared staff layout and secure sign-out implemented
- [x] Staff home page implemented
- [x] Unknown staff routes safely redirected
- [x] Visitor routes preserved
- [x] Route-level code splitting implemented
- [x] Initial oversized JavaScript chunk warning resolved
- [x] Incorrect-password runtime test completed
- [x] Authorised receptionist sign-in verified
- [x] Browser-refresh session persistence verified
- [x] Sign-out and route protection verified
- [x] Mobile-width staff-login validation completed
- [x] `npm run check:staff-auth` completed successfully
- [x] All existing validation scripts completed successfully
- [x] `npm run lint` completed successfully without warnings
- [x] `npm run build` completed successfully without chunk-size warnings
- [x] `git diff --check` completed successfully

### Stage 9 completion checklist — completed

- [x] Protected reception dashboard implemented
- [x] Active-visitor summary metrics implemented
- [x] Ghana operational-day calculations use the `Africa/Accra` timezone
- [x] Currently checked-in visitor list implemented
- [x] Visitor-name and visit-reference search implemented
- [x] Search values submitted by `POST` instead of URL parameters
- [x] Agency filtering implemented
- [x] Conditional Ministry division filtering implemented
- [x] Server-side pagination implemented
- [x] Dashboard page size restricted to 10 records
- [x] Page-number, previous-page and next-page controls implemented
- [x] Responsive mobile visitor cards implemented
- [x] Responsive desktop visitor table implemented
- [x] Loading, empty, error and refresh states implemented
- [x] Staff bearer-token authorization enforced
- [x] Invalid or expired staff sessions rejected
- [x] Dashboard database function restricted to `service_role`
- [x] Anonymous and direct authenticated function execution denied
- [x] Visitor email addresses and visitor UUIDs excluded from dashboard responses
- [x] Five existing active visitors displayed successfully
- [x] Pagination verified using 11 active development records
- [x] Page 1 displayed 10 records
- [x] Page 2 displayed the remaining record
- [x] Search and agency filters verified
- [x] Six invented pagination records removed after testing
- [x] Original five active visitors restored
- [x] `npm run check:dashboard` completed successfully
- [x] All existing validation scripts completed successfully
- [x] `npm run lint` completed successfully without warnings
- [x] `npm run build` completed successfully
- [x] `git diff --check` completed successfully


### Stage 10 completion checklist — completed

- [x] Visitor checkout added to the reception dashboard
- [x] Checkout confirmation dialog implemented
- [x] Visitor name, reference and check-in time shown before confirmation
- [x] Checkout requests protected by active staff bearer authentication
- [x] Transactional checkout database function implemented
- [x] Visit record locked during checkout
- [x] Checked-in visits transitioned atomically to checked-out status
- [x] Checkout timestamp generated by the database
- [x] Cancelled visits protected from checkout
- [x] Missing visits handled safely
- [x] Repeated checkout requests handled idempotently
- [x] Repeated checkout returns the original checkout result
- [x] Repeated checkout does not create duplicate audit events
- [x] Staff actor recorded for each successful checkout
- [x] Checkout audit event contains the visit reference and status transition
- [x] Direct authenticated updates to visits removed
- [x] Direct authenticated audit-event insertion removed
- [x] Service-role database permissions preserved
- [x] Checkout database function restricted to `service_role`
- [x] Paginated visit-history database function implemented
- [x] Visit-history function restricted to `service_role`
- [x] Visit history limited to 10 records per page
- [x] Visitor-name and reference search implemented
- [x] Visit-status filtering implemented
- [x] Agency and Ministry division filtering implemented
- [x] Ghana check-in date-range filtering implemented
- [x] History date range limited to 366 days
- [x] Mobile visit-history cards implemented
- [x] Desktop visit-history table implemented
- [x] History loading, empty, error and refresh states implemented
- [x] Protected `/staff/history` route implemented
- [x] Staff navigation updated with visit history
- [x] Checkout dashboard metrics refresh automatically
- [x] Successful checkout runtime flow verified
- [x] Checkout audit-event creation verified
- [x] Repeated-checkout safety verified
- [x] All automated validation scripts completed successfully
- [x] `npm run lint` completed successfully
- [x] `npm run build` completed successfully
- [x] Node.js 22 final validation completed
- [x] `git diff --check` completed successfully

### Stage 11 completion checklist — completed

- [x] Administrator-only host administration implemented
- [x] Administrator-only staff administration implemented
- [x] Active administrator authorization enforced by every administration endpoint
- [x] Receptionists prevented from accessing administration routes
- [x] Administrator navigation displayed conditionally by role
- [x] Protected `/staff/admin/hosts` route implemented
- [x] Protected `/staff/admin/staff` route implemented
- [x] Public invitation-completion route implemented at `/staff/setup`
- [x] Host-name and department search implemented
- [x] Host active-status filtering implemented
- [x] Host creation implemented
- [x] Host editing implemented
- [x] Host activation and deactivation implemented
- [x] Permanent host deletion excluded from the administration workflow
- [x] Staff-name and email search implemented
- [x] Staff role and active-status filtering implemented
- [x] Receptionist and administrator role management implemented
- [x] Staff activation and deactivation implemented
- [x] Email-based Supabase Auth staff invitations implemented
- [x] Invitation redirect configuration validated on the server
- [x] Invitation email delivery verified
- [x] Invited staff password setup implemented
- [x] Strong invited-staff password validation implemented
- [x] Invited Auth users linked to application staff profiles
- [x] Failed profile creation triggers invited-user cleanup
- [x] Signed-in administrators prevented from demoting themselves
- [x] Signed-in administrators prevented from deactivating themselves
- [x] Last-active-administrator protection implemented
- [x] Host and staff lists limited to 10 records per page
- [x] Responsive mobile administration cards implemented
- [x] Responsive desktop administration tables implemented
- [x] Loading, empty, error and refresh states implemented
- [x] Host and staff mutations recorded in the audit trail
- [x] Direct authenticated host mutations removed
- [x] Direct authenticated staff-profile mutations removed
- [x] Administration database functions restricted to `service_role`
- [x] Anonymous and direct authenticated function execution denied
- [x] `npm run check:admin` completed successfully
- [x] Five logical administration endpoints consolidated behind one Vercel Function
- [x] Existing administration API URLs preserved through internal rewrites
- [x] Total deployable Vercel Function count verified as 11
- [x] Vercel Hobby-plan 12-function limit satisfied
- [x] All existing automated validation scripts completed successfully
- [x] Node.js 22 final validation completed
- [x] `npm run lint` completed successfully
- [x] `npm run build` completed successfully
- [x] `git diff --check` completed successfully

### Stage 13 completion checklist — completed

- [x] Vitest unit and component testing configured
- [x] Testing Library and jest-dom matchers configured
- [x] V8 coverage reporting configured
- [x] Playwright browser testing configured
- [x] Desktop Chromium viewport configured
- [x] Compact-mobile Chromium viewport configured at 390 × 844 CSS pixels
- [x] Large-mobile Chromium viewport configured at 412 × 915 CSS pixels
- [x] Automated axe WCAG checks configured
- [x] Horizontal-overflow checks added for covered responsive pages
- [x] Public visitor landing workflow covered
- [x] First-time visitor registration workflows covered
- [x] Returning-visitor search, verification and check-in workflows covered
- [x] Staff authentication validation covered
- [x] Protected-route role enforcement covered
- [x] Staff-login component behavior covered
- [x] Reception dashboard workflows covered
- [x] Visitor checkout workflow covered
- [x] Visit-history workflows covered
- [x] Administrator host-management workflows covered
- [x] Host pagination verified using more than 10 synthetic records
- [x] Administrator staff-management workflows covered
- [x] Staff pagination verified using more than 10 synthetic records
- [x] Invited-staff password setup workflows covered
- [x] Invalid and expired invitation states covered
- [x] Mobile staff description-list semantics corrected
- [x] Responsive staff sign-out button given an accessible name
- [x] Responsive staff-setup cancellation button given an accessible name
- [x] Synthetic browser fixtures create no production visitor, visit, host or staff records
- [x] GitHub Actions quality workflow configured
- [x] All 12 isolated validation harnesses passed
- [x] All 35 unit and component tests passed
- [x] All 87 Playwright browser tests passed
- [x] Covered browser states passed automated axe checks
- [x] `npm run lint` completed successfully
- [x] `npm run build` completed successfully
- [x] Production dependency audit reported zero vulnerabilities
- [x] Complete dependency audit reported zero vulnerabilities
- [x] Deployable Vercel Function count remained 11
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
| Backend        | Vercel Functions         | Protected registration, lookup, check-in, dashboard, checkout, history, invitation and administration operations |
| Hosting        | Vercel                   | Frontend and serverless Function deployment                |
| Unit testing   | Vitest and Testing Library | Unit and React component behavior checks                    |
| Browser testing | Playwright and axe-core    | Responsive workflow and automated accessibility checks      |
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

The registration, returning-visitor, meeting, staff-session, dashboard, checkout, visit-history and administration endpoints require the Vercel development server.

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

### 6. Configure a development staff account

Create an invented development user through the Supabase Authentication Users page. Use a strong password stored outside the repository.

Copy the Auth user UUID and link it to an application role:

```sql
insert into public.staff_profiles (
  user_id,
  full_name,
  role,
  active
)
values (
  'PASTE_DEVELOPMENT_AUTH_USER_UUID'::uuid,
  'Development Receptionist',
  'receptionist',
  true
)
on conflict (user_id)
do update set
  full_name = excluded.full_name,
  role = excluded.role,
  active = excluded.active;
```

Supported application roles are:

- `receptionist`;
- `admin`.

Do not place staff passwords, real staff email addresses or Auth user identifiers in migrations, source files, tests or documentation.

### 7. Configure staff invitations

Add the local invitation-completion route to the Supabase allowed redirect URLs:

```text
http://localhost:3000/staff/setup
```

Add the matching server-only value to `.env.local`:

```text
STAFF_INVITE_REDIRECT_URL=http://localhost:3000/staff/setup
```

Load the environment file before starting the complete local application:

```bash
set -a
source .env.local
set +a
npx vercel dev
```

The invitation redirect must use the approved HTTPS application URL in preview and production environments.

Supabase's built-in email sender is suitable only for limited development testing. Configure an approved custom SMTP provider before using staff invitations in production.

### 8. Run the quality checks

```bash
npm run check:validation
npm run test
npm run test:coverage
npm run test:e2e
npm run lint
npm run build
npm audit --omit=dev
npm audit
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
| `npm run check:staff-auth`          | Run staff-login validation and staff-session API contract checks           |
| `npm run check:dashboard`           | Run reception-dashboard validation and API contract checks                 |
| `npm run check:staff-visits`          | Run staff checkout, visit-history validation and API contract checks       |
| `npm run check:admin`                 | Run host and staff administration validation and API contract checks       |
| `npm run check:validation` | Run all isolated validation and API contract checks |
| `npm run test` | Run the Vitest unit and component test suite once |
| `npm run test:watch` | Run Vitest interactively while developing |
| `npm run test:coverage` | Run Vitest and generate V8 coverage reports |
| `npm run test:e2e` | Build the application and run Playwright browser tests |
| `npm run test:e2e:headed` | Run Playwright with the browser visible |
| `npm run test:e2e:ui` | Open the Playwright interactive test interface |

Stage 13 established automated unit, component, browser, responsive-layout and accessibility coverage. Database-connected integration and RLS checks remain pending until a dedicated non-production test environment is configured.

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
STAFF_INVITE_REDIRECT_URL
```

`STAFF_INVITE_REDIRECT_URL` controls where invited staff complete password setup. It must exactly match an approved Supabase Auth redirect URL. Local development uses `/staff/setup` on the Vercel development server; deployed environments must use their approved HTTPS application URL.

Server-only values must be configured in the local server environment and Vercel Project Settings. They must never be placed in `src/`, prefixed with `VITE_` or committed to Git.

## Project structure

The expected project structure will grow as stages are completed:

```text
mof-visitor-management/
├── api/
│   ├── _lib/
│   │   ├── http.js
│   │   ├── rateLimit.js
│   │   ├── staffAuth.js
│   │   ├── supabase.js
│   │   └── visitorLookup.js
│   ├── admin.js
│   ├── returning/
│   │   ├── check-in.js
│   │   ├── search.js
│   │   └── verify.js
│   ├── staff/
│   │   ├── checkout.js
│   │   ├── dashboard.js
│   │   ├── history.js
│   │   └── session.js
│   ├── hosts.js
│   ├── meetings.js
│   └── register.js
├── public/
├── scripts/
│   ├── check-admin-management-validation.mjs
│   ├── check-registration-validation.mjs
│   ├── check-returning-check-in-validation.mjs
│   ├── check-returning-visitor-validation.mjs
│   ├── check-staff-auth-validation.mjs
│   ├── check-staff-visits-validation.mjs
│   ├── check-reception-dashboard-validation.mjs
│   └── check-supabase.mjs
├── src/
│   ├── components/
│   │   └── ProtectedRoute.jsx
│   ├── constants/
│   ├── context/
│   │   ├── AuthProvider.jsx
│   │   └── authContext.js
│   ├── hooks/
│   │   └── useAuth.js
│   ├── layouts/
│   │   ├── StaffLayout.jsx
│   │   └── VisitorLayout.jsx
│   ├── lib/
│   │   ├── api.js
│   │   └── supabase.js
│   ├── pages/
│   │   ├── AdminHostsPage.jsx
│   │   ├── AdminStaffPage.jsx
│   │   ├── NewVisitorPage.jsx
│   │   ├── NotFoundPage.jsx
│   │   ├── ReturningVisitorPage.jsx
│   │   ├── StaffHomePage.jsx
│   │   ├── StaffLoginPage.jsx
│   │   ├── StaffSetupPage.jsx
│   │   ├── StaffVisitHistoryPage.jsx
│   │   └── VisitorLandingPage.jsx
│   ├── validation/
│   │   ├── adminManagement.js
│   │   ├── returningVisit.js
│   │   ├── returningVisitor.js
│   │   ├── receptionDashboard.js
│   │   ├── staffVisits.js
│   │   ├── staffLogin.js
│   │   ├── visitDetails.js
│   │   └── visitorRegistration.js
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── verify.sql
├── .env.example
├── .gitignore
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

Execution is revoked from `public`, `anon` and `authenticated`. The trusted server-side `service_role` is granted execution. The `public_request_limits` table has Row Level Security enabled and stores only HMAC-derived request keys, timestamps and counters—not raw visitor IP addresses.


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


Stage 8 uses the existing `staff_profiles` relationship with `auth.users`. Each staff profile uses the Auth user UUID as its primary key and supports either the `receptionist` or `admin` role.

The Stage 8 permission-hardening migration:

- removes anonymous table privileges from `staff_profiles`;
- removes anonymous execution of `is_active_staff()` and `is_admin()`;
- preserves authenticated execution required by Row Level Security;
- preserves trusted service-role access; and
- retains Row Level Security on `staff_profiles`.

Stage 8 database migration:

- `supabase/migrations/202607270004_harden_staff_auth_permissions.sql`.

Stage 9 adds the `get_reception_dashboard` database function. It returns active-visitor metrics, filtered visitor records and pagination metadata to the trusted dashboard Vercel Function.

The function:

- returns only currently checked-in visits in the visitor list;
- calculates active, checked-in-today and checked-out-today metrics;
- uses the `Africa/Accra` timezone for operational-day boundaries;
- searches visitor names and visit references;
- filters by agency and Ministry division;
- orders active visits by latest check-in time;
- limits each page to no more than 10 records;
- excludes visitor email addresses and visitor UUIDs; and
- is executable only by the trusted `service_role`.

Stage 9 database migration:

- `supabase/migrations/202608040001_reception_dashboard.sql`.

Stage 10 adds the transactional `checkout_visit` database function. The function locks the selected visit, validates the active staff actor, permits only the `checked_in` to `checked_out` transition, records the database-generated checkout time and creates a corresponding audit event.

Repeated checkout requests are idempotent. When a visit is already checked out, the function returns the existing checkout result without modifying the visit or creating another audit event. Cancelled visits cannot be checked out.

Stage 10 removes unrestricted authenticated `UPDATE` access to `visits` and direct authenticated `INSERT` access to `audit_events`. These mutations now pass through the trusted service-role operation.

The `get_visit_history` function provides protected visit history with:

- visitor-name and visit-reference search;
- checked-in, checked-out and cancelled status filters;
- agency and Ministry division filters;
- check-in date filters using `Africa/Accra` boundaries;
- a maximum date range of 366 days;
- deterministic newest-first ordering; and
- server-side pagination limited to 10 records per page.

Stage 10 introduces the following protected functions:

- `checkout_visit(uuid, uuid)`;
- `get_visit_history(integer, integer, text, text, text, text, date, date)`.

Both functions are executable only by the trusted `service_role`.

Stage 10 adds supporting indexes for status and check-in ordering, checkout timestamps and audit-event entity lookup.

Stage 10 database migration:

- `supabase/migrations/202608040002_visitor_checkout_history.sql`.

Stage 11 adds protected host and staff administration functions. Active administrators access these operations through trusted Vercel Functions after bearer-token and administrator-role verification.

Host administration supports:

- paginated name and department search;
- active and inactive status filtering;
- host creation and editing;
- reversible activation and deactivation; and
- audit recording for created and updated hosts.

Staff administration supports:

- paginated name and email search;
- role and active-status filtering;
- email-based Supabase Auth invitations;
- linking invited Auth users to application staff profiles;
- receptionist and administrator role updates;
- reversible staff activation and deactivation;
- self-demotion and self-deactivation prevention;
- protection of the last active administrator; and
- audit recording for invitations and profile updates.

Stage 11 removes direct authenticated `INSERT`, `UPDATE` and `DELETE` privileges from `hosts` and `staff_profiles`. Mutations are performed by the trusted `service_role` through protected database functions.

Stage 11 introduces the following protected functions:

- `get_admin_hosts(integer, integer, text, text)`;
- `save_admin_host(uuid, uuid, text, text, boolean)`;
- `get_admin_staff(integer, integer, text, text, text)`;
- `create_invited_staff_profile(uuid, uuid, text, text)`; and
- `update_admin_staff(uuid, uuid, text, text, boolean)`.

These functions are executable only by the trusted `service_role`. Host and staff administration lists are limited to 10 records per page.

Stage 11 database migration:

- `supabase/migrations/202608050001_host_staff_administration.sql`.

To remain within the Vercel Hobby deployment limit, the five logical administration endpoints are dispatched through a single consolidated `api/admin.js` Vercel Function, while `vercel.json` rewrites preserve the logical route paths (`/api/admin/hosts/list`, `/api/admin/hosts/save`, `/api/admin/staff/list`, `/api/admin/staff/invite`, `/api/admin/staff/update`).

Development staff accounts are created outside migrations so passwords, email addresses and Auth identifiers are not committed.

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
- consume verified returning-visitor tokens only once;
- prevent token replay from creating duplicate visits;
- enforce one active checked-in visit per visitor at the database level;
- perform returning check-in through a protected database transaction;
- preserve successful check-in results for safe idempotent retries;
- authenticate staff through Supabase Auth;
- verify staff access tokens through the trusted server;
- require an active authorised staff profile;
- restrict staff features by assigned role;
- deny anonymous access to staff-profile information;
- rate-limit public search, verification and registration endpoints;
- avoid personal data in URLs, routine logs and analytics;
- return neutral public authentication and verification errors;
- record privileged actions in the audit trail; and
- complete privacy, accessibility and security review before production use.
- keep staff dashboard searches out of URLs;
- restrict reception dashboard data to active authorised staff;
- enforce dashboard pagination and input limits on the server;
- return only visitor information required for reception operations; and
- prevent anonymous and direct browser execution of dashboard database functions.
- prevent authenticated browser clients from directly updating visit status;
- perform checkout through a row-locked database transaction;
- record the authorised staff actor for successful checkout;
- prevent repeated checkout requests from creating duplicate audit events;
- prevent authenticated browser clients from directly inserting audit records;
- keep visit-history searches and filters out of URLs;
- restrict checkout and visit history to active authorised staff; and
Administrator operations must also:

- verify an active administrator profile on the trusted server;
- prevent receptionists from accessing host and staff administration;
- keep staff searches and filters out of URLs;
- prevent authenticated browser clients from directly mutating hosts or staff profiles;
- protect the last active administrator from deactivation or demotion;
- prevent administrators from deactivating or demoting their own signed-in account;
- record host and staff administration actions in the audit trail;
- validate staff invitation redirect URLs on the server;
- keep staff invitation credentials and SMTP credentials outside browser code; and
- use an approved custom SMTP provider before production deployment.

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
npm run check:validation
npm run test
npm run test:coverage
npm run test:e2e
npm run lint
npm run build
npm audit --omit=dev
npm audit
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
- Staff email and password input validation
- Staff session endpoint method restrictions
- Missing bearer-token rejection
- Unsupported authorization-scheme rejection
- Reception dashboard request validation
- Dashboard page-boundary validation
- Dashboard search-length validation
- Agency and Ministry division filter validation
- Dashboard API method restriction
- Missing staff bearer-token rejection
- Staff checkout request validation
- Visit UUID validation
- Visit-history page and page-size validation
- Visit-history status validation
- Visit-history date validation
- Reversed date-range rejection
- Date ranges longer than 366 days rejected
- Conditional Ministry division validation
- Checkout API method restriction
- Visit-history API method restriction
- Missing staff bearer-token rejection for checkout and history
- Host administration list validation
- Host creation and update validation
- Host-name and department length validation
- Host active-status validation
- Staff administration list validation
- Staff role and active-status validation
- Staff invitation validation
- Invited-staff password complexity validation
- Password-confirmation matching validation
- Administration API method restrictions
- Missing administrator bearer-token rejection
- Invalid invitation-redirect configuration rejection
- First-time visitor normalization and privacy-acknowledgement unit tests
- Active staff authorization and approved response-field tests
- Missing, malformed and oversized bearer-token rejection
- Invalid and expired Supabase staff-session rejection
- Missing, inactive and unsupported staff-profile rejection
- Administrator-only server authorization enforcement
- Protected-route loading and unauthenticated redirect tests
- Protected destination preservation during staff-login redirects
- Receptionist and administrator route-role enforcement
- Staff-login validation, email normalization and error-state tests
- Unsafe post-login destination rejection
- Mocked first-time and returning-visitor browser workflows
- Desktop, compact-mobile and large-mobile browser coverage
- Automated WCAG 2.2 AA axe checks for covered visitor workflows
- Keyboard skip-link and horizontal-overflow browser checks
- Synthetic Supabase staff-authentication browser fixture with no database writes
- Authenticated reception-dashboard loading, statistics, filtering and pagination
- Visitor check-out confirmation, request validation and success-state coverage
- Expired dashboard-session sign-out and login redirection
- Authenticated visit-history loading, filtering and pagination
- Reversed history date-range rejection without an API request
- Staff dashboard and visit-history accessibility checks across three viewports
- Staff-page horizontal-overflow checks across desktop and mobile viewports
- Administrator host loading, filtering and pagination across three viewports
- Host creation validation and successful host creation
- Host editing and deactivation
- Administrator staff loading, filtering and pagination across three viewports
- Staff invitation validation and successful invitation responses
- Staff role changes and account deactivation
- Unauthenticated staff-setup invitation rejection
- Invited-staff password validation and visibility controls
- Successful invited-staff password creation
- Expired invitation password-update handling
- Administrator and staff-setup accessibility checks across three viewports
- Administrator and staff-setup horizontal-overflow checks
- Complete browser suite of 87 passing tests
- Complete unit and component suite of 35 passing tests
- Complete set of 12 passing isolated validation harnesses

### Planned test coverage

- Database-connected API integration tests for registration, lookup, verification and check-in
- RLS tests for anonymous, receptionist and administrator access
- Expanded database-connected checkout and visit-history integration tests
- Manual keyboard and screen-reader testing
- Security and penetration testing before production launch


### Completed Stage 8 runtime checks

- Protected-route redirection
- Neutral incorrect-password response
- Authorised receptionist sign-in
- Persistent session after browser refresh
- Secure sign-out
- Unknown staff-route redirection
- Visitor-route regression validation
- Mobile-width staff-login validation

### Completed Stage 9 runtime checks

- Active-visitor summary metrics
- Active-visitor mobile cards
- Active-visitor desktop table
- Visitor-name search
- Visit-reference search
- Agency filtering
- Ministry division filtering
- Filter clearing
- Manual dashboard refresh
- Loading and empty-result states
- Pagination with 11 active development visits
- Previous, next and numbered page navigation
- Pagination test-data cleanup


### Completed Stage 10 runtime checks

- Checkout confirmation dialog
- Successful visitor checkout
- Active-dashboard removal after checkout
- Active-count metric update
- Checked-out-today metric update
- Checkout persistence after browser refresh
- Checkout audit-event creation
- Correct staff actor recorded in the audit event
- Repeated checkout returned the original result
- Repeated checkout created no duplicate audit event
- Protected visit-history route
- Visit-history status filtering
- Visitor-name and reference search
- Agency and Ministry division filtering
- Ghana date-range filtering
- Filter clearing
- Mobile history-card layout
- Desktop history-table layout
- Staff-session persistence on history refresh

### Completed Stage 11 runtime checks

- Administrator-only navigation
- Receptionist administration-route redirection
- Host creation and editing
- Host activation and deactivation
- Host search and filtering
- Staff search and filtering
- Email-based staff invitation
- Supabase invitation email delivery
- Invitation redirect to `/staff/setup`
- Invited-staff password setup
- Invited-staff sign-in
- Staff role updates
- Staff activation and deactivation
- Self-demotion and self-deactivation protection
- Responsive host and staff administration layouts


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
- [x] Stage 8 — Staff authentication and protected routes
- [x] Stage 9 — Reception dashboard and pagination
- [x] Stage 10 — Visitor checkout and visit history
- [x] Stage 11 — Host and staff administration
- [x] Stage 12 — Security, privacy and abuse controls
- Stage 13 — Automated testing and accessibility — completed
- Stage 14 — Vercel deployment and environments — next
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

### Stage 8 — Staff authentication and protected routes

Status: Completed

Implemented:

- Link application staff profiles to Supabase Auth users.
- Preserve the existing receptionist and administrator roles.
- Remove unnecessary anonymous staff-profile and role-function privileges.
- Validate staff bearer tokens through the Supabase Auth server.
- Verify that the authenticated user has an active authorised staff profile.
- Add a protected staff-session Vercel Function.
- Add shared staff-login validation.
- Add a React authentication provider and authentication hook.
- Listen for Supabase authentication and token-refresh events.
- Persist authorised staff sessions across browser refreshes.
- Add protected staff routes.
- Add a mobile-first staff login page.
- Add a responsive staff layout and secure sign-out.
- Add an authenticated staff landing page.
- Preserve all public visitor routes.
- Add route-level lazy loading to reduce the initial JavaScript bundle.

Database migration:

- `supabase/migrations/202607270004_harden_staff_auth_permissions.sql`

Routes:

| Route | Access | Purpose |
| --- | --- | --- |
| `/staff/login` | Public | Staff authentication |
| `/staff` | Active receptionist or administrator | Protected staff landing page |

API endpoint:

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/staff/session` | `GET` | Verify the bearer token and return the authorised staff role |

Validation completed:

- Staff profile constraints, policies and role functions inspected
- Anonymous staff-profile table access removed
- Anonymous staff-role function execution removed
- Authenticated and service-role permissions verified
- `staff_profiles` Row Level Security verified
- Incorrect-password runtime test
- Authorised receptionist sign-in
- Browser-refresh session persistence
- Sign-out and protected-route validation
- Visitor-route regression validation
- Mobile-width staff-login validation
- Route-level code-splitting build verification
- `npm run check:staff-auth`
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


### Stage 9 — Reception dashboard and pagination

Status: Completed

Implemented:

- Add a protected reception dashboard for active staff.
- Add active, checked-in-today and checked-out-today metrics.
- Calculate operational-day statistics in the `Africa/Accra` timezone.
- Add active-visitor name and reference search.
- Submit staff searches in request bodies instead of URLs.
- Add agency and conditional Ministry division filtering.
- Add server-side pagination with 10 records per page.
- Add responsive mobile visitor cards.
- Add a responsive desktop visitor table.
- Add loading, empty, error and refresh states.
- Reject invalid and expired staff sessions.
- Exclude visitor email addresses and visitor UUIDs from responses.
- Keep checkout actions out of Stage 9.

Database migration:

- `supabase/migrations/202608040001_reception_dashboard.sql`

API endpoint:

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/staff/dashboard` | `POST` | Return protected, filtered and paginated active-visitor data |

Database function:

- `get_reception_dashboard(integer, integer, text, text, text)`

Validation completed:

- Database function signature and `SECURITY DEFINER` verification
- Service-role-only function execution verification
- Dashboard metrics and pagination metadata verification
- Active-visitor runtime display
- Name and reference search
- Agency and Ministry division filtering
- Mobile-card and desktop-table layouts
- Pagination using 11 active development visits
- Pagination test-data cleanup
- `npm run check:dashboard`
- `npm run check:staff-auth`
- `npm run check:returning-check-in`
- `npm run check:returning`
- `npm run check:registration`
- `npm run check:supabase`
- `npm run lint`
- `npm run build`
- `git diff --check`

### Stage 10 — Visitor checkout and visit history

Status: Completed

Implemented:

- Add checkout actions to active-visitor mobile cards and the desktop table.
- Add a confirmation step before recording visitor departure.
- Add a protected checkout Vercel Function.
- Add an atomic, row-locked checkout database transaction.
- Record the checkout timestamp in the database.
- Record the authorised staff actor in `audit_events`.
- Make repeated checkout requests idempotent.
- Prevent repeated checkout from creating duplicate audit events.
- Remove unrestricted authenticated visit updates.
- Remove direct authenticated audit-event insertion.
- Add a protected paginated visit-history Vercel Function.
- Add visitor-name and reference search.
- Add status, agency, division and date-range filters.
- Add responsive visit-history cards and table layouts.
- Add the protected `/staff/history` route and staff navigation item.
- Add shared Zod validation and automated API contract checks.

Database migration:

- `supabase/migrations/202608040002_visitor_checkout_history.sql`

Routes:

| Route | Access | Purpose |
| --- | --- | --- |
| `/staff` | Active receptionist or administrator | Active-visitor dashboard and checkout |
| `/staff/history` | Active receptionist or administrator | Filtered and paginated visit history |

API endpoints:

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/staff/checkout` | `POST` | Atomically check an active visitor out |
| `/api/staff/history` | `POST` | Return protected, filtered and paginated visit history |

Database functions:

- `checkout_visit(uuid, uuid)`
- `get_visit_history(integer, integer, text, text, text, text, date, date)`

Validation completed:

- Database function signature and `SECURITY DEFINER` verification
- Service-role-only function execution verification
- Direct authenticated mutation restriction verification
- Supporting database-index verification
- Successful checkout runtime test
- Checkout timestamp and dashboard refresh verification
- Audit-event actor and status-transition verification
- Idempotent repeated-checkout verification
- Duplicate audit-event prevention verification
- Visit-history search and filter verification
- Mobile and desktop history-layout verification
- Node.js 22 runtime verification
- `npm run check:staff-visits`
- `npm run check:dashboard`
- `npm run check:staff-auth`
- `npm run check:returning-check-in`
- `npm run check:returning`
- `npm run check:registration`
- `npm run check:supabase`
- `npm run lint`
- `npm run build`
- `git diff --check`

### Stage 11 — Host and staff administration

Status: Completed

Implemented:

- Add administrator-only host and staff administration routes.
- Add paginated host and staff lists limited to 10 records per page.
- Add search and status filters for hosts.
- Add search, role and status filters for staff.
- Add host creation, editing, activation and deactivation.
- Add email-based Supabase Auth staff invitations.
- Add invited-staff password setup.
- Add staff role and active-status management.
- Add self-demotion, self-deactivation and last-active-administrator protection.
- Remove direct authenticated host and staff-profile mutations.
- Add protected service-role database functions.
- Record host and staff administration actions in the audit trail.
- Add shared Zod validation and automated administration API checks.
- Add responsive mobile and desktop administration interfaces.

Database migration:

- `supabase/migrations/202608050001_host_staff_administration.sql`

Routes:

| Route | Access | Purpose |
| --- | --- | --- |
| `/staff/setup` | Invited staff session | Complete invited-account password setup |
| `/staff/admin/hosts` | Active administrator | Manage hosts |
| `/staff/admin/staff` | Active administrator | Invite and manage staff |

API endpoints:

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/admin/hosts/list` | `POST` | Return filtered and paginated hosts |
| `/api/admin/hosts/save` | `POST` | Create or update a host |
| `/api/admin/staff/list` | `POST` | Return filtered and paginated staff |
| `/api/admin/staff/invite` | `POST` | Invite a staff member through Supabase Auth |
| `/api/admin/staff/update` | `POST` | Update a staff profile, role or active status |

Validation completed:

- Administrator database-function signature verification
- Service-role-only function execution verification
- Direct authenticated mutation restriction verification
- Administrator-only route validation
- Receptionist-route rejection
- Host creation, editing and deactivation
- Staff invitation and email delivery
- Invited-staff password setup
- Staff role and status updates
- Self-demotion and self-deactivation protection
- `npm run check:admin`
- `npm run check:staff-visits`
- `npm run check:dashboard`
- `npm run check:staff-auth`
- `npm run check:returning-check-in`
- `npm run check:returning`
- `npm run check:registration`
- `npm run check:supabase`
- `npm run lint`
- `npm run build`
- Node.js 22 runtime verification
- `git diff --check`

Future stages will add a new entry under this section describing:

- what was implemented;
- important architectural decisions;
- new environment variables;
- database changes;
- new routes and APIs;
- validation completed; and
- the associated Git commit.

### Stage 12 — Database privilege hardening

- Enforced server-only access to application tables and sequences.
- Revoked direct `anon` and `authenticated` table and sequence privileges.
- Restricted all `postgres`-owned application RPCs.
- Retained authenticated execution only for the RLS authorization helpers.
- Preserved full `service_role` access for trusted Vercel Functions.
- Hardened `SECURITY DEFINER` function search paths.
- Hardened default privileges for future `postgres`-owned public objects.
- Retained existing RLS policies as defence in depth.
- Documented `pg_trgm` as a Supabase-managed extension owned by
  `supabase_admin`; the migration does not alter, drop, reinstall, or
  change privileges on provider-owned extension objects.
- No additional Vercel Function was introduced; the count remains 11.
- Added first-visit registration throttling through the shared
  database-backed rate limiter.
- Limited registration POST requests to five attempts per private
  request key within ten minutes.
- Added neutral `429 Too Many Requests` responses with
  `Retry-After` and `Cache-Control: no-store`.
- Added isolated registration rate-limit validation without using
  production data or making a live Supabase request.
- Preserved the deployment count at 11 Vercel Functions.
- Added centralized production security headers through `vercel.json`.
- Added a restrictive Content Security Policy permitting only self-hosted
  resources and Supabase HTTPS/WebSocket connections.
- Added HSTS, MIME-sniffing protection, clickjacking protection,
  referrer suppression and browser-feature restrictions.
- Preserved static asset caching while enforcing
  `Cache-Control: no-store` on API responses.
- Added automated validation for security headers, Vercel rewrites and the 11-Function deployment limit.
- Required `application/json` for every body-bearing API request.
- Accepted standard JSON media-type parameters such as UTF-8 charset
  declarations while rejecting missing or unsupported media types with
  `415 Unsupported Media Type`.
- Preserved declared and actual UTF-8 request-body limits of 20,000 bytes.
- Added isolated validation for media-type enforcement, malformed JSON,
  invalid content lengths, exact byte boundaries and oversized bodies.
- Prevented browser cross-origin simple requests from reaching JSON
  processing while retaining the same-origin application architecture.
- No additional Vercel Function was introduced; the count remains 11.
- Audited API responses, browser storage, token handling, error messages
  and production bundle references for sensitive-data exposure.
- Confirmed that server secrets are absent from the browser bundle and
  authentication tokens are not persisted in local or session storage.
- Confirmed that unexpected runtime and Supabase errors are replaced by
  neutral responses; only controlled `HttpError` messages reach clients.
- Minimized authenticated staff context so raw bearer tokens and complete
  Supabase user objects remain local to authentication processing.
- Added isolated validation proving that authenticated helpers return only
  the restricted application staff profile.
- No additional Vercel Function was introduced; the count remains 11.
- Adopted the project-approved two-year retention baseline for completed
  visitor records and application audit events.
- Limited expired verification tokens and inactive rate-limit counters to
  a 24-hour cleanup window.
- Added versioned retention-policy configuration and documented legal,
  regulatory, security and investigation holds.
- Added service-role-only dry-run and batched retention-cleanup functions.
- Prevented automatic deletion of open visits and records protected by an
  active retention hold.
- Added policy confirmation, controlled batch sizes, serialized execution,
  row-lock skipping and aggregate cleanup auditing.
- Added retention indexes for rate-limit counters, audit events and orphaned
  visitor-profile assessment.
- Completed the first controlled cleanup: one expired verification token
  and four inactive rate-limit counters were removed.
- Confirmed that no completed visits, visitor profiles or historical audit
  events were eligible for deletion during the first cleanup.
- Flagged two stale open visits for staff review without automatically
  modifying or deleting them.
- Added automated validation for the retention migration, identity-safe
  audit insertion, privilege controls and deployment-function limit.
- No additional Vercel Function was introduced; the count remains 11.
- Extended database-backed throttling to the anonymous host and meeting
  directory endpoints.
- Allowed 300 requests per private request key within ten minutes for each
  public directory, using independent scopes to prevent cross-endpoint
  exhaustion.
- Preferred Vercel's platform forwarding header while retaining local
  `X-Forwarded-For` support.
- Validated and bounded IPv4 and IPv6 address inputs before deriving
  irreversible HMAC request keys.
- Added isolated validation for successful directory responses, neutral
  rate-limit responses, proxy-header precedence and method rejection.
- Preserved `Cache-Control: no-store` and the existing minimal host and
  meeting response fields.
- No additional Vercel Function was introduced; the count remains 11.
- Added account-bound throttling for authenticated high-impact operations.
- Limited host changes to 60 per administrator within ten minutes, staff
  invitations to 20 per administrator within one hour and staff-account
  changes to 30 per administrator within ten minutes.
- Limited visitor checkout to 120 attempts per staff account within ten
  minutes.
- Changed record-specific returning-visitor verification to an account-
  independent subject key, preventing client-address rotation from resetting
  the five-attempt record limit.
- Kept public throttling client-address-bound while deriving authenticated
  limits solely from irreversible HMACs of trusted user or visitor IDs.
- Added isolated validation for key-mode separation, cross-address account
  enforcement, neutral `429` responses and method rejection.
- No additional Vercel Function was introduced; the count remains 11.
- Published privacy notice version `2.0`, effective 14 August 2026.
- Documented the Ministry as the responsible organisation, the visitor data
  collected, processing purposes, authorised access, retention periods,
  returning-visitor reuse and available privacy rights.
- Added Ministry and designated privacy-officer contact information and the
  Data Protection Commission complaint route.
- Required explicit acknowledgement of the current privacy notice for both
  first-time and returning visitor check-ins.
- Recorded privacy notice version `2.0` and a renewed acknowledgement timestamp
  when a returning visitor completes check-in.
- Added a compatibility overload for returning check-in so the deployed
  nine-argument API remains operational during rollout.
- Added isolated validation proving that an unchecked acknowledgement is
  rejected and that the server supplies privacy notice version `2.0`.
- No additional Vercel Function was introduced; the count remains 11.


### Stage 13 — Automated testing and accessibility

Status: Completed

Implemented:

- Added Vitest and Testing Library for repeatable unit and React component testing.
- Added V8 statement, branch, function and line coverage reporting.
- Added Playwright browser testing using desktop, compact-mobile and large-mobile Chromium viewports.
- Added automated axe checks for detectable WCAG 2.2 AA violations in covered states.
- Added responsive horizontal-overflow checks.
- Added keyboard skip-link coverage for the visitor landing page.
- Added mocked first-time and returning-visitor browser workflows.
- Added visitor privacy-acknowledgement enforcement coverage.
- Added expired returning-verification cleanup coverage.
- Added staff authorization, protected-route and staff-login unit and component coverage.
- Added a synthetic Supabase authentication fixture that uses invented credentials and makes no database writes.
- Added authenticated reception-dashboard, filtering, pagination and checkout coverage.
- Added authenticated visit-history, filtering, pagination and date-validation coverage.
- Added administrator host loading, filtering, pagination, creation, editing and deactivation coverage.
- Added administrator staff loading, filtering, pagination, invitation, role-change and deactivation coverage.
- Added invited-staff password validation, successful setup, unavailable invitation and expired-update coverage.
- Corrected mobile description-list semantics in the reception dashboard and visit history.
- Added accessible names to responsive staff sign-out and staff-setup cancellation controls.
- Added a GitHub Actions quality workflow for validation, unit coverage, browser checks, accessibility checks, linting, building, dependency auditing and Function-count enforcement.
- Kept database-connected integration and RLS checks outside CI until a dedicated non-production test environment is configured.
- Added no Vercel Function; the deployable Function count remains 11.

Final verification:

- All 12 isolated validation harnesses passed.
- All 35 unit and component tests passed across four files.
- All 87 Playwright tests passed across desktop and mobile Chromium projects.
- Overall measured coverage reached 7.4% statements, 8.44% branches, 8.77% functions and 7.48% lines.
- `api/_lib/staffAuth.js` and `src/components/ProtectedRoute.jsx` achieved complete statement, branch, function and line coverage.
- `src/pages/StaffLoginPage.jsx` achieved complete statement, function and line coverage and 97.14% branch coverage.
- Covered browser states passed automated axe accessibility checks.
- Responsive overflow checks passed across the configured viewports.
- `npm run check:validation` completed successfully.
- `npm run test` completed successfully.
- `npm run test:coverage` completed successfully.
- `npm run test:e2e` completed successfully.
- `npm run lint` completed successfully.
- `npm run build` completed successfully.
- `npm audit --omit=dev` reported zero vulnerabilities.
- `npm audit` reported zero vulnerabilities.
- The deployable Vercel Function count remained 11.
- `git diff --check` completed successfully.

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
