---
kind: external_dependency
name: API test harness (Jest + supertest)
slug: jest-supertest
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
---

Route unit tests run against an in-memory Express app factory (`test/helpers/testApp.ts`) backed by a temporary SQLite DB (`testDb.ts`). Seed fixtures live in `test/helpers/seeds.ts`. Test runner is Jest with ts-jest; supertest drives HTTP requests to the in-process app.
- framework_behavior: each test suite mounts its own isolated DB instance via the test helpers rather than hitting a real filesystem DB.