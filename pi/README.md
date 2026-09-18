# Querion pi extension — `/sync`

`querion-sync.ts` is a standalone pi extension that uploads pi sessions to a
Querion server. It has no runtime dependencies (Node built-ins only), so it can
be copied anywhere.

## Install

```bash
# global: available in every pi session
mkdir -p ~/.pi/agent/extensions
cp querion-sync.ts ~/.pi/agent/extensions/querion.ts

# project-local: only in a trusted project
mkdir -p .pi/extensions
cp querion-sync.ts .pi/extensions/querion.ts

# one-off
pi -e ./querion-sync.ts
```

For a declarative Nix setup, point your pi module's `extensions` list at the
copied file and rebuild. `/reload` picks up edits in the global directory.

## Configure

Resolution order (first match wins):

1. Environment variables `QUERION_URL` and `QUERION_SYNC_TOKEN`
2. `$QUERION_CONFIG`, `~/.config/querion/config.json`, or `~/.querion.json`:

   ```json
   { "url": "https://querion.vercel.app", "token": "<QUERION_SYNC_TOKEN>" }
   ```

3. `.env` / `.env.local` in `~/Projects/querion`, then `.env` in the current directory

## Commands

| Command | Action |
|---|---|
| `/sync` | sync the current session |
| `/sync all` | sync every session under `~/.pi/agent/sessions` (or `$PI_SESSION_DIR`) |
| `/sync all <text>` | only sessions whose path contains `<text>` |
| `/sync status` | print resolved config and server health |

Secrets are sanitised and redacted before upload; the server reports how many
values it redacted.
