# Load testing

Two complementary tests. Both require the server running with Postgres + Redis
(`npm run infra:up && npm run dev:server`).

## HTTP API — k6

Exercises signup → create → list under a ramping load (0→50→0 VUs).

```bash
# Install k6: https://k6.io/docs/get-started/installation/
k6 run load/http-load.js
k6 run -e BASE_URL=http://localhost:4000 load/http-load.js
```

Thresholds (test fails if breached): <1% errors, p95 < 400ms.

## WebSocket collaboration — Node

Spawns N Socket.io clients joining one document; one writer emits Yjs updates
while the rest measure broadcast fan-out latency.

```bash
node load/ws-load.mjs
CLIENTS=200 DURATION_MS=20000 RATE_MS=200 node load/ws-load.mjs
```

Reports p50/p95/p99/max broadcast latency. The design target is p99 < 100ms for
in-region clients; expect higher numbers when running everything on one laptop.

## Interpreting results

- **Rising latency as CLIENTS grows** → single-server fan-out limit; scale out
  (more `rtc-server` replicas) and confirm the Redis relay spreads load.
- **HTTP p95 spikes** → check the PostgreSQL connection pool (`max: 20`) and
  `pg_stat_activity` for saturation.
- Watch `/metrics` (`rtc_ws_connections`, `rtc_doc_updates_total`,
  `http_request_duration_seconds`) during a run.
