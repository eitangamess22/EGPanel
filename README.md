# EGPanel

EGPanel is a self-hosted game and Discord bot hosting panel. The launch stack includes Minecraft Java, Node.js Discord bots, and Python Discord bots.

## Requirements

- Linux host with Docker Engine and Docker Compose
- Node.js 20.11 or newer for local panel development
- Go 1.22 or newer for EGAgent development
- PostgreSQL 16 and Redis 7

## Quick start

### Windows Docker Desktop

1. Install Docker Desktop and enable **WSL 2**, then set Docker Desktop to **Linux containers**.
2. In Docker Desktop, open **Settings → Resources → WSL Integration** and enable the current Ubuntu distribution.
3. Open PowerShell in [the EGPanel workspace](file:///G:/Panel%20-%20EGPanel).
4. Copy `.env.example` to `.env`.
5. Replace every example secret and set the administrator values.
6. Start the stack:

```powershell
docker compose --env-file .env -f deploy/docker-compose.yml up -d --build
docker compose --env-file .env -f deploy/docker-compose.yml ps
```

```bash
cp .env.example .env
openssl rand -hex 32
docker compose --env-file .env -f deploy/docker-compose.yml up -d --build
```

Open `http://localhost:8080`. Configure TLS and a real domain before exposing EGPanel publicly. The panel container automatically runs database migrations and, when `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set, imports the launch templates and creates the administrator.

You can also seed manually from the host:

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD="replace-with-a-secure-password" npm run seed -w apps/panel
```

## Development

```bash
npm install
npm run db:generate
npm run db:migrate
npm run dev
npm run web
```

The panel API runs on port 3001 and the web UI runs on port 5173. Generate a PostgreSQL database named `egpanel` before running migrations.

## EGAgent

```bash
sudo sh deploy/egagent-install.sh
cd apps/agent
EGAGENT_TOKEN="replace-with-node-token" EGAGENT_STATE_DIR="/var/lib/egagent" go run ./cmd/egagent
```

EGAgent requires a dedicated Linux host or VM, Docker Engine, an EGPanel-provided node token, and outbound/inbound TLS connectivity through a reverse proxy.

## Template development

Template files are JSON documents under `templates/`. Each document must use:

- `apiVersion: egpanel.io/v1`
- `kind: Template`
- metadata with `name`, `slug`, `type`, and `version`
- Docker startup/stop configuration
- startup variables and optional config patches

Import templates from **Templates** in the admin interface or through `POST /api/v1/templates`.
