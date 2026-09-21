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

## DNS vs TLS

Public DNS:

- `handson.tools` A/AAAA → Traefik box
- `*.handson.tools` A/AAAA → same

TLS is one Let’s Encrypt cert covering `handson.tools` **and** `*.handson.tools` (resolver `le-dns`, DNS-01). New app hosts from the admin UI then get HTTPS without Compose changes. Nested names like `dev.flow.handson.tools` are not in that wildcard.

Do **not** replace Traefik’s existing resolver `le` (HTTP-01, OpenProject). Add `le-dns` next to it — see `deploy/traefik-le-dns.txt`. The DNS API token must be allowed to write TXT `_acme-challenge.handson.tools`.

## Admin

`https://handson.tools/admin` (Keycloak, client role `handson-tools-admin`).

Each short is:

- **Slug** → `{slug}.handson.tools`
- **Bezeichnung / Untertitel** — title and subtitle on the public start page
- **Target** → origin to proxy or redirect to
- **Proxy** — subdomain stays in the address bar
- **Redirect** — browser is sent to the target host
- **Übersicht** — whether the slug appears on the public start page (`dev` / `test` / `test-flow` default off; the host still routes)

The apex FLOW target is a separate field (one-link catch-all). Event slugs are not entered here; FLOW owns them.

## Deploy behind existing Traefik

Same Docker host, network `proxy`, entrypoint `websecure`, resolver **`le-dns`**.

1. Add `le-dns` to the Traefik compose (`deploy/traefik-le-dns.txt`), restart Traefik.
2. Point the two DNS records at the Traefik host.
3. Copy `env.example` → `.env`, set Keycloak + `SESSION_SECRET` (from the current handson.tools server).
4. `docker compose up -d --build`
5. Optional: Keycloak client `flow` → `https://flow.handson.tools/*`

`data/shorts.json` is bind-mounted and edited by the admin UI.

The `flow-hop` sidecar listens on host `:4180` and forwards TLS by SNI (IPv6 or IPv4). Docker’s bridge has no working IPv6, so every HTTPS proxy target goes through that hop — not only FLOW.

## FLOW env

Production one-link stays `PUBLIC_URL=https://handson.tools`.

Dev / Test instances should publish their own subdomain, not a path on the apex:

- Dev → `PUBLIC_URL=https://dev.handson.tools`
- Test → `PUBLIC_URL=https://test.handson.tools`

Old links `handson.tools/dev/aachen` 301 to `dev.handson.tools/aachen`.

The public index and `/admin` use `@hands-on/glass` from GitHub (`hands-on-leipzig/glass#main`; the lockfile pins the commit). Docker `npm ci` fetches it during the image build.

## Local

```bash
npm install
npm test
COOKIE_SECURE=false NODE_ENV=development BASE_DOMAIN=handson.tools npm start
```

With `NODE_ENV=development`, `http://localhost:3000` is treated as the apex so the Glass UI can be previewed without a `Host` header.

Subdomains need `/etc/hosts` (or similar) for `flow.handson.tools`, `rg.handson.tools`, … pointing at localhost, plus a reverse proxy that forwards the `Host` header.

Until Traefik owns the domain, the existing Apache vhost can keep proxying everything to Node — add `ServerAlias *.handson.tools` so app hosts hit the same process.
