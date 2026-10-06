---
kind: external_dependency
name: Recharts charting library
slug: recharts
category: external_dependency
category_hints:
    - sdk_real_api
scope:
    - '**'
---

Used for the churn-over-time line chart and top-files bar chart in the dashboard. Charts consume typed DTOs from `@rat/shared` and render within the design-system CSS classes defined in `globals.css`.
- sdk_real_api: chart components accept data arrays of the shared metric DTOs rather than raw git diffs.