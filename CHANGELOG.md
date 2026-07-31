# Change Log

## 7.1.0

A security fix, a denial-of-service fix, and one new export. **All 7.0.x users should
upgrade.**

### Security

- **Any client could choose which route the server rendered, on every route, in every app
  using 7.0.x (and 6.x).** The URL handed to React Router was built by string-concatenating
  request headers:

  ```js
  `${headers['x-forwarded-proto']}://${headers.host}${pathname}${search}`
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
  **Who is affected:** every route of every app on 7.0.x or 6.x. A reverse proxy is **not** a
  mitigation: `x-forwarded-proto` was read as the *first* comma-separated hop, which under the
  usual appending-proxy configuration is the value the client supplied. If a cache sits in
  front of the app, this is also a cache-poisoning primitive.

  Fixed in two independent ways, either of which stops the routing attack on its own:

  1. The scheme and authority derived from headers are now validated. The scheme must be
     `http` or `https`; the host must be a plausible authority (registered name or bracketed
     IPv6 literal, optional port) containing none of `/`, `\`, `#`, `?`, `@`, whitespace or
     control characters. An unusable `Host` falls back to the app's own `ROOT_URL` host
     (`Meteor.absoluteUrl()`), and finally to `localhost`.
  2. The URL is no longer assembled by concatenation. The validated origin is parsed first and
     the path and query are applied with the `URL` object's `pathname`/`search` setters, which
     cannot reach the origin and percent-encode anything that would otherwise re-parse.

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

### Added

- **`requestRoutedUrl(req)`** (server export) — returns the WHATWG `URL` this package's
  renderer will route on for a given request. Accepts a raw connect/express request (as seen
  in `WebApp.handlers` middleware, where webapp has not categorized the request yet) as well
  as an already-categorized webapp request, and reproduces webapp's categorization — fragment
  removal and `/__<arch>` stripping — when needed. `createFetchRequest` now uses this same
  function, so there is exactly one implementation of the derivation.

  This exists because consumer middleware that needs the routed path *before* the renderer
  runs was hand-mirroring the algorithm, and the copy drifted from the package. See
  [the README](README.md#requestroutedurlreq) — please do not reimplement it.

### Misc

- The package now has a test suite: a small Meteor app under `tests/app/` that drives real
  HTTP requests (written as raw bytes onto a socket, so hostile `Host` headers survive) all
  the way through webapp, `renderWithSSR` and React Router, and asserts on the route that
  actually matched. See [Running the tests](README.md#running-the-tests).
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
