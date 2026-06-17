# Production-Grade Real-Time Collaborative Editor
## System Design Document

---

## 1. REQUIREMENTS

### Functional Requirements
- **Multi-user real-time editing** with instant conflict resolution
- **Document persistence** with full version history
- **User presence** (cursors, selections, online status)
- **Collaborative features**: comments/threads, mentions, @notifications
- **Permissions & access control**: document sharing, role-based (owner, editor, viewer)
- **Rich text support** (formatting, links, embeds)
- **Offline support** with automatic sync when online
- **Full-text search** across documents
- **Undo/redo** with collaborative awareness
- **Document templates** for quick setup

### Non-Functional Requirements
| Metric | Target |
|--------|--------|
| **Concurrent Users per Document** | 100+ |
| **Real-time Sync Latency** | <100ms p99 |
| **Document Availability** | 99.95% SLA |
| **Max Documents** | Millions |
| **Max Document Size** | 10MB |
| **Data Durability** | 99.999% (multi-region replication) |
| **Peak QPS** | 10k+ concurrent WebSocket connections |
| **Scaling** | Horizontal (stateless services) |

### Constraints & Assumptions
- **Team size**: 2-3 engineers initially, scale to 10+
- **Deployment**: Cloud-native (AWS/GCP) with containerization
- **Budget**: Optimize for operational efficiency, not minimum cost
- **Timeline**: MVP in 8 weeks, production-ready in 16 weeks
- **Existing tech**: Assume JavaScript/Node.js ecosystem preferred

---

## 2. ARCHITECTURE OVERVIEW

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (React + TS)                      │
│  - Yjs CRDT + Y.js                                              │
│  - IndexedDB (offline persistence)                              │
│  - Presence tracking (cursors, selections)                      │
│  - Optimistic UI updates                                        │
└────────────────────┬────────────────────────────────────────────┘
                     │ WebSocket (Socket.io)
                     │ + Exponential backoff + Reconnect
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API GATEWAY (Load Balancer)                   │
│  - TLS termination                                              │
│  - Rate limiting (per user/IP)                                  │
│  - WebSocket upgrade handling                                   │
│  - Authentication (JWT validation)                              │
└────────────────────┬────────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Node.js    │ │   Node.js    │ │   Node.js    │
│ (Collab Svc) │ │ (Collab Svc) │ │ (Collab Svc) │
│  - WebSocket │ │  - WebSocket │ │  - WebSocket │
│  - CRDT Sync │ │  - CRDT Sync │ │  - CRDT Sync │
│  - Presence  │ │  - Presence  │ │  - Presence  │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
       ┌────────────────┴──────────────────┐
       ▼                                    ▼
  ┌─────────────┐                   ┌──────────────┐
  │   Redis     │                   │  PostgreSQL  │
  │  (Presence, │                   │ (Documents,  │
  │   Sessions, │                   │  History,    │
  │   Locks)    │                   │  Users)      │
  └─────────────┘                   └──────────────┘
       │                                   │
       └───────────────┬───────────────────┘
                       ▼
         ┌──────────────────────────┐
         │  Event Stream (Kafka)    │
         │  (Audit trail, indexing) │
         └──────────────────────────┘
```

### Data Flow for Edit Operation

```
1. Client: Edit made locally → Yjs CRDT generates update + local state
2. Client: Send update via WebSocket → Server (within <50ms)
3. Server: Validate (permissions, conflicts) → Store in memory
4. Server: Broadcast to other clients (within <100ms)
5. Clients: Receive update → Apply to Yjs → UI auto-updates
6. Server: Periodically flush to PostgreSQL (debounced)
7. Event Stream: Emit change event (audit, search indexing)
```

---

## 3. TECHNOLOGY STACK

### Frontend
| Component | Technology | Justification |
|-----------|------------|---------------|
| Framework | React 18 + TypeScript | Type safety, ecosystem, performance |
| CRDT | Yjs + y-websocket | Battle-tested, handles complex conflict resolution |
| State | Zustand (local) + Yjs (shared) | Lightweight, integrates well with Yjs |
| Offline | IndexedDB via y-indexeddb | Offline persistence for Yjs state |
| Real-time | Socket.io (auto-reconnect) | WebSocket abstraction, built-in fallbacks |
| Rich Editor | TipTap (Prosemirror-based) | CRDT-friendly, extensible |
| Build | Vite | Fast HMR, excellent TS support |
| Testing | Vitest + React Testing Library | Fast, modern, component-focused |

### Backend
| Component | Technology | Justification |
|-----------|------------|---------------|
| Runtime | Node.js 20 LTS + TypeScript | Async I/O, WebSocket support, team familiarity |
| Framework | Hono (lightweight) or NestJS (structured) | Hono for performance, NestJS for enterprise patterns |
| Real-time | Socket.io server | WebSocket rooms for documents, built-in pub/sub |
| Message Queue | Redis Streams (or Kafka) | Pub/sub for presence, event sourcing for changelog |
| Database | PostgreSQL 15+ | ACID transactions, JSON support, full-text search |
| Cache | Redis | Session storage, presence, locks, rate limiting |
| Search | PostgreSQL full-text + pg_trgm (or Elasticsearch) | Full-text search, trigram similarity |
| Background Jobs | Bull (Redis-backed) | Async tasks (notifications, indexing, cleanup) |
| Monitoring | Prometheus + Grafana | Metrics, visualizations, alerting |
| Logging | Winston (structured) → ELK Stack | Centralized logging, searchable |
| Tracing | OpenTelemetry + Jaeger | Distributed tracing for debugging |

### Deployment & Infrastructure
| Component | Technology | Justification |
|-----------|------------|---------------|
| Container | Docker | Reproducible environments, easy scaling |
| Orchestration | Kubernetes (or Docker Swarm) | Auto-scaling, self-healing, declarative |
| Database | AWS RDS PostgreSQL (Multi-AZ) | Managed, automated backups, failover |
| Cache | AWS ElastiCache Redis | Managed, cluster mode for HA |
| Message Queue | AWS MSK (Kafka) or Redis Streams | Event sourcing, audit trail |
| Storage | S3 (for exports, backups) | Durable, versioned |
| CI/CD | GitHub Actions | GitHub-native, no extra tools |
| Secrets | AWS Secrets Manager | Encrypted, rotated credentials |

---

## 4. DATA MODELS

### Core Tables (PostgreSQL)

#### Users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255),
  avatar_url TEXT,
  password_hash VARCHAR(255),
  email_verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Documents
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id),
  content_snapshot JSONB, -- Latest Yjs state vector
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP, -- Soft delete
  metadata JSONB, -- Custom fields
  is_public BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_documents_owner_id ON documents(owner_id);
CREATE INDEX idx_documents_deleted_at ON documents(deleted_at);
```

#### Document Permissions
```sql
CREATE TABLE document_permissions (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL, -- 'owner', 'editor', 'viewer', 'commenter'
  granted_by_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(document_id, user_id)
);

CREATE INDEX idx_permissions_document_id ON document_permissions(document_id);
CREATE INDEX idx_permissions_user_id ON document_permissions(user_id);
```

#### Document History (Change Events)
```sql
CREATE TABLE document_changes (
  id BIGSERIAL PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  change_data BYTEA NOT NULL, -- Binary Yjs update
  operation_index INT NOT NULL, -- Lamport clock for ordering
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_changes_document_id ON document_changes(document_id);
CREATE INDEX idx_changes_document_created ON document_changes(document_id, created_at);
```

#### Comments & Threads
```sql
CREATE TABLE comments (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES comments(id) ON DELETE CASCADE, -- Parent for replies
  user_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_comments_document_id ON comments(document_id);
CREATE INDEX idx_comments_thread_id ON comments(thread_id);
```

#### Sessions & Presence
```sql
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON user_sessions(expires_at);
```

#### Notifications
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50), -- 'comment_reply', 'shared', 'mentioned'
  related_document_id UUID REFERENCES documents(id),
  content TEXT,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id_read ON notifications(user_id, read_at);
```

### Redis Data Structures

```
# Presence (active users in document)
document:{doc_id}:presence -> HSET (user_id -> {cursor, selection, color})

# Sessions
session:{session_id} -> HSET (user_id, expires_at, etc.)

# Rate limiting
rate_limit:{user_id}:{endpoint} -> INCR (ttl: 1 minute)

# Distributed locks
lock:{doc_id} -> SET (NX, EX 30s) for critical operations

# Pub/Sub channels
document:{doc_id}:updates -> Pub/Sub stream for real-time changes
document:{doc_id}:presence -> Pub/Sub for cursor/selection updates
```

---

## 5. REAL-TIME SYNC STRATEGY

### CRDT (Conflict-free Replicated Data Type) with Yjs

**Why Yjs?**
- Proven in production (Figma, Notion competitors use similar)
- Efficient binary encoding (small update sizes)
- Rich data types (Text, Array, Map, XML)
- Built-in awareness protocol (presence tracking)
- Easy persistence and offline support

### Sync Algorithm

```
Client State:
├── Yjs Doc (contains edits)
├── State Vector (SV) - clock for each client
└── Updates Queue (pending sends)

Server State (per document):
├── Yjs Doc (merged state)
├── State Vector Matrix (SV for each connected client)
├── Pending updates (to be broadcast)
└── PostgreSQL snapshot (periodic flush)

SYNC FLOW:
1. Client A makes edit
   ├── Locally apply to Yjs
   ├── Generate update (binary diff)
   └── Send to server with client_id + clock

2. Server receives update
   ├── Validate permissions
   ├── Apply to server Yjs
   ├── Generate state vector snapshot
   ├── Broadcast update to all other clients
   └── Queue for persistence (debounced, every 5s or 50 ops)

3. Client B receives update
   ├── Validate (came from trusted server)
   ├── Apply to Yjs
   ├── UI auto-updates (React binding)
   └── Send acknowledgment (implicit via ack message)

4. Offline Client C
   ├── Accumulates updates locally in IndexedDB
   ├── On reconnect, sends all local updates
   ├── Server applies + broadcasts back all updates missed
   └── Merge happens seamlessly (Yjs handles conflicts)
```

### Key Design Decisions

1. **Full State Vector Sync** (not just diffs)
   - Every 10s, send full state vector to detect and fill gaps
   - Handles packet loss, late arrivals

2. **Acknowledgment Model**
   - Server broadcasts to all, waits for client ACK
   - Missing ACKs trigger resend (exponential backoff)
   - Timeout = kick client from document room

3. **Persistence Strategy**
   - **In-memory**: Yjs Doc in memory for fast access
   - **Debounced flush**: Every 5 seconds or 50 operations
   - **Snapshot**: Save full state + increment number for recovery
   - **Change log**: Store individual updates for audit trail

4. **Conflict Resolution**
   - **Automatic** (Yjs CRDT handles it)
   - Example: Two users insert at same position → uses operation IDs
   - No manual merge required ✓

---

## 6. USER PRESENCE & AWARENESS

### Presence Protocol

```typescript
// Each client broadcasts:
{
  userId: "uuid",
  clientId: "unique-session-id", // different from user_id (multi-tab)
  cursor: { line: 10, ch: 5 },
  selection: { from: { line: 5, ch: 0 }, to: { line: 10, ch: 5 } },
  color: "#FF5733", // assigned per user
  lastActive: timestamp,
  status: "editing" | "idle"
}

// Broadcast frequency: Every 500ms (or on change, debounced)
// Cleanup: Remove absent users after 30s inactivity
```

### Rendering Presence
- **Remote cursors**: Render as colored lines with user avatars
- **Selections**: Semi-transparent highlight color
- **Status**: Show "X is typing..." when activity detected
- **Avatars**: Floating near cursor with color + initials

---

## 7. PERMISSIONS & ACCESS CONTROL

### Role-Based Access Control (RBAC)

| Role | View | Edit | Comment | Share | Delete |
|------|------|------|---------|-------|--------|
| Owner | ✓ | ✓ | ✓ | ✓ | ✓ |
| Editor | ✓ | ✓ | ✓ | ✗ | ✗ |
| Commenter | ✓ | ✗ | ✓ | ✗ | ✗ |
| Viewer | ✓ | ✗ | ✗ | ✗ | ✗ |

### Permission Checks

```typescript
// Every operation validated at server:
async function validateOperation(userId, docId, operation) {
  const permission = await db.getPermission(docId, userId);
  
  switch (operation) {
    case 'EDIT':
      if (!['owner', 'editor'].includes(permission.role)) throw Error('Forbidden');
      break;
    case 'COMMENT':
      if (!['owner', 'editor', 'commenter'].includes(permission.role)) throw Error('Forbidden');
      break;
    case 'DELETE':
      if (permission.role !== 'owner') throw Error('Forbidden');
      break;
  }
}
```

### Share via Link
- **Public link**: Read-only share with access token
- **Private link**: Time-limited, single-use tokens for specific users
- **Expiration**: Configurable (1 day, 7 days, never)

---

## 8. OFFLINE SUPPORT

### Architecture

```
Online Mode:
- All changes sync real-time to server
- Receive updates from other clients instantly

Offline Mode (detected by failed WebSocket):
- All edits stored in IndexedDB (via Yjs)
- UI remains fully functional
- Optimistic updates (assume success)

Reconnect Flow:
1. Detect online (network restored)
2. Initialize WebSocket
3. Send all offline updates to server (in order)
4. Server applies + broadcasts back merged state
5. Merge seamlessly (Yjs CRDT handles conflicts)
6. Sync complete, resume real-time mode
```

### IndexedDB Schema
```javascript
// Yjs automatically persists to IndexedDB:
db.documents[{
  id: "doc-uuid",
  state: /* Yjs state vector */,
  lastSync: timestamp,
  updates: [ /* pending updates */ ]
}]
```

---

## 9. SCALABILITY

### Horizontal Scaling

**WebSocket Server Scaling**
```
Load Balancer
├── Collab Server 1 (handles docs 1-N)
├── Collab Server 2 (handles docs N+1-2N)
└── Collab Server 3 (handles docs 2N+1-3N)

↓ (Document rooms sticky session)

Redis Pub/Sub (broadcast between servers):
  - document:{doc_id}:updates
  - document:{doc_id}:presence
```

**Why Redis Pub/Sub?**
- Simple, fast, enough for most cases
- If need ordered guarantees → switch to Kafka

**Database Scaling**
```
PostgreSQL Read Replicas:
├── Primary (writes)
└── Replica-1, Replica-2 (reads)

Full-text search:
├── PostgreSQL built-in (good for MVP)
└── Elasticsearch (if >10M documents or 1000 QPS)
```

### Load Estimation

Assuming **1M active daily users**, **100k concurrent users**:

```
WebSocket connections: 100k
├── Document edits/sec: ~500 (5 edits per user/minute on avg)
├── Network traffic: ~50 Mbps (compressed updates)
└── CPU/RAM per server: Handle ~5k connections/server

Example deployment:
├── 20 WebSocket servers (5k connections each)
├── 3 PostgreSQL (1 primary, 2 replicas)
├── 3 Redis nodes (cluster mode)
├── 3 Kafka brokers (for audit trail)
└── Load balancer (auto-scaling)
```

### Bottleneck Mitigation

| Bottleneck | Solution |
|-----------|----------|
| WebSocket CPU | Multi-threaded worker pools, load balance by doc_id |
| Database writes | Connection pooling (PgBouncer), write batching |
| Presence updates | Debounce (200ms), aggregate before broadcast |
| Full-text search | Index on content changes (async job), cache hot docs |
| Memory per server | Snapshot old docs to disk, LRU eviction |

---

## 10. OFFLINE SUPPORT (DETAILED)

### Sync Queue with Retry Logic

```typescript
class SyncQueue {
  private queue: Update[] = [];
  private inFlight = false;
  
  async send(update: Update) {
    this.queue.push(update);
    
    if (!this.inFlight) {
      this.processBatch();
    }
  }
  
  private async processBatch() {
    this.inFlight = true;
    
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, 50); // batch size
      
      try {
        await this.socket.emit('batch_update', batch);
        // Clear on success
      } catch (error) {
        // Exponential backoff: 1s, 2s, 4s, 8s... (max 30s)
        await this.delay(Math.min(30000, 1000 * Math.pow(2, retryCount)));
        this.queue.unshift(...batch); // put back
      }
    }
    
    this.inFlight = false;
  }
}
```

---

## 11. MONITORING & OBSERVABILITY

### Metrics to Track

```
Application Metrics:
├── Sync latency (p50, p99, p99.9)
├── Update size (bytes)
├── Conflict rate (% of updates conflicting)
├── Offline users (count)
├── Document load time (cold start)
└── Comments per document (engagement)

Infrastructure Metrics:
├── CPU/Memory per server
├── WebSocket connection churn
├── Database query latency
├── Redis memory usage
├── Network I/O
└── Disk I/O for PostgreSQL

Business Metrics:
├── Documents created/deleted
├── Active documents
├── Concurrent users per doc (p95, p99)
├── Share rate
└── Feature usage (comments, search, etc.)
```

### Alerting Rules

```yaml
- Alert: HighSyncLatency
  Condition: p99_latency > 500ms
  Action: Page oncall, investigate server load

- Alert: SyncQueueBackup
  Condition: pending_updates > 10000
  Action: Check network, database write capacity

- Alert: DatabaseConnectionPoolExhausted
  Condition: active_connections > 95% of pool
  Action: Increase pool size, check for slow queries

- Alert: RedisMemoryHigh
  Condition: used_memory_percentage > 80%
  Action: Evict old presence data, check for leaks

- Alert: WebSocketConnectionDrop
  Condition: churn_rate > 100/sec
  Action: Check server health, network issues
```

### Logging Strategy

```typescript
// Structured logging with correlation IDs
logger.info({
  event: 'document_edited',
  documentId: doc_id,
  userId: user_id,
  operationCount: 5,
  updateSize: 1024,
  syncLatency: 45,
  timestamp: Date.now(),
  correlationId: request.id // for tracing
});
```

---

## 12. SECURITY

### Authentication & Authorization

```
1. JWT-based Sessions
   ├── Issued on login (access token: 1 hour, refresh: 30 days)
   ├── Refresh token stored in httpOnly cookie
   ├── Validated on every WebSocket message

2. Permission Checks
   ├── Server validates every edit operation
   ├── No client-side permission checks trusted
   └── Rate limit per user (10 edits/sec max)

3. Token Rotation
   ├── Refresh token rotated on each use
   ├── Revoke old token (prevent token reuse attacks)
```

### Input Validation

```typescript
// Every incoming update validated:
function validateUpdate(update: any) {
  if (!isValidYjsUpdate(update.data)) throw Error('Invalid update');
  if (update.documentId && !isUUID(update.documentId)) throw Error('Invalid doc ID');
  if (update.size > 1024 * 1024) throw Error('Update too large'); // 1MB max
}
```

### Data Protection

```
1. Encryption in Transit
   ├── TLS 1.3 for all HTTP + WebSocket
   └── No plaintext credentials

2. Encryption at Rest
   ├── PostgreSQL: Transparent Data Encryption (TDE)
   ├── Backups: AES-256 encryption
   └── S3: Server-side encryption

3. PII Handling
   ├── Don't store raw passwords (bcrypt + salt)
   ├── Hash emails for analytics
   ├── Audit trail for access to sensitive docs
```

### DDoS & Rate Limiting

```typescript
// Per-user rate limits
const limits = {
  'document.edit': 100, // edits/minute
  'document.create': 10, // creates/minute
  'comment.create': 50, // comments/minute
  'api.general': 1000   // API calls/minute
};

// IP-based rate limiting (login attempts)
- 5 failed logins → 15 minute lockout
```

### Audit Trail

```sql
-- Every change logged
INSERT INTO audit_log (
  user_id, document_id, action, before_data, after_data, timestamp
) VALUES (...)

-- Retention: 1 year for compliance
CREATE POLICY delete_old_audit_logs AS
  DELETE FROM audit_log WHERE timestamp < NOW() - INTERVAL '1 year'
```

---

## 13. IMPLEMENTATION ROADMAP

### Phase 1: MVP (Weeks 1-4)
**Goal: Basic collaborative editing working**

- [ ] Project setup (monorepo, Docker, CI/CD)
- [ ] User authentication (signup, login, JWT)
- [ ] Basic document CRUD
- [ ] Yjs + Socket.io real-time sync
- [ ] Basic permissions (owner/editor/viewer)
- [ ] Deploy to staging

**Deliverable**: 2 users can edit same doc in real-time

### Phase 2: Core Features (Weeks 5-8)
**Goal: Production-ready collaborative editor**

- [ ] User presence (cursors, selection)
- [ ] Comments & threads
- [ ] Document history & version control
- [ ] Offline support (IndexedDB sync)
- [ ] Full-text search
- [ ] Share by link (public & private)
- [ ] Notifications system

**Deliverable**: Feature-complete, internal dogfooding

### Phase 3: Scale & Polish (Weeks 9-12)
**Goal: Production hardening**

- [ ] Comprehensive error handling & recovery
- [ ] Monitoring & alerting setup
- [ ] Load testing (1000 concurrent users)
- [ ] Security audit & fixes
- [ ] Performance optimization (lazy load, code splitting)
- [ ] Documentation (API, deployment, runbooks)

**Deliverable**: Production-ready, load-tested

### Phase 4: Advanced Features (Weeks 13-16)
**Goal: Competitive differentiation**

- [ ] Rich text formatting (Markdown, bold, etc.)
- [ ] Document templates
- [ ] Collaborative cursors (avatars, names)
- [ ] @ mentions & notifications
- [ ] Export (PDF, Word, HTML)
- [ ] Integrations (Slack, GitHub, etc.)

**Deliverable**: Feature-rich, ready for public beta

---

## 14. KEY TRADE-OFFS

| Decision | Pros | Cons | When to Revisit |
|----------|------|------|-----------------|
| **Yjs over OT** | CRDT simplicity, built-in offline | Larger memory footprint | If memory becomes bottleneck (>1M concurrent) |
| **Socket.io over gRPC** | Fallback to long-polling, mature ecosystem | Slightly higher latency | If need sub-50ms latency consistently |
| **PostgreSQL over MongoDB** | ACID, proven at scale, FTS built-in | Requires schema migration | If need schema-less flexibility |
| **Redis pub/sub over Kafka** | Simple, low latency, no ops overhead | No persistence, no ordering guarantees | If need audit trail or replay capability (→ add Kafka) |
| **IndexedDB for offline** | Simple, browser-native, good for 10MB docs | No full-text search offline | If need rich offline search → Lunr.js |
| **Self-hosted vs SaaS** | Full control, compliance, cost at scale | Ops overhead, initial setup time | Start self-hosted, evaluate SaaS at 100k users |

---

## 15. CRITICAL QUESTIONS FOR REFINEMENT

Before implementation, validate:

1. **Rich text or plain text?**
   - MVP: Plain text (Yjs Text type)
   - Future: Rich text (TipTap integration)

2. **Comment threads or inline only?**
   - Propose: Full threads, reply chains, resolutions

3. **Version history granularity?**
   - Propose: Snapshots every 5min + all changes
   - Keep 30 days full history, compress older

4. **Export formats?**
   - Propose: JSON, Markdown, HTML, PDF (as premium)

5. **Team collaboration?**
   - Propose: Start with 1:1 sharing, later add teams/workspaces

6. **Search across user's documents or all documents?**
   - Propose: User's documents only (privacy), later add public search

---

## 16. DEPLOYMENT CHECKLIST

Before going to production:

- [ ] SSL/TLS certificates (auto-renew with Let's Encrypt)
- [ ] Secrets management (no hardcoded keys)
- [ ] Database backups (daily, encrypted, multi-region)
- [ ] Load test with 10k concurrent users
- [ ] Monitoring alerts configured
- [ ] Runbooks for common incidents
- [ ] Security audit (OWASP Top 10)
- [ ] GDPR/privacy compliance review
- [ ] Disaster recovery plan (RTO < 1 hour)
- [ ] Client onboarding & support plan

---

## Summary

This design prioritizes:
1. **Correctness** (CRDT, ACID transactions)
2. **Scalability** (horizontal, stateless services)
3. **Reliability** (multi-region, failover, monitoring)
4. **Performance** (<100ms sync latency)
5. **Developer experience** (familiar stack, clear architecture)

The system is production-ready but intentionally left room for optimization as usage patterns emerge. Start with MVP, measure, then optimize.
