# Admin panel

`https://handson.tools/admin` — Keycloak SSO.

## Keycloak client

1. Client ID e.g. `handson-tools`, confidential
2. Valid redirect URIs: `https://handson.tools/auth/keycloak/callback`
3. Web origins: `https://handson.tools`

## `.env`

See `env.example`. Required: `KEYCLOAK_ISSUER`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `SESSION_SECRET`.

Optional `ALLOWED_EMAILS` (addresses or domains). Empty = any logged-in user.

## What you can edit

- **Apex / One-Link** — FLOW origin for `handson.tools/<event>`
- **Apps** — slug, target, proxy vs redirect

Event slugs are not managed here.
