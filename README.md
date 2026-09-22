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
4. `docker compose down --remove-orphans && docker compose up -d --build` — the old `flow-hop` container (socat, wired to one destination) has to release host port 4180 before `egress-hop` can bind it.
5. Check `https://handson.tools/admin/api/egress`, then open one app subdomain.
6. Optional: Keycloak client `flow` → `https://flow.handson.tools/*`

`data/shorts.json` is bind-mounted and edited by the admin UI.

## Egress — how the gateway reaches an app

Two routes, tried in parallel for every HTTPS upstream:

1. **direct** from the container (IPv4 or IPv6, Happy Eyeballs)
2. **hop** — `egress-hop`, a TLS relay on the host network (`src/egressHop.js`). It has no destination of its own: it reads the SNI from the ClientHello and dials that host, so it works for every app, not just FLOW. The host’s routing table includes IPv6, which the container’s bridge does not.

The direct attempt starts first, the hop follows 250 ms later, and the **first finished TLS handshake** wins — the handshake, not the TCP connect, because the hop accepts every connection before it knows where it goes. A dead hop, a black-holed IPv6 route or a container without egress therefore costs a few hundred milliseconds instead of taking every app down. Nothing in the code knows any hostname; whatever the admin UI stores is what gets dialled.

`EGRESS_HOP_HOST` empty → direct only. Do not open 4180 on the Hetzner firewall: the hop relays to any TLS host, it only refuses its own names (loop protection).

`GET /admin/api/egress` (Keycloak login) checks both routes against every configured target and reports them separately:

```json
{ "target": "https://timer.hands-on-technology.org",
  "direct": { "ok": true, "ms": 42 }, "hop": { "ok": true, "ms": 48 } }
```

Upstream redirects and cookies are rewritten onto the vanity host, so `rg.handson.tools` stays in the address bar and sessions keep working. An upstream that cannot be reached answers 502 (504 on timeout) with a German error page instead of hanging.

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

With `NODE_ENV=development`, `http://localhost:3000` is treated as the apex so the Glass UI can be previewed without a `Host` header. Any app subdomain can be tried with a `Host` header instead of `/etc/hosts`:

```bash
curl -H 'Host: rg.handson.tools' http://127.0.0.1:3000/
```

To exercise the hop locally, run `HOP_LISTEN_HOST=127.0.0.1 npm run hop` next to it and start the gateway with `EGRESS_HOP_HOST=127.0.0.1`.
