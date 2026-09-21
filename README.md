# handson.tools gateway

Vanity host for Hands-on apps. Traefik terminates TLS; this process routes.

## How it routes

| Request | Result |
|---|---|
| `handson.tools/norderstedt` | Proxy to FLOW (address bar stays) |
| `handson.tools/2025/aachen` | Same, past season |
| `flow.handson.tools/…` | Proxy to FLOW (planner, API, everything) |
| `rg.handson.tools/…` | Proxy to the timer (or whatever the admin set) |
| `handson.tools/rg` | 301 → `rg.handson.tools` (old path shorts) |
| `handson.tools/plan/…` | 302 → `flow.handson.tools/plan/…` |
| `handson.tools/admin` | This app’s admin UI |

Unknown apex paths are the one-link: they are proxied to the configured FLOW origin, including `/api` and `/assets` so the public event page can load.

`/flow/*.png` is proxied to FLOW (logos). Bare `/flow` redirects to `flow.handson.tools`.

## DNS

Not one record per app. Publicly:

- `handson.tools` A/AAAA → Traefik box
- `*.handson.tools` A/AAAA → same

Wildcard TLS (`handson.tools` + `*.handson.tools`) needs a Let’s Encrypt **DNS** challenge. `*.handson.tools` does not cover `dev.flow.handson.tools`.

## Admin

`https://handson.tools/admin` (Keycloak).

Each short is:

- **Slug** → `{slug}.handson.tools`
- **Target** → origin to proxy or redirect to
- **Proxy** — subdomain stays in the address bar
- **Redirect** — browser is sent to the target host

The apex FLOW target is a separate field (one-link catch-all). Event slugs are not entered here; FLOW owns them.

## Deploy behind existing Traefik

1. Point the two DNS records at the Traefik host.
2. Join this compose file to Traefik’s docker network (`TRAEFIK_NETWORK`, default `traefik`).
3. Copy `env.example` → `.env`, set Keycloak + `SESSION_SECRET`.
4. Wildcard cert resolver on Traefik must use DNS-01.
5. `docker compose up -d --build`
6. Add `https://flow.handson.tools/*` (and `https://dev.handson.tools/*` / `https://test.handson.tools/*` if used) to the Keycloak client `flow` redirect URIs.

`data/shorts.json` is bind-mounted and edited by the admin UI.

## FLOW env

Production one-link stays `PUBLIC_URL=https://handson.tools`.

Dev / Test instances should publish their own subdomain, not a path on the apex:

- Dev → `PUBLIC_URL=https://dev.handson.tools`
- Test → `PUBLIC_URL=https://test.handson.tools`

Old links `handson.tools/dev/aachen` 301 to `dev.handson.tools/aachen`.

## Local

```bash
npm install
npm test
COOKIE_SECURE=false NODE_ENV=development BASE_DOMAIN=handson.tools npm start
```

Subdomains need `/etc/hosts` (or similar) for `flow.handson.tools`, `rg.handson.tools`, … pointing at localhost, plus a reverse proxy that forwards the `Host` header.

Until Traefik owns the domain, the existing Apache vhost can keep proxying everything to Node — add `ServerAlias *.handson.tools` so app hosts hit the same process.
