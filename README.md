# Querion

A private archive for your [`pi`](https://github.com/earendil-works/pi) coding-agent sessions.
Run `/sync` inside any pi session and read the full transcript — messages, thinking,
tool calls, diffs, images, token cost — from any browser, including your phone.

- **Read on the go.** Mobile-first transcript reader with markdown + syntax highlighting.
- **One password.** Single-user auth, no accounts, no orgs, no third-party login.
- **Self-contained.** Next.js + Prisma 7 + Tailwind v4, Postgres (Supabase), deployable on Vercel.
- **Idempotent sync.** Re-sync as often as you like; entries are keyed and deduplicated.
- **Secret hygiene.** NUL/lone-surrogate sanitisation always on; high-confidence secret redaction on by default.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, RSC) |
| Language | TypeScript (strict) |
| Database | PostgreSQL (Supabase) |
| ORM | Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg`, Rust-free runtime) |
| Styling | Tailwind CSS v4 + `@tailwindcss/typography` (Catppuccin Mocha) |
| Markdown | `react-markdown` + `remark-gfm` + `rehype-highlight` |
| Auth | HMAC-signed HttpOnly cookie, single password (Web Crypto, edge-compatible) |
| Hosting | Vercel |

---

## How it works

```
   pi session (.jsonl)                 Querion server                     Browser
 ┌────────────────────┐        ┌──────────────────────────┐        ┌──────────────────┐
 │ /sync  (extension) │  POST  │ /api/sync                │        │ /login           │
 │  or                │ ─────► │  • Bearer token          │        │ /sessions        │
 │ npm run sync:...   │        │  • sanitize + redact     │  read  │ /sessions/:id    │
 └────────────────────┘        │  • upsert (idempotent)   │ ◄───── │  (auth cookie)   │
                               │  • store Session + Entry │        └──────────────────┘
                               └────────────┬─────────────┘
                                            │ Prisma + pg adapter
                                       ┌────▼─────┐
                                       │ Postgres │
                                       └──────────┘
```

Sessions are stored as a `Session` row plus one `Entry` row per JSONL line
(`data` holds the verbatim entry as `jsonb`). The reader computes the active
branch from the `parentId` chain, so `/tree` branches render correctly.

---

## Quick start (local)

Requires Node 20+ and a PostgreSQL database. The easiest local database is Docker:

```bash
docker run -d --name querion-pg \
  -e POSTGRES_USER=querion -e POSTGRES_PASSWORD=querion -e POSTGRES_DB=querion \
  -p 5432:5432 postgres:16

git clone <your-repo> ~/Projects/querion && cd ~/Projects/querion
cp .env.example .env          # then edit values
npm install                   # generates the Prisma client

npm run db:migrate -- --name init   # local only: create + apply migrations
npm run dev
```

Open <http://localhost:3000>, sign in with `QUERION_PASSWORD`.

Generate strong secrets:

```bash
openssl rand -hex 32   # AUTH_SECRET
openssl rand -hex 32   # QUERION_SYNC_TOKEN
```

> **NixOS:** Prisma cannot download prebuilt engines. `scripts/prisma.mjs` transparently
> wires in `nixpkgs#prisma-engines`, so `npm install`, `npm run build` and all
> `npm run db:*` scripts work without extra setup. On other platforms it is a no-op.

---

## Supabase (production database)

Create a project, then copy the pooled connection strings into `.env` (and later Vercel):

```bash
# Transaction-mode pooler (IPv4) — used by the running app
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"

# Session-mode pooler — used by migrations
DIRECT_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

Apply the committed migrations once (uses `DIRECT_URL`):

```bash
npm run db:deploy
```

Notes:

- `prisma migrate deploy` does **not** need a shadow database — safe for Supabase.
- Avoid `prisma migrate dev` against Supabase (it wants a shadow DB). Use it locally,
  commit the generated migration, then `db:deploy`.
- If you prefer a shadow DB, set `SHADOW_DATABASE_URL` in `.env`.

---

## Deploy to Vercel

1. Push the repo to GitHub and import it at [vercel.com/new](https://vercel.com/new).
2. Framework preset: **Next.js**. Build command: `npm run build` (default). Leave the rest.
3. Add **Environment Variables** (Production + Preview):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Supabase transaction pooler (`:6543`, `?pgbouncer=true&connection_limit=1`) |
   | `DIRECT_URL` | Supabase session pooler (`:5432`) |
   | `AUTH_SECRET` | `openssl rand -hex 32` |
   | `QUERION_PASSWORD` | the password you will type on the login page |
   | `QUERION_SYNC_TOKEN` | `openssl rand -hex 32` — the pi extension sends this |
   | `QUERION_REDACT_SECRETS` | optional, default `true` |
   | `QUERION_HIDE_SOURCE_PATH` | optional, default `true` |

4. Deploy. Then run migrations against Supabase from your machine (nothing writes DDL on Vercel):

   ```bash
   DIRECT_URL="postgresql://…:5432/postgres" npm run db:deploy
   ```

5. Visit the deployment, sign in, and sync a session (below).

**Node version:** Vercel uses Node 20/22; both are supported (`engines: >=20`).
`prisma generate` runs during `npm run build` on Vercel where engines download normally.

---

## Syncing pi sessions

### 1. Configure the client

The pi extension and the CLI resolve configuration in this order:

1. Environment: `QUERION_URL` (non-secret) + `QUERION_SYNC_TOKEN`
2. Environment `QUERION_URL` + a token file
   (`$QUERION_TOKEN_FILE`, `~/.config/querion/token`, `~/.config/querion/token.txt`)
3. `$QUERION_CONFIG` / `~/.config/querion/config.json` / `~/.querion.json`:

   ```json
   { "url": "https://querion.vercel.app", "token": "<QUERION_SYNC_TOKEN>" }
   ```

4. `.env` / `.env.local` inside `~/Projects/querion`

### 2. Load the extension (declarative)

The extension is a single file, `pi/querion-sync.ts`. In a Nix setup it is
loaded from the repo — **do not** copy it into `~/.pi/agent/extensions`:

```nix
# modules/core.nix
programs.pi.coding-agent.extensions = [
  ../pi/extensions/querion-sync.ts
];

environment.sessionVariables = {
  QUERION_URL = "https://<your-app>.vercel.app";
  QUERION_TOKEN_FILE = "/absolute/path/to/secrets/querion-token";  # gitignored
};
```

Then `nixos-rebuild switch` and the command is available in every pi session.
Non-Nix fallbacks: `pi -e ./querion-sync.ts` (one-off) or
`.pi/extensions/querion.ts` (project-local).

### 3. Use it

Inside pi:

```
/sync                 sync the current session
/sync all             sync every session in ~/.pi/agent/sessions
/sync all <text>      sync sessions whose path contains <text>
/sync status          show resolved config + server health
```

Or bulk-sync from a terminal (cron-friendly):

```bash
npm run sync:sessions              # all sessions
npm run sync:sessions -- morphix   # filter by path
```

---

## API

All `/api/*` routes require either the auth cookie (browser) or a Bearer token (`/api/sync`).

| Method | Route | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | public | DB liveness + latency |
| `GET`/`HEAD` | `/api/ping` | public | uptime-bot keep-alive; runs a real query |
| `POST` | `/api/sync` | `Bearer QUERION_SYNC_TOKEN` | ingest a session (chunked, idempotent) |
| `GET` | `/api/sessions` | cookie | list/search (`?q=&project=&limit=&offset=`) |
| `GET` | `/api/sessions/:id` | cookie | session detail: summary + active branch + all entries |
| `DELETE` | `/api/sessions/:id` | cookie | delete a session (does not touch local `.jsonl`) |
| `POST` | `/api/auth/login` | public | `{ "password": "…" }` → sets cookie |
| `POST` | `/api/auth/logout` | cookie | clears cookie |

`POST /api/sync` body:

```jsonc
{
  "session": {
    "id": "<pi session uuid>",
    "cwd": "/home/me/project",
    "version": 3,
    "leafId": "<current leaf entry id>",
    "startedAt": "2026-09-18T06:12:15.092Z",
    "lastActivityAt": "2026-09-18T07:00:00.000Z",
    "title": "first user message (optional)",
    "model": "…", "provider": "…",
    "stats": { "messageCount": 42, "userMessages": 3, "totalTokens": 1234, "totalCost": 0.02 }
  },
  "entries": [ { "id": "…", "parentId": "…", "type": "message", "timestamp": "…", "message": { } } ],
  "done": true
}
```

Large sessions are sent in chunks (≤ ~3 MB each, ≤ 400 entries); the client sets
`done: true` on the final chunk. Re-sending any chunk is safe.

---

## Keeping Supabase awake

Free Supabase projects pause after a period of inactivity. Point an uptime
monitor (UptimeRobot, Better Stack, cron-job.org, …) at:

```
GET https://<your-app>.vercel.app/api/ping
```

`/api/ping` is public, uncached (`Cache-Control: no-store`), answers `GET` and
`HEAD`, and runs a small real query against the `Session` table (not just
`SELECT 1`) so the database registers genuine activity. `200` = up, `503` = down.

A monitor every 5–10 minutes is plenty.

---

## Security

- **Single password.** `QUERION_PASSWORD` is compared in constant time; login is
  rate-limited (10/min/IP). The session cookie is `HttpOnly`, `SameSite=Lax`,
  `Secure` in production, signed with HMAC-SHA256 (`AUTH_SECRET`), 30-day expiry.
- **Machine auth.** `/api/sync` requires `Authorization: Bearer <QUERION_SYNC_TOKEN>`.
- **No indexing.** `robots.txt` disallows everything and pages send `noindex`.
- **Sanitisation.** All strings are stripped of NUL/lone surrogates before storage
  (Postgres `jsonb` cannot hold them).
- **Redaction (default on).** PEM private keys, `sk-…`, `sk-ant-…`, `ghp_…`,
  `AKIA…`, `AIza…`, `xox…`, JWTs, and quoted `password=/secret=/api_key=` values are
  replaced with `[REDACTED]` — including in titles. Disable with
  `QUERION_REDACT_SECRETS=false`.
- **Never commit** `.env`, `secrets/`, or pi's `auth.json`. `.gitignore` blocks them.

Residual risk: transcripts are stored verbatim apart from the above. If a session
contains credentials you did not notice, treat the database as sensitive and rotate
them. Redaction is a safety net, not a guarantee.

---

## Project structure

```
prisma/
  schema.prisma              # Session + Entry models
  migrations/                # committed SQL migrations
prisma.config.ts             # Prisma 7 config (datasource URL from DIRECT_URL)
scripts/
  prisma.mjs                 # Prisma CLI wrapper (NixOS engine shim)
  sync-sessions.mjs          # CLI bulk sync
pi/
  querion-sync.ts            # pi extension: /sync
src/
  app/
    (app)/sessions/…         # list + reader (auth-protected shell)
    login/                   # password login
    api/…                    # sync, sessions, auth, health
    globals.css              # Catppuccin Mocha theme + prose + hljs
  components/                # Transcript, ToolCallCard, Markdown, …
  lib/                       # prisma, auth, sessions, sync, redact, format
  middleware.ts              # cookie gate for pages + APIs
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | generate Prisma client + production build |
| `npm run start` | serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | `prisma generate` |
| `npm run db:migrate -- --name <name>` | create + apply a migration (local) |
| `npm run db:deploy` | apply committed migrations (Supabase/prod) |
| `npm run db:status` | migration status |
| `npm run db:studio` | Prisma Studio |
| `npm run sync:sessions` | bulk-sync pi sessions over HTTP |

---

## License

MIT
