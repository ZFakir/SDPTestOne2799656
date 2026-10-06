---
kind: external_dependency
name: Express API server
slug: express
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
---

HTTP server powering the RAT analysis API. Routers are mounted under `/api/repositories` (repositories, commits, authors, paths, jobs, metrics) via Express `Router`s; error handling goes through a single Express error middleware. Dev runs via `tsx watch`, production via `tsx src/index.ts` after `tsc` build.
- verify exact router mount paths and response shapes against the route modules.