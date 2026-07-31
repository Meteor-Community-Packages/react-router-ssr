import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { normalizePathname, requestPathname } from './helpers';

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
//      `.pathname` / `.search`. Those setters cannot reach the origin, and they
//      percent-encode `#`, `?`, spaces and most control characters (CR, LF and
//      TAB are stripped rather than encoded), so no path can escape into the
//      authority or vice versa, however it is spelled.
//
// IMPORTANT, and by design: validation makes the origin *well-formed*, not
// *trustworthy*. A syntactically valid `Host: evil.example` is accepted and
// becomes the origin of the returned URL, because host-routed multi-tenant apps
// depend on that. Treat `.pathname` and `.search` as the trustworthy parts; see
// the README's security note before deriving an absolute URL from `.origin`.
//
// This is exported (see README) precisely so that consumer middleware that needs
// to know the routed path *before* the renderer runs can call it instead of
// hand-mirroring the algorithm. A hand-mirrored copy is how this bug class
// spreads.

// A plausible HTTP authority: a registered name or a bracketed IPv6 literal,
// with an optional port. Deliberately a whitelist. It admits none of `/`, `\`,
// `#`, `?`, `@`, whitespace or control characters — exactly the bytes that let
// a client splice a path, userinfo or fragment into the composed URL.
//
// It is a *syntactic* filter and is knowingly looser than the URL parser: it
// accepts `999.999.999.999`, `1.2.3.4.5`, `4294967296`, `[1.2.3.4]` and
// `host:99999`, all of which `new URL()` rejects. Those land on the same
// ROOT_URL fallback as a regex rejection — see `requestOrigin`.
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
// it is guaranteed to be a real origin for this app. Its *scheme* is used too,
// so the fallback is a coherent origin rather than a mix of ROOT_URL's host and
// a header's scheme — but an explicitly supplied, valid `x-forwarded-proto`
// still wins, because a proxy knows which scheme the client actually used.
//
// `http://localhost` is the last resort, for an unset or unparseable ROOT_URL.
// Unlike the previous behaviour (`http://undefined/…`, or a hard `TypeError:
// Invalid URL` that 500'd the request) it always yields a valid URL, and since
// only the pathname and search reach React Router, the choice of fallback
// origin cannot change which route matches.
const fallbackOrigin = (scheme) => {
  let rootUrl;
  try {
    rootUrl = new URL(Meteor.absoluteUrl());
  } catch (error) {
    rootUrl = new URL('http://localhost');
  }

  const protocol = scheme || rootUrl.protocol.replace(/:$/, '') || 'http';
  try {
    return new URL(`${protocol}://${rootUrl.host}`);
  } catch (error) {
    return new URL(`${protocol}://localhost`);
  }
};

// Build the request's origin as a URL object from validated header parts only.
const requestOrigin = (headers) => {
  // `x-forwarded-proto` is only present when a proxy sets it (Meteor's dev
  // proxy, Galaxy's load balancer, …). When the app server is reached directly
  // it is absent. A chained-proxy value uses the first hop. NOTE that the first
  // hop is also the value a *client* supplies under the usual appending-proxy
  // configuration, so this value is untrusted input even in a normal proxied
  // deployment — a proxy is not a mitigation.
  //
  // Only 'http' and 'https' are accepted. They are the only schemes a request
  // can physically arrive over, the scheme has no effect on routing, and
  // admitting anything else just widens what a header can put in a URL.
  const forwarded = headerValue(headers, 'x-forwarded-proto').split(',')[0].trim().toLowerCase();
  const scheme = (forwarded === 'http' || forwarded === 'https') ? forwarded : '';

  const rawHost = headerValue(headers, 'host').trim();
  if (!HOST_RE.test(rawHost)) {
    return fallbackOrigin(scheme);
  }

  try {
    return new URL(`${scheme || 'http'}://${rawHost}`);
  } catch (error) {
    // HOST_RE is a syntactic filter, not a parser: it accepts authorities the
    // URL parser rejects (`999.999.999.999`, `host:99999`, `[1.2.3.4]`, …).
    // Those have to land on the same fallback as a regex rejection, or the
    // documented "falls back to the ROOT_URL host" promise would hold for only
    // one of the two failure modes.
    return fallbackOrigin(scheme);
  }
};

// The query string, across the request shapes webapp has used (see helpers.js).
//
// Note that the categorized shape carries an already-parsed `url.query` object,
// so the query is *re-serialized* rather than passed through: `?a=b%20c`
// becomes `?a=b+c` and `?flag` becomes `?flag=`. Anything recomputing a
// signature over the raw query string must not use this value. Repeated keys
// are lossy too, in a webapp-version-specific way — webapp 2.2.0 builds the
// object with `Object.fromEntries` and keeps only the last value, while 2.1.2
// (still allowed by this package's `versionsFrom`) comma-joins them. Either way
// this reproduces whatever webapp did, which is the point: what this helper
// reports and what the renderer routes on stay identical.
const requestSearch = (req) => {
  const url = req ? req.url : undefined;
  if (url && typeof url === 'object' && url.query) {
    const qs = new URLSearchParams(url.query).toString();
    return qs ? `?${qs}` : '';
  }
  if (typeof url === 'string') {
    try {
      return new URL(url, 'http://localhost').search;
    } catch (error) {
      return '';
    }
  }
  if (url && typeof url.search === 'string') {
    return url.search;
  }
  return '';
};

// Strip a leading `/__<arch>` segment exactly as webapp's `categorizeRequest`
// does, for the fallback path where we could not call webapp itself. Mirrors
// webapp's logic including the `clientPrograms` membership test (so `/__cordova`
// is only stripped when a cordova program is actually built), but guards the
// undefined-segment case that makes webapp's own version throw.
const stripArchSegment = (pathname) => {
  const parts = pathname.split('/');
  const archKey = parts[1];
  if (typeof archKey !== 'string' || !archKey.startsWith('__')) {
    return pathname;
  }

  const programs = (WebApp && WebApp.clientPrograms) || {};
  if (!Object.prototype.hasOwnProperty.call(programs, `web.${archKey.slice(2)}`)) {
    return pathname;
  }

  parts.splice(1, 1);
  return normalizePathname(parts.join('/'));
};

// webapp's own test for "already categorized". Do NOT use `typeof req.path ===
// 'string'` here: express defines `req.path` as a getter on every raw request,
// so that check silently skips categorization in exactly the middleware case
// this helper exists to serve.
const isCategorized = (req) => Boolean(
  req && req.browser && req.arch && typeof req.modern === 'boolean',
);

// Reproduce webapp's request categorization when the caller has not had it done
// for them. Boilerplate data callbacks receive an already-categorized request;
// `WebApp.handlers` middleware — where a consumer would call this helper — does
// not. Categorization is what drops the `#fragment` and strips a leading
// `/__<arch>` segment, so skipping it would report a different path from the one
// the renderer ultimately routes on.
//
// `WebApp.categorizeRequest` is described by webapp's own source as "a temporary
// hack" and is absent from `@types/meteor`, so it is treated as optional. It
// also throws outright on some inputs — it calls `.startsWith()` on
// `path.split('/')[1]`, which is undefined when the path is empty.
const categorize = (req) => {
  if (isCategorized(req)) {
    return { request: req, categorized: true };
  }
  if (typeof req.url === 'string' && WebApp && typeof WebApp.categorizeRequest === 'function') {
    try {
      const categorized = WebApp.categorizeRequest(req);
      if (categorized && typeof categorized.path === 'string') {
        return { request: categorized, categorized: true };
      }
    } catch (error) {
      // Fall through to reproducing categorization ourselves.
    }
  }
  return { request: req, categorized: false };
};

// Pathname for a request webapp did not categorize for us.
//
// This must NOT fall through to `requestPathname`, whose first check is
// `req.path` — express's un-arch-stripped getter. Degrading to that would make
// the helper report `/__browser/admin` where the renderer routes `/admin`: it
// would fail open into exactly the drift this export exists to prevent. Derive
// from the raw target and strip the arch segment ourselves instead.
const uncategorizedPathname = (req) => {
  let pathname;
  if (typeof req.url === 'string') {
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch (error) {
      pathname = '/';
    }
  } else if (req.url && typeof req.url.pathname === 'string') {
    pathname = req.url.pathname;
  } else {
    pathname = '/';
  }
  return stripArchSegment(normalizePathname(pathname));
};

/**
 * The WHATWG `URL` this package's renderer will route on for a given request.
 *
 * Accepts a raw connect/express request (as seen in `WebApp.handlers`
 * middleware) or an already-categorized webapp request (as passed to
 * boilerplate data callbacks). Does not throw for any input, including `null`.
 *
 * `pathname` and `search` are derived from the request target. `origin` is
 * derived from client-supplied headers and is NOT trustworthy — see the
 * security note in the README.
 *
 * @param {Object} req a Node `IncomingMessage`, or a categorized webapp request
 * @returns {URL} the absolute URL React Router receives
 */
export const requestRoutedUrl = (req) => {
  const source = (req && typeof req === 'object') ? req : {};
  const { request, categorized } = categorize(source);
  const headers = request.headers || source.headers || {};

  const url = requestOrigin(headers);
  // Assignment, not concatenation: these setters are origin-safe by
  // construction and percent-encode anything that would otherwise re-parse.
  url.pathname = categorized ? requestPathname(request) : uncategorizedPathname(request);
  url.search = requestSearch(request);
  url.hash = '';
  return url;
};
