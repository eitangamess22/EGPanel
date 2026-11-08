# EGPanel — Phase 1 Architecture

## Assumptions

- The first implementation uses PostgreSQL, Redis, and Docker Compose on Linux hosts.
- HTTPS is terminated at a reverse proxy or load balancer; development uses HTTP on localhost.
- Users connect to the panel; the panel never opens Docker sockets on user nodes.
- `EGAgent` is a separate Go service. The panel communicates with it through authenticated REST and WebSocket connections.
- Template JSON is authoritative for server startup and installation behavior; core server lifecycle fields remain typed in the database.
- The reference image establishes visual hierarchy, density, and navigation behavior, not a pixel-for-pixel layout.

## Technology Decisions

| Concern | Choice | Reason |
|---|---|---|
| Panel API | Node.js, TypeScript, Fastify | Low overhead, mature ecosystem, Zod/Fastify integration, and straightforward typed plugin boundaries |
| Database | PostgreSQL 16 with Prisma | Strong relational guarantees for permissions, allocations, nodes, and server ownership |
| Cache/session/queue | Redis 7 | Session revocation, rate-limit counters, BullMQ jobs, and schedule coordination |
| Queue | BullMQ | Delayed schedules, retries, backup jobs, and deploy jobs with observable job state |
| Panel frontend | React, TypeScript, Vite, Tailwind CSS | Fast iteration and a small, explicit component system |
| Agent | Go with Docker Engine API | Small memory/CPU footprint, easy static builds, context cancellation, and reliable WebSocket handling |
| Realtime | WebSocket over WSS | Bidirectional console and low-latency stats with signed, short-lived subscriptions |

Fastify is preferred over NestJS for the first release because the deployment surface is smaller and plugins map naturally to the authentication, authorization, agent, template, and audit domains.

## System Boundaries

```text
Browser
  ├── HTTPS REST API
  └── WSS console/stats subscriptions
            │
      EGPanel API
      ├── PostgreSQL
      ├── Redis
      └── Node management plane
            │
     WSS + REST/TLS
            │
      EGAgent on each host
            └── Docker Engine API
```

EGAgent validates a node-scoped bearer token and TLS certificate identity. Each server is placed in an isolated Docker network and restricted with CPU, memory, PID, disk quota, and read-only system settings supported by the host.

## Monorepo Folder Structure

```text
EGPanel/
├── apps/
│   ├── panel/
│   │   ├── src/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── servers/
│   │   │   ├── nodes/
│   │   │   ├── allocations/
│   │   │   ├── templates/
│   │   │   ├── schedules/
│   │   │   ├── backups/
│   │   │   ├── files/
│   │   │   ├── audit/
│   │   │   ├── settings/
│   │   │   ├── api-keys/
│   │   │   ├── websocket/
│   │   │   └── shared/
│   │   ├── prisma/
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── agent/
│       ├── cmd/egagent/
│       ├── internal/
│       │   ├── docker/
│       │   ├── console/
│       │   ├── files/
│       │   ├── backups/
│       │   ├── stats/
│       │   └── auth/
│       ├── go.mod
│       └── Dockerfile
├── web/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── styles/
│   ├── public/
│   └── package.json
├── templates/
│   ├── minecraft/
│   ├── discord-node/
│   └── discord-python/
├── deploy/
│   ├── docker-compose.yml
│   ├── nginx.conf
│   └── egagent-install.sh
├── docs/
├── scripts/
├── package.json
└── README.md
```

## Database Model

The initial schema is in [schema.prisma](../apps/panel/prisma/schema.prisma).

Core entities:

- `User`, `Session`, `ApiKey`, and `TotpCredential`
- `Role`-based application authorization plus server-level `SubuserPermission`
- `Node`, `Allocation`, and `Server`
- `Template`, `TemplateVariable`, and resolved `ServerVariable`
- `Backup`, `Schedule`, and `ScheduledAction`
- `AuditLog` and `PanelSetting`

Important invariants:

- An allocation can belong to only one server at a time.
- A server must reference exactly one node and one template.
- Server ownership is separate from subuser access.
- API keys receive explicit scopes and optional server/node restrictions.
- Template edits do not mutate existing server variables unless an installation or version migration is requested.
- Audit rows retain actor, server, node, action, request metadata, and success state.

## REST API Surface

All API routes use `/api/v1`; request and response bodies are JSON except uploads and file downloads.

### Authentication and Sessions

| Method | Route | Purpose | Scope |
|---|---|---|---|
| POST | `/auth/login` | Argon2id login; optional TOTP challenge | Public |
| POST | `/auth/logout` | Revoke current session | Session |
| POST | `/auth/totp/setup` | Start TOTP enrollment | Session |
| POST | `/auth/totp/verify` | Verify and enable TOTP | Session |
| POST | `/auth/password/reset/request` | Request password reset | Public |
| POST | `/auth/password/reset/confirm` | Confirm password reset | Public |
| GET | `/account/sessions` | List sessions | Session |
| DELETE | `/account/sessions/:sessionId` | Revoke a session | Session |

### Users

| Method | Route | Purpose | Scope |
|---|---|---|---|
| GET | `/users` | Paginated user list | `user.read` |
| POST | `/users` | Create user | `user.write` |
| GET | `/users/:userId` | User details | `user.read` |
| PATCH | `/users/:userId` | Update profile or role | `user.write` |
| DELETE | `/users/:userId` | Disable or delete user | `user.write` |

### Servers

| Method | Route | Purpose | Scope |
|---|---|---|---|
| GET | `/servers` | Paginated server list visible to actor | `server.read` |
| POST | `/servers` | Allocate resources and install server | `server.create` |
| GET | `/servers/:serverId` | Server details | `server.read` |
| PATCH | `/servers/:serverId` | Rename or update allowed settings | `server.write` |
| DELETE | `/servers/:serverId` | Delete server and selected volumes | `server.delete` |
| POST | `/servers/:serverId/power/:action` | Start, stop, restart, or kill | `server.power` |
| POST | `/servers/:serverId/reinstall` | Reinstall while preserving selected data | `server.write` |
| POST | `/servers/:serverId/transfer` | Transfer to another node | `server.write` |

### Variables, Subusers, and Network

| Method | Route | Purpose | Scope |
|---|---|---|---|
| GET | `/servers/:serverId/variables` | Read editable startup variables | `server.startup.read` |
| PATCH | `/servers/:serverId/variables` | Update startup variables | `server.startup.write` |
| GET | `/servers/:serverId/subusers` | List subusers | `subuser.read` |
| POST | `/servers/:serverId/subusers` | Invite or add subuser | `subuser.write` |
| PATCH | `/servers/:serverId/subusers/:userId` | Update permissions | `subuser.write` |
| DELETE | `/servers/:serverId/subusers/:userId` | Remove access | `subuser.write` |
| GET | `/servers/:serverId/allocations` | List allocations | `server.network.read` |
| POST | `/servers/:serverId/allocations` | Assign allocation | `server.network.write` |
| DELETE | `/servers/:serverId/allocations/:allocationId` | Unassign allocation | `server.network.write` |

### Files

| Method | Route | Purpose | Scope |
|---|---|---|---|
| GET | `/servers/:serverId/files?path=` | List directory | `server.file.read` |
| GET | `/servers/:serverId/files/content?path=` | Read text or binary metadata | `server.file.read` |
| PUT | `/servers/:serverId/files/content?path=` | Write text file | `server.file.write` |
| POST | `/servers/:serverId/files/upload` | Chunked multipart upload | `server.file.write` |
| POST | `/servers/:serverId/files/rename` | Rename entry | `server.file.write` |
| POST | `/servers/:serverId/files/delete` | Delete entries | `server.file.write` |
| POST | `/servers/:serverId/files/compress` | Create archive | `server.file.write` |
| POST | `/servers/:serverId/files/decompress` | Extract archive | `server.file.write` |

Paths are resolved and validated against the server root by EGAgent. The panel does not accept absolute paths.

### Backups and Schedules

| Method | Route | Purpose | Scope |
|---|---|---|---|
| GET | `/servers/:serverId/backups` | List backups | `backup.read` |
| POST | `/servers/:serverId/backups` | Create backup | `backup.create` |
| POST | `/servers/:serverId/backups/:backupId/restore` | Restore backup | `backup.restore` |
| GET | `/servers/:serverId/backups/:backupId/download` | Signed download URL | `backup.download` |
| PATCH | `/servers/:serverId/backups/:backupId` | Lock or unlock | `backup.write` |
| DELETE | `/servers/:serverId/backups/:backupId` | Delete backup | `backup.delete` |
| GET | `/servers/:serverId/schedules` | List schedules | `schedule.read` |
| POST | `/servers/:serverId/schedules` | Create schedule | `schedule.write` |
| PATCH | `/servers/:serverId/schedules/:scheduleId` | Update schedule | `schedule.write` |
| DELETE | `/servers/:serverId/schedules/:scheduleId` | Delete schedule | `schedule.write` |

### Nodes, Allocations, Templates, and Administration

| Method | Route | Purpose |
|---|---|---|
| GET/POST | `/nodes` | List/create nodes |
| GET/PATCH/DELETE | `/nodes/:nodeId` | Read/update/remove node |
| POST | `/nodes/:nodeId/token/rotate` | Rotate EGAgent token |
| GET/POST | `/allocations` | List/create allocations |
| POST/DELETE | `/allocations/:allocationId` | Assign/remove allocation |
| GET/POST | `/templates` | List/import templates |
| GET/PATCH/DELETE | `/templates/:templateId` | Read/edit/delete template |
| GET | `/templates/:templateId/export` | Export versioned JSON |
| GET | `/api-keys` | List API keys |
| POST/DELETE | `/api-keys/:keyId` | Create/revoke API key |
| GET | `/audit-log` | Filtered audit log |
| GET/PATCH | `/settings` | Read/update panel settings |

## Template Contract

Templates are JSON documents. `spec` contains Docker and lifecycle configuration; `variables` defines user-editable startup values; `patches` contains optional config transformations.

```json
{
  "apiVersion": "egpanel.io/v1",
  "kind": "Template",
  "metadata": {
    "name": "Minecraft Paper",
    "slug": "minecraft-paper",
    "type": "MINECRAFT_JAVA",
    "description": "Paper Minecraft Java server",
    "version": "1.0.0"
  },
  "spec": {
    "docker": {
      "image": "eclipse-temurin:21-jdk",
      "workingDirectory": "/home/container",
      "stopCommand": "stop",
      "user": "1000:1000"
    },
    "startup": "java -Xms128M -Xmx{{RAM}}M {{JVM_FLAGS}} -jar server.jar nogui",
    "install": { "script": "sh", "args": ["./install.sh"] },
    "readyLog": "Done \\([^;]+sec\\)! For help, type \"help\"",
    "features": {
      "javaVersions": [8, 11, 17, 21],
      "software": ["PAPER", "VANILLA", "PURPUR"]
    }
  },
  "variables": [
    {
      "name": "RAM",
      "label": "Memory Limit",
      "type": "NUMBER",
      "required": true,
      "min": 512,
      "max": 65536,
      "default": 2048
    }
  ],
  "patches": [
    {
      "file": "server.properties",
      "path": "server-port",
      "target": "PORT",
      "rule": "REPLACE"
    }
  ]
}
```

Validation rules:

- Template JSON must pass JSON Schema and semantic validation before import.
- Startup and install commands must be non-empty strings.
- Variable names use uppercase letters, digits, and underscores.
- Config paths must remain inside the server volume.
- Docker images are allowlisted or require an administrator opt-in.
- The ready regex is compiled server-side and limited to a fixed duration and pattern size.

## WebSocket Protocol

### Browser to EGPanel

Browser clients connect to `wscat://host/api/v1/ws` over WSS using a signed, short-lived access token.

```json
{
  "v": 1,
  "id": "01J...",
  "type": "subscribe",
  "payload": { "serverId": "01J...", "channels": ["console", "stats"] }
}
```

### EGAgent to EGPanel

EGAgent maintains a node-scoped WSS connection:

```json
{
  "v": 1,
  "id": "01J...",
  "type": "node.stats",
  "payload": {
    "nodeId": "01J...",
    "cpuPercent": 12.4,
    "memoryUsedBytes": 1073741824,
    "memoryTotalBytes": 34359738368
  }
}
```

Core event types:

| Direction | Event | Payload summary |
|---|---|---|
| Browser → Panel | `subscribe` | Server ID and channels |
| Browser → Panel | `unsubscribe` | Server ID and channels |
| Browser → Panel | `console.command` | Command text; signed server token |
| Browser → Panel | `ping` | Optional client timestamp |
| Panel → Browser | `console.output` | ANSI-safe text, stream, sequence number |
| Panel → Browser | `server.state` | State, reason, ready flag |
| Panel → Browser | `server.stats` | CPU, memory, disk, network counters |
| Panel → Browser | `job.progress` | Backup/install/deploy job progress |
| Panel → Browser | `error` | Stable code, safe message, request ID |
| Panel → Browser | `pong` | Server and client timestamps |
| Panel → Agent | `server.start` | Server config revision and resolved startup |
| Panel → Agent | `server.stop` | Graceful timeout and stop command |
| Panel → Agent | `server.restart` | Graceful timeout and resolved startup |
| Panel → Agent | `server.kill` | Container kill |
| Panel → Agent | `server.reinstall` | Template and install payload |
| Agent → Panel | `console.output` | Container output and sequence |
| Agent → Panel | `server.state` | Starting/running/stopping/offline/crashed |
| Agent → Panel | `server.stats` | Docker stats snapshot |
| Agent → Panel | `job.progress` | Job ID, stage, percent, message |

Every frame has a ULID-style `id`, protocol `v`, and payload. State and console frames include monotonic sequence numbers per server. Reconnect clients use the last sequence to request missed console output.

Browser access is checked on every subscribe and command. EGAgent never trusts browser identity; the panel validates permissions and sends signed actions to the node token. EGAgent accepts node connections only from a configured mTLS peer or pinned certificate.
