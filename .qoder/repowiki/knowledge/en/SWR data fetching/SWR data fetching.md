---
kind: external_dependency
name: SWR data fetching
slug: swr
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
---

Client-side data fetching and caching layer over the Express API. Custom hooks wrap SWR calls for repositories, metrics, authors, and job polling. Used throughout the dashboard pages to keep UI in sync with the backend without manual refresh logic.
- framework_behavior: polling while ingesting is handled via SWR options rather than custom intervals.