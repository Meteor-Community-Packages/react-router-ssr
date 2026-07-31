# Change Log

## 7.1.0

A security fix, a denial-of-service fix, and one new export. **Every release from 5.0.0
onward is affected by the security issue below; all of them should upgrade.**

### Security

- **Any client could choose which route the server rendered, on every route, in every
  affected app.** The URL handed to React Router was built by string-concatenating request
  headers:

  ```js
  // 6.0.0, 7.0.0, 7.0.1 — verbatim
  const forwardedProto = headers['x-forwarded-proto'];
  const protocol = (forwardedProto ? forwardedProto.split(',')[0].trim() : '') || 'http';
  const baseUrl = `${protocol}://${headers.host}`;
  const newUrl = new URL(`${baseUrl}${pathname}${search}`);
  ```

  Neither header was validated, so a client could close the origin early and append its own
  path. `new URL()` then parsed the result and the injected path won:

  ```http
  GET /events/some-event HTTP/1.1
  Host: app.example.com
  X-Forwarded-Proto: http://app.example.com/pricing#
  ```

  The `#` swallowed the real pathname as a fragment, so the server rendered `/pricing` while
  the client had asked for `/events/some-event`. `Host: app.example.com/pricing` does the same
  thing, as do backslash and percent-encoded spellings (`/%70ricing`).

  **What an attacker controls:** the `X-Forwarded-Proto` and `Host` request headers.
  **What they get:** the pathname the server-side router matches — for *any* request target,
  including authenticated and tokenised URLs. The server-rendered document, its status code,
  and anything a route loader derives from `request.url` all come from the injected path.
  A reverse proxy is **not** a mitigation: `x-forwarded-proto` was read as the *first*
  comma-separated hop, which under the usual appending-proxy configuration is the value the
  client supplied. If a shared cache sits in front of the app, this is also a cache-poisoning
  primitive: the rendered document depended on `Host` and `X-Forwarded-Proto`, and the
  response never listed either in `Vary`, so the attacker's variant could be stored under the
  victim's URL.

  **Affected versions: every published release from 5.0.0 through 7.0.1**, i.e. `5.0.0`,
  `6.0.0-beta.1`, `6.0.0-beta.2`, `6.0.0`, `7.0.0` and `7.0.1`. The header-derived base URL
  arrived in 5.0.0 with the switch to React Router 6 data routers. There are two spellings of
  it, and **the exposure differs between them — check which one you are on**:

  | versions | base URL expression | `X-Forwarded-Proto` steers? | `Host` **alone** steers? |
  | --- | --- | --- | --- |
  | `5.0.0`, `6.0.0-beta.1`, `6.0.0-beta.2` | `${protocol ? '${protocol}:' : ''}//${host}` | **yes** | **yes, whenever any single-scheme `X-Forwarded-Proto` is present** — i.e. behind essentially any reverse proxy. Only when the header is absent entirely, or holds a comma-joined value, does the URL fail to parse and 500 instead |
  | `6.0.0`, `7.0.0`, `7.0.1` | `${protocol}://${host}` | **yes** | **yes, unconditionally** — the `'http'` default means no header is needed at all |

  Two things to be clear about, because getting either wrong leads to a wrong exposure
  assessment:

  - **`6.0.0` — the current published 6.x — behaves like 7.0.x, not like the 6.0.0 betas.** It
    already carries the `${protocol}://${host}` form with the `'http'` default.
  - **Normalising `X-Forwarded-Proto` at your edge is not a mitigation on any affected
    version, and on `5.0.0`/`6.0.0-beta.x` it is what *enables* the `Host`-only attack.** On
    those versions a bare `Host: app.example.com/pricing#` with no `X-Forwarded-Proto` throws
    and 500s — but add the entirely ordinary `proxy_set_header X-Forwarded-Proto $scheme` that
    nginx, Galaxy's load balancer, an ALB, Cloudflare and Meteor's own dev proxy all set, and
    the same request steers the route cleanly. On `6.0.0`/`7.0.x` it works with or without any
    proxy. Only *stripping* the header entirely produces the 500, and only on 5.0.0/6.0.0-beta.

  Backslash (`Host: app.example.com\pricing#`) and percent-encoded (`/%70ricing#`) spellings
  work on every affected version.

  **1.x–4.x are not affected**: they passed the request path straight to `StaticRouter` and
  never derived an origin from request headers. (Verified by grepping every published tag from
  `v1.0.0` to `v4.0.0` for any use of `x-forwarded-*` or `headers.host`: none.)

  Fixed in two independent ways, either of which stops the routing attack on its own:

  1. The scheme and authority derived from headers are now validated. The scheme must be
     `http` or `https`; the host must be a plausible authority (registered name or bracketed
     IPv6 literal, optional port) containing none of `/`, `\`, `#`, `?`, `@`, whitespace or
     control characters. An unusable `Host` — whether it fails that filter or is merely
     something `new URL()` rejects, such as `999.999.999.999` or `host:99999` — falls back to
     the app's own `ROOT_URL` origin (`Meteor.absoluteUrl()`), and finally to
     `http://localhost`. A valid `x-forwarded-proto` still overrides the fallback's scheme.
  2. The URL is no longer assembled by concatenation. The validated origin is parsed first and
     the path and query are applied with the `URL` object's `pathname`/`search` setters, which
     cannot reach the origin and percent-encode anything that would otherwise re-parse.

- **What this fix does NOT do — read this if you build absolute URLs.** Validation makes the
  origin *well-formed*, not *trustworthy*. A syntactically valid but foreign `Host` is still
  accepted verbatim and becomes the origin of the URL the renderer routes on:

  ```http
  GET /events/e1 HTTP/1.1
  Host: evil.example
  ```

  still yields a `request.url` whose host is `evil.example` inside your route loaders (the
  scheme comes from `x-forwarded-proto` or `ROOT_URL` — see *Changed* below), and the same
  from `requestRoutedUrl(req).origin`. This is **by design** — host-routed
  multi-tenant apps must be able to see the requested host, and pinning the origin to
  `ROOT_URL` would break them — but it means the origin is attacker-controlled input.

  Consequences to guard against in your own code:

  - React Router's usual idiom `redirect(new URL("/login", request.url))` produces an
    absolute redirect to the attacker's host. Redirect to a path (`redirect("/login")`), or
    pin the origin yourself (`new URL("/login", Meteor.absoluteUrl())`), or allow-list the
    host before trusting it.
  - The same applies to canonical `<link>` tags, `og:url`, absolute asset URLs and anything
    else you derive from `request.url` or `requestRoutedUrl(req).origin`.
  - `pathname` can legitimately begin with `//`: `GET //evil.example/x` routes with
    `pathname === "//evil.example/x"`. Redirecting to a bare `url.pathname` therefore gives a
    protocol-relative open redirect. (The renderer and `requestRoutedUrl` agree on this
    value, so it is not drift — but it is a sharp edge.)
  - **`X-Forwarded-Host` is not consulted, anywhere.** The origin comes from `Host` only.
    That is the deliberate security choice — honouring `X-Forwarded-Host` would hand a second,
    even less constrained header control of the origin — but it means host passthrough only
    works if your proxy *rewrites* `Host`. Behind a proxy that preserves its own `Host` and
    forwards the original in `X-Forwarded-Host`, the app silently sees the proxy's internal
    authority instead of the requested one. If you need that value, read the header yourself,
    against your own allow-list.
  - **`search` is a normalized re-serialization, not the raw query bytes.** It is rebuilt from
    the query object webapp parsed, so `?a=b%20c&flag` comes back as `?a=b+c&flag=`. Repeated
    keys are lossy in a webapp-version-dependent way: `?a=1&a=2` becomes `?a=2` on webapp
    2.2.0 (which uses `Object.fromEntries`) but `?a=1%2C2` on 2.1.2 (which comma-joins).
    Never recompute a signature or HMAC over this value — read `req.url` for raw bytes.
  - **`isAppUrl()`'s decline rules are matched against the encoded pathname.** `/__cordova/x`
    is declined but `/%5F%5Fcordova/x` is not; it renders the app's catch-all route instead.
    That direction only ever serves the catch-all for a URL that does not exist, and it
    matches how webapp's own `appUrl()` behaves, so it is left as is — but if you rely on
    `RoutePolicy.declare()` to keep app HTML off a prefix, know that the check is syntactic.

  Treat `pathname` as the trustworthy output, `search` as trustworthy-but-normalized, and the
  origin as untrusted.

### Changed

- **The scheme of the URL your loaders see now comes from `ROOT_URL` when the request carries
  no usable `x-forwarded-proto`.** Through 7.0.1 it was hardcoded to `http`. A valid
  `x-forwarded-proto` (`http` or `https`, first hop) still wins, and the host is unaffected —
  this only changes the scheme, and only on requests where the header is absent or unusable.

  **This changes `request.url` for existing apps.** If `ROOT_URL` is `https://…` and your
  Meteor process is reached over plain HTTP by something that sets no `x-forwarded-proto` — a
  TCP-passthrough load balancer, an Ingress without the header, a health check, a sidecar —
  then every value derived from `request.url` flips from `http:` to `https:` on upgrade.
  Check any loader or action that builds a *fetchable* URL from it, e.g.
  `fetch(new URL("/api/internal", request.url))`: that call now goes out over https and will
  fail if the port behind the terminator only speaks http. Absolute URLs emitted into HTML
  (canonical links, `og:url`) get *more* correct, which is the reason for the change — an
  https site was previously advertising `http://` URLs to crawlers.

  If you need the old behaviour, have your proxy set `X-Forwarded-Proto: http` explicitly.

### Fixed

- **Unauthenticated denial of service: `GET /__cordova/<anything>` hung the socket forever.**
  Unless a mobile platform has been added, `web.cordova` is not in `clientPrograms`, so webapp
  does not strip the `/__cordova` segment and the package's `isAppUrl()` declines the request.
  The render callback then returned without responding — and because
  `WebAppInternals.disableBoilerplateResponse()` is in effect, webapp never sends a body
  either. Nothing ended the response, so every such request pinned a connection until the
  socket timeout: trivial socket exhaustion, no authentication required. The same held for any
  other path `isAppUrl()` declines that still reaches the render callback, such as
  `/app.manifest?v=2`. Declined requests are now answered with `404 Not Found` and
  `Cache-Control: no-store`.
- **`GET /__browser` (no trailing slash) returned a 500.** webapp's `categorizeRequest` strips
  the `/__browser` segment and leaves an *empty* pathname, and `RoutePolicy.classify('')`
  throws `url must be a relative URL:`. An empty or non-absolute pathname is now normalised to
  `/`, so the URL renders the root route like `/__browser/` always did.
- **A dot segment defeated every "don't serve app HTML here" rule.** `isAppUrl()` decided from
  the raw request path while React Router routed the *normalized* one, so `/x/../sockjs/info`
  and `/./sockjs/info` were served the app document with `location.pathname` of
  `/sockjs/info`, and `/x/../__cordova/y` likewise. Any route an operator had declared with
  `RoutePolicy` — `/sockjs/`, or an app's own `/internal-api/` — could be dressed up this way
  and answered with app HTML. Both decisions are now made from the single pathname
  `requestRoutedUrl` produces. (Present since at least 6.0.0; not introduced by this release.)

### Added

- **`requestRoutedUrl(req)`** (server export) — returns the WHATWG `URL` this package's
  renderer will route on for a given request. Accepts a raw connect/express request (as seen
  in `WebApp.handlers` middleware, where webapp has not categorized the request yet) as well
  as an already-categorized webapp request, and reproduces webapp's categorization — fragment
  removal and `/__<arch>` stripping — when needed. `createFetchRequest` now uses this same
  function, so there is exactly one implementation of the derivation.

  This exists because consumer middleware that needs the routed path *before* the renderer
  runs was hand-mirroring the algorithm, and the copy drifted from the package. See
  [the README](README.md#requestroutedurlreq) — please do not reimplement it, and read the
  security note there before using its `origin`.

### Packaging

- **The published isopack no longer contains the repo's `node_modules` or test app.** Meteor's
  package source walk (unlike an app's) excludes neither, and adds every file it finds as a
  lazy module: built from a working tree with dev dependencies installed, the isopack was
  roughly 150 MB and 167 source resources, instead of well under a megabyte
  and the 7 files this package actually ships. Previously the only thing keeping that
  out of a release was the `rimraf ./node_modules` in the `publish-release` npm script. A
  `.meteorignore` now excludes both, so a correct result no longer depends on remembering to
  publish through that one script — `rimraf` stays as a second line of defence on an
  irreversible action.

### Misc

- The package now has a test suite: a small Meteor app under `tests/app/` that drives real
  HTTP requests, written as raw bytes onto a socket so that hostile `Host` headers survive.
  Most of them go through webapp, `renderWithSSR` and React Router and assert on the route
  that actually matched; the `requestRoutedUrl` tests instead call the export from
  `WebApp.handlers` middleware, as a consumer would, and a cross-check asserts the two agree.
  See [Running the tests](README.md#running-the-tests) for what is and is not covered.
- `webapp` and `routepolicy` are now declared explicitly in `package.js` instead of being
  relied on transitively.

## 7.0.1

Compatibility fixes for Meteor 3.5 (webapp 2.2.0) and the Rspack bundler. No API changes.

### Fixed

- **SSR 500 on every request under Meteor 3.5.** webapp now passes the *categorized* request
  to boilerplate data callbacks: the pathname lives at `req.path` and `req.url` is
  `{ query }` — `req.url.pathname` no longer exists. `isAppUrl` and the router's fetch-request
  construction now accept all request shapes (categorized, legacy parsed URL, raw string) and
  preserve the query string, which was previously dropped even on older webapp versions.
- **Unstyled pages under the Rspack bundler.** Meteor's Rspack integration delivers the app's
  compiled CSS as a `<link>` in the boilerplate *head fragment* (contributed via
  `static-html`), not in the css manifest this package rendered from — so the SSR'd document
  dropped it and the app rendered with no styles at all (in development the link points at the
  Rspack dev server; in production at the emitted css chunk). Stylesheet links found in the
  boilerplate head fragment are now carried into the rendered `<head>` and into the client's
  `window.styleTagUrls` hydration config, so server and client markup stay identical.
  Rspack apps must keep `static-html` (and a `client/main.html`; an empty `<head></head>` is
  enough) so the integration has a head fragment to deliver the link through.
- **Hydration mismatch warning for `<html>` attributes.** Apps legitimately set attributes on
  `<html>` (theming's `data-theme`/`data-org`, `lang`) from inline scripts that run before
  hydration. React 19 leaves unknown attributes in place, so the warning was pure noise —
  suppressed via `suppressHydrationWarning` on the package-rendered `<html>` element.

## 7.0.0

Adds **React Router 7 and 8** support (including v8's ESM-only build) by having the app inject
React Router into the package. See the
[Upgrading from v6](README.md#upgrading-from-v6) section of the README.

### Breaking changes

- **React Router is now provided by the app**, not imported by the package. `renderWithSSR`
  takes it as an option:

  ```diff
  +import * as ReactRouter from "react-router";
  -renderWithSSR(routes);
  +renderWithSSR(routes, { reactRouter: ReactRouter });
  ```

  Meteor's package build stack cannot consume React Router 7/8's ESM (`import.meta`), but your
  app's bundler can — so the package no longer imports React Router itself. This is what makes
  React Router 7/8 work, and it guarantees a single shared React Router instance.
- **React Router 7 or 8 is required** (was React Router 6). Update your app's imports from
  `react-router-dom` to `react-router`. React Router 6 users should stay on `react-router-ssr@6`.

### Removed

- **No bundler externals configuration is needed anymore.** v6 required a
  `compileWithMeteor(["react-router", …])` block in `rspack.config.js` to avoid duplicate
  react-router copies; with injection there is a single shared instance, so that config should
  be deleted.
- The `react-router` npm-version check was dropped — the package is now agnostic to which React
  Router major the app injects (it still requires React 19).

## 6.0.0

A rewrite around React 19 and whole-document server rendering. See the
[Upgrading from v5](README.md#upgrading-from-v5) section of the README for a migration guide.

### Breaking changes

- **React 19 is now required** (previously React 18). The package renders and hydrates the
  whole `<html>` document and relies on React 19's native document-metadata hoisting; it will
  refuse to load on React 18.
- **`react-helmet` is no longer used or needed.** Manage `<title>`/`<meta>`/`<link>` by
  rendering them from your route/page components — React 19 hoists them into `<head>` on both
  the server and the client. See "Managing the document head" in the README.
- **The `renderTarget` option has been removed.** The package now renders and hydrates the
  entire document (`hydrateRoot(document, …)`), so there is no mount element to configure and
  no `<div id="react-target">` is required. `renderWithSSR(routes)` takes no options object.
- `react-router-dom` v6 is still required; `react` and `react-dom` must be v19.

### Features

- Whole-document isomorphic rendering: the server streams a complete `<html>` document with
  `renderToPipeableStream` and the client hydrates it with `hydrateRoot(document, …)`.
- Subscription-data re-hydration via `communitypackages:fast-render@5.0.0` (using its new
  `onPageLoadWithoutSink` flow) and `communitypackages:inject-data@3.0.0`. Use the exported
  `useSubscribeSuspense(name, ...args)` in your components.
- Support for Meteor's Rspack bundler (`@meteorjs/rspack`). The app's client bundle is loaded
  correctly during development, and duplicate-`react-router` issues are avoided by externalizing
  it — see "Using with the Rspack bundler" in the README.

### Fixes

- Fixed a production-only 500 (`TypeError: Invalid URL`) when the incoming request has no
  `x-forwarded-proto` header (a directly-run production bundle or a platform health check). The
  SSR base URL now defaults its scheme to `http` and handles chained-proxy header values.

### Misc

- `abort-controller` is now bundled by the package, so apps no longer need to install it.
