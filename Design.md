---
version: alpha
name: Github
description: |
  GitHub's design system embodies a dark, technical-forward aesthetic rooted in
  developer culture and open-source collaboration. The visual language is
  intentionally minimal and functional, prioritizing clarity and accessibility
  in code-heavy environments. Deep navy and black canvases (#0D1117) provide a
  comfortable surface for extended screen time, while bright accent green
  (#08872B) creates strong action focal points. The system employs layered
  gradients in hero sections—blending dark navy foundations with subtle purple
  and green undertones—to inject personality without sacrificing usability.
  Typography is bold and confident, using variable fonts (Mona Sans) to convey
  stability and modernity. Interactions are crisp and responsive, with minimal
  shadows relying instead on color shifts and subtle focus rings to signal state
  changes. The overall effect is authoritative yet approachable—designed for
  developers who value precision, speed, and visual intelligence.
source:
  url: "https://github.com"
  pagesAnalyzed: 1
  extractedAt: 2026-10-06
  tokensMeasured: true
colors:
  primary: "#08872B"
  canvas: "#0D1117"
  surface-alt: "#000000"
  on-primary: "#FFFFFF"
  ink: "#FFFFFF"
  body: "#A4AEA6"
  muted: "#24292F"
  accent-1: "#A2DAFF"
  accent-2: "#090D0A"
  neutral-1: "#F0F6FC"
typography:
  display-xl:
    fontFamily: "Mona Sans"
    fontSize: 64px
    fontWeight: 425
    lineHeight: 1.08
    letterSpacing: -2.24px
  display-lg:
    fontFamily: "Mona Sans"
    fontSize: 40px
    fontWeight: 460
    lineHeight: 1.2
    letterSpacing: 0px
  display-lg-strong:
    fontFamily: "Mona Sans"
    fontSize: 40px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0px
  heading:
    fontFamily: "Mona Sans"
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0px
  body-xl:
    fontFamily: "Mona Sans"
    fontSize: 22px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0px
  body-xl-2:
    fontFamily: "Mona Sans"
    fontSize: 22px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0.24px
  body-xl-strong:
    fontFamily: "Mona Sans"
    fontSize: 22px
    fontWeight: 425
    lineHeight: 1.2
    letterSpacing: 0px
  body-lg:
    fontFamily: "Mona Sans"
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0.18px
  body-md:
    fontFamily: "Mona Sans"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0.24px
  body-sm:
    fontFamily: "Mona Sans"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0.21px
  button-xl:
    fontFamily: "Mona Sans"
    fontSize: 22px
    fontWeight: 480
    lineHeight: 1.4
    letterSpacing: 0px
  button-lg:
    fontFamily: "Mona Sans"
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0.24px
  button-md:
    fontFamily: "Mona Sans"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0px
  label-md:
    fontFamily: "Mona Sans"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0.21px
  label-md-tight:
    fontFamily: "Mona Sans"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0px
  code-md:
    fontFamily: "Mona Sans Mono"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0.24px
    textTransform: uppercase
  code-sm:
    fontFamily: "Mona Sans Mono"
    fontSize: 14px
    fontWeight: 480
    lineHeight: 1.5
    letterSpacing: 0px
    textTransform: uppercase
  code-xs:
    fontFamily: "Mona Sans Mono"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0px
    textTransform: uppercase
rounded:
  none: 0px
  xs: 6px
  sm: 8px
  md: 16px
  full: 9999px
spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 24px
  xxl: 28px
  xxxl: 32px
  section: 40px
  band: 48px
borderWidths:
  thin: 1px
shadows:
  sm: "rgb(61, 68, 77) 0px 0px 0px 1px, rgba(1, 4, 9, 0.4) 0px 6px 12px -3px, rgba(1, 4, 9, 0.4) 0px 6px 18px 0px"
elevationStrategy: single-tier
themes:
  derived: light   # the other theme is the site's measured palette
  light:
    bg: "#FAFCFB"
    surface: "#F0F2F1"
    surfaceRaised: "#E9EAE9"
    text: "#111712"
    textMuted: "#696D6A"
    border: "#D7D9D8"
    accent: "#08872B"
    accentFg: "#FFFFFF"
    focusRing: "#08872B"
    elevation: shadow
  dark:
    bg: "#0D1117"
    surface: "#000000"
    surfaceRaised: "#141414"
    text: "#FFFFFF"
    textMuted: "#A4AEA6"
    border: "#2A2E33"
    accent: "#08872B"
    accentFg: "#FFFFFF"
    focusRing: "#08872B"
    elevation: "border+surface"
gradients:
  - context: hero
    kind: linear
    value: "linear-gradient(rgb(0, 2, 64), rgba(0, 0, 0, 0))"
  - context: hero
    kind: linear
    value: "linear-gradient(rgb(0, 2, 64), rgb(0, 0, 0) 117%)"
  - context: hero
    kind: linear
    value: "linear-gradient(rgba(255, 255, 255, 0) -8.14%, rgba(255, 255, 255, 0.1) 62.09%)"
  - context: hero
    kind: linear
    value: "linear-gradient(rgba(39, 50, 231, 0) 57.46%, rgba(95, 237, 131, 0.5) 112.96%)"
  - context: hero
    kind: linear
    value: "linear-gradient(rgba(0, 0, 0, 0) 47.42%, rgba(14, 10, 162, 0.5) 104.56%)"
  - context: section
    kind: linear
    value: "linear-gradient(90deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.57) 300%)"
components:
  button-filled:
    textColor: "{colors.accent-1}"
    border: "1px solid {colors.on-primary}"
    height: 56px
    padding: "6px 20px 6px 20px"
    fontSize: 14px
    fontFamily: "Mona Sans VF"
    fontWeight: 400
    lineHeight: 1.5
    rounded: "{rounded.xs}"
    backgroundColor: "rgba(31, 35, 40, 0.4)"
  button-secondary:
    textColor: "{colors.ink}"
    border: "1px solid rgb(38, 44, 40)"
    height: 32px
    padding: "1px 12px 1px 12px"
    fontSize: 16px
    fontFamily: "Mona Sans VF"
    fontWeight: 400
    lineHeight: 1.5
    rounded: "{rounded.xs}"
    backgroundColor: "rgba(0, 0, 0, 0.01)"
  button-secondary-2:
    textColor: "{colors.ink}"
    border: "1px solid rgba(255, 255, 255, 0.06)"
    height: 32px
    padding: "0px 12px 0px 12px"
    fontSize: 16px
    fontFamily: "Mona Sans VF"
    fontWeight: 400
    lineHeight: 1.5
    rounded: "{rounded.xs}"
    backgroundColor: "rgba(255, 255, 255, 0.12)"
  button-primary:
    typography: "{typography.button-md}"
    textColor: "{colors.ink}"
    height: 48px
    padding: "6px 20px 6px 20px"
    rounded: "{rounded.xs}"
    backgroundColor: "{colors.primary}"
  button-icon:
    textColor: "{colors.ink}"
    border: "1px solid rgb(25, 31, 27)"
    height: 32px
    fontSize: 14px
    fontFamily: "Mona Sans VF"
    fontWeight: 400
    lineHeight: 1.5
    rounded: 48px
    backgroundColor: "{colors.accent-2}"
  navigation:
    typography: "{typography.body-md}"
    textColor: "{colors.ink}"
    height: 40px
  footer:
    typography: "{typography.button-md}"
    textColor: "{colors.ink}"
    border: "2px solid rgb(95, 237, 131)"
    backgroundColor: "rgb(15, 21, 17)"
  link:
    textColor: "{colors.accent-1}"
    fontSize: 14px
    fontFamily: "Mona Sans VF"
    fontWeight: 400
    lineHeight: 1.5
  link-sm:
    textColor: "rgba(255, 255, 255, 0.6)"
    border: "1px solid rgba(255, 255, 255, 0.15)"
    fontSize: 14px
    fontFamily: "Mona Sans VF"
    fontWeight: 400
    lineHeight: 1.5
    rounded: "50%"
    backgroundColor: "rgba(13, 17, 23, 0.75)"
states:
  link-hover:
    target: link
    state: hover
    textDecoration: underline
  button-focus:
    target: button
    state: focus
    boxShadow: none
  button-focus-visible:
    target: button
    state: focus-visible
    boxShadow: none
  other-focus-visible:
    target: other
    state: focus-visible
    outline: "rgba(0, 0, 0, 0) solid 1px"
    outlineColor: "rgba(0, 0, 0, 0)"
    outlineWidth: 1px
  button-hover:
    target: button
    state: hover
    textDecoration: none
  button-active:
    target: button
    state: active
    outline: "rgba(0, 0, 0, 0) solid 1px"
    boxShadow: none
    outlineColor: "rgba(0, 0, 0, 0)"
    outlineWidth: 1px
  button-disabled:
    target: button
    state: disabled
    boxShadow: none
  other-hover:
    target: other
    state: hover
    textDecoration: none
  input-focus:
    target: input
    state: focus
    outline: none
  input-focus-visible:
    target: input
    state: focus-visible
    outline: none
  other-focus:
    target: other
    state: focus
    transform: "translate(-50%) translateY(-50%)"
breakpoints:
  - width: 375
    containerWidth: 327
    gridColumns: 7
    navLinksVisible: 45
    menuToggleVisible: true
    headingPx: 40
    bodyPx: 14
    sectionPaddingX: 24
  - width: 768
    containerWidth: 720
    gridColumns: 4
    navLinksVisible: 45
    menuToggleVisible: true
    headingPx: 56
    bodyPx: 14
    sectionPaddingX: 24
  - width: 1024
    containerWidth: 976
    gridColumns: 6
    navLinksVisible: 46
    menuToggleVisible: true
    headingPx: 64
    bodyPx: 14
    sectionPaddingX: 24
  - width: 1280
    containerWidth: 1246
    gridColumns: 6
    navLinksVisible: 46
    menuToggleVisible: true
    headingPx: 64
    bodyPx: 14
    sectionPaddingX: 24
  - width: 1440
    containerWidth: 1392
    gridColumns: 6
    navLinksVisible: 46
    menuToggleVisible: true
    headingPx: 64
    bodyPx: 14
    sectionPaddingX: 24
coverage:
  statesFound: 61
  gradientsFound: 6
  rolesUnassigned: 3
  archetypesUnnamed: 0
  archetypesDetected: 0
  responsiveMeasured: true
  stylesheetsBlocked: false
  semanticRampDeclared: false
---

# Design System Inspired by GitHub

## 1. Visual Theme & Atmosphere

GitHub's design system embodies a **dark, technical-forward aesthetic** rooted in developer culture and open-source collaboration. The visual language is intentionally minimal and functional, prioritizing clarity and accessibility in code-heavy environments. Deep navy and black canvases (`{colors.canvas}` — `#0D1117`) provide a comfortable surface for extended screen time, while bright accent green (`{colors.primary}` — `#08872B`) creates strong action focal points. The system employs layered gradients in hero sections—blending dark navy foundations with subtle purple and green undertones—to inject personality without sacrificing usability. Typography is bold and confident, using variable fonts (Mona Sans) to convey stability and modernity. Interactions are crisp and responsive, with minimal shadows relying instead on color shifts and subtle focus rings to signal state changes. The overall effect is authoritative yet approachable—designed for developers who value precision, speed, and visual intelligence.

**Key Characteristics**

- **Dark-first palette**: Deep canvas (`#0D1117`) and pure black (`#000000`) create a low-contrast, comfortable reading environment
- **Brand green for emphasis**: Primary accent (`#08872B`) reserved for high-intent CTAs and confirmation states
- **Minimal elevation**: Depth achieved through color blocking and single-tier shadows, not stacked layers
- **Variable typography**: Mona Sans family with precision tracking and tight line heights for technical readability
- **Sharp, functional corners**: Most interactive elements use minimal border radius (`6px` or `0px`) for a clean, orthogonal feel
- **Developer-centric interaction states**: Focus rings, hover underlines, and outline treatments borrowed from CLI and code editors
- **Gradient hero sections**: Layered linear gradients for visual richness without noise—purple, green, and white overlays on dark navy bases
- **Semantic, not decorative**: Every UI decision supports scanning, comparison, and deep work

---

## 2. Color Palette & Roles

### Primary

- **Primary / Brand** (`{colors.primary}` — `#08872B`): High-intent CTAs, confirmation states, active tabs, and accent UI. The brand's signature green—unmistakable and reserved for the most important interactive moments.

### Accent Colors

- **Accent 1 / Decorative** (`{colors.accent-1}` — `#A2DAFF`): Light cyan used in hero section overlays and gradient fills. Decorative only; no interactive role.
- **Accent 2 / Decorative** (`{colors.accent-2}` — `#090D0A`): Very dark charcoal used in decorative illustrations and background layers. Adds subtle visual texture.

### Neutral Scale

- **Canvas** (`{colors.canvas}` — `#0D1117`): Default page background. Warm, slightly-offset black that prevents eye strain during extended use.
- **Surface Alt** (`{colors.surface-alt}` — `#000000`): Pure black, reserved for alternating section bands and high-contrast backgrounds.
- **Ink / On Primary** (`{colors.on-primary}` — `#FFFFFF`): Primary text on brand surfaces and headings. Pure white for maximum contrast and authority.
- **Body** (`{colors.body}` — `#A4AEA6`): Body copy and secondary descriptions. Slightly warm gray that reads comfortably on dark backgrounds.
- **Muted** (`{colors.muted}` — `#24292F`): Captions, tertiary text, and disabled states. Darkened neutral for visual hierarchy depth.
- **Neutral 1 / Decorative** (`{colors.neutral-1}` — `#F0F6FC`): Light, cool neutral. Decorative only; not used as a primary surface or text color in this extraction.

---

## 3. Typography Rules

### Font Family

**Primary:** Mona Sans, Mona Sans VF (variable)  
**Monospace:** Mona Sans Mono  
**Fallback:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`

The system uses Mona Sans as its core typeface—a humanist sans-serif optimized for both screen and print. Mona Sans Mono handles code blocks and technical labels. Both families support variable weight, enabling precise typographic control across weights 400–600.

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Display XL | Mona Sans | 64px | 425 | 1.08 | −2.24px | Hero headlines; tight tracking for visual drama |
| Display Large | Mona Sans | 40px | 460–500 | 1.2–1.3 | 0px | Section headings; weight variant for emphasis |
| Heading | Mona Sans | 22px | 600 | 1.4 | 0px | Subsection titles and card headers |
| Body XL | Mona Sans | 22px | 400–425 | 1.2–1.4 | 0–0.24px | Large descriptive text; slight tracking on variant |
| Body Large | Mona Sans | 18px | 400 | 1.5 | 0.18px | Lead paragraphs and introductory text |
| Body Medium | Mona Sans | 16px | 400 | 1.5 | 0.24px | Standard body copy and UI labels |
| Body Small | Mona Sans | 14px | 500 | 1.5 | 0.21px | Captions, hints, and secondary UI text |
| Button XL | Mona Sans | 22px | 480 | 1.4 | 0px | Large action buttons (sign-up, primary CTAs) |
| Button Large | Mona Sans | 16px | 500 | 1.5 | 0.16–0.24px | Medium action buttons |
| Button Medium | Mona Sans | 14px | 400 | 1.5 | 0–0.21px | Standard button label; weight and tracking variant |
| Label Medium | Mona Sans | 16px | 400 | 1.5 | 0–0.21px | Form labels and input hints; tight variant available |
| Code Small | Mona Sans Mono | 14px | 480 | 1.5 | 0px | Inline code and monospace labels; uppercase |
| Code Medium | Mona Sans Mono | 16px | 400 | 1.5 | 0.24px | Code block headings and technical snippets |
| Code XS | Mona Sans Mono | 12px | 500 | 1.5 | 0px | Inline code references; uppercase |

### Principles

- **Tight, negative tracking on display sizes**: Display XL uses −2.24px letter-spacing to create visual tension and brand personality. Smaller sizes use minimal or positive tracking for readability.
- **Consistent line-height ratios**: Body and UI copy use 1.5× line-height for comfortable scanning; display sizes compress to 1.08–1.3× for visual weight.
- **Weight as hierarchy, not size alone**: The system privileges weight shifts (400 → 500 → 600) over point-size jumps, enabling flexible scaling across viewports.
- **Monospace for precision**: Code and technical labels always use Mona Sans Mono, signaling their functional, non-prose nature.
- **Semantic tracking**: Positive letter-spacing increases on larger body sizes (18px and up) to prevent crowding; display sizes go negative for intensity.

---

## 4. Component Stylings

### Buttons

#### Primary Button
- **Background**: `{colors.primary}` (`#08872B`)
- **Text Color**: `{colors.on-primary}` (`#FFFFFF`)
- **Font**: Mona Sans, `{typography.button-md}` (14px, weight 400, line-height 1.5)
- **Padding**: `6px 20px`
- **Border Radius**: `{rounded.xs}` (6px)
- **Border**: 1px solid transparent
- **Height**: 48px
- **Hover State**: Darker background (button-primary-bgColor-hover); enhanced shadow
- **Focus State**: 2px solid accent outline; inset 3px white ring
- **Active State**: Selected background with inset shadow
- **Disabled State**: Muted text, muted border, neutral background

#### Secondary Button
- **Background**: `rgba(255, 255, 255, 0.12)`
- **Text Color**: `{colors.on-primary}` (`#FFFFFF`)
- **Font**: Mona Sans VF, `{typography.label-md}` (16px, weight 400, line-height 1.5)
- **Padding**: `1px 12px`
- **Border Radius**: `{rounded.xs}` (6px)
- **Border**: 1px solid `rgba(255, 255, 255, 0.06)`
- **Height**: 32px
- **Hover State**: Increased background opacity; small shadow lift
- **Focus State**: Outline and inset ring at accent color
- **Active State**: Darkened background with selected shadow
- **Disabled State**: Reduced opacity; muted text

#### Ghost / Outline Button
- **Background**: Transparent or minimal fill (`rgba(0, 0, 0, 0.01)`)
- **Text Color**: `{colors.on-primary}` (`#FFFFFF`) or accent (`{colors.accent-1}` — `#A2DAFF`)
- **Font**: Mona Sans VF, `{typography.label-md}` (16px, weight 400, line-height 1.5)
- **Padding**: `0px 12px`
- **Border Radius**: `{rounded.xs}` (6px)
- **Border**: 1px solid `rgb(38, 44, 40)` or `rgba(255, 255, 255, 0.06)`
- **Height**: 32px
- **Hover State**: Slight background tint; small shadow; text color change to accent
- **Active State**: Darker background; selected shadow; accent text
- **Disabled State**: Muted text; transparent background

#### Icon Button
- **Background**: `rgb(9, 13, 10)`
- **Text Color**: `{colors.on-primary}` (`#FFFFFF`)
- **Font**: Mona Sans VF, `{typography.button-md}` (14px, weight 400, line-height 1.5)
- **Padding**: `0px`
- **Border Radius**: `48px` (circular/pill-shaped)
- **Border**: 1px solid `rgb(25, 31, 27)`
- **Width / Height**: 32px
- **Hover State**: Lighter background; accent text color
- **Focus State**: Outline ring at accent color
- **Active State**: Selected background state

### Cards & Containers

- **Background**: `{colors.canvas}` (`#0D1117`) or `{colors.surface-alt}` (`#000000`)
- **Border Radius**: `{rounded.md}` (16px) for rounded cards; `{rounded.none}` (0px) for hero sections
- **Padding**: `{spacing.md}` (16px) to `{spacing.xxl}` (28px) depending on card type
- **Border**: None (color blocking) or subtle 1px border in `rgba(255, 255, 255, 0.12)` for definition
- **Shadow**: Single tier: `rgb(61, 68, 77) 0px 0px 0px 1px, rgba(1, 4, 9, 0.4) 0px 6px 12px -3px, rgba(1, 4, 9, 0.4) 0px 6px 18px 0px` (reserved for dropdowns and overlays)

### Inputs & Forms

- **Background**: `{colors.canvas}` (`#0D1117`)
- **Text Color**: `{colors.on-primary}` (`#FFFFFF`)
- **Font**: Mona Sans VF, `{typography.label-md-tight}` (16px, weight 400, line-height 1.5)
- **Padding**: `{spacing.xs}` to `{spacing.md}` (8–16px horizontal)
- **Border Radius**: `{rounded.sm}` (8px)
- **Border**: 1px solid `rgba(255, 255, 255, 0.12)`
- **Height**: 40px (standard); 56px (large)
- **Focus State**: Inset 1px border at accent color; outline none; enhanced shadow
- **Focus Background**: Brightens slightly to `{colors.canvas}` variant
- **Disabled State**: Muted text; neutral-muted background; reduced opacity (0.6)
- **Placeholder**: `{colors.body}` (`#A4AEA6`) at 60% opacity

### Navigation

- **Background**: Transparent or `{colors.canvas}` (`#0D1117`) on sticky header
- **Text Color**: `{colors.on-primary}` (`#FFFFFF`)
- **Font**: Mona Sans, `{typography.label-md}` (16px, weight 400, line-height 1.5)
- **Padding**: `0px` (flexbox spacing)
- **Border Radius**: `{rounded.none}` (0px)
- **Border**: None
- **Height**: 40px (horizontal nav items)
- **Hover State**: Text underline or background tint (accent-muted)
- **Active State**: Text in white; background in accent-emphasis
- **Focus State**: 2px solid accent outline; 3px inset ring

### Links

- **Text Color**: `{colors.accent-1}` (`#A2DAFF`) (default); `{colors.on-primary}` (`#FFFFFF`) (on dark)
- **Font**: Mona Sans VF, `{typography.body-md}` or smaller (14–16px, weight 400)
- **Text Decoration**: None (default); underline (hover)
- **Background**: Transparent
- **Hover State**: Underline; background tint to accent-muted
- **Active State**: Text in white (on-emphasis); background in accent-emphasis
- **Focus State**: Outline ring at accent; pill-shaped focus indicator

### Footer

- **Background**: `rgb(15, 21, 17)` (slightly warmer than canvas)
- **Text Color**: `{colors.on-primary}` (`#FFFFFF`)
- **Font**: Mona Sans, `{typography.button-md}` (14px, weight 400, line-height 1.5)
- **Border Top**: 2px solid `rgb(95, 237, 131)` (a green accent lighter than primary)
- **Padding**: `{spacing.band}` (48px) vertical; `{spacing.section}` (40px) horizontal
- **Border Radius**: `{rounded.none}` (0px)
- **Layout**: Full-width; multi-column grid (6 columns at 1280px+, collapsing to 1–2 at mobile)

---

## 5. Layout Principles

### Spacing System

The system uses an 8-unit base with a 10-step scale, enabling both tight micro-interactions and generous breathing room across layouts.

- `{spacing.xxs}` = 4px — Micro-spacing: margin between icon and text, hairline gaps
- `{spacing.xs}` = 8px — Small spacing: padding inside badges, tight button padding
- `{spacing.sm}` = 12px — Compact spacing: internal padding for small components
- `{spacing.md}` = 16px — Standard spacing: card padding, form field margins, default gutter
- `{spacing.lg}` = 20px — Generous spacing: button padding, section dividers
- `{spacing.xl}` = 24px — Large spacing: container margins, section padding
- `{spacing.xxl}` = 28px — Extra-large spacing: card padding on large screens
- `{spacing.xxxl}` = 32px — Heap spacing: major layout margins
- `{spacing.section}` = 40px — Section padding-x on most breakpoints; horizontal breathing room
- `{spacing.band}` = 48px — Full-height section padding; hero and footer zones

**Usage Context**

- Buttons: `{spacing.xs}` (8px) to `{spacing.md}` (16px) padding
- Cards: `{spacing.md}` (16px) to `{spacing.xxl}` (28px) padding
- Forms: `{spacing.md}` (16px) between fields; `{spacing.xs}` (8px) label-to-input
- Hero sections: `{spacing.band}` (48px) padding-y
- Layout grid: `{spacing.section}` (40px) margin-x

### Grid & Container

- **Max Width**: 1440px (viewport 1440px+); 1392px (content width)
- **Breakpoints**: Container queries scale column count at 375px (1 col), 768px (4 col), 1024px+ (6 col)
- **Section Padding**: `{spacing.section}` (40px) horizontal on mobile (375px); increases slightly at 768px+
- **Gutter**: 16px column gap (8-unit alignment)
- **Hero & Footer**: Full-width, no max-width constraint

### Whitespace Philosophy

GitHub's layout prioritizes **breathing room over compaction**. Large hero sections use full viewport height with `{spacing.band}` (48px) padding top and bottom, creating visual staging for key messages. Body text sits in a narrow measure (60–75 characters) with generous line-height (1.5) to prevent eye strain. Section breaks use 40px vertical spacing, signaling clear content zones. Cards and components use internal padding (`{spacing.md}` minimum) to prevent visual cramping. At smaller viewports, horizontal margins tighten slightly to `{spacing.section}` (40px), but vertical rhythm remains spacious to support mobile scanning.

### Border Radius Scale

- `{rounded.none}` = 0px — Sharp, orthogonal edges on buttons, overlays, hero sections, and badges. The default for technical, CLI-like UI.
- `{rounded.xs}` = 6px — Mild rounding on buttons, input fields, and small components. Signals interactivity without softness.
- `{rounded.sm}` = 8px — Input fields and form controls. Slightly more forgiving than buttons.
- `{rounded.md}` = 16px — Cards, container borders, and rounded image corners. The "comfortable" radius for larger surfaces.
- `{rounded.full}` = 9999px — Icon buttons and avatar circles. Complete pill-shape for compact, circular components.

**Component Radius Mapping**

- Button (primary, secondary, outline): `{rounded.xs}` (6px)
- Button (icon): `{rounded.full}` (9999px)
- Input / Form fields: `{rounded.sm}` (8px)
- Cards & Containers: `{rounded.md}` (16px)
- Overlays / Modals: `{rounded.none}` (0px)
- Badges: `{rounded.none}` (0px)
- Images: `{rounded.none}` (0px)

### Border Widths

- **Thin** = 1px — Button outlines, input focus borders, card dividers, and subtle separators. The primary stroke weight across all interactive components.

---

## 6. Depth & Elevation

GitHub's depth strategy is **minimalist and color-forward**. Rather than stacking multiple shadows, the system relies on single-tier shadows (reserved for dropdowns) and pervasive color blocking. Surfaces are defined by their background color (`{colors.canvas}` vs. `{colors.surface-alt}`), not shadow blur.

| Level | Treatment | Use |
|-------|-----------|-----|
| Base / Flat | No shadow; color block only | Default cards, buttons, inputs, standard UI |
| Elevated (Dropdown) | `rgb(61, 68, 77) 0px 0px 0px 1px, rgba(1, 4, 9, 0.4) 0px 6px 12px -3px, rgba(1, 4, 9, 0.4) 0px 6px 18px 0px` | Dropdown menus, tooltips, modals on hover |

**Shadow Philosophy**

The single shadow layer mimics a card slightly above the surface, using a fine outline (`rgb(61, 68, 77)` — a mid-gray border) plus two blur layers. The first blur (6px, −3px offset) is tight and sharp; the second (6px, 0px offset) spreads wider. This combination creates a gentle lift without bloat. **Most interactive elements never use shadows**—they signal depth through border color shifts, background opacity changes, or accent color introduction. This keeps the interface crisp and legible at high pixel densities.

### Opacity Levels

- **60% / 0.60** — Muted text, disabled states, and secondary UI labels. Used on body text (`{colors.body}` — `#A4AEA6`), link underlines, and placeholder copy to signal lower emphasis without desaturation.

### Z-index / Layering

The system uses 6 distinct stacking layers for overlays, navigation, and modals:

- **Base** = 1–3 — Standard UI elements (buttons, cards, form inputs)
- **Dropdown** = 98–99 — Dropdown menus, popover menus (just below sticky)
- **Sticky** = 100 — Sticky navigation header, floating buttons
- **Modal** = 1000 — Modals, dialogs, full-screen overlays
- **Toast** = 99999 — Toast notifications, alerts at the absolute top of the stack

---

## 7. Do's and Don'ts

### Do

- **Use the primary green (`#08872B`) for high-intent CTAs only.** Reserve it for sign-up, download, submit, and confirm actions. Overuse dilutes its power.
- **Pair dark canvas (`#0D1117`) with high-contrast text (`#FFFFFF`)** for headings and critical labels. The 15:1 contrast ratio ensures WCAG AAA compliance and code readability.
- **Layer gradients for hero sections only.** Use the provided linear gradients (navy-to-navy with purple/green overlays) to add visual interest without cluttering smaller components.
- **Maintain 1.5× line-height on body copy.** This ratio is non-negotiable for scanning; it supports developers reading long descriptions and documentation.
- **Use Mona Sans VF (variable font) in production** for smaller (≤18px) UI text. Its precision tracking and tight metrics are optimized for screen rendering.
- **Apply single-tier shadows to dropdowns and modals only.** Keep standard buttons, cards, and inputs flat (no shadow). Depth comes from color shifts.
- **Keep border-radius minimal (0–6px) on interactive elements.** This reinforces the technical, command-line aesthetic and maintains visual hierarchy.
- **Extend focus rings beyond element boundaries** to ensure keyboard users see a clear 2px outline in accent color.
- **Test responsive behavior at 375px, 768px, and 1024px.** The system's breakpoints are measured; honor the measured column counts and padding at each tier.

### Don't

- **Do not use the lighter accent cyan (`#A2DAFF`) for interactive CTAs.** It's decorative only—reserved for hero overlays and visual accents.
- **Do not invent semantic status colors (error red, success green).** The site does not declare error/success/warning states. Use only the primary green for confirmation; defer to product specifications for error handling.
- **Do not apply rounded corners (>6px) to buttons, inputs, or badges.** The system is orthogonal and sharp; softness signals low-priority or decorative elements only.
- **Do not increase line-height above 1.5 on UI text.** This creates visual bloat and wastes viewport space—developers value dense, scannable layouts.
- **Do not use box-shadow on standard components.** Shadows are reserved for dropdowns and elevated modals. Use background color and border shifts to signal interactivity.
- **Do not mix multiple font families within a single component.** Buttons use Mona Sans or Mona Sans VF; code uses Mona Sans Mono. Consistency reinforces function.
- **Do not override focus styles.** The system mandates a 2px outline plus 3px inset ring. Keyboard accessibility is non-negotiable.
- **Do not add transparency overlays to body text.** Opacity shifts are reserved for disabled states and secondary UI. Keep body copy at full opacity (`{colors.body}` — `#A4AEA6`, no alpha reduction).
- **Do not exceed `{spacing.section}` (40px) horizontal padding on mobile.** Compact screens need edge-to-edge content; excessive margins create wasted gutter space.

---

## 8. Responsive Behavior

### Breakpoints

| Viewport | Max Width | Columns | Header Nav | Body Font | Display Heading | Section Padding-X |
|----------|-----------|---------|-----------|-----------|-----------------|-------------------|
| 375px | 327px | 1–7 | Visible (45 links) | 14px | 40px | 24px |
| 768px | 720px | 4 | Visible (45 links) | 14px | 56px | 24px |
| 1024px | 976px | 6 | Visible (46 links) | 14px | 64px | 24px |
| 1280px | 1246px | 6 | Visible (46 links) | 14px | 64px | 24px |
| 1440px | 1392px | 6 | Visible (46 links) | 14px | 64px | 24px |

**Key Transitions**

- **Mobile (≤375px)**: Single-column layout; compact nav; display heading at 40px
- **Tablet (768px)**: 4-column grid; body padding remains 24px; heading grows to 56px
- **Desktop (1024px+)**: 6-column grid; display heading at full 64px; max-width capped at 1392px; navigation fully visible with all links

### Touch Targets

- **Minimum size**: 44×44px (buttons, icon buttons, links, form controls)
- **Recommended size**: 48px (primary buttons, large touch targets)
- **Icon buttons**: 32px minimum; 48px preferred
- **Link hit area**: Extend invisible hit zone to 44px using padding if link text is narrow

### Collapsing Strategy

- **Navigation**: Header nav links remain visible at all measured breakpoints; no hamburger menu observed in extraction. If viewport drops below 375px, implement a menu toggle (note: not measured in extraction).
- **Columns**: Layouts collapse from 6 columns (1024px+) → 4 columns (768px) → 1–7 columns (375px). Grid gap remains 16px.
- **Typography**: Body text (`{typography.body-md}` — 14px) and button labels stay fixed across all breakpoints. **Display headings scale** from 40px (375px) → 56px (768px) → 64px (1024px+). Hero sections remain full-width; max-width constraint applies to content containers only.
- **Padding**: Horizontal section padding locked at `{spacing.section}` (40px) or 24px on mobile. Vertical padding (`{spacing.band}` — 48px for hero) never collapses.
- **Images & Cards**: No responsive image resizing observed in extraction; assume 100% width on mobile, constrained at desktop. Cards maintain padding (`{spacing.md}` — 16px minimum) across all breakpoints.

---

## 9. Agent Prompt Guide

### Quick Color Reference

- **Primary CTA**: Brand Green (`{colors.primary}` — `#08872B`) — use for "Sign up," "Download," "Confirm" buttons
- **Background**: Canvas (`{colors.canvas}` — `#0D1117`) — default page and card fill
- **Alt Background**: Surface Alt (`{colors.surface-alt}` — `#000000`) — alternate section band, footer
- **Heading Text**: Ink / On Primary (`{colors.on-primary}` — `#FFFFFF`) — all display and heading copy
- **Body Text**: Body (`{colors.body}` — `#A4AEA6`) — standard paragraph copy
- **Secondary Text**: Muted (`{colors.muted}` — `#24292F`) — captions, hints, disabled states
- **Link Text**: Accent 1 (`{colors.accent-1}` — `#A2DAFF`) — hyperlinks and accent UI (decorative only—**do not use for CTAs**)

### Iteration Guide

1. **Start with dark canvas + white headings.** Every page layer uses `#0D1117` or `#000000` background with `#FFFFFF` headings. This 15:1 contrast is the system's foundation.

2. **Reserve brand green for CTAs.** Primary buttons, sign-up links, and confirmation states get `#08872B`. **Everything else uses secondary/ghost button variants.** No green accents outside of high-intent actions.

3. **Use Mona Sans VF (variable) for UI below 18px; Mona Sans for headlines.** Font selection is semantic: body/labels/buttons use the variable version; display copy uses the regular Mona Sans.

4. **Apply single-tier shadow (`rgb(61, 68, 77) 0px 0px 0px 1px, ...`) to dropdowns only.** All standard components (buttons, cards, inputs) are flat (no shadow). Depth comes from `background-color` or `border-color` shifts.

5. **Lock border-radius to project specs: 0px (buttons/overlays), 6px (inputs/buttons), 8px (form fields), 16px (cards), 9999px (icons).** Do not vary—consistency defines the orthogonal aesthetic.

6. **Maintain 1.5× line-height on all body copy.** Non-negotiable for readability. Code copy uses the same 1.5×.

7. **Responsive breakpoints are measured at 375px, 768px, 1024px, 1280px, 1440px.** Honor the column counts, padding, and heading sizes at each tier. Do not interpolate between breakpoints.

8. **Focus states must include a 2px outline in accent color plus a 3px inset ring in white.** Keyboard accessibility is mandatory; do not suppress or customize focus rings.

9. **Section padding is `{spacing.section}` (40px) horizontal at all breakpoints except ultra-compact devices.** Vertical padding uses `{spacing.band}` (48px) for hero/footer. Never reduce below 24px on mobile.

10. **Test interaction states (hover, focus, active, disabled) per the extracted stylesheets.** Link hover = underline; button hover = background + shadow shift; input focus = accent border + inset shadow. Every state is documented; implement as specified.

---

## 10. Known Gaps

- **No semantic status colors.** The site does not declare error (red), success (green), or warning (yellow) states in its stylesheets. Only `#08872B` (primary) is confirmed. Error/success/warning color roles **must be specified externally** before implementation.

- **No dark-mode alternate palette.** One theme was extracted (dark). The system does not expose a light mode or derived color variant in the measured markup. If dark-mode support is required, it is **out of scope** for this document.

- **Three colors marked unassigned:** `{colors.accent-1}` (`#A2DAFF`), `{colors.accent-2}` (`#090D0A`), and `{colors.neutral-1}` (`#F0F6FC`) have no measured interactive role. They appear in decorative overlays and hero gradients only. Do not assign them to buttons, links, or form states without explicit product guidance.

- **Hover / active / focus states inferred from stylesheets, not visual inspection.** The extraction captured CSS rules for button hover (background shift, shadow), focus (outline + ring), and disabled (opacity/color fade). **Interaction states on smaller components (chips, toggles, switches) were not extracted.** Implement state changes per the rules provided; gaps remain for unmeasured component roles.

- **No animation or transition timing extracted.** The system does not specify duration (e.g., 200ms fade-in on hover). Use standard conventions (200–300ms cubic-bezier easing) or defer to product specs.

- **Surfaces behind authentication not visited.** This extraction covers the public marketing site only. Logged-in dashboard, settings, and repository pages may use different color roles or component styles. Assume public-facing rules apply; validate against internal product guidelines.

- **Only 1 page analyzed.** The extraction came from GitHub's homepage (`github.com`). Navigation, enterprise, pricing, and internal product pages may override these tokens. Treat this document as a **reference baseline**; check for page-specific overrides in production.

- **No data table, breadcrumb, tooltip, or modal component styles extracted.** These roles were not present on the measured page. Implement them using the core button/input/card patterns or provide external specs.

- **Gradient overlays on hero sections are decorative, not tokenized.** The hero uses literal CSS gradients (e.g., `linear-gradient(rgb(0, 2, 64), rgba(0, 0, 0, 0))`). These are hardcoded for visual effect; no semantic "hero gradient" token exists. Replicate exactly for brand consistency.

- **Footer border color (`rgb(95, 237, 131)`) does not appear elsewhere.** This bright green accent is unique to the footer top border. Do not generalize it to other components; it may be a one-off hero accent.

---

## 11. Project Extensions (RAT)

The RAT dashboard consumes this design system and fills the gaps catalogued in §10 with the extensions below. Every extension is implemented in `apps/web/src/styles/globals.css` and flagged there with a `PROJECT EXTENSION` comment so it can be audited against this document.

### 11.1 Semantic status colors (§10: none declared)

| Role | Token | Value | Usage |
|---|---|---|---|
| Success | `--color-success` (+ 12% bg tint) | `#3FB950` | `ready` repo badges, `done` job badges, positive growth, added-chart series |
| Danger | `--color-danger` (+ 12% bg tint) | `#F85149` | Error banners, `error`/`failed` badges, negative growth, removed-chart series, destructive actions |
| Warning | `--color-warning` (+ 12% bg tint) | `#D29922` | `queued` badges and pending states |
| Info | `--color-info` (+ 12% bg tint) | `#58A6FF` | `processing`/`running` badges, canonical-author resolution badge |

These roles are the minimum required by repository/job status, validation banners and the churn chart; they do not reinterpret any measured token.

### 11.2 Data tables (§10: no table component extracted)

Built from the core card/input patterns as §10 recommends. `.table-wrap` = 1px `{colors.border-soft}` border + `{rounded.sm}` (8px). Header row: 12px uppercase labels (0.08em tracking) on `surface-alt`, sticky while the body scrolls. Row separators `rgba(255,255,255,0.06)`; row hover `rgba(255,255,255,0.03)`. Numeric cells are right-aligned with `tabular-nums`; path and sha cells use the mono stack. Sortable headers are plain buttons so they inherit the mandated §7 focus ring. Used by the Files, Directories and Authors tabs.

### 11.3 Badges (§10: no badge role extracted)

Radius `{rounded.none}` (0px) per the badge radius mapping, 12px uppercase, `0.04em` tracking, a 6px dot marker and the four status fills from §11.1. `.badge-no-dot` drops the dot for label-only chips.

### 11.4 Breadcrumb (§10: no breadcrumb component)

Directory drill-down navigation: `{colors.accent-1}` text buttons (the §4 `link` role), muted `/` separators, 14px, wrapping.

### 11.5 Tabs and segmented control (§10: unmeasured component states)

Underline tabs with an `{colors.primary}` bottom indicator on `aria-selected`; segmented control for binary switches (ingest source, day/week buckets) with a pressed-state fill of `rgba(8,135,43,0.35)`. Hover states follow the measured button hover convention (background shift, no shadow for in-page controls).

### 11.6 Progress bars

8px track `rgba(255,255,255,0.1)` with `{rounded.full}`; fill uses `{colors.primary}`, switching to `{colors.danger}` when the underlying job failed. Used for ingestion jobs and author-ownership bars (ownership bars reuse the same geometry with the `accent-1` fill).

### 11.7 Charts (§10: no chart styles extracted)

Implemented with Recharts, using the token palette only:

- Added series `#3FB950` (success), removed series `#F85149` (danger, mirrored below zero), commits line `{colors.accent-1}` `#A2DAFF`, top-files bars `{colors.accent-1}`;
- Grid `{colors.border}` dashed `3 3`, axis ticks muted at 11px, no axis lines beyond a single baseline;
- Tooltips reuse the dropdown surface role: `surface-raised` (`#141414`), 1px `{colors.border}`, `{rounded.xs}`, and the single-tier `{shadow.sm}`.

### 11.8 Interaction timing (§10: no durations extracted)

Only interactive elements transition, at 150ms ease (color/border) or 300ms cubic-bezier(0.33, 1, 0.68, 1) (progress width), inside the 200–300ms convention §10 suggests. No entrance animations.

### 11.9 Link role note

§10 classifies `{colors.accent-1}` as decorative, but §4 defines the `link` component with `textColor: {colors.accent-1}`. The explicit component spec wins for text links (global `a`, path links, breadcrumbs); no other interactive element reuses the accent beyond chart data marks.
