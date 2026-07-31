import assert from 'assert';
import { appPort, browserHeaders, marker, rawRequest, rootUrlHost, waitForServer } from './helpers/raw-http';

// Every one of these drives the real path end to end: a real socket → real
// webapp → real fast-render boilerplate callback → real renderWithSSR → real
// React Router. Nothing calls an exported pure function directly, because the
// bug these cover was invisible from that angle.

const PORT = appPort();
const ORIGIN = `http://localhost:${PORT}`;
// Where a rejected Host header lands. Deliberately *not* the request's own
// authority, so an assertion on it cannot be satisfied by the attacker's value.
const FALLBACK_ORIGIN = `http://${rootUrlHost()}`;

const render = (target, headerOverrides) =>
  rawRequest({ target, headers: browserHeaders(headerOverrides) });

const routeOf = res => marker(res.body, 'matched-route');

before(async function () {
  this.timeout(60000);
  await waitForServer();
});

describe('routing (controls — these must fail if the fixtures go vacuous)', function () {
  this.timeout(20000);

  it('routes an ordinary request to the root route', async () => {
    const res = await render('/');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(routeOf(res), 'ROOT');
    assert.strictEqual(marker(res.body, 'routed-pathname'), '/');
    assert.strictEqual(marker(res.body, 'loader-url'), `${ORIGIN}/`);
  });

  it('the decoy route is genuinely reachable (otherwise the attack tests prove nothing)', async () => {
    const res = await render('/pricing');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(routeOf(res), 'DECOY-PRICING');
    assert.strictEqual(marker(res.body, 'routed-pathname'), '/pricing');
  });

  it('routes a parameterised path and preserves params', async () => {
    const res = await render('/events/e123');
    assert.strictEqual(routeOf(res), 'EVENT');
    assert.strictEqual(marker(res.body, 'routed-params'), '{"eventId":"e123"}');
  });

  it('preserves the query string', async () => {
    const res = await render('/events/e123?foo=bar&baz=1');
    assert.strictEqual(routeOf(res), 'EVENT');
    assert.strictEqual(marker(res.body, 'routed-search'), '?foo=bar&baz=1');
    assert.strictEqual(marker(res.body, 'loader-url'), `${ORIGIN}/events/e123?foo=bar&baz=1`);
  });

  it('honours a legitimate x-forwarded-proto: https', async () => {
    const res = await render('/', { 'X-Forwarded-Proto': 'https' });
    assert.strictEqual(routeOf(res), 'ROOT');
    assert.strictEqual(marker(res.body, 'loader-url'), `https://localhost:${PORT}/`);
  });

  it('honours the first hop of a chained x-forwarded-proto', async () => {
    const res = await render('/', { 'X-Forwarded-Proto': 'https, http' });
    assert.strictEqual(routeOf(res), 'ROOT');
    assert.strictEqual(marker(res.body, 'loader-url'), `https://localhost:${PORT}/`);
  });

  it('honours the Host header for the derived origin', async () => {
    const res = await render('/', { Host: 'example.test:8080' });
    assert.strictEqual(routeOf(res), 'ROOT');
    assert.strictEqual(marker(res.body, 'loader-url'), 'http://example.test:8080/');
  });
});

describe('routing (header injection — CVE-shaped: the client must not steer the URL)', function () {
  this.timeout(20000);

  // The invariant under test, for every case: the request target decides the
  // route. A header never does.
  const mustStillBeRoot = async (label, headers) => {
    const res = await render('/', headers);
    assert.strictEqual(
      routeOf(res),
      'ROOT',
      `${label}: request target was "/" but the renderer matched ${routeOf(res)}`,
    );
    assert.strictEqual(marker(res.body, 'routed-pathname'), '/', `${label}: routed pathname was steered`);
  };

  it('x-forwarded-proto containing an origin + path + fragment cannot steer the route', () =>
    mustStillBeRoot('xfp origin injection', {
      'X-Forwarded-Proto': `http://localhost:${PORT}/pricing#`,
    }));

  it('x-forwarded-proto injection with a percent-encoded path cannot steer the route', () =>
    mustStillBeRoot('xfp percent-encoded', {
      'X-Forwarded-Proto': `http://localhost:${PORT}/%70ricing#`,
    }));

  it('x-forwarded-proto injection using backslashes cannot steer the route', () =>
    mustStillBeRoot('xfp backslash', {
      'X-Forwarded-Proto': `http:\\\\localhost:${PORT}\\pricing#`,
    }));

  it('x-forwarded-proto injection using a query terminator cannot steer the route', () =>
    mustStillBeRoot('xfp query terminator', {
      'X-Forwarded-Proto': `https://localhost:${PORT}/pricing?`,
    }));

  it('x-forwarded-proto injection in the FIRST comma-separated hop cannot steer the route', () =>
    // This is the shape a normal appending proxy produces: the client supplies
    // hop 1 and the proxy appends its own, so a proxy deployment is no mitigation.
    mustStillBeRoot('xfp first hop', {
      'X-Forwarded-Proto': `http://localhost:${PORT}/pricing#, https`,
    }));

  it('Host containing a path cannot steer the route', () =>
    mustStillBeRoot('host path injection', { Host: `localhost:${PORT}/pricing` }));

  it('Host containing a backslash path cannot steer the route', () =>
    mustStillBeRoot('host backslash', { Host: `localhost:${PORT}\\pricing` }));

  it('Host containing a percent-encoded path cannot steer the route', () =>
    mustStillBeRoot('host percent-encoded', { Host: `localhost:${PORT}/%70ricing` }));

  it('Host containing userinfo cannot steer the route, and its credentials never reach the URL', async () => {
    await mustStillBeRoot('host userinfo', { Host: `evil.test@localhost:${PORT}/pricing` });
    // Composing via URL setters is enough to protect the *route*; rejecting the
    // authority outright is what keeps attacker-supplied userinfo out of the
    // URL that loaders (and anything a consumer derives from it) actually see.
    const res = await render('/', { Host: `evil.test@localhost:${PORT}/pricing` });
    assert.strictEqual(marker(res.body, 'loader-url'), `${FALLBACK_ORIGIN}/`);
  });

  it('Host containing a fragment cannot steer the route', () =>
    mustStillBeRoot('host fragment', { Host: `localhost:${PORT}#/pricing` }));

  it('injection cannot steer a non-root target either', async () => {
    const res = await render('/events/e123', { Host: `localhost:${PORT}/pricing` });
    assert.strictEqual(routeOf(res), 'EVENT');
    assert.strictEqual(marker(res.body, 'routed-params'), '{"eventId":"e123"}');
  });

  it('injection cannot steer a deep target either', async () => {
    const res = await render('/claim/tok-abc', {
      'X-Forwarded-Proto': `http://localhost:${PORT}/pricing#`,
    });
    assert.strictEqual(routeOf(res), 'CLAIM');
    assert.strictEqual(marker(res.body, 'routed-params'), '{"token":"tok-abc"}');
  });

  it('a bogus scheme falls back to http rather than producing a weird URL', async () => {
    const res = await render('/', { 'X-Forwarded-Proto': 'javascript' });
    assert.strictEqual(routeOf(res), 'ROOT');
    assert.strictEqual(marker(res.body, 'loader-url'), `${ORIGIN}/`);
  });

  it('an invalid Host falls back to the app ROOT_URL host and still renders', async () => {
    const res = await render('/', { Host: 'not a host/pricing' });
    assert.strictEqual(routeOf(res), 'ROOT');
    assert.strictEqual(marker(res.body, 'loader-url'), `${FALLBACK_ORIGIN}/`);
  });

  it('a missing Host header still renders the right route', async () => {
    // No Host at all — a directly-reached app server, an HTTP/1.0 client, or a
    // health check. Must not 500 and must not hang.
    const res = await rawRequest({
      target: '/',
      version: 'HTTP/1.0',
      headers: { Accept: 'text/html' },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(routeOf(res), 'ROOT');
    assert.strictEqual(marker(res.body, 'loader-url'), `${FALLBACK_ORIGIN}/`);
  });
});

describe('requestRoutedUrl (the exported helper consumers must not reimplement)', function () {
  this.timeout(20000);

  const probe = async (target, headerOverrides) => {
    const res = await rawRequest({
      target,
      headers: browserHeaders({ 'x-rrssr-probe': '1', ...headerOverrides }),
    });
    assert.strictEqual(res.status, 200, `probe for ${target} returned ${res.status}`);
    return JSON.parse(res.body);
  };

  it('is exported from the server module', async () => {
    const url = await probe('/');
    assert.strictEqual(url.ok, true, `helper threw: ${url.error}`);
  });

  it('works on a raw, un-categorized connect request', async () => {
    const url = await probe('/events/e123?foo=bar');
    assert.strictEqual(url.categorizedByCaller, false, 'the probe request was already categorized — the test is not exercising the raw path');
    // The trap this suite caught: express puts a `path` getter on every raw
    // request, so "has req.path" must never be read as "already categorized".
    assert.strictEqual(url.hasExpressPathGetter, true, 'expected the raw express request to expose req.path');
    assert.strictEqual(url.rawUrl, '/events/e123?foo=bar');
    assert.strictEqual(url.pathname, '/events/e123');
    assert.strictEqual(url.search, '?foo=bar');
    assert.strictEqual(url.host, `localhost:${PORT}`);
    assert.strictEqual(url.protocol, 'http:');
  });

  it('reproduces webapp categorization: strips a leading /__<arch> segment', async () => {
    const url = await probe('/__browser/pricing?x=1');
    assert.strictEqual(url.pathname, '/pricing');
    assert.strictEqual(url.search, '?x=1');
  });

  it('reproduces webapp categorization: drops the fragment', async () => {
    const url = await probe('/pricing#/events/e1');
    assert.strictEqual(url.pathname, '/pricing');
    assert.strictEqual(url.hash, '');
  });

  it('normalises a bare /__<arch> target to /', async () => {
    const url = await probe('/__browser');
    assert.strictEqual(url.pathname, '/');
  });

  it('honours a legitimate x-forwarded-proto', async () => {
    const url = await probe('/', { 'X-Forwarded-Proto': 'https' });
    assert.strictEqual(url.protocol, 'https:');
    assert.strictEqual(url.host, `localhost:${PORT}`);
  });

  it('refuses to let headers steer the path it reports', async () => {
    const injected = await probe('/', { Host: `localhost:${PORT}/pricing` });
    assert.strictEqual(injected.pathname, '/');
    const injected2 = await probe('/', { 'X-Forwarded-Proto': `http://localhost:${PORT}/pricing#` });
    assert.strictEqual(injected2.pathname, '/');
  });

  it('agrees with what the renderer actually routes on (the anti-drift guarantee)', async () => {
    const cases = [
      ['/', undefined],
      ['/pricing', undefined],
      ['/events/e123?foo=bar', undefined],
      ['/__browser/pricing', undefined],
      ['/', { Host: `localhost:${PORT}/pricing` }],
      ['/', { 'X-Forwarded-Proto': `http://localhost:${PORT}/pricing#` }],
      ['/claim/tok-abc?a=1&b=2', { 'X-Forwarded-Proto': 'https' }],
      ['/pricing#/events/e1', undefined],
      // Repeated query keys: webapp's categorization keeps only the last value.
      // The point is not which value wins, it is that both sides agree.
      ['/events/e1?a=1&a=2&b=3', undefined],
    ];

    for (const [target, headers] of cases) {
      const helper = await probe(target, headers);
      const rendered = await render(target, headers);
      const renderedPath = marker(rendered.body, 'routed-pathname');
      const renderedSearch = marker(rendered.body, 'routed-search');
      assert.strictEqual(
        helper.pathname,
        renderedPath,
        `helper said "${helper.pathname}" but the renderer routed "${renderedPath}" for ${target} ${JSON.stringify(headers || {})}`,
      );
      assert.strictEqual(
        helper.search,
        renderedSearch,
        `helper said search "${helper.search}" but the renderer routed "${renderedSearch}" for ${target}`,
      );
    }
  });
});
