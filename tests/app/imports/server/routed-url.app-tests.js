import assert from 'assert';
import { appPort, browserHeaders, marker, rawRequest, rootUrlOrigin, waitForServer } from './helpers/raw-http';

// Every one of these drives the real path end to end: a real socket → real
// webapp → real fast-render boilerplate callback → real renderWithSSR → real
// React Router. Nothing calls an exported pure function directly, because the
// bug these cover was invisible from that angle.

const PORT = appPort();
const ORIGIN = `http://localhost:${PORT}`;
// Where a rejected Host header lands. Deliberately *not* the request's own
// authority, so an assertion on it cannot be satisfied by the attacker's value.
const FALLBACK_ORIGIN = rootUrlOrigin();

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

  it('a Host the syntax filter rejects falls back to the app ROOT_URL origin', async () => {
    const res = await render('/', { Host: 'not a host/pricing' });
    assert.strictEqual(routeOf(res), 'ROOT');
    assert.strictEqual(marker(res.body, 'loader-url'), `${FALLBACK_ORIGIN}/`);
  });

  // The syntax filter is deliberately looser than the URL parser, so there are
  // TWO ways a Host can be unusable. Both must land on the same fallback — this
  // class used to reach `new URL()`, throw, and silently drop ROOT_URL's port.
  const urlRejectedHosts = [
    ['out-of-range dotted quad', '999.999.999.999'],
    ['bare integer overflowing IPv4', '4294967296'],
    ['five dotted labels', '1.2.3.4.5'],
    ['IPv4 in IPv6 brackets', '[1.2.3.4]'],
    ['port out of range', 'localhost:99999'],
  ];

  for (const [label, host] of urlRejectedHosts) {
    it(`a Host the URL parser rejects (${label}) falls back to the full ROOT_URL origin`, async () => {
      const res = await render('/', { Host: host });
      assert.strictEqual(routeOf(res), 'ROOT');
      assert.strictEqual(
        marker(res.body, 'loader-url'),
        `${FALLBACK_ORIGIN}/`,
        `${label}: fallback must keep ROOT_URL's host AND port`,
      );
    });
  }

  it('a syntactically odd but parseable Host is still honoured (the filter is not over-tight)', async () => {
    // Control for the two tests above: proves they fail because the host is
    // unusable, not because every unusual host is rejected.
    const res = await render('/', { Host: '127.0.0.1:8080' });
    assert.strictEqual(routeOf(res), 'ROOT');
    assert.strictEqual(marker(res.body, 'loader-url'), 'http://127.0.0.1:8080/');
  });

  it('a protocol-relative request target stays in the path and never becomes the origin', async () => {
    // Documented sharp edge (README security note): `//evil.example/x` is a
    // legitimate pathname, so a consumer redirecting to a bare `url.pathname`
    // gets a protocol-relative open redirect. What must NOT happen is the host
    // moving into the origin — assert both halves so the README stays true.
    const res = await render('//evil.example/x');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(marker(res.body, 'routed-pathname'), '//evil.example/x');
    assert.strictEqual(marker(res.body, 'loader-url'), `${ORIGIN}//evil.example/x`);
    assert.strictEqual(new URL(marker(res.body, 'loader-url')).host, `localhost:${PORT}`);
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

  it('a valid x-forwarded-proto still wins over the fallback origin scheme', async () => {
    // Documented rule: an unusable Host falls back to ROOT_URL's *whole*
    // origin, scheme included, but an explicit proxy-supplied scheme overrides
    // it — the proxy knows which scheme the client actually used.
    const res = await render('/', { Host: 'not a host', 'X-Forwarded-Proto': 'https' });
    assert.strictEqual(routeOf(res), 'ROOT');
    assert.strictEqual(
      marker(res.body, 'loader-url'),
      `${FALLBACK_ORIGIN.replace(/^https?:/, 'https:')}/`,
    );
  });
});

describe('requestRoutedUrl (the exported helper consumers must not reimplement)', function () {
  this.timeout(20000);

  const probeMode = async (mode, target, headerOverrides) => {
    const res = await rawRequest({
      target,
      headers: browserHeaders({ 'x-rrssr-probe': mode, ...headerOverrides }),
    });
    assert.strictEqual(res.status, 200, `probe for ${target} returned ${res.status}`);
    return JSON.parse(res.body);
  };

  const probe = (target, headerOverrides) => probeMode('1', target, headerOverrides);

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

  describe('when webapp cannot categorize the request', function () {
    // The guarded fallback must not degrade into express's un-arch-stripped
    // `req.path`. If it did, a consumer's `url.pathname.startsWith('/admin')`
    // gate would see `/__browser/admin` where the renderer routes `/admin` —
    // failing OPEN, which is exactly the drift the export exists to prevent.

    it('really is exercising the fallback (webapp itself throws on this input)', async () => {
      const url = await probeMode('raw-fallback', '/__browser/admin');
      assert.strictEqual(
        url.webappCategorizeThrew,
        true,
        'WebApp.categorizeRequest did not throw — this test is not reaching the fallback branch',
      );
    });

    it('strips the /__<arch> segment itself rather than reporting express req.path', async () => {
      const url = await probeMode('raw-fallback', '/__browser/admin');
      assert.strictEqual(
        url.fixtureHasExpressPathGetter,
        true,
        'the fixture exposes no req.path getter, so this test has nothing to fail into',
      );
      assert.strictEqual(url.fixtureExpressPath, '/__browser/admin', 'req.path is the un-stripped value');
      assert.strictEqual(url.pathname, '/admin');
    });

    // Ordering defect found in review: webapp strips /__<arch> from the RAW
    // pathname, and dot segments are removed afterwards by the url.pathname
    // setter. Normalizing first inverts that and disagrees with the renderer.
    const orderingCases = [
      ['/x/../__browser/pricing', '/__browser/pricing'],
      ['/./__browser/admin', '/__browser/admin'],
      ['/%2E%2E/__browser/x', '/__browser/x'],
    ];

    for (const [target, expected] of orderingCases) {
      it(`strips the arch segment in webapp's order for ${target}`, async () => {
        const url = await probeMode('raw-fallback', target);
        assert.strictEqual(url.pathname, expected);

        // …and it must equal what the renderer actually routes for that target.
        const rendered = await render(target);
        const renderedPath = marker(rendered.body, 'routed-pathname');
        assert.strictEqual(
          url.pathname,
          renderedPath,
          `fallback said "${url.pathname}" but the renderer routed "${renderedPath}"`,
        );
      });
    }

    it('leaves a non-arch path alone', async () => {
      const url = await probeMode('raw-fallback', '/admin/settings?x=1');
      assert.strictEqual(url.pathname, '/admin/settings');
      assert.strictEqual(url.search, '?x=1');
    });

    it('does not strip an arch segment for a program that is not built', async () => {
      // /__cordova must survive when no mobile platform has been added, exactly
      // as webapp's own categorization leaves it.
      const url = await probeMode('raw-fallback', '/__cordova/x');
      assert.strictEqual(url.pathname, '/__cordova/x');
    });

    it('normalises a bare arch segment to /', async () => {
      const url = await probeMode('raw-fallback', '/__browser');
      assert.strictEqual(url.pathname, '/');
    });

    it('drops the fragment', async () => {
      const url = await probeMode('raw-fallback', '/pricing#/events/e1');
      assert.strictEqual(url.pathname, '/pricing');
      assert.strictEqual(url.hash, '');
    });
  });

  describe('scheme derivation', function () {
    // With ROOT_URL pinned to https, a hardcoded 'http' default is
    // distinguishable from "inherit the app's own scheme". Without this the
    // suite's own ROOT_URL is http and the two are indistinguishable.
    const pinned = (target, headerOverrides) => probeMode('root-url-scheme', target, headerOverrides);

    it('pins ROOT_URL for the duration of the probe (fixture sanity)', async () => {
      const url = await pinned('/');
      assert.strictEqual(url.pinnedRootUrl, 'https://pinned.test:8443/');
    });

    it('takes the scheme from ROOT_URL when no x-forwarded-proto is set', async () => {
      // A TLS terminator that rewrites Host but sets no x-forwarded-proto is a
      // normal deployment; defaulting to http downgraded every absolute URL.
      const url = await pinned('/events/e1');
      assert.strictEqual(url.protocol, 'https:');
      assert.strictEqual(url.host, `localhost:${PORT}`, 'the real Host header must still win for the authority');
      assert.strictEqual(url.pathname, '/events/e1');
    });

    it('lets a valid x-forwarded-proto override the ROOT_URL scheme', async () => {
      const url = await pinned('/', { 'X-Forwarded-Proto': 'http' });
      assert.strictEqual(url.protocol, 'http:');
    });

    it('takes both scheme and host from ROOT_URL when the Host is unusable', async () => {
      const url = await pinned('/', { Host: '999.999.999.999' });
      assert.strictEqual(url.origin, 'https://pinned.test:8443');
    });

    it('the ROOT_URL pin did not leak out of the probe', async () => {
      // The probe mutates global state and restores it in a `finally`. That
      // invariant is load-bearing and otherwise untested: delete the try/finally
      // and every run still reports green, because the assertions the leak would
      // corrupt happen to be ordered before it.
      const url = await probe('/', { Host: 'not a host' });
      assert.strictEqual(url.origin, FALLBACK_ORIGIN);
    });
  });

  it('does not throw for any input, including null', async () => {
    const { results } = await probeMode('degenerate', '/');
    assert.ok(Array.isArray(results) && results.length >= 8, 'expected the degenerate-input sweep to run');
    const threw = results.filter(r => r.threw);
    assert.deepStrictEqual(
      threw,
      [],
      `requestRoutedUrl threw for: ${threw.map(r => `${r.label} (${r.error})`).join(', ')}`,
    );
    for (const result of results) {
      assert.ok(
        typeof result.href === 'string' && result.href.startsWith('http'),
        `${result.label}: expected an absolute http(s) URL, got ${result.href}`,
      );
    }
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
      // Encoding survivals the two sides could plausibly disagree about.
      ['/events/e1?a=b%20c&flag', undefined],
      ['/x/../pricing', undefined],
      ['/./pricing', undefined],
      ['/', { Host: '999.999.999.999' }],
      ['/', { Host: 'not a host' }],
      ['/pricing', { 'X-Forwarded-Proto': 'https, http' }],
      ['/pricing', { Host: 'evil.example' }],
    ];

    for (const [target, headers] of cases) {
      const label = `${target} ${JSON.stringify(headers || {})}`;
      const helper = await probe(target, headers);
      const rendered = await render(target, headers);
      const renderedPath = marker(rendered.body, 'routed-pathname');
      const renderedSearch = marker(rendered.body, 'routed-search');
      const renderedUrl = marker(rendered.body, 'loader-url');
      assert.strictEqual(
        helper.pathname,
        renderedPath,
        `helper said "${helper.pathname}" but the renderer routed "${renderedPath}" for ${label}`,
      );
      assert.strictEqual(
        helper.search,
        renderedSearch,
        `helper said search "${helper.search}" but the renderer routed "${renderedSearch}" for ${label}`,
      );
      // Origin too: a consumer building an absolute URL from the helper must
      // get the same origin the renderer hands to loaders.
      assert.strictEqual(
        helper.origin,
        new URL(renderedUrl).origin,
        `helper said origin "${helper.origin}" but the renderer routed "${renderedUrl}" for ${label}`,
      );
      assert.strictEqual(
        helper.href,
        renderedUrl,
        `helper href "${helper.href}" !== renderer "${renderedUrl}" for ${label}`,
      );
    }
  });
});

// Every claim the README and CHANGELOG make about what this package does NOT
// protect you from. Three review rounds in a row found a false statement in the
// exposure notes, each one reasoned-from-the-code rather than executed. These
// execute them, so the docs cannot drift from the behaviour they describe.
describe('claims made in the published security notes', function () {
  this.timeout(20000);

  it('a foreign but valid Host IS reflected into the origin loaders see', async () => {
    // Documented as by-design, and the reason the notes say the origin is
    // untrusted. If this ever stops being true the notes must change too.
    const res = await render('/events/e1', { Host: 'evil.example' });
    assert.strictEqual(routeOf(res), 'EVENT');
    const loaderUrl = new URL(marker(res.body, 'loader-url'));
    assert.strictEqual(loaderUrl.host, 'evil.example');
    assert.strictEqual(loaderUrl.pathname, '/events/e1');
  });

  it('X-Forwarded-Host is not consulted anywhere', async () => {
    const res = await render('/events/e1', {
      Host: `localhost:${PORT}`,
      'X-Forwarded-Host': 'evil.example',
    });
    const loaderUrl = new URL(marker(res.body, 'loader-url'));
    assert.strictEqual(
      loaderUrl.host,
      `localhost:${PORT}`,
      'X-Forwarded-Host reached the origin; the security notes say it never does',
    );
  });

  it('search is a normalized re-serialization, not the raw query bytes', async () => {
    const res = await render('/events/e1?a=b%20c&flag');
    assert.strictEqual(marker(res.body, 'routed-search'), '?a=b+c&flag=');
  });

  it('repeated query keys are lossy, in a webapp-version-dependent way', async () => {
    // webapp 2.2.0 keeps the last value (Object.fromEntries); 2.1.2 comma-joins.
    // The suite runs on both, so accept either — the documented point is that
    // the raw bytes do not survive.
    const res = await render('/events/e1?a=1&a=2');
    const search = marker(res.body, 'routed-search');
    assert.ok(
      search === '?a=2' || search === '?a=1%2C2',
      `expected webapp 2.2.0's "?a=2" or 2.1.2's "?a=1%2C2", got ${search}`,
    );
    assert.notStrictEqual(search, '?a=1&a=2', 'raw repeated keys are documented as not surviving');
  });

  it('the decline rules are syntactic: /%5F%5Fcordova/x is NOT declined', async () => {
    // Documented, deliberately unfixed: it fails safe, rendering the catch-all
    // for a URL that does not exist rather than declining something it should
    // have rendered.
    const res = await render('/%5F%5Fcordova/x');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(routeOf(res), 'NOT-FOUND');
  });

  it('the rendered document does not Vary on the headers that steered it', async () => {
    // The advisory calls the pre-7.1.0 bug a cache-poisoning primitive. That
    // rests on the response body having depended on request headers that the
    // response never declares in `Vary`, so a shared cache would key the
    // attacker's variant under the victim's URL.
    //
    // Note the response DOES carry `Vary: Accept-Encoding` from Meteor's
    // compression middleware — the claim is specifically about `Host` and
    // `X-Forwarded-Proto`, so assert that rather than the absence of Vary.
    const res = await render('/');
    assert.strictEqual(res.status, 200);
    const vary = (res.headers.vary || '').toLowerCase();
    assert.ok(!vary.includes('host'), `Vary unexpectedly lists host: ${res.headers.vary}`);
    assert.ok(
      !vary.includes('x-forwarded-proto'),
      `Vary unexpectedly lists x-forwarded-proto: ${res.headers.vary}`,
    );
  });
});
