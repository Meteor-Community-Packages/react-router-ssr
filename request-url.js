import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { requestPathname } from './helpers';

// The single source of truth for "which URL does the router route on?".
//
// This used to be a two-line string concatenation inside server.jsx, and it was
// a request-routing vulnerability: the scheme came from the client-supplied
// `x-forwarded-proto` header and the authority from the client-supplied `Host`
// header, both spliced unvalidated into `${protocol}://${host}${pathname}${search}`
// before being parsed with `new URL()`. A client could therefore terminate the
// origin early and supply its own path — e.g. `X-Forwarded-Proto:
// http://example.com/pricing#` made every request route `/pricing`, because the
// injected `#` swallowed the real pathname as a fragment.
//
// Two rules follow from that, and both are enforced here:
//
//   1. Validate the header-derived scheme and authority before they are used.
//   2. Never build a URL by concatenating a path onto an origin string. We
//      construct `new URL(origin)` from the validated parts only, then assign
//      `.pathname` / `.search`. Those setters cannot reach the origin and they
//      percent-encode `#`, `?`, whitespace and control characters, so no path
//      can escape into the authority (or vice versa) however it is spelled.
//
// It is exported (see README) precisely so that consumer middleware that needs
// to know the routed path *before* the renderer runs can call this instead of
// hand-mirroring the algorithm. A hand-mirrored copy is how this bug class
// spreads.

// RFC 3986 scheme grammar.
const SCHEME_RE = /^[a-z][a-z0-9+.-]*$/;

// A plausible HTTP authority: a registered name or a bracketed IPv6 literal,
// with an optional port. Deliberately a whitelist. It admits none of `/`, `\`,
// `#`, `?`, `@`, whitespace or control characters — exactly the bytes that let
// a client splice a path, userinfo or fragment into the composed URL.
const HOST_RE = /^(?:\[[0-9A-Fa-f:.]{2,45}\]|[0-9A-Za-z._~-]{1,253})(?::\d{1,5})?$/;

// Node gives a repeated header as a comma-joined string, but be defensive: a
// hand-built request object (or a different server) may hand us an array.
const headerValue = (headers, name) => {
  const value = headers ? headers[name] : undefined;
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : '';
  return typeof value === 'string' ? value : '';
};

// Where a missing or unusable `Host` header lands.
//
// The app's own ROOT_URL is the right answer: it is the origin the app already
// considers canonical (it is what `Meteor.absoluteUrl()` builds every link and
// email URL from), it is operator-configured rather than client-supplied, and
// it is guaranteed to be a real origin for this app. `localhost` is the
// last-resort fallback for the case where ROOT_URL is unset or unparseable —
// unlike the previous behaviour (`http://undefined/…`, or a hard `TypeError:
// Invalid URL` that 500'd the request) it always yields a valid URL, and since
// only the pathname and search reach React Router, the choice of fallback host
// cannot change which route matches.
const fallbackHost = () => {
  try {
    const { host } = new URL(Meteor.absoluteUrl());
    if (HOST_RE.test(host)) {
      return host;
    }
  } catch (error) {
    // ROOT_URL unset or unparseable — fall through.
  }
  return 'localhost';
};

// Build the request's origin as a URL object from validated header parts only.
const requestOrigin = (headers) => {
  // `x-forwarded-proto` is only present when a proxy sets it (Meteor's dev
  // proxy, Galaxy's load balancer, …). When the app server is reached directly
  // it is absent, so default to 'http'; a chained-proxy value uses the first
  // hop. NOTE that the first hop is also the value a *client* supplies under
  // the usual appending-proxy configuration, so this value is untrusted input
  // even in a normal proxied deployment — a proxy is not a mitigation.
  //
  // Only 'http' and 'https' are accepted. They are the only schemes a request
  // can physically arrive over, the scheme has no effect on routing, and
  // admitting anything else just widens what a header can put in a URL.
  const forwarded = headerValue(headers, 'x-forwarded-proto').split(',')[0].trim().toLowerCase();
  const scheme = (SCHEME_RE.test(forwarded) && (forwarded === 'http' || forwarded === 'https'))
    ? forwarded
    : 'http';

  const rawHost = headerValue(headers, 'host').trim();
  const host = HOST_RE.test(rawHost) ? rawHost : fallbackHost();

  try {
    return new URL(`${scheme}://${host}`);
  } catch (error) {
    // Belt and braces: the regex should already guarantee this parses, but an
    // SSR request must never 500 because of a header we chose to distrust.
    return new URL(`${scheme}://localhost`);
  }
};

// The query string, across the request shapes webapp has used (see helpers.js).
//
// Note that the categorized shape carries an already-parsed `url.query` object
// (webapp builds it with `Object.fromEntries`, which keeps only the LAST value
// of a repeated key), so `?a=1&a=2` routes as `?a=2`. That is webapp's
// behaviour, not this package's, and it is preserved here deliberately: the
// helper runs categorization for raw requests too, so what it reports and what
// the renderer routes on stay identical.
const requestSearch = (req) => {
  const { url } = req;
  if (url && typeof url === 'object' && url.query) {
    const qs = new URLSearchParams(url.query).toString();
    return qs ? `?${qs}` : '';
  }
  if (typeof url === 'string') {
    return new URL(url, 'http://localhost').search;
  }
  if (url && typeof url.search === 'string') {
    return url.search;
  }
  return '';
};

// Reproduce webapp's request categorization when the caller has not had it done
// for them. Boilerplate data callbacks receive an already-categorized request;
// `WebApp.handlers` middleware — where a consumer would call this helper — does
// not. Categorization is what drops the `#fragment` and strips a leading
// `/__<arch>` segment, so skipping it would report a different path from the one
// the renderer ultimately routes on.
//
// `WebApp.categorizeRequest` is described by webapp's own source as "a temporary
// hack" and is absent from `@types/meteor`, so it is treated as optional: if it
// is missing or throws, fall back to the raw request shape, which `helpers.js`
// already knows how to read.
// webapp's own test for "already categorized". Do NOT use `typeof req.path ===
// 'string'` here: express defines `req.path` as a getter on every raw request,
// so that check silently skips categorization in exactly the middleware case
// this helper exists to serve — the helper would then report `/__browser/x`
// where the renderer routes `/x`.
const isCategorized = (req) => Boolean(
  req && req.browser && req.arch && typeof req.modern === 'boolean',
);

const categorize = (req) => {
  if (!req || isCategorized(req)) {
    return req;
  }
  if (typeof req.url === 'string' && WebApp && typeof WebApp.categorizeRequest === 'function') {
    try {
      const categorized = WebApp.categorizeRequest(req);
      if (categorized && typeof categorized.path === 'string') {
        return categorized;
      }
    } catch (error) {
      // Fall through to the raw shape.
    }
  }
  return req;
};

/**
 * The WHATWG `URL` this package's renderer will route on for a given request.
 *
 * Accepts a raw connect/express request (as seen in `WebApp.handlers`
 * middleware) or an already-categorized webapp request (as passed to
 * boilerplate data callbacks). Never throws: an unusable header falls back to
 * the app's own ROOT_URL host.
 *
 * @param {Object} req a Node `IncomingMessage`, or a categorized webapp request
 * @returns {URL} the absolute URL React Router receives
 */
export const requestRoutedUrl = (req) => {
  const request = categorize(req);
  const headers = (request && request.headers) || (req && req.headers) || {};

  const url = requestOrigin(headers);
  // Assignment, not concatenation: these setters are origin-safe by
  // construction and percent-encode anything that would otherwise re-parse.
  url.pathname = requestPathname(request);
  url.search = requestSearch(request);
  url.hash = '';
  return url;
};
