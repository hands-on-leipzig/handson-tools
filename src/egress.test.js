const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const { race, tcpAttempt, hopFromEnv, probe } = require('./egress');

function listen() {
  const server = net.createServer((socket) => socket.end());
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function runRace(attempts, options = {}) {
  return new Promise((resolve) => {
    race(attempts, { delayMs: 20, timeoutMs: 1000, ...options }, (error, socket) => {
      if (socket) socket.destroy();
      resolve({ error, socket });
    });
  });
}

/** An attempt that never connects and never fails — a black-holed route. */
function hangingAttempt() {
  return () => null;
}

function failingAttempt(code) {
  return (done) => {
    setImmediate(() => done(Object.assign(new Error(code), { code })));
    return null;
  };
}

function succeedingAttempt(label) {
  return (done) => {
    setImmediate(() => done(null, Object.assign(new net.Socket(), { label, destroy() {} })));
    return null;
  };
}

describe('race', () => {
  it('keeps the first attempt that comes up', async () => {
    const { error, socket } = await runRace([succeedingAttempt('direct'), succeedingAttempt('hop')]);
    assert.ifError(error);
    assert.equal(socket.label, 'direct');
  });

  it('falls through to the next attempt when the first fails', async () => {
    const { error, socket } = await runRace([failingAttempt('ENETUNREACH'), succeedingAttempt('hop')]);
    assert.ifError(error);
    assert.equal(socket.label, 'hop');
  });

  it('does not wait out the stagger when an attempt hangs', async () => {
    const started = Date.now();
    const { socket } = await runRace([hangingAttempt(), succeedingAttempt('hop')], { delayMs: 30 });
    assert.equal(socket.label, 'hop');
    assert.ok(Date.now() - started < 500);
  });

  it('reports the last error when every attempt fails', async () => {
    const { error } = await runRace([failingAttempt('ENETUNREACH'), failingAttempt('ECONNREFUSED')]);
    assert.equal(error.code, 'ECONNREFUSED');
  });

  it('times out instead of hanging forever', async () => {
    const { error } = await runRace([hangingAttempt()], { timeoutMs: 60 });
    assert.equal(error.code, 'ETIMEDOUT');
  });

  it('connects over TCP through a real attempt', async () => {
    const { server, port } = await listen();
    try {
      const { error, socket } = await runRace([
        tcpAttempt(() => net.connect({ host: '127.0.0.1', port })),
      ]);
      assert.ifError(error);
      assert.ok(socket);
    } finally {
      await close(server);
    }
  });
});

describe('hopFromEnv', () => {
  it('is off unless a host is configured', () => {
    assert.equal(hopFromEnv({}), null);
    assert.equal(hopFromEnv({ EGRESS_HOP_HOST: '  ' }), null);
    assert.deepEqual(hopFromEnv({ EGRESS_HOP_HOST: 'host.docker.internal' }), {
      host: 'host.docker.internal',
      port: 4180,
    });
    assert.equal(hopFromEnv({ EGRESS_HOP_HOST: 'h', EGRESS_HOP_PORT: '5000' }).port, 5000);
  });
});

describe('probe', () => {
  it('reports a refused upstream instead of throwing', async () => {
    const { server, port } = await listen();
    await close(server);
    const result = await probe(`http://127.0.0.1:${port}`, { timeoutMs: 500, hop: null });
    assert.equal(result.direct.ok, false);
    assert.ok(result.direct.error);
  });

  it('rejects an unusable target', async () => {
    assert.ok((await probe('not a url')).error);
  });
});
