# Admin panel

`https://handson.tools/admin` — Keycloak SSO.

## Keycloak client

1. Client ID e.g. `handson-tools`, confidential
2. Valid redirect URIs: `https://handson.tools/auth/keycloak/callback`
3. Web origins: `https://handson.tools`
4. Client role **`handson-tools-admin`** — only users with this role on that client may open `/admin`

The role must be in the access token (`resource_access.<client-id>.roles`). Keycloak’s default “Client roles” mapper does that; turn on “Add to ID token” if you also want it there.

## `.env`

See `env.example`. Required: `KEYCLOAK_ISSUER`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `SESSION_SECRET`.

Optional `KEYCLOAK_ADMIN_ROLE` (default `handson-tools-admin`).

## What you can edit

- **Apex / One-Link** — FLOW origin for `handson.tools/<event>`
- **Apps** — slug, target, proxy vs redirect

Event slugs are not managed here.
