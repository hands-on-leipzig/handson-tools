# Domain Shortener

A simple domain shortener service that redirects short URLs to full domain targets.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server (choose one method):

**Option A: Run in background with PM2 (Recommended for production):**
```bash
npm install
npm run pm2:start
```

**Option B: Run directly (for development):**
```bash
npm start
```

The server will run on port 3000 by default (or the port specified in the `PORT` environment variable).

## Usage

### Adding URL Mappings

Edit the `urls.json` file to add your slug-to-URL mappings:

```json
{
  "slug": "full.domain.target",
  "example": "example.com",
  "github": "github.com"
}
```

You can use either:
- Full URLs: `"https://example.com"`
- Domain names: `"example.com"` (will automatically add `https://`)

### Accessing Short URLs

Once the server is running, access your short URLs like:
- `http://localhost:3000/slug` → redirects to `full.domain.target`
- `http://localhost:3000/example` → redirects to `example.com`

### Apache Configuration

If you're using Apache and getting "file not found" errors, you need to configure Apache to proxy requests to the Node.js server:

1. **Enable required Apache modules:**
   ```bash
   sudo a2enmod rewrite
   sudo a2enmod proxy
   sudo a2enmod proxy_http
   sudo systemctl restart apache2
   ```

2. **The `.htaccess` file is already included** - it will proxy all requests to your Node.js server running on port 3000.

3. **If your Node.js server runs on a different port**, edit `.htaccess` and change `localhost:3000` to your port.

4. **Make sure your Apache virtual host allows `.htaccess` overrides:**
   ```apache
   <Directory /path/to/your/project>
       AllowOverride All
   </Directory>
   ```

### Running in Background with PM2

PM2 keeps your server running in the background and automatically restarts it if it crashes:

1. **Start the server:**
   ```bash
   npm run pm2:start
   ```

2. **Check status:**
   ```bash
   npm run pm2:status
   ```

3. **View logs:**
   ```bash
   npm run pm2:logs
   ```

4. **Restart the server:**
   ```bash
   npm run pm2:restart
   ```

5. **Stop the server:**
   ```bash
   npm run pm2:stop
   ```

6. **Make PM2 start on system boot:**

   **Option A: With sudo rights (Linux):**
   ```bash
   pm2 startup
   pm2 save
   ```

   **Option B: Without sudo rights (using cron):**
   ```bash
   # Edit your crontab
   crontab -e
   
   # Add this line (adjust the path to your project):
   @reboot /path/to/handson-tools/start-pm2.sh >> /path/to/handson-tools/logs/cron.log 2>&1
   ```

PM2 will automatically restart your server if it crashes, and you can configure it to start on system boot.

### Production Deployment

For production with your domain `short.ly`:

1. Set up your domain to point to your server
2. Install dependencies and start with PM2:
   ```bash
   npm install
   npm run pm2:start
   pm2 startup  # Make it start on boot
   pm2 save
   ```
3. Configure Apache as described above
4. The service will automatically handle requests to `short.ly/slug` and redirect accordingly

## File Structure

- `server.js` - Main server application
- `urls.json` - Storage file for slug-to-URL mappings
- `package.json` - Node.js dependencies
- `ecosystem.config.js` - PM2 configuration file
- `.htaccess` - Apache configuration to proxy requests to Node.js server

