---
kind: frontend_style
name: GitHub-Inspired CSS Design Tokens and Global Stylesheet
category: frontend_style
scope:
    - '**'
source_files:
    - Design.md
    - apps/web/src/styles/globals.css
    - apps/web/package.json
    - apps/web/next.config.mjs
---

## Approach

The RAT dashboard (`apps/web`) uses a **plain-CSS design-token system** driven by a single global stylesheet. There is no CSS-in-JS, Tailwind, or component library — styling lives in `apps/web/src/styles/globals.css` and is applied via BEM-style class names from React components.

The token layer is declared as CSS custom properties on `:root` (colors, typography scale, spacing, radii, elevation, z-index layers). The file header explicitly states the tokens are "implemented from Design.md" and that the palette is a GitHub-inspired dark theme with brand green `#08872B`, Mona Sans variable font, flat cards, and a single-tier shadow reserved for dropdowns.

The source of truth for the visual system is `Design.md`, which documents the measured GitHub design system (colors, typography, spacing, radii, shadows, breakpoints, component specs) and then adds an explicit "Project Extensions (§11)" section documenting how RAT fills gaps the extraction did not cover (semantic status colors, data tables, badges, tabs, segmented controls, progress bars, chart styles, interaction timing).

## Key Files

- `Design.md` — authoritative design-system spec (measured GitHub palette + RAT project extensions)
- `apps/web/src/styles/globals.css` — all CSS: `:root` tokens, base reset, layout primitives, component classes (`.btn`, `.card`, `.table`, `.badge`, `.tabs`, `.segmented`, `.progress`, `.banner`, `.stat-*`, `.chart-*`, `.repo-*`, `.filter-bar`, etc.)
- `apps/web/package.json` — declares `@fontsource-variable/mona-sans` (Mona Sans VF), `recharts` (charts), `swr` (data fetching); no CSS framework dependency
- `apps/web/next.config.mjs` — only `reactStrictMode` and `transpilePackages: ['@rat/shared']`; no CSS config
- `apps/web/src/app/layout.tsx` — imports `globals.css` to register it at the app root

## Architecture and Conventions

### Token layer (`:root`)

All design decisions are centralized as CSS variables:

- Colors: `--color-primary`, `--color-canvas`, `--color-surface-alt`, `--color-surface-raised`, `--color-ink`, `--color-body`, `--color-muted`, `--color-border`, `--color-border-soft`, `--color-accent-1`, `--color-accent-2`, `--color-neutral-1`
- Project-extension status colors: `--color-success` (+ `--color-success-bg`), `--color-danger` (+ bg), `--color-warning` (+ bg), `--color-info` (+ bg)
- Typography: `--font-sans` (Mona Sans Variable fallback chain), `--font-mono`, `--text-xs` through `--text-display`, `--leading-body`
- Spacing: `--space-xxs` (4px) through `--space-band` (48px), plus `--space-section`
- Radii: `--radius-none` (0px), `--radius-xs` (6px), `--radius-sm` (8px), `--radius-md` (16px), `--radius-full` (9999px)
- Elevation: one `--shadow-sm` value; `elevationStrategy: single-tier` per `Design.md`
- Z-index: `--z-dropdown` (98), `--z-sticky` (100), `--z-modal` (1000), `--z-toast` (99999)

Every component class references these variables rather than hardcoding values.

### Component class naming

Classes follow a flat BEM-like scheme under a single namespace (no SCSS nesting, no CSS modules):

- Primitives: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-sm`
- Surfaces: `.card`, `.card-pad-lg`, `.panel-header`, `.section-title`, `.section-sub`, `.hero`, `.divider`
- Layout: `.container` (max-width 1392px, `--space-section` horizontal padding), `.stack`, `.row`, `.site-header`, `.site-main`, `.site-footer`, `.site-nav`, `.brand`, `.brand-mark`
- Forms: `.field`, `.field-label`, `.input`, `.select`, `.textarea`, `.field-hint`
- Navigation: `.tabs`, `.tab[aria-selected='true']`, `.segmented`, `.segmented button[aria-pressed='true']`
- Data display: `.badge` (+ `.badge-success|danger|warning|info|neutral`, `.badge-no-dot`), `.table-wrap`, `.table`, `.table-empty`, `.stat-grid`, `.stat-card`, `.stat-label`, `.stat-value`, `.stat-sub`, `.pos`, `.neg`
- Feedback: `.progress`, `.progress-fill`, `.progress-fill.is-failed`, `.banner`, `.banner-error`, `.banner-warning`, `.empty-state`, `.skeleton`
- Charts: `.chart-row`, `.chart-card`, `.chart-title`, `.chart-tooltip`, `.chart-empty`
- Domain: `.repo-list`, `.repo-row`, `.repo-name`, `.repo-meta`, `.repo-actions`, `.filter-bar`

### Responsive strategy

There are no media queries in `globals.css`. Responsiveness is achieved through:

- Fluid flexbox/grid layouts (`.repo-list`, `.filter-bar`, `.stat-grid` use `flex-wrap` / `auto-fit` / `minmax()`)
- A fixed `.container` max-width of 1392px with responsive horizontal padding
- `auto-fit` grids for stat cards and chart rows
- The `Design.md` breakpoint table (375/768/1024/1280/1440) is documented but not enforced in CSS — it serves as a specification reference

### Typography and fonts

- Primary typeface: Mona Sans Variable loaded via `@fontsource-variable/mona-sans`
- Monospace stack: `ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace`
- Body line-height locked to `--leading-body` (1.5)
- Headings use `--font-sans` with weights 460–600; body text uses weight 400

### Accessibility

- Mandated focus treatment defined in the stylesheet comment referencing `Design.md §7`: 2px accent outline + 3px inset ring for `:focus-visible` on buttons and links
- Semantic attributes drive state: `.tab[aria-selected='true']`, `.segmented button[aria-pressed='true']`
- Selection color set to primary green at 50% opacity

### Status semantics (RAT extension)

`Design.md §11` explicitly extends the measured GitHub system with four semantic roles not present in the original extraction: success (green), danger (red), warning (amber), info (blue), each paired with a 12%-opacity background tint. These are used across badges, banners, chart series, and job-progress fills.

## Conventions and Constraints

- **Single stylesheet**: All UI styles live in `apps/web/src/styles/globals.css`; there are no per-component CSS files, CSS modules, styled-components, or Tailwind rules.
- **Token-only colors/sizes/radii**: Component classes never hardcode design values — they reference `--color-*`, `--space-*`, `--radius-*`, `--text-*`, `--font-*` variables.
- **Flat surfaces**: Per `Design.md §6` and the `elevationStrategy: single-tier` declaration, standard components (buttons, cards, inputs) have no box-shadow; depth comes from color blocking. Only dropdowns/tooltips use `--shadow-sm`.
- **Brand green is CTA-only**: `--color-primary` (`#08872B`) is reserved for high-intent actions; decorative/accent roles use `--color-accent-1` (`#A2DAFF`).
- **Border-radius mapping**: Buttons/overlays/badges use `--radius-none` or `--radius-xs` (0/6px); inputs use `--radius-sm` (8px); cards use `--radius-md` (16px); circular elements use `--radius-full` (9999px).
- **Focus rings are mandatory**: The stylesheet enforces a 2px outline + 3px inset ring on `:focus-visible`; overriding this is flagged as a "Don't" in `Design.md §7`.
- **No light mode**: `Design.md` notes the extracted system has no alternate theme; the implementation exposes only the dark canvas palette.
- **Status colors are project extensions**: They are not part of the measured GitHub system and are introduced solely to support repository/job status badges, error banners, and chart series (documented in `Design.md §11.1`).
- **Charts reuse the token palette**: Recharts charts in `apps/web/src/components/metrics/charts/` consume `--color-*` variables rather than defining their own colors.
- **No animation beyond transitions**: Interaction timing follows the 150ms ease / 300ms cubic-bezier convention noted in `Design.md §11.8`; no entrance animations are present.