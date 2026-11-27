---
name: MOF Visitor Management
description: The Ministry of Finance front desk, on the visitor's phone and the receptionist's screen.
colors:
  teal-mist: "#f0fdfa"
  teal-wash: "#ccfbf1"
  teal-light: "#99f6e4"
  teal-glow: "#5eead4"
  teal-bright: "#2dd4bf"
  teal-signal: "#14b8a6"
  teal-primary: "#0d9488"
  teal-deep: "#0f766e"
  teal-action: "#115e59"
  teal-ink: "#134e4a"
  teal-night: "#042f2e"
  paper: "#f8fafc"
  surface: "#ffffff"
  hairline: "#e2e8f0"
  field-border: "#cbd5e1"
  muted-text: "#475569"
  body-text: "#1e293b"
  ink: "#020617"
  night-paper: "#0b1220"
  night-surface: "#111a2b"
  night-raised: "#1a2436"
  night-hairline: "#263247"
  night-ink: "#f5f7fa"
  danger-wash: "#fef2f2"
  danger-text: "#b91c1c"
  caution-wash: "#fffbeb"
  caution-text: "#92400e"
  success-wash: "#ecfdf5"
  success-text: "#065f46"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "3rem"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1.875rem"
    fontWeight: 900
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 900
    lineHeight: 1.5
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.25
  caption:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.33
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  card: "24px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.teal-action}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.teal-ink}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.body-text}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.paper}"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
    height: "48px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "24px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.muted-text}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "44px"
  nav-item-active:
    backgroundColor: "{colors.teal-mist}"
    textColor: "{colors.teal-action}"
  chip-filter:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.body-text}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "44px"
  chip-filter-selected:
    backgroundColor: "{colors.teal-action}"
    textColor: "{colors.surface}"
---

# Design System: MOF Visitor Management

## Overview

**Creative North Star: "The Calm Front Desk"**

The interface is the Ministry's reception desk. It welcomes you, it is composed and it is unhurried. It reads as official without being cold. A visitor standing in the lobby, phone in hand, and a receptionist working through a morning rush should both feel that the desk has things in hand. Every screen answers "what do I do next?" before it says anything else.

The look is built from four things:

- **Teal:** one teal family carries identity and action.
- **Neutrals:** cool slate on a pale paper background.
- **Type:** confident, heavy headings with plain, readable body text.
- **Corners:** generous rounding.

Depth is layered and lifted. White cards sit on the paper background, rise on hover, and dialogs float well above everything else. The Ministry of Finance logo and seal are the identity marks. Real building and reception photography carries the visitor-facing welcome, and the staff tools stay quiet and dense.

Dark mode is a full sibling, not an afterthought. Slate is inverted at the token level, and teal shifts to its brighter steps so it still reads on navy.

**Key Characteristics:**
- **Colour:** a single teal family for identity, action and data. Status hues (red, amber, emerald) are used only for state.
- **Type:** headings and figures in the heaviest weight (900) with slightly tightened letter spacing; body text stays regular.
- **Shape:** soft, generous corners. Cards are 24px, controls 12px, chips and avatars fully round.
- **Depth:** layered, lifting surfaces. Cards lift and gently bob on hover; dialogs and hero panels cast deep, soft shadows.
- **Touch:** large targets of at least 44px and 16px form text, built for phones first.

## Colors

The palette is a single teal family set against cool slate neutrals. All of the brand's colour lives in that teal.

### Primary
- **Teal Primary** (#0d9488): the brand reference teal. Used for focus rings (at 30% opacity), the active-navigation marker and small brand details. It is not used as a fill behind white text.
- **Teal Action** (#115e59): solid fill for primary buttons, selected chips and active states with white text. It passes AA contrast against white.
- **Teal Ink** (#134e4a): hover state of Teal Action, and the colour of display headings on the visitor pages.
- **Teal Deep** (#0f766e): the primary chart series in light mode, plus dark accents and brand text links.
- **Teal Mist** (#f0fdfa) and **Teal Wash** (#ccfbf1): tinted panels, the active navigation background, highlighted figures and focus halos.
- **Teal Glow** (#5eead4) and **Teal Bright** (#2dd4bf): the secondary chart series in light mode. In dark mode they become the primary chart series and the teal highlights.

### Neutral
- **Paper** (#f8fafc): the page background behind every card.
- **Surface** (#ffffff): cards, dialogs, inputs and the sidebar.
- **Hairline** (#e2e8f0): card borders, dividers and chart gridlines.
- **Field Border** (#cbd5e1): borders of inputs and secondary buttons.
- **Muted Text** (#475569): subtitles, helper text and inactive navigation.
- **Body Text** (#1e293b): labels and secondary-button text.
- **Ink** (#020617): headings, figures and primary text.
- **Night Paper** (#0b1220), **Night Surface** (#111a2b), **Night Raised** (#1a2436) and **Night Hairline** (#263247): the dark-theme page, cards and inputs, raised tiles, and borders.
- **Night Ink** (#f5f7fa): the darkest slate value in the light theme becomes this near-white in dark mode.

### Status
- **Danger** (wash #fef2f2, text #b91c1c): errors, failed checks and card incidents.
- **Caution** (wash #fffbeb, text #92400e): overstays, warnings and pending actions.
- **Success** (wash #ecfdf5, text #065f46): completed check-ins and confirmations.

### Named Rules
**The One Teal Rule.** Teal is the only brand colour. The former yellow-gold accent (#fcd116) has been removed from the system. Do not reintroduce gold, a second brand hue or a gradient between colours.

**The Fill-Behind-White Rule.** Any solid teal fill that carries white text uses Teal Action (#115e59) or darker. Lighter teals are only for tints, borders, charts and text on dark surfaces.

**The Status-Is-Not-Brand Rule.** Red, amber and emerald appear only to report state. Every status colour comes with a text label or an icon, never colour alone.

## Typography

**Display Font:** Inter (with ui-sans-serif, system-ui, -apple-system, Segoe UI fallback)
**Body Font:** the same family
**Label/Mono Font:** none separate. Figures use tabular numerals.

**Character:** one sans-serif family does all the work. Hierarchy comes from weight and size, not from a font pairing. Headings and key figures are set at weight 900 with tight tracking for a confident, official voice; body text stays at regular weight so long forms remain easy to read.

Inter is named first but is not self-hosted, so the platform's system sans is what renders today.

### Hierarchy
- **Display** (900, 3rem, line height 1): visitor landing headings in Teal Ink. On phones it drops to 2.25rem.
- **Headline** (900, 1.875rem, line height 1.25): page titles in staff tools and hero figures on the dashboard.
- **Title** (900, 1rem): card and section titles such as "Tower 1 visitors" and "First-time vs returning".
- **Body** (400, 1rem, line height 1.5): form text, paragraphs and table cells. Form controls never go below 16px.
- **Label** (600–700, 0.875rem): form labels, buttons and navigation items.
- **Caption** (600, 0.75rem): metadata, percentages, chart captions and helper lines.

### Named Rules
**The Heavy Figures Rule.** Counts, KPIs and visit references are set at weight 900 with tabular numerals, so columns of figures line up and read at a glance.

**The Sixteen Floor Rule.** No input, select or textarea text is smaller than 16px. This stops iOS from zooming in and keeps the form readable in a lobby.

## Layout

The layout is mobile-first and has no horizontal page scrolling down to 320px; it respects device safe-area insets.

- **Visitor screens:** a single centred column. Hero photography sits behind it, and a soft building image blurs behind forms.
- **Staff screens:**
  - **Sidebar:** fixed on desktop and collapsible to icons; on mobile it becomes a slide-in drawer. There is no bottom navigation bar.
  - **Content:** a card grid that changes from one column on phones to two or three columns from `lg`. Cards use container queries to rearrange their own inner layout when they are narrow.
- **Spacing:** Tailwind's 4px scale. Cards have 20px padding on phones and 24px from `sm`. Gaps inside a group are 8–12px, and gaps between sections are 20–24px.
- **Dialogs:** a fixed header and footer, with a body that scrolls on its own using a thin, rounded scrollbar.

## Elevation & Depth

Depth is layered and lifted. Surfaces stack visibly: the paper background, then white cards with a hairline border and soft shadow, then raised hover states, then dialogs and hero panels with deep, diffuse shadows. Primary buttons cast a teal-tinted shadow, so the main action feels physically raised.

### Shadow Vocabulary
- **Resting card** (`box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)`): every card and input at rest.
- **Hover lift** (`translate: 0 -4px; box-shadow: 0 18px 36px -16px rgb(15 23 42 / 0.28)`): interactive cards on hover, followed by a slow 4px bob (2.4s). Only for mouse users who allow motion.
- **Teal action glow** (`box-shadow: 0 10px 15px -3px rgb(15 118 110 / 0.25)`): primary buttons and selected key actions.
- **Dialog** (`box-shadow: 0 24px 80px -30px rgba(0,0,0,0.4)`): modals and floating panels.

### Named Rules
**The Lift-Means-Touchable Rule.** A surface lifts on hover only when clicking it does something. Static information cards keep the resting shadow.

**The Motion-Consent Rule.** Lifts, bobs and slide-ins run only under `prefers-reduced-motion: no-preference`. Without motion, depth is shown by shadow alone.

## Shapes

Corners are soft and generous throughout.

| Element | Radius |
|---|---|
| Cards and panels | 24px |
| Inner tiles, figure panels, dialogs | 16px |
| Buttons and form fields | 12px |
| Chips, pills, avatars, the icon buttons used for pagination, status dots | Fully round |
| Small badges | 6–8px |

Borders are 1px hairlines. There are no thick or coloured side borders. The only exception is the 4px rounded teal marker beside the active navigation item.

## Components

### Buttons
Confident and tactile. Every button is a large, rounded target.
- **Shape:** gently rounded (12px). Height is at least 44px, and 48px in forms.
- **Primary:** Teal Action fill with white bold text, 20px horizontal padding and a teal action glow.
- **Hover / Focus:** hover deepens the fill to Teal Ink. Focus shows a 4px Teal Primary ring at 30% opacity.
- **Disabled:** reduced opacity (40–50%) or a slate-200 fill with slate-500 text, and a not-allowed cursor.
- **Secondary:** white surface, 1px Field Border and Body Text label; hover moves to Paper.
- **Icon buttons:** round, 40px, with a hairline border, used for pagination and toolbar actions.

### Chips
- **Style:** fully round pills at 44px height. Unselected chips are white with a hairline border.
- **State:** a selected period or filter chip fills with Teal Action and white text. Chips stay on one line from `sm` up.

### Cards / Containers
- **Corner Style:** 24px.
- **Background:** white Surface on Paper. Night Surface in dark mode.
- **Shadow Strategy:** resting card shadow, with the hover lift for interactive cards (see Elevation & Depth).
- **Border:** 1px Hairline.
- **Internal Padding:** 20px on phones, 24px from `sm`.
- **Header:** a title (900, 1rem) with a muted one-line subtitle, and an optional action on the right.
- **Inner figure panel:** a Teal Mist tile with a 16px radius holds a hero count (900, 1.875rem) and a caption.

### Inputs / Fields
- **Style:** at least 48px high, 12px radius, 1px Field Border, white fill, 16px text, 12px × 16px padding and the resting shadow.
- **Focus:** a 4px Teal Primary ring at 30% opacity, with no outline.
- **Error:** the field shows red-700 error text, and the form has a red-50 error summary at the top. Labels are always visible above the field.
- **Placeholder:** slate-600, which passes AA. It follows the dark theme because slate is remapped.

### Navigation
- **Sidebar items:** 44px high, 12px radius, label weight. Inactive items use Muted Text; hover moves to slate-100.
- **Active item:** Teal Mist background, Teal Action text in bold, and the 4px teal marker on the left edge.
- **Collapse:** the sidebar collapses to icons only, with tooltips taken from the item label. On mobile it opens as a drawer.

### Report charts (signature component)
The charts use Apache ECharts with the SVG renderer.
- **Colour:** every colour comes from `--chart-*` tokens, so the charts follow the theme.
- **Tooltips:** richText tooltips stay inside the chart (`confine`), because the CSP blocks inline HTML styles.
- **Accessibility:** each chart is `aria-hidden`, and its numbers are given in a visually hidden table.
- **Donut:** the donut shows its total in the centre and has a legend of count rows with share bars.

## Do's and Don'ts

### Do:
- **Do** use Teal Action (#115e59) or darker for any solid fill behind white text.
- **Do** keep every touch target at least 44px and every form control's text at least 16px.
- **Do** set counts and figures at weight 900 with tabular numerals.
- **Do** give interactive cards the hover lift, gated behind `prefers-reduced-motion: no-preference`.
- **Do** add a dark-theme counterpart in `src/dark-theme.css` whenever a new light-only colour utility appears.
- **Do** pair every status colour with a label or an icon.
- **Do** use the Ministry of Finance logo and seal as the only identity marks.

### Don't:
- **Don't** reintroduce the yellow-gold accent (#fcd116) or any second brand hue.
- **Don't** put white text on Teal Primary (#0d9488) or any lighter teal.
- **Don't** use colour alone to show a status.
- **Don't** add a bottom mobile navigation bar.
- **Don't** use inline HTML styles in chart tooltips or injected markup; the Content-Security-Policy blocks them.
- **Don't** add thick or coloured side borders to cards, list items or alerts.
- **Don't** show real visitor data in screenshots, fixtures or design examples.
