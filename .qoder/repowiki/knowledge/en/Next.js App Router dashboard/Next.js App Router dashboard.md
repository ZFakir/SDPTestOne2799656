---
kind: external_dependency
name: Next.js App Router dashboard
slug: nextjs
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
---

React-based dashboard built on Next.js 14.x App Router. Pages live under `src/app/`; the repo dashboard is at `repos/[repoId]/page.tsx`. Data fetching uses SWR hooks against the Express API. Fonts come from `@fontsource-variable/mona-sans` and charts from Recharts.
- framework_behavior: dev via `next dev`, build via `next build`, start via `next start`.