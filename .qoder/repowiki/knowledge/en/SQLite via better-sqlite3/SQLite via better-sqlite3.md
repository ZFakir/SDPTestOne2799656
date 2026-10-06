---
kind: external_dependency
name: SQLite via better-sqlite3
slug: better-sqlite3
category: external_dependency
category_hints:
    - client_constraint
scope:
    - '**'
---

Synchronous SQLite driver used for the repository metadata store (`storage/rat.db`). The database schema lives in `schema.sql` and is applied at startup. Requires a native C++ binding compiled against the running Node ABI — prebuilt binaries may not exist for patched Node builds (e.g. Ubuntu-patched Node 18 ABI 109), so a source build via node-gyp/Python may be needed when `prebuild-install` fails.
- client_constraint: single-process synchronous DB; no connection pool or replication.