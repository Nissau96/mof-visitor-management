# Visitor Management Application

A simple, secure and mobile-first visitor registration and check-in application built with React.js, JavaScript, Tailwind CSS, Supabase and Vercel.

The application allows first-time visitors to register their details and record a visit. Returning visitors can locate a masked visitor record, verify ownership with their registered mobile number and check in without completing the full registration process again.

> Project status: Database foundation completed; secure environment connection in progress  
> Current implementation stage: Stage 3 — Environment configuration and Supabase clients  
> Documentation version: 1.4

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

Stages 1 and 2 established the React application and Supabase database foundation. Stage 3 introduces separate browser-safe and server-only Supabase clients, protected environment files and a development connection check.

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

### Stage 3 completion checklist — in progress

- [x] `.env.example` added without real credentials
- [x] `.gitignore` protects `.env.local` and other environment files
- [x] `.env.local` created locally and remains untracked
- [x] Browser-safe Supabase client created in `src/lib/supabase.js`
- [x] Server-only Supabase admin client created in `api/_lib/supabase.js`
- [x] `VISITOR_LOOKUP_SECRET` generated locally
- [x] Supabase connection-check script added
- [x] ESLint scopes browser globals to `src/` and Node globals to `api/`, `scripts/` and configuration files
- [x] Official `@eslint/compat` wrappers configured for React plugins used with ESLint 10
- [ ] `process is not defined` lint error prevented
- [ ] `npm run check:supabase` completed successfully
- [ ] Secret values confirmed absent from Git changes
- [ ] `npm run lint` completed successfully
- [ ] `npm run build` completed successfully
- [x] README updated with the Stage 3 implementation and pending validation
- [ ] Stage 3 Git commit created

Do not mark Stage 3 as complete until all checks above have passed.

## Technology stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React.js with JavaScript | Component-based visitor and staff interfaces |
| Build tool | Vite | Local development server and production build |
| Routing | React Router | Visitor, login, dashboard and administration routes |
| Styling | Tailwind CSS | Responsive mobile-first interface and design tokens |
| Forms | React Hook Form | Form state, validation feedback and submission handling |
| Validation | Zod | Browser and server input validation |
| Database | Supabase Postgres | Visitors, visits, hosts, staff and audit records |
| Authentication | Supabase Auth | Receptionist and administrator authentication |
| Backend | Vercel Functions | Protected registration, lookup and verification operations |
| Hosting | Vercel | Frontend and serverless Function deployment |
| Icons | Lucide React | Consistent accessible interface icons |
| Code quality | ESLint 10 with `@eslint/compat` | Browser, React and server linting with temporary compatibility wrappers for plugins using older rule APIs |

Package versions are controlled by `package.json` and `package-lock.json`. Always commit the lock file and test dependency upgrades before merging them.

## Project requirements

Install the following before starting:

- Node.js supported by the current Vite release;
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

### 4. Start the development server

```bash
npm run dev
```

Vite normally displays a local URL similar to:

```text
http://localhost:5173
```

### 5. Run the quality checks

```bash
npm run lint
npm run build
```

Both commands must succeed before a development stage is committed.

## Available scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run lint` | Check the source code with ESLint |
| `npm run build` | Create the optimised production build |
| `npm run preview` | Preview the production build locally |
| `npm run check:supabase` | Verify the server-side development connection without printing credentials |

Additional testing scripts will be documented when the automated test stage is implemented.

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
│   └── _lib/                    # Server-only helpers
├── public/                      # Public static files
├── src/
│   ├── components/              # Reusable interface components
│   ├── context/                 # Authentication and shared state
│   ├── layouts/                 # Visitor and dashboard layouts
│   ├── lib/                     # Browser-safe clients and utilities
│   ├── pages/                   # Application pages
│   ├── App.jsx                  # Routes and application entry component
│   ├── index.css                # Tailwind import and global styles
│   └── main.jsx                 # React browser entry point
├── scripts/
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

| Table | Purpose |
|---|---|
| `visitor_profiles` | Reusable visitor identity and contact information |
| `visits` | One record for each arrival and departure |
| `hosts` | Active people or offices that can receive visitors |
| `staff_profiles` | Application role attached to a Supabase Auth user |
| `audit_events` | Staff actions, access changes, corrections and exports |

The Stage 2 schema introduces the five planned tables, constraints, indexes, role helper functions and the first-registration transaction. Row Level Security is enabled on every application table.

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
npm run check:supabase
npm run lint
npm run build
```

### Planned test coverage

- Unit tests for validation, phone normalisation, masking and token handling
- API tests for registration, lookup, verification and check-in
- RLS tests for anonymous, receptionist and administrator access
- End-to-end tests for first-time and returning visitors
- Pagination and checkout tests
- Mobile viewport tests
- Automated accessibility checks
- Manual keyboard and screen-reader testing
- Security and penetration testing before production launch

## Deployment

The application will be deployed through Vercel.

The planned deployment environments are:

| Environment | Purpose | Database |
|---|---|---|
| Development | Local implementation | Development Supabase project |
| Preview | Pull-request review and UAT | Staging/development Supabase project |
| Production | Approved live visitor service | Production Supabase project |

Preview deployments must never connect to the production visitor database.

The final visitor QR code must contain only the stable production HTTPS visitor URL. Do not print a QR code that points to a temporary Vercel preview address.

## Development roadmap

- [x] Stage 1 — React, Vite and Tailwind foundation
- [x] Stage 2 — Supabase database schema and Row Level Security
- [ ] Stage 3 — Environment configuration and Supabase clients
- [ ] Stage 4 — Application routing and shared layout
- [ ] Stage 5 — First-time visitor registration
- [ ] Stage 6 — Returning-visitor search and verification
- [ ] Stage 7 — Returning-visitor check-in
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

Stage and commit the code and README together:

```bash
git add .
git commit -m "chore: initialize React Vite visitor management app" -m "Create the React JavaScript project, configure Tailwind CSS v4, add the mobile-first visitor landing interface, and document the foundation in the repository README."
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

Status: In progress

Implemented:

- Add `.env.example` containing names and placeholders only.
- Protect local environment files with `.gitignore`.
- Configure the browser-safe Supabase publishable client.
- Configure the server-only Supabase secret client.
- Generate a signing secret for returning-visitor verification tokens.
- Add a Supabase development connection-check script.
- Keep browser configuration on `import.meta.env` and server configuration on `process.env`.
- Scope Node globals to Vercel Functions, scripts and configuration files so browser code cannot silently depend on `process`.
- Add the official `@eslint/compat` layer for React plugins that still use rule APIs removed by ESLint 10.

Validation pending:

- `npm run check:supabase`
- `npm run lint`
- `npm run build`
- Review tracked changes for secret values and confirm `.env.local` remains ignored.

Planned Stage 3 commit:

```text
chore: configure secure Supabase connections
```

Stage 3 must remain in progress until the pending validation succeeds and the commit is created.

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