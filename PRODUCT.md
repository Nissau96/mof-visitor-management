# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three groups carry equal weight in design decisions. Administrators come after them.

- **Visitors** arrive at the Ministry of Finance towers in Accra. They scan the weekly reception QR code on their own phone, or use the reception kiosk. First-time visitors register. Returning visitors find their record with their registered mobile number and first name, then check in for the current visit. Many are one-off members of the public with no account and no training. They complete the flow standing in a lobby, often on a recent iPhone or Android phone.
- **Receptionists** work the desk of their assigned tower (Tower 1 or Tower 2). They show the weekly QR code and watch who is checked in. They admit visitors with physical visitor cards (regular and VIP), check visitors out, record card returns and incidents, and manage meetings. Their work peaks during busy arrival periods. They see only the visits for their own tower.
- **Administrators** manage hosts, staff accounts and roles, and visitor-card inventory. They can see across towers and read analytics and reports.

## Product Purpose

Replaces the manual paper visitor register at the Ministry of Finance with a secure, mobile-first web application.

Success means four things, all of which must hold:

1. The paper register is retired entirely.
2. Visitors get from the door to admission faster, with less queueing at the desk.
3. Management knows who is in the building, holding which card, with an auditable record of every action.
4. The Client Service Unit and leadership get reliable visit figures and reports, including the monthly CSU report.

## Positioning

A government front-desk service built around how these towers actually operate:

- QR access that changes weekly;
- routing to a tower and agency;
- physical visitor cards with tracked return;
- returning-visitor reuse that never reveals another visitor's details.

## Operating Context

- **Visitor access:** a weekly reception QR code opens the visitor landing route. It exchanges a short-lived token for a visitor-access cookie. The QR code cannot identify who scanned it, so the visitor chooses between "This is my first visit" and "I have visited before".
- **Visit details:** visitors name the person they are visiting, the agency (the Ministry of Finance or one of its agencies and project offices, such as GIFMIS, PPA and GIPC), the purpose and, where relevant, a scheduled meeting.
- **Staff sign-in:** staff sign in and select their assigned tower.
- **Staff pages:** dashboard, visitor cards, meetings, visit history, analytics and reports, weekly QR code, and admin pages for hosts, cards and staff.
- **Report conventions:** Accra time. The working week runs Monday to Friday. A visit still open after 6 pm counts as an overstay.
- **Rollout:** the system is in controlled operational rollout. Real visitor data is not entered in Production until final operational approval.

## Capabilities and Constraints

- **Built:**
  - first-time registration;
  - verified returning check-in that resists replayed requests;
  - group visit guests;
  - staff authentication with receptionist and admin roles, locked to a tower;
  - active-visitor dashboard; checkout; visit history;
  - visitor-card inventory with admission, return, incident and replacement tracking;
  - meeting management with host agencies;
  - analytics and reports with exports to CSV/Excel and print/PDF;
  - weekly QR code; staff invitations and temporary-password onboarding.
- **Privacy:**
  - visitors acknowledge a versioned privacy notice (version 2.0), and each acknowledgement is recorded;
  - visitor records are kept only for a limited period;
  - no screen may show one visitor's details to another visitor.
- **Security:**
  - every database table enforces access rules row by row (Supabase Row Level Security);
  - the server checks every staff session;
  - API requests are rate-limited, and security headers are applied;
  - the Content-Security-Policy blocks inline styles;
  - staff actions are recorded in an audit log.
- **Hosting:** Vercel Hobby plan, which allows at most 12 serverless functions.
- **Deferred to phase 2:** pre-registering expected meeting guests.
- **Not yet built:** the card-incident and overstay reports.

## Brand Commitments

- **Identity:** must read as an official Ministry of Finance (Ghana) government service. It uses the Ministry's name and its logo and seal assets.
- **Voice:** plain, polite, formal English that any visitor can follow. No casual or marketing tone.
- **Colour:** the current teal colour scheme is an approved commitment.
- **Themes:** light and dark themes are both required and supported.

## Evidence on Hand

- **Brand assets:**
  - `src/assets/images/mof-logo.webp`
  - `src/assets/images/mof-seal.webp`
  - `src/assets/images/peer-values.webp` and `peerwhite.png`
- **Photography:**
  - `src/assets/images/building-bg.jpeg` and `building-bg-soft.webp`
  - `src/assets/images/reception-desk.webp`
  - `src/assets/images/reception-hero-cutout.webp`
- **Reference data:** the agency and tower lists in `src/constants/visitorOptions.js`.
- **Documentation:** the full stage-by-stage requirements and history are in `README.md`.
- **Must not be invented:** there are no testimonials, usage statistics or published performance figures. Dev data is synthetic, and real visitor data must not appear in screenshots or fixtures.

## Product Principles

1. **Equal care for both sides of the desk.** A visitor's speed on their phone and a receptionist's speed at the counter are both success criteria. One must not be traded away for the other.
2. **Privacy by construction.** Show the minimum, hide masked data, and never let one visitor learn about another. Every privacy promise must be auditable.
3. **The record is the product.** Every admission, card movement and checkout has to be accurate and traceable. Management reports depend on it.
4. **Official, not bureaucratic.** The service reads as the Ministry's own, in plain language anyone in the lobby can follow without help.
5. **Works on the phone in the lobby.** Mobile-first and resilient on recent iOS Safari and Android Chrome. Desktop staff screens follow.

## Accessibility & Inclusion

The product must meet WCAG 2.2 Level AA. It must also:

- **Layout:** have no horizontal page scrolling at 320 CSS pixels, and respect device safe areas.
- **Touch and type:** use touch targets of at least 44 px, and form-control text of 16 px or larger.
- **Forms:** give every field a visible associated label, show errors at each field, and add an error summary.
- **Keyboard:** keep keyboard focus visible, follow a logical focus order, and allow every task to be completed by keyboard alone.
- **Colour:** never use colour as the only status indicator.
- **Automated checks:** cover these requirements in the Playwright tests, using axe for WCAG checks.
