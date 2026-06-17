# Operations Runbook

Operational reference for running the RTC collaborative editor in production.

## Endpoints

| Path | Purpose | Notes |
|------|---------|-------|
| `GET /health` | Liveness | Always 200 if the process is up. Used by the k8s liveness probe. |
| `GET /ready` | Readiness | 200 only when Postgres **and** Redis respond. 503 otherwise. Used by the readiness probe. |
| `GET /metrics` | Prometheus | Scrape target. Do **not** expose publicly — keep behind the cluster network. |

## Key metrics

| Metric | Type | Watch for |
|--------|------|-----------|
| `rtc_ws_connections` | gauge | Sudden drops → mass disconnect (LB / network). |
| `rtc_active_documents` | gauge | Unbounded growth → docs not being evicted (ref-count leak). |
| `rtc_doc_updates_total` | counter | Rate = write throughput. |
| `rtc_doc_update_bytes` | histogram | Large updates → client sending oversized payloads. |
| `http_request_duration_seconds` | histogram | p95/p99 latency per route. |

Suggested alerts:
- `histogram_quantile(0.99, http_request_duration_seconds) > 0.5` for 5m → page.
- `up{job="rtc-server"} == 0` → page.
- readiness failing (`/ready` 503) for >2m → investigate DB/Redis.

## Common incidents

### Server pods CrashLoopBackOff
1. `kubectl -n rtc logs deploy/rtc-server --previous`
2. Most common: bad `DATABASE_URL`/`REDIS_URL` or missing JWT secrets → check the
   `rtc-secrets` secret.
3. `/ready` returns 503 → a dependency is down; check Postgres/Redis pods.

### High sync latency
1. Check `rtc_ws_connections` per pod — are connections balanced? Sticky-session
   affinity can pin too many clients to one pod.
2. Scale out: the HPA targets 70% CPU (min 3 / max 20). Bump `minReplicas` if
   traffic is consistently high.
3. Confirm the Redis relay is healthy — cross-pod updates depend on it.

### Database connection exhaustion
- Pool is `max: 20` per pod. Symptoms: requests hang then 500.
- Check `SELECT count(*) FROM pg_stat_activity;` and slow queries.
- Mitigate: add PgBouncer, or reduce pod count, or raise Postgres `max_connections`.

### Lost edits / document stuck
- Edits live in memory and flush to `documents.content_snapshot` every 5s (debounced).
  A hard pod kill can lose <5s of edits for docs with no other connected client.
- The append-only `document_changes` log can reconstruct state if needed.
- `preStop` sleep (10s) + 30s grace period let in-flight sessions drain on rollout.

## Deploy

1. CI builds and pushes `rtc-server` / `rtc-client` images (see `.github/workflows/ci.yml`).
2. Apply manifests: `kubectl apply -f k8s/`.
3. **Run migrations** before/with the rollout:
   `npm run migrate --workspace=@rtc/server` against the production `DATABASE_URL`.
4. Rollout is zero-downtime (readiness-gated). Roll back with
   `kubectl -n rtc rollout undo deploy/rtc-server`.

## Backups & DR

- Postgres: automated daily snapshots (managed RDS) + PITR. Target RTO < 1h.
- Redis is ephemeral (presence + relay only) — safe to lose; clients reconnect.
- Document content of record lives in Postgres, not Redis.
