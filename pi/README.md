# Querion pi extension — `/sync`

`querion-sync.ts` is a standalone pi extension that uploads pi sessions to a
Querion server. It has no runtime dependencies (Node built-ins only), so it can
be loaded from anywhere.

## Load it (declarative)

This repository is the upstream copy; the machine loads it from
`~/niri-desktop/pi/extensions/querion-sync.ts` via the flake:

```nix
# ~/niri-desktop/modules/core.nix
programs.pi.coding-agent.extensions = [
  ../pi/extensions/querion-sync.ts
];
```

`nixos-rebuild switch` and it is available in every pi session. Do **not** copy
it into `~/.pi/agent/extensions` — the repo is the source of truth.

Non-Nix fallbacks:

```bash
pi -e ./querion-sync.ts          # one-off
cp querion-sync.ts .pi/extensions/querion.ts   # project-local
```

## Configure

Resolution order (first match wins):

1. Environment `QUERION_URL` (non-secret) + `QUERION_SYNC_TOKEN`
2. Environment `QUERION_URL` + a token file:
   `$QUERION_TOKEN_FILE` → `~/.config/querion/token` → `~/.config/querion/token.txt`
4. `$QUERION_CONFIG` / `~/.config/querion/config.json` / `~/.querion.json`:

   ```json
   { "url": "https://querion.vercel.app", "token": "<QUERION_SYNC_TOKEN>" }
   ```

   `tokenFile` may be used instead of `token`:
   `{ "url": "…", "tokenFile": "/absolute/path/to/querion-token" }`

5. `.env` / `.env.local` in `~/Projects/querion`

URLs/tokens containing `CHANGE-ME`/`<…>` placeholders are ignored, so an
unconfigured placeholder URL cleanly falls through to the next source.

The declarative setup writes a **non-secret config file** with home-manager and
keeps the token in a gitignored file:

```nix
# modules/core.nix (inside home-manager.users.<you>)
xdg.configFile."querion/config.json".text = builtins.toJSON {
  url = "https://<your-app>.vercel.app";
  tokenFile = "/home/<you>/niri-desktop/secrets/querion-token";
};
```

```bash
echo -n "<QUERION_SYNC_TOKEN>" > ~/niri-desktop/secrets/querion-token
chmod 600 ~/niri-desktop/secrets/querion-token
```

Prefer this over `environment.sessionVariables`: session env vars only apply to
new login sessions and are easy to miss for a GUI-started shell, whereas the
config file is read directly and takes effect immediately after
`nixos-rebuild switch`.

## Commands

| Command | Action |
|---|---|
| `/sync` | sync the current session |
| `/sync <id\|path>` | sync one session by id, `.jsonl` path, or path substring |
| `/sync all` | sync every session under `~/.pi/agent/sessions` (or `$PI_SESSION_DIR`) |
| `/sync all <text>` | only sessions whose path contains `<text>` |
| `/sync status` | print resolved config and server health |

Syncs are **incremental**. Before uploading, the extension asks the server for
the last entry it holds and sends only what follows — and it caches the last
uploaded content hash in `~/.cache/querion/`, so an unchanged session skips the
network entirely. Re-running `/sync all` on an unchanged archive uploads zero
entries.

Secrets are sanitised and redacted before upload; the server reports how many
values it redacted.
