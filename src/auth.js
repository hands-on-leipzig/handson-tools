const session = require('express-session');
const passport = require('passport');
const OpenIDConnectStrategy = require('passport-openidconnect').Strategy;

function allowedEmail(email, allowed) {
  if (!allowed || allowed.length === 0) return true;
  if (!email) return false;
  const domain = email.split('@')[1];
  return allowed.some((entry) => (entry.includes('@') ? entry === email : entry === domain));
}

function configureAuth(app, { onApex } = {}) {
  const issuer = process.env.KEYCLOAK_ISSUER;
  const clientID = process.env.KEYCLOAK_CLIENT_ID;
  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
  const callbackURL = process.env.KEYCLOAK_CALLBACK_URL || 'https://handson.tools/auth/keycloak/callback';
  const allowed = process.env.ALLOWED_EMAILS
    ? process.env.ALLOWED_EMAILS.split(',').map((s) => s.trim()).filter(Boolean)
    : null;
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
    }, (iss, profile, done) => {
      const email = profile.email || (profile.emails && profile.emails[0] && profile.emails[0].value) || null;
      if (!allowedEmail(email, allowed)) {
        return done(null, false, { message: 'Access denied. Your email is not authorized.' });
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
      passport.authenticate('openidconnect', { failureRedirect: '/admin?error=auth_failed' }),
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
      if (err) return res.redirect('/admin?error=logout_failed');
      res.redirect('/');
    });
  });

  return { ensureAuthenticated };
}

module.exports = { configureAuth };
