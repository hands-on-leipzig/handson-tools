const session = require('express-session');
const passport = require('passport');
const OpenIDConnectStrategy = require('passport-openidconnect').Strategy;

const ADMIN_ROLE = 'handson-tools-admin';

function decodeJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function hasClientRole(claims, clientId, role) {
  if (!claims || !clientId || !role) return false;
  const roles = claims.resource_access?.[clientId]?.roles;
  return Array.isArray(roles) && roles.includes(role);
}

function hasAdminRole(idToken, accessToken, clientId, role = ADMIN_ROLE) {
  for (const token of [accessToken, idToken]) {
    if (hasClientRole(decodeJwt(token), clientId, role)) return true;
  }
  return false;
}

function configureAuth(app, { onApex } = {}) {
  const issuer = process.env.KEYCLOAK_ISSUER;
  const clientID = process.env.KEYCLOAK_CLIENT_ID;
  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
  const callbackURL = process.env.KEYCLOAK_CALLBACK_URL || 'https://handson.tools/auth/keycloak/callback';
  const adminRole = process.env.KEYCLOAK_ADMIN_ROLE || ADMIN_ROLE;
  const apex = onApex || ((req, res, next) => next());

  app.set('trust proxy', 1);
  app.use(session({
    secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.COOKIE_SECURE === 'false' ? false : process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  }));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user, done) => done(null, user));

  if (issuer && clientID && clientSecret) {
    passport.use(new OpenIDConnectStrategy({
      issuer,
      authorizationURL: `${issuer}/protocol/openid-connect/auth`,
      tokenURL: `${issuer}/protocol/openid-connect/token`,
      userInfoURL: `${issuer}/protocol/openid-connect/userinfo`,
      clientID,
      clientSecret,
      callbackURL,
      scope: ['openid', 'profile', 'email'],
    }, function verifyOidc(iss, profile, context, idToken, accessToken, refreshToken, params, done) {
      profile = profile || {};
      const email = profile.email || (profile.emails && profile.emails[0] && profile.emails[0].value) || null;
      if (!hasAdminRole(idToken, accessToken, clientID, adminRole)) {
        return done(null, false, { message: `Access denied. Missing client role ${adminRole}.` });
      }
      return done(null, {
        id: profile.id,
        email,
        name: profile.displayName || profile.username || profile.id,
        photo: profile.photos && profile.photos[0] && profile.photos[0].value,
      });
    }));

    app.get('/auth/keycloak', apex, passport.authenticate('openidconnect'));
    app.get(
      '/auth/keycloak/callback',
      apex,
      passport.authenticate('openidconnect', { failureRedirect: '/?error=forbidden' }),
      (req, res) => res.redirect('/admin'),
    );
  } else {
    console.warn('Keycloak nicht konfiguriert — /admin ist ohne Login offen, bis KEYCLOAK_* gesetzt sind.');
  }

  function ensureAuthenticated(req, res, next) {
    if (!issuer || !clientID || !clientSecret) return next();
    if (req.isAuthenticated()) return next();
    res.redirect('/auth/keycloak');
  }

  app.get('/auth/logout', apex, (req, res) => {
    req.logout((err) => {
      if (err) return res.redirect('/?error=logout_failed');
      res.redirect('/');
    });
  });

  return { ensureAuthenticated };
}

module.exports = {
  configureAuth,
  decodeJwt,
  hasClientRole,
  hasAdminRole,
  ADMIN_ROLE,
};
