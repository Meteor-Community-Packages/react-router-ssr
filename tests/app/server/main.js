import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
// Namespace import on purpose: if the package stops exporting `requestRoutedUrl`
// this must surface as a failing test, not as a boot failure — a crashed boot
// prints "0 passing / 0 failures", which reads as green.
import * as ReactRouterSSR from 'meteor/communitypackages:react-router-ssr';

import '../both/main.jsx';

// Stands in for a consumer app's own middleware (the real-world case that
// motivated exporting `requestRoutedUrl`): code that must know the path the
// renderer will route on *before* the renderer runs, from a raw, un-categorized
// connect request. Any request carrying `x-rrssr-probe: 1` is answered here
// with the helper's verdict instead of being rendered.
if (Meteor.isAppTest || Meteor.isTest) {
  WebApp.handlers.use((req, res, next) => {
    if (req.headers['x-rrssr-probe'] !== '1') {
      return next();
    }

    let payload;
    try {
      const { requestRoutedUrl } = ReactRouterSSR;
      if (typeof requestRoutedUrl !== 'function') {
        throw new Error('the package does not export requestRoutedUrl');
      }
      const url = requestRoutedUrl(req);
      payload = {
        ok: true,
        href: url.href,
        protocol: url.protocol,
        host: url.host,
        pathname: url.pathname,
        search: url.search,
        hash: url.hash,
        // Proves the raw request really was un-categorized when the helper ran.
        rawUrl: typeof req.url === 'string' ? req.url : null,
        // webapp's own "already categorized" test. Note that express defines
        // req.path on every raw request, so `req.path` is NOT this signal.
        categorizedByCaller: Boolean(req.browser && req.arch && typeof req.modern === 'boolean'),
        hasExpressPathGetter: typeof req.path === 'string',
      };
    } catch (error) {
      payload = { ok: false, error: error.message };
    }

    const body = JSON.stringify(payload);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  });
}
