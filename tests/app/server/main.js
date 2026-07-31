import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
// Namespace import on purpose: if the package stops exporting `requestRoutedUrl`
// this must surface as a failing test, not as a boot failure — a crashed boot
// prints "0 passing / 0 failures", which reads as green.
import * as ReactRouterSSR from 'meteor/communitypackages:react-router-ssr';

import '../both/main.jsx';

// Degenerate inputs for the "does not throw" contract. Real sockets cannot
// produce these; a consumer's middleware can.
const DEGENERATE_INPUTS = [
  ['null', () => null],
  ['undefined', () => undefined],
  ['empty object', () => ({})],
  ['unparseable url string', () => ({ url: 'http://[', headers: {} })],
  ['url is an empty object', () => ({ url: {}, headers: {} })],
  ['url is a number', () => ({ url: 42, headers: {} })],
  ['headers is null', () => ({ url: '/pricing', headers: null })],
  ['not an object at all', () => 'GET /pricing'],
];

const describeUrl = (url) => ({
  ok: true,
  href: url.href,
  origin: url.origin,
  protocol: url.protocol,
  host: url.host,
  pathname: url.pathname,
  search: url.search,
  hash: url.hash,
});

// Stands in for a consumer app's own middleware (the real-world case that
// motivated exporting `requestRoutedUrl`): code that must know the path the
// renderer will route on *before* the renderer runs, from a raw, un-categorized
// connect request. Any request carrying `x-rrssr-probe` is answered here
// instead of being rendered.
if (Meteor.isAppTest || Meteor.isTest) {
  WebApp.handlers.use((req, res, next) => {
    const mode = req.headers['x-rrssr-probe'];
    if (!mode) {
      return next();
    }

    let payload;
    try {
      const { requestRoutedUrl } = ReactRouterSSR;
      if (typeof requestRoutedUrl !== 'function') {
        throw new Error('the package does not export requestRoutedUrl');
      }

      if (mode === 'degenerate') {
        // Assert the "does not throw" contract from the outside.
        payload = {
          ok: true,
          results: DEGENERATE_INPUTS.map(([label, build]) => {
            try {
              const url = requestRoutedUrl(build());
              return { label, threw: false, href: url.href };
            } catch (error) {
              return { label, threw: true, error: `${error.name}: ${error.message}` };
            }
          }),
        };
      } else if (mode === 'root-url-scheme') {
        // Pin ROOT_URL to an https origin so the derived scheme cannot be
        // mistaken for a hardcoded 'http'. `Meteor.absoluteUrl.defaultOptions`
        // is global state, but this block is entirely synchronous — there is no
        // await between the swap and the restore, so no other request can
        // observe the pinned value.
        const saved = Meteor.absoluteUrl.defaultOptions.rootUrl;
        Meteor.absoluteUrl.defaultOptions.rootUrl = 'https://pinned.test:8443';
        try {
          payload = {
            ...describeUrl(requestRoutedUrl(req)),
            pinnedRootUrl: Meteor.absoluteUrl(),
          };
        } finally {
          Meteor.absoluteUrl.defaultOptions.rootUrl = saved;
        }
      } else if (mode === 'raw-fallback') {
        // Force the branch where webapp's categorization is unusable.
        // `pathname: ''` makes webapp's own implementation throw (it calls
        // .startsWith() on `''.split('/')[1]`, which is undefined), so this
        // exercises the real catch branch rather than a stubbed one.
        //
        // The fixture carries an express-style `path` getter on purpose: the
        // fallback must not read it, and without one the test asserting so
        // would have nothing to fail into.
        const synthetic = {
          url: req.url,
          headers: req.headers,
          pathname: '',
          get path () { return req.path; },
        };
        let webappThrew = false;
        try {
          WebApp.categorizeRequest(synthetic);
        } catch (error) {
          webappThrew = true;
        }
        payload = {
          ...describeUrl(requestRoutedUrl(synthetic)),
          webappCategorizeThrew: webappThrew,
          fixtureHasExpressPathGetter: typeof synthetic.path === 'string',
          fixtureExpressPath: synthetic.path,
        };
      } else {
        payload = {
          ...describeUrl(requestRoutedUrl(req)),
          // Proves the raw request really was un-categorized when the helper ran.
          rawUrl: typeof req.url === 'string' ? req.url : null,
          // webapp's own "already categorized" test. Note that express defines
          // req.path on every raw request, so `req.path` is NOT this signal.
          categorizedByCaller: Boolean(req.browser && req.arch && typeof req.modern === 'boolean'),
          hasExpressPathGetter: typeof req.path === 'string',
        };
      }
    } catch (error) {
      payload = { ok: false, error: `${error.name}: ${error.message}` };
    }

    const body = JSON.stringify(payload);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  });
}
