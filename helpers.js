import { RoutePolicy } from 'meteor/routepolicy';

// webapp's `categorizeRequest` strips a leading `/__<arch>` segment, so a
// request for `/__browser` (no trailing slash) arrives with an *empty*
// pathname. That is not a relative URL: `RoutePolicy.classify('')` throws
// "url must be a relative URL:", which surfaced as a 500 on every request to
// that URL. An empty (or non-absolute) pathname means the site root.
export const normalizePathname = function normalizePathname (pathname) {
  if (typeof pathname !== 'string' || pathname === '') {
    return '/';
  }
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
};

// Meteor's webapp passes the *categorized* request to boilerplate data
// callbacks (WebApp.categorizeRequest): the pathname lives at `req.path`
// and `req.url` is `{ query }` — there is no `req.url.pathname` (webapp
// 2.2.0 / Meteor 3.5). Accept every historical shape: categorized
// (`path`), legacy parsed URL (`url.pathname`), and raw connect
// (`url` as a string).
export const requestPathname = function requestPathname (req) {
  return normalizePathname(rawPathname(req));
};

const rawPathname = function rawPathname (req) {
  if (!req) {
    return '/';
  }
  if (typeof req.path === 'string') {
    return req.path;
  }
  if (req.url && typeof req.url.pathname === 'string') {
    return req.url.pathname;
  }
  if (typeof req.url === 'string') {
    try {
      return new URL(req.url, 'http://localhost').pathname;
    } catch (error) {
      return '/';
    }
  }
  return '/';
};

// Should this package render the app document for `pathname`?
//
// Takes the pathname STRING `requestRoutedUrl` produced, not a request object.
// That is deliberate: this decision and the router's own have to be made about
// the same string. While this read the un-normalized request path, a single dot
// segment defeated it — `/x/../sockjs/info` and `/x/../__cordova/y` were
// declined by nobody and rendered as app HTML, while React Router routed
// `/sockjs/info` and `/__cordova/y`.
//
// Note this remains a *syntactic* test against an encoded pathname:
// `/%5F%5Fcordova` does not match `/__cordova`. That direction only ever
// renders the app's catch-all route for a URL that does not exist, and it
// matches how webapp's own `appUrl()` behaves, so it is left alone.
export const isAppUrl = function isAppUrl (pathname) {
  const url = normalizePathname(pathname);

  if (url === '/favicon.ico' || url === '/robots.txt') {
    return false;
  }

  if (url === '/app.manifest') {
    return false;
  }

  if (url.startsWith('/__cordova')) {
    return false;
  }

  // Avoid serving app HTML for declared routes such as /sockjs/.
  if (RoutePolicy.classify(url)) {
    return false;
  }
  return true;
};
