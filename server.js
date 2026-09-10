// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const OpenIDConnectStrategy = require('passport-openidconnect').Strategy;
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const URLS_FILE = path.join(__dirname, 'urls.json');

// Every slug that is not in urls.json is an event slug and belongs to FLOW.
const FLOW_BASE_URL = (process.env.FLOW_BASE_URL || 'https://flow.hands-on-technology.org').replace(/\/$/, '');

// Only these files are public; everything else in the project directory (urls.json,
// server.js, .env, logs) must never be served.
const STATIC_FILES = ['favicon.ico', 'hot.png'];

// Redirect to a target, keeping the query string of the incoming request. FLOW reads
// ?source=qr to tell scanned QR codes from ordinary visits, so dropping it here would
// silently falsify that statistic.
function redirectTo(req, res, target, permanent) {
  const query = req.originalUrl.indexOf('?');
  const incoming = query === -1 ? '' : req.originalUrl.slice(query + 1);
  const separator = target.includes('?') ? '&' : '?';
  const url = incoming === '' ? target : `${target}${separator}${incoming}`;

  res.redirect(permanent ? 301 : 302, url);
}

// Absolute target for a urls.json entry, which may be stored without a protocol.
function withProtocol(target) {
  return /^https?:\/\//i.test(target) ? target : `https://${target}`;
}

// Environment variables for Keycloak OAuth
const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER; // e.g., https://keycloak.example.com/realms/your-realm
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID;
const KEYCLOAK_CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET;
const KEYCLOAK_CALLBACK_URL = process.env.KEYCLOAK_CALLBACK_URL || `https://handson.tools/auth/keycloak/callback`;
// Allowed email domains (comma-separated) - set to restrict access
const ALLOWED_EMAILS = process.env.ALLOWED_EMAILS ? process.env.ALLOWED_EMAILS.split(',') : null;

// Configure session
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true } // Set to true if using HTTPS
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Body parser for JSON
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// No HTTPS enforcement needed - Apache handles HTTPS termination

// Serve static files (logo, favicon) — named explicitly instead of the whole directory
STATIC_FILES.forEach((file) => {
  app.get(`/${file}`, (req, res) => {
    res.sendFile(path.join(__dirname, file));
  });
});

// Ensure urls.json exists
if (!fs.existsSync(URLS_FILE)) {
  fs.writeFileSync(URLS_FILE, JSON.stringify({}, null, 2));
}

// Read URLs from file
function getUrls() {
  try {
    const data = fs.readFileSync(URLS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading urls.json:', error);
    return {};
  }
}

// Write URLs to file
function saveUrls(urls) {
  try {
    fs.writeFileSync(URLS_FILE, JSON.stringify(urls, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing urls.json:', error);
    return false;
  }
}

// ===== AUTHENTICATION SETUP =====

// Passport serialization
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// Keycloak OAuth Strategy
if (KEYCLOAK_ISSUER && KEYCLOAK_CLIENT_ID && KEYCLOAK_CLIENT_SECRET) {
  passport.use(new OpenIDConnectStrategy({
    issuer: KEYCLOAK_ISSUER,
    authorizationURL: `${KEYCLOAK_ISSUER}/protocol/openid-connect/auth`,
    tokenURL: `${KEYCLOAK_ISSUER}/protocol/openid-connect/token`,
    userInfoURL: `${KEYCLOAK_ISSUER}/protocol/openid-connect/userinfo`,
    clientID: KEYCLOAK_CLIENT_ID,
    clientSecret: KEYCLOAK_CLIENT_SECRET,
    callbackURL: KEYCLOAK_CALLBACK_URL,
    scope: ['openid', 'profile', 'email']
  }, (issuer, sub, profile, accessToken, refreshToken, done) => {
    // Check if email is allowed
    const email = profile.email || (profile.emails && profile.emails[0] ? profile.emails[0].value : null);
    
    if (ALLOWED_EMAILS && email) {
      const emailDomain = email.split('@')[1];
      const isAllowed = ALLOWED_EMAILS.some(allowed => 
        allowed.includes('@') ? allowed === email : allowed === emailDomain
      );
      
      if (!isAllowed) {
        return done(null, false, { message: 'Access denied. Your email is not authorized.' });
      }
    }
    
    return done(null, {
      id: sub,
      email: email,
      name: profile.name || profile.displayName || profile.preferred_username,
      photo: profile.picture || null
    });
  }));
} else {
  console.warn('⚠️  Keycloak OAuth not configured. Set KEYCLOAK_ISSUER, KEYCLOAK_CLIENT_ID, and KEYCLOAK_CLIENT_SECRET in .env file.');
}

// Authentication middleware
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/auth/keycloak');
}

// ===== AUTHENTICATION ROUTES =====

// Keycloak OAuth login
app.get('/auth/keycloak',
  passport.authenticate('openidconnect')
);

// Keycloak OAuth callback
app.get('/auth/keycloak/callback',
  passport.authenticate('openidconnect', { failureRedirect: '/admin?error=auth_failed' }),
  (req, res) => {
    res.redirect('/admin');
  }
);

// Logout
app.get('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.redirect('/admin?error=logout_failed');
    }
    res.redirect('/');
  });
});

// Generate index page HTML
function generateIndexPage(notFoundSlug = null) {
  const urls = getUrls();
  const urlEntries = Object.entries(urls);
  
  const notFoundMessage = notFoundSlug ? `
      <div style="background: #fee; border-left: 4px solid #f00; border-radius: 8px; padding: 15px; margin-bottom: 20px; color: #c00;">
        <strong>⚠️ Slug not found:</strong> "${notFoundSlug}" - Here are all available links:
      </div>
    ` : '';
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Domain Shortener - short.ly</title>
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="shortcut icon" type="image/x-icon" href="/favicon.ico">
  <link rel="apple-touch-icon" href="/hot.png">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #F78B1F 0%, #ff9f40 100%);
      min-height: 100vh;
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    
    .container {
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 800px;
      width: 100%;
      padding: 40px;
      margin: 20px;
    }
    
    .header {
      text-align: center;
      margin-bottom: 40px;
    }
    
    .logo {
      max-width: 120px;
      height: auto;
      margin-bottom: 20px;
      display: block;
      margin-left: auto;
      margin-right: auto;
    }
    
    h1 {
      color: #F78B1F;
      font-size: 2.5rem;
      margin-bottom: 10px;
      font-weight: 700;
    }
    
    .subtitle {
      color: #666;
      font-size: 1.1rem;
      margin-bottom: 30px;
    }
    
    .url-list {
      list-style: none;
      margin-top: 30px;
    }
    
    .url-item {
      background: #f8f9fa;
      border-left: 4px solid #F78B1F;
      border-radius: 8px;
      margin-bottom: 15px;
      padding: 20px;
      transition: all 0.3s ease;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .url-item:hover {
      transform: translateX(5px);
      box-shadow: 0 4px 12px rgba(247, 139, 31, 0.2);
      background: #fff5eb;
    }
    
    .url-slug {
      font-size: 1.3rem;
      font-weight: 600;
      color: #F78B1F;
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .url-slug:hover {
      color: #d97706;
    }
    
    .url-slug::before {
      content: "🔗";
      font-size: 1.2rem;
    }
    
    .url-target {
      color: #666;
      font-size: 0.95rem;
      word-break: break-all;
      padding-left: 28px;
    }
    
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #999;
    }
    
    .empty-state-icon {
      font-size: 4rem;
      margin-bottom: 20px;
    }
    
    .stats {
      display: flex;
      justify-content: center;
      gap: 30px;
      margin-top: 30px;
      padding-top: 30px;
      border-top: 2px solid #f0f0f0;
      flex-wrap: wrap;
    }
    
    .stat-item {
      text-align: center;
    }
    
    .stat-number {
      font-size: 2rem;
      font-weight: 700;
      color: #F78B1F;
    }
    
    .stat-label {
      color: #666;
      font-size: 0.9rem;
      margin-top: 5px;
    }
    
    @media (max-width: 768px) {
      .container {
        padding: 30px 20px;
        margin: 10px;
      }
      
      h1 {
        font-size: 2rem;
      }
      
      .url-item {
        padding: 15px;
      }
      
      .url-slug {
        font-size: 1.1rem;
      }
      
      .stats {
        gap: 20px;
      }
      
      .stat-number {
        font-size: 1.5rem;
      }
    }
    
    @media (max-width: 480px) {
      h1 {
        font-size: 1.5rem;
      }
      
      .subtitle {
        font-size: 0.95rem;
      }
      
      .logo {
        max-width: 80px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="/hot.png" alt="HandsOn Logo" class="logo" />
      <h1>handson.tools</h1>
      <p class="subtitle">Quick access to your favorite links</p>
    </div>
    
    ${notFoundMessage}
    
    ${urlEntries.length > 0 ? `
      <ul class="url-list">
        ${urlEntries.map(([slug, target]) => {
          const fullUrl = target.startsWith('http://') || target.startsWith('https://') 
            ? target 
            : `https://${target}`;
          return `
          <li class="url-item">
            <a href="/${slug}" class="url-slug">/${slug}</a>
            <div class="url-target">→ ${target}</div>
          </li>
        `;
        }).join('')}
      </ul>
      
      <div class="stats">
        <div class="stat-item">
          <div class="stat-number">${urlEntries.length}</div>
          <div class="stat-label">Active Links</div>
        </div>
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <h2>No links yet</h2>
        <p>Add your first link to urls.json to get started!</p>
      </div>
    `}
  </div>
</body>
</html>
  `;
  
  return html;
}

// ===== ADMIN ROUTES =====

// Admin page (protected)
app.get('/admin', ensureAuthenticated, (req, res) => {
  const urls = getUrls();
  const urlEntries = Object.entries(urls);
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin - Domain Shortener</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #F78B1F 0%, #ff9f40 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 1000px;
      margin: 0 auto;
      padding: 40px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #f0f0f0;
    }
    h1 { color: #F78B1F; font-size: 2rem; }
    .user-info {
      display: flex;
      align-items: center;
      gap: 15px;
    }
    .user-photo {
      width: 40px;
      height: 40px;
      border-radius: 50%;
    }
    .btn {
      padding: 10px 20px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 1rem;
      text-decoration: none;
      display: inline-block;
    }
    .btn-primary { background: #F78B1F; color: white; }
    .btn-primary:hover { background: #d97706; }
    .btn-danger { background: #dc3545; color: white; }
    .btn-danger:hover { background: #c82333; }
    .url-form {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .form-group {
      margin-bottom: 15px;
    }
    label {
      display: block;
      margin-bottom: 5px;
      font-weight: 600;
      color: #333;
    }
    input {
      width: 100%;
      padding: 10px;
      border: 2px solid #ddd;
      border-radius: 8px;
      font-size: 1rem;
    }
    input:focus {
      outline: none;
      border-color: #F78B1F;
    }
    .url-list {
      list-style: none;
    }
    .url-item {
      background: #f8f9fa;
      border-left: 4px solid #F78B1F;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .url-details {
      flex: 1;
    }
    .url-slug {
      font-weight: 600;
      color: #F78B1F;
      font-size: 1.1rem;
    }
    .url-target {
      color: #666;
      font-size: 0.9rem;
      margin-top: 5px;
    }
    .url-actions {
      display: flex;
      gap: 10px;
    }
    .btn-small {
      padding: 5px 10px;
      font-size: 0.9rem;
    }
    .message {
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .message-success {
      background: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }
    .message-error {
      background: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Admin Panel</h1>
      <div class="user-info">
        ${req.user.photo ? `<img src="${req.user.photo}" alt="User" class="user-photo">` : ''}
        <div>
          <div><strong>${req.user.name || req.user.email}</strong></div>
          <a href="/auth/logout" class="btn btn-danger btn-small">Logout</a>
        </div>
      </div>
    </div>
    
    <div class="url-form">
      <h2 style="margin-bottom: 20px; color: #333;">Add New URL</h2>
      <form id="addUrlForm">
        <div class="form-group">
          <label for="slug">Slug:</label>
          <input type="text" id="slug" name="slug" placeholder="e.g., flow" required>
        </div>
        <div class="form-group">
          <label for="target">Target URL:</label>
          <input type="text" id="target" name="target" placeholder="e.g., flow.hands-on-technology.org" required>
        </div>
        <button type="submit" class="btn btn-primary">Add URL</button>
      </form>
    </div>
    
    <div id="message"></div>
    
    <h2 style="margin-bottom: 20px; color: #333;">Existing URLs</h2>
    <ul class="url-list" id="urlList">
      ${urlEntries.map(([slug, target]) => `
        <li class="url-item">
          <div class="url-details">
            <div class="url-slug">/${slug}</div>
            <div class="url-target">→ ${target}</div>
          </div>
          <div class="url-actions">
            <button onclick="deleteUrl('${slug}')" class="btn btn-danger btn-small">Delete</button>
          </div>
        </li>
      `).join('')}
    </ul>
  </div>
  
  <script>
    document.getElementById('addUrlForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const slug = document.getElementById('slug').value.trim();
      const target = document.getElementById('target').value.trim();
      
      if (!slug || !target) {
        showMessage('Please fill in all fields', 'error');
        return;
      }
      
      try {
        const response = await fetch('/admin/api/urls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, target })
        });
        
        const data = await response.json();
        
        if (response.ok) {
          showMessage(data.message || 'URL added successfully!', 'success');
          document.getElementById('addUrlForm').reset();
          setTimeout(() => location.reload(), 1000);
        } else {
          showMessage(data.error || 'Error adding URL', 'error');
        }
      } catch (error) {
        showMessage('Error: ' + error.message, 'error');
      }
    });
    
    async function deleteUrl(slug) {
      if (!confirm('Are you sure you want to delete /' + slug + '?')) {
        return;
      }
      
      try {
        const response = await fetch('/admin/api/urls/' + encodeURIComponent(slug), {
          method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (response.ok) {
          showMessage(data.message || 'URL deleted successfully!', 'success');
          setTimeout(() => location.reload(), 1000);
        } else {
          showMessage(data.error || 'Error deleting URL', 'error');
        }
      } catch (error) {
        showMessage('Error: ' + error.message, 'error');
      }
    }
    
    function showMessage(text, type) {
      const messageDiv = document.getElementById('message');
      messageDiv.className = 'message message-' + type;
      messageDiv.textContent = text;
      messageDiv.style.display = 'block';
      setTimeout(() => {
        messageDiv.style.display = 'none';
      }, 5000);
    }
  </script>
</body>
</html>
  `;
  
  res.send(html);
});

// API: Get all URLs
app.get('/admin/api/urls', ensureAuthenticated, (req, res) => {
  res.json(getUrls());
});

// API: Add/Update URL
app.post('/admin/api/urls', ensureAuthenticated, (req, res) => {
  const { slug, target } = req.body;
  
  if (!slug || !target) {
    return res.status(400).json({ error: 'Slug and target are required' });
  }
  
  const urls = getUrls();
  urls[slug] = target;
  
  if (saveUrls(urls)) {
    res.json({ message: 'URL added successfully', urls });
  } else {
    res.status(500).json({ error: 'Failed to save URL' });
  }
});

// API: Delete URL
app.delete('/admin/api/urls/:slug', ensureAuthenticated, (req, res) => {
  const { slug } = req.params;
  const urls = getUrls();
  
  if (!urls[slug]) {
    return res.status(404).json({ error: 'URL not found' });
  }
  
  delete urls[slug];
  
  if (saveUrls(urls)) {
    res.json({ message: 'URL deleted successfully', urls });
  } else {
    res.status(500).json({ error: 'Failed to delete URL' });
  }
});

// Index page with list of all URLs (must be before /:slug route)
app.get('/', (req, res) => {
  res.send(generateIndexPage());
});

// Special case: /s/:id routes to FLOW's carousel
app.get('/s/:id', (req, res) => {
  const { id } = req.params;
  redirectTo(req, res, `${FLOW_BASE_URL}/carousel/${id}`, true);
});

// Redirect handler for slugs with paths (e.g., /flow/anything). Event links of past
// seasons look the same (/2025/aachen) and pass through to FLOW, which resolves the
// year as the season.
app.get('/:slug/*', (req, res) => {
  const { slug } = req.params;
  const path = req.params[0]; // Everything after /slug/
  const urls = getUrls();
  
  if (urls[slug]) {
    // Append the path to the target URL
    redirectTo(req, res, `${withProtocol(urls[slug])}/${path}`, true);
  } else {
    // Fallback: assume it's an event slug and redirect to flow. Not permanent, because
    // FLOW decides per slug and season what it resolves to, and a cached 301 would
    // outlive that decision.
    redirectTo(req, res, `${FLOW_BASE_URL}/${slug}/${path}`, false);
  }
});

// Redirect handler for simple slugs (must be after /:slug/* route)
app.get('/:slug', (req, res) => {
  const { slug } = req.params;
  const urls = getUrls();
  
  if (urls[slug]) {
    redirectTo(req, res, withProtocol(urls[slug]), true);
  } else {
    // Fallback: assume it's an event slug and redirect to flow
    redirectTo(req, res, `${FLOW_BASE_URL}/${slug}`, false);
  }
});

// Start HTTP server on port 3000
// Apache handles HTTPS termination and redirects to this server
app.listen(PORT, () => {
  console.log(`✓ HTTP server running on port ${PORT}`);
  console.log(`✓ Domain shortener is ready (Apache handles HTTPS)`);
});

