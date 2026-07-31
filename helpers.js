import { RoutePolicy } from 'meteor/routepolicy';

// Meteor's webapp passes the *categorized* request to boilerplate data
// callbacks (WebApp.categorizeRequest): the pathname lives at `req.path`
// and `req.url` is `{ query }` — there is no `req.url.pathname` (webapp
// 2.2.0 / Meteor 3.5). Accept every historical shape: categorized
// (`path`), legacy parsed URL (`url.pathname`), and raw connect
// (`url` as a string).
export const requestPathname = function requestPathname (req) {
  return normalize(rawPathname(req));
};

// webapp's `categorizeRequest` strips a leading `/__<arch>` segment, so a
// request for `/__browser` (no trailing slash) arrives here with an *empty*
// pathname. That is not a relative URL: `RoutePolicy.classify('')` throws
// "url must be a relative URL:", which surfaced as a 500 on every request to
// that URL. An empty (or non-absolute) pathname means the site root.
const normalize = function normalize (pathname) {
  if (typeof pathname !== 'string' || pathname === '') {
    return '/';
  }
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
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
    return new URL(req.url, 'http://localhost').pathname;
  }
  return '/';
};

export const isAppUrl = function isAppUrl (req) {
  const url = requestPathname(req);
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
