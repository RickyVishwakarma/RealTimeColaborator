# Real-Time Collaborative Editor

A production-grade collaborative document editor demonstrating live multi-user
sync, CRDT conflict resolution, presence, and horizontal scalability.

**▶ Live demo: <https://rtc-client.onrender.com>**
&nbsp;·&nbsp; API: <https://rtc-server-7pwy.onrender.com/health>

> Hosted on Render's free tier — the server sleeps after ~15 min idle, so the
> first request (and first live-sync connection) may take 30–60s to wake.

See [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) for the architecture and
[DEPLOY.md](DEPLOY.md) for deployment.

## Stack

| Layer    | Technology |
|----------|-----------|
| Frontend | React 18, Vite, TipTap, Yjs, Socket.io-client |
| Backend  | Node.js, Express, Socket.io, Yjs, PostgreSQL, Redis |
| Sync     | CRDT (Yjs) with awareness protocol for presence |
| Scaling  | Stateless servers + Redis pub/sub relay; sticky WS sessions |
| Infra    | Docker, Kubernetes, GitHub Actions |

## Monorepo layout

```
packages/
  shared/   # Types + wire protocol shared by client and server
  server/   # Express REST API + Socket.io collaboration gateway
  client/   # React SPA with the collaborative editor
k8s/        # Kubernetes manifests
.github/    # CI pipeline
```

## Quick start

```bash
# 1. Install dependencies (root installs all workspaces)
npm install

# 2. Start Postgres + Redis
cp .env.example .env
npm run infra:up

# 3. Apply the database schema
npm run migrate --workspace=@rtc/server

# 4. Run server (:4000) and client (:5173)
npm run dev:server   # terminal 1
npm run dev:client   # terminal 2
```

Open two browser windows at <http://localhost:5173>, sign up as two users,
share a document, and edit simultaneously to see live sync + cursors.

## How real-time sync works

1. Each open document is a shared `Y.Doc`. Local edits produce a binary CRDT
   update emitted over Socket.io (`doc:update`).
2. The server applies the update to its in-memory copy, appends it to the
   `document_changes` audit log, broadcasts to other clients in the room, and
   publishes it to Redis so other server instances relay it too.
3. Cursors/selections travel over the Yjs **awareness** protocol
   (`awareness:update`) and are never persisted.
4. A debounced job flushes the full document snapshot to PostgreSQL.
5. Offline edits accumulate in the client `Y.Doc` and merge automatically on
   reconnect — CRDT guarantees convergence with no manual conflict resolution.

## Scaling model

Servers are stateless. A client is pinned to one pod via a sticky cookie (see
[k8s/ingress.yaml](k8s/ingress.yaml)) for the life of its WebSocket, while Redis
pub/sub fans updates out across all pods. Scale horizontally with the HPA in
[k8s/server.yaml](k8s/server.yaml).

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev:server` | Run the API + collab server with watch |
| `npm run dev:client` | Run the Vite dev server |
| `npm run build`      | Build all workspaces |
| `npm run typecheck`  | Type-check all workspaces |
| `npm test`           | Run tests |
| `npm run infra:up`   | Start Postgres + Redis via Docker |

## Deploy on Render

The repo includes a [`render.yaml`](render.yaml) Blueprint that provisions the
whole stack — PostgreSQL, Redis, the Node server (WebSockets), and the static
client — in one click. The server applies its schema automatically on boot.

1. **dashboard.render.com → New → Blueprint**, connect this repo, **Apply**.
2. After the first deploy, set the cross-service URLs (they only exist once the
   services are created):
   - `rtc-server` → `CLIENT_ORIGIN` = the client URL
   - `rtc-client` → `VITE_API_URL` and `VITE_WS_URL` = the server URL → rebuild
3. Visit the client URL and sign up.

Full walkthrough and gotchas: [DEPLOY.md](DEPLOY.md).

### CI as a deploy gate

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) type-checks, lints,
migrates, tests, and builds on every push/PR. On `main`, a final `deploy` job
triggers Render **only after CI passes** (via per-service Deploy Hooks). Render
auto-deploy is disabled (`autoDeploy: false`) so CI is the single gate.

To enable it, add two repo secrets (each service → Settings → **Deploy Hook**):
`RENDER_DEPLOY_HOOK_SERVER` and `RENDER_DEPLOY_HOOK_CLIENT`.

## Roadmap

Phases 1–4 from [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md#13-implementation-roadmap)
are implemented: real-time CRDT editing, presence, comments, version history,
search, rich text, templates, export, folders, trash, public links, mentions,
notifications + digest, command palette, dark mode, and an offline PWA.
