# Admin Panel Setup Guide

The admin panel allows you to manage URL redirects through a web interface, protected by Keycloak SSO.

## Step 1: Configure Keycloak Client

1. Log into your Keycloak admin console
2. Select your realm
3. Go to **Clients** → **Create client**
4. Set **Client ID**: e.g., `handson-tools`
5. Set **Client authentication**: `On` (confidential client)
6. Set **Valid redirect URIs**: `https://handson.tools/auth/keycloak/callback`
7. Set **Web origins**: `https://handson.tools`
8. Save and copy the **Client Secret**

## Step 2: Create .env File

1. Copy `env.example` to `.env`:
   ```bash
   cp env.example .env
   ```

2. Edit `.env` and fill in your Keycloak credentials:
   ```env
   KEYCLOAK_ISSUER=https://your-keycloak-server.com/realms/your-realm
   KEYCLOAK_CLIENT_ID=handson-tools
   KEYCLOAK_CLIENT_SECRET=your-client-secret-here
   KEYCLOAK_CALLBACK_URL=https://handson.tools/auth/keycloak/callback
   SESSION_SECRET=generate-a-random-secret-string
   ALLOWED_EMAILS=
   ```

3. Generate a secure SESSION_SECRET:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

## Step 3: Install Dependencies

```bash
npm install
```

## Step 4: Restart PM2

```bash
npm run pm2:restart
```

## Step 5: Access Admin Panel

1. Visit `https://handson.tools/admin`
2. You'll be redirected to Keycloak for authentication
3. After logging in, you'll be redirected back to the admin panel

## Features

- **Add URLs**: Create new slug → target URL mappings
- **Delete URLs**: Remove existing mappings
- **View all URLs**: See all current redirects
- **Secure**: Protected by Keycloak SSO

## Access Control

You can restrict access by setting `ALLOWED_EMAILS` in `.env`:

- **Specific emails**: `user1@example.com,user2@example.com`
- **Email domains**: `example.com` (allows all @example.com emails)
- **Mixed**: `user@example.com,another-domain.org`

Leave empty to allow any authenticated Keycloak user.

## Troubleshooting

**"Access denied" error:**
- Check that your email/domain is in `ALLOWED_EMAILS` in `.env`
- Or remove `ALLOWED_EMAILS` to allow all authenticated users

**OAuth not working:**
- Verify `KEYCLOAK_ISSUER`, `KEYCLOAK_CLIENT_ID`, and `KEYCLOAK_CLIENT_SECRET` are set correctly in `.env`
- Check that the callback URL matches exactly: `https://handson.tools/auth/keycloak/callback`
- Ensure the client in Keycloak has the correct redirect URI configured
- Check PM2 logs: `npm run pm2:logs`

**Session issues:**
- Make sure `SESSION_SECRET` is set to a secure random string in `.env`
- Check that cookies are working (HTTPS required for secure cookies)
