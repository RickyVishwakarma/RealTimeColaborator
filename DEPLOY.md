# Deploying to Render

This repo ships a [`render.yaml`](render.yaml) Blueprint that provisions the
whole stack: **PostgreSQL**, **Redis**, the **Node server** (REST + WebSockets),
and the **static client**. The server auto-applies the database schema on boot,
so there's no separate migration step.

> You perform the account/secret steps — Claude can't create accounts or enter
> credentials on your behalf.

## 1. Push the repo

Already done — the Blueprint lives on `main` at
`github.com/RickyVishwakarma/RealTimeColaborator`.

## 2. Create the Blueprint on Render

1. Go to **dashboard.render.com → New → Blueprint**.
2. Connect your GitHub and pick **RealTimeColaborator**.
3. Render reads `render.yaml` and shows 4 resources (postgres, redis,
   rtc-server, rtc-client). Click **Apply**.
4. It builds and deploys. Postgres + Redis come up first; the server and client
   follow. The first build takes a few minutes.

`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` are generated automatically;
`DATABASE_URL` and `REDIS_URL` are wired from the managed services.

## 3. Set the three cross-service URLs

The client and server need each other's URLs, which only exist after creation.
Once both show a URL (like `https://rtc-server.onrender.com`):

| Service | Env var | Value |
|---------|---------|-------|
| **rtc-server** | `CLIENT_ORIGIN` | the client URL, e.g. `https://rtc-client.onrender.com` |
| **rtc-client** | `VITE_API_URL` | the server URL, e.g. `https://rtc-server.onrender.com` |
| **rtc-client** | `VITE_WS_URL`  | the server URL (same as API URL) |

Set them under each service → **Environment**, then:
- **rtc-server** → redeploy (picks up `CLIENT_ORIGIN` for CORS).
- **rtc-client** → **Clear build cache & deploy** (the `VITE_*` vars are baked in at build time).

## 4. Verify

- `https://rtc-server.onrender.com/health` → `{"status":"ok"}`
- `https://rtc-server.onrender.com/ready` → `{"ready":true,...}`
- Open the client URL, sign up, create a document, type — open it in a second
  window to confirm live sync.

## Notes & gotchas

- **Free tier sleeps.** Free web services spin down after ~15 min idle; the
  first request then takes ~30–60s. Upgrade to a paid instance to keep it warm.
- **Free Postgres expires** after 90 days — back up or upgrade before then.
- **WebSockets** work out of the box on Render web services. With multiple
  instances, enable session affinity (or rely on the Redis relay, which already
  fans updates across instances).
- **Schema** is applied automatically on each server boot (idempotent). To run
  it manually instead, open the server's **Shell** and run
  `npm run migrate --workspace=@rtc/server`.
- **Email digests**: set `SMTP_URL` (and optionally `MAIL_FROM`) on rtc-server
  to actually deliver digests; without it they're generated but not sent.
- **Custom domains**: add them under each service; update `CLIENT_ORIGIN` and
  the `VITE_*` URLs to match, then redeploy.

## Alternative: containers / Kubernetes

Dockerfiles for both apps and full manifests live in [`k8s/`](k8s/) for a
container-based deploy (managed Postgres/Redis recommended over the in-cluster
`data.yaml`). See [OPERATIONS.md](OPERATIONS.md) for the runbook.
