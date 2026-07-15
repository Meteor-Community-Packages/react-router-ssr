# Change Log

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
