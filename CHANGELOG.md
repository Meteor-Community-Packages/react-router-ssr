# Change Log

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
