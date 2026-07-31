import assert from 'assert';
import { browserHeaders, marker, rawRequest, waitForServer } from './helpers/raw-http';

// Bug 2: once `disableBoilerplateResponse()` is in effect, webapp will never
// end a response itself. Any request that reaches the boilerplate data callback
// and is then declined by `isAppUrl()` used to be abandoned mid-response — the
// socket stayed open forever, unauthenticated, one held socket per request.

const request = (target, headerOverrides, timeout = 5000) =>
  rawRequest({ target, headers: browserHeaders(headerOverrides), timeout });

const routeOf = res => marker(res.body, 'matched-route');

before(async function () {
  this.timeout(60000);
  await waitForServer();
});

describe('declined requests always get a response', function () {
  this.timeout(30000);

  // These reach the boilerplate data callback (webapp's own appUrl() lets them
  // through) and are then declined by the package's isAppUrl(). Before the fix
  // each of them hung the socket forever.
  const declined = [
    '/__cordova/x',
    '/__cordova/manifest.json',
    '/__cordova/',
    '/__cordova',
    '/app.manifest?v=2',
  ];

  for (const target of declined) {
    it(`answers ${target} instead of holding the socket open`, async () => {
      const res = await request(target);
      assert.ok(res.complete, `${target} produced no complete response`);
      assert.strictEqual(res.status, 404, `${target} should be a 404, got ${res.status}`);
      assert.strictEqual(
        marker(res.body, 'matched-route'),
        null,
        `${target} should not be served the app document`,
      );
    });
  }

  it('does not leak sockets: the app still serves pages after a burst of declined requests', async () => {
    // The DoS claim, exercised directly. If each declined request holds a
    // socket, this either exhausts the server or fails at the first request.
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => request(`/__cordova/burst-${i}`)),
    );
    const res = await request('/');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(routeOf(res), 'ROOT');
  });
});

describe('arch-prefixed requests', function () {
  this.timeout(20000);

  it('serves /__browser (no trailing slash) as the root route', async () => {
    // webapp strips the /__browser segment and leaves an EMPTY pathname, which
    // RoutePolicy.classify() rejects with "url must be a relative URL:" — a 500
    // on every request to this URL.
    const res = await request('/__browser');
    assert.strictEqual(res.status, 200, `expected 200, got ${res.status}`);
    assert.strictEqual(routeOf(res), 'ROOT');
    assert.strictEqual(marker(res.body, 'routed-pathname'), '/');
  });

  it('serves /__browser/ as the root route', async () => {
    const res = await request('/__browser/');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(routeOf(res), 'ROOT');
  });

  it('serves /__browser/pricing as the pricing route (control: stripping really happens)', async () => {
    const res = await request('/__browser/pricing');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(routeOf(res), 'DECOY-PRICING');
    assert.strictEqual(marker(res.body, 'routed-pathname'), '/pricing');
  });
});

describe('regression controls: machinery other than the renderer must keep working', function () {
  this.timeout(20000);

  it('serves public/robots.txt from the static middleware', async () => {
    const res = await request('/robots.txt');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('User-agent'), `robots.txt body was ${JSON.stringify(res.body)}`);
  });

  it('serves public/favicon.ico from the static middleware', async () => {
    const res = await request('/favicon.ico');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('RRSSR-TEST-FAVICON'), `favicon body was ${JSON.stringify(res.body)}`);
  });

  it('serves a static public file with a cache-busting query string', async () => {
    const res = await request('/robots.txt?v=2');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('User-agent'));
  });

  it('leaves the sockjs network route to sockjs', async () => {
    const res = await request('/sockjs/info?cb=abc');
    assert.strictEqual(res.status, 200, `sockjs /info returned ${res.status}`);
    assert.ok(res.body.includes('websocket'), `sockjs /info body was ${JSON.stringify(res.body.slice(0, 200))}`);
  });

  it('serves the DDP runtime config script', async () => {
    const res = await request('/meteor_runtime_config.js');
    assert.notStrictEqual(res.status, undefined);
    assert.ok(res.complete);
  });

  it('still renders unknown app paths through the catch-all route', async () => {
    const res = await request('/no/such/page');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(routeOf(res), 'NOT-FOUND');
  });
});
