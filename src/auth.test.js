const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { decodeJwt, hasClientRole, hasAdminRole, ADMIN_ROLE } = require('./auth');

function jwtWith(payload) {
  const json = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${json}.sig`;
}

describe('client role gate', () => {
  it('reads resource_access roles from a Keycloak JWT', () => {
    const claims = decodeJwt(jwtWith({
      resource_access: { 'handson-tools': { roles: [ADMIN_ROLE, 'other'] } },
    }));
    assert.equal(hasClientRole(claims, 'handson-tools', ADMIN_ROLE), true);
    assert.equal(hasClientRole(claims, 'handson-tools', 'nope'), false);
    assert.equal(hasClientRole(claims, 'other-client', ADMIN_ROLE), false);
  });

  it('accepts the role on the access token', () => {
    const access = jwtWith({ resource_access: { tools: { roles: [ADMIN_ROLE] } } });
    const id = jwtWith({ email: 'a@b.c' });
    assert.equal(hasAdminRole(id, access, 'tools'), true);
  });

  it('accepts the role on the id token if the access token has none', () => {
    const access = jwtWith({ sub: '1' });
    const id = jwtWith({ resource_access: { tools: { roles: [ADMIN_ROLE] } } });
    assert.equal(hasAdminRole(id, access, 'tools'), true);
  });

  it('rejects a signed-in user without the client role', () => {
    const access = jwtWith({ resource_access: { tools: { roles: ['viewer'] } } });
    assert.equal(hasAdminRole(null, access, 'tools'), false);
    assert.equal(hasAdminRole(null, 'not-a-jwt', 'tools'), false);
  });
});
