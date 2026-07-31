# React-Router-SSR

Simple isomorphic React SSR for Meteor with subscribed data re-hydration

## Supporting the project ❤️

This project, like all of the projects maintained by the Meteor Community Packages org, takes time and hard work to keep updated. If you find this or any of our other packages useful, consider visiting the sponsor section of a repo and sending some love to the dedicated developers that keep your favorite packages up to date.

## Install

1. First install NPM dependencies

   ```sh
   npm install --save react@19 react-dom@19 react-router@7
   ```

   > **React 19 and React Router 7 or 8 are required.** Your app imports React Router and passes
   > it to this package (see [Usage](#usage)), so **React Router 7 or 8 both work** — including
   > v8's ESM-only build. This package renders and hydrates the whole document and relies on
   > React 19's native document-metadata hoisting for the `<head>`
   > (see [Managing the document head](#managing-the-document-head)); it will refuse to load on
   > React 18, and `react-helmet` is neither needed nor supported. *(For React Router 6, use
   > `react-router-ssr@6`.)*

2. Install `communitypackages:react-router-ssr`

   ```sh
   meteor add communitypackages:react-router-ssr
   ```

## Upgrading from v6

v7 adds React Router 7 and 8 support (v6 supported React Router 6) and changes how React Router
is supplied to the package — your app now **injects** it. There are three changes:

1. **Move to React Router 7 or 8** and update your app's own imports from `react-router-dom` to
   `react-router` (v7/v8 consolidated everything into the `react-router` package):

   ```sh
   npm uninstall react-router-dom
   npm install --save react-router@7   # or react-router@8
   ```

2. **Pass React Router into `renderWithSSR`.** The package no longer imports React Router
   itself — you inject it. This is what makes React Router 7/8 (including v8's ESM-only build)
   work under Meteor's package build stack, and it guarantees a single shared React Router
   instance:

   ```diff
   +import * as ReactRouter from "react-router";

   -renderWithSSR(AppRoutes);
   +renderWithSSR(AppRoutes, { reactRouter: ReactRouter });
   ```

3. **Remove the Rspack externals config.** If you added `compileWithMeteor([...])` for
   react-router to `rspack.config.js` (required in v6), **delete it** — with injection there is
   one shared React Router instance and nothing to externalize. No bundler configuration is
   needed at all.

If you are still on React Router 6, stay on `react-router-ssr@6`.

## Package Exports 📦

**`renderWithSSR(routes, { reactRouter })`** - Isomorphic app rendering. Renders and hydrates
the whole `<html>` document, so there is no mount element to configure.

- `routes` - A JSX element or array of JSX elements that represent the routes of your app.
- `reactRouter` **(required)** - Your app's React Router module, i.e. the result of
  `import * as ReactRouter from "react-router"`. The package uses the router primitives from
  this module rather than importing React Router itself (see [Usage](#usage) for why).

  ```js
  import * as ReactRouter from "react-router";
  import { renderWithSSR } from "meteor/communitypackages:react-router-ssr";

  const AppRoutes = [
    { path: "/", element: <Home /> },
    { path: "/about", element: <About /> },
  ]

  renderWithSSR(AppRoutes, { reactRouter: ReactRouter });
  ```

**`useSubscribeSuspense(name, ...args)`** - A server enabled version of `react-meteor-data`'s suspendable `useSubscribe` hook. Arguments are same as `Meteor.subscribe`.

**`requestRoutedUrl(req)`** *(server only)* - The URL the renderer will route on for a given
request. See [below](#requestroutedurlreq).

### `requestRoutedUrl(req)`

Returns the WHATWG [`URL`](https://developer.mozilla.org/en-US/docs/Web/API/URL) that this
package hands to React Router for `req`. Server only. Does not throw for any input.

```js
import { WebApp } from "meteor/webapp";
import { requestRoutedUrl } from "meteor/communitypackages:react-router-ssr";

WebApp.handlers.use((req, res, next) => {
  // pathname/search come from the request target and are trustworthy.
  // The ORIGIN comes from the client's Host header and is NOT — see below.
  const url = requestRoutedUrl(req);

  if (url.pathname.startsWith("/admin") && !isAdmin(req)) {
    res.writeHead(302, { Location: "/login" });   // a path, not url.origin + …
    res.end();
    return;
  }

  next();
});
```

It accepts both request shapes:

- a **raw** connect/express request, as your middleware sees it — webapp has not categorized it
  yet, so the helper reproduces categorization itself (dropping the `#fragment` and stripping a
  leading `/__<arch>` segment);
- an **already-categorized** webapp request, as passed to boilerplate data callbacks.

#### What each part of the returned URL is worth

| part | trust | |
| --- | --- | --- |
| `pathname` | trustworthy | may legitimately begin with `//` — see below |
| `search` | trustworthy but **normalized** | a re-serialization, not raw bytes — see below |
| `origin`, `host`, `protocol`, `href` | **not trustworthy** | derived from client headers — see below |

**`search` is a re-serialization, not the request's query string.** It is rebuilt from the
query object webapp parsed, so `?a=b%20c&flag` comes back as `?a=b+c&flag=`. Repeated keys are
lossy, in a webapp-version-dependent way: `?a=1&a=2` becomes `?a=2` on webapp 2.2.0 (which
builds the object with `Object.fromEntries`) but `?a=1%2C2` on 2.1.2 (which comma-joins). That
is faithful to what the renderer routes on — which is the whole point of this helper — but
**never recompute a signature or HMAC over it**; read `req.url` if you need the raw bytes.

#### Security: the origin is client-supplied, by design

**`pathname` is trustworthy. `origin`, `host` and `href` are not.**

This package deliberately derives the origin from the request's `Host` and `X-Forwarded-Proto`
headers, because host-routed multi-tenant apps have to be able to see which host was asked
for. Since 7.1.0 those headers can no longer inject a *path* (see the
[changelog](CHANGELOG.md#710)), but a syntactically valid host is still taken at face value:

```http
GET /events/e1 HTTP/1.1
Host: evil.example
```

gives `requestRoutedUrl(req).origin === "http://evil.example"`, and the same value reaches
`request.url` inside your React Router loaders and actions. Treat it as attacker input:

- **Do not redirect to an absolute URL built from it.** React Router's common idiom
  `redirect(new URL("/login", request.url))` becomes an open redirect to the attacker's host.
  Redirect to a path — `redirect("/login")` — or pin the origin explicitly with
  `new URL("/login", Meteor.absoluteUrl())`, or check the host against an allow-list first.
- **The same applies** to canonical `<link>` tags, `og:url`, absolute asset URLs, signed
  callback URLs and anything else derived from the origin.
- **`pathname` can begin with `//`.** `GET //evil.example/x` legitimately routes with
  `pathname === "//evil.example/x"`, so redirecting to a bare `url.pathname` yields a
  protocol-relative open redirect. Prefix-check or normalise before using it as a `Location`.

If your app is not host-routed, the simplest rule is to ignore the origin entirely and build
absolute URLs from `Meteor.absoluteUrl()`.

Two more things worth knowing when you assess exposure:

- **`X-Forwarded-Host` is not consulted, anywhere.** The origin comes from `Host` only.
  Honouring `X-Forwarded-Host` would hand a second, even less constrained header control of
  the origin, so it is deliberately ignored — but that means host passthrough only works if
  your proxy *rewrites* `Host`. Behind a proxy that keeps its own `Host` and forwards the
  original in `X-Forwarded-Host`, your app sees the proxy's internal authority, silently. If
  you need that value, read the header yourself and check it against your own allow-list.
- **The scheme** comes from `X-Forwarded-Proto` when it is `http` or `https`, and otherwise
  from your app's `ROOT_URL` — not from a hardcoded `http`. An https app behind a terminator
  that sets no `X-Forwarded-Proto` therefore still gets `https://` URLs.

#### Where the origin comes from, exactly

1. **Scheme** — the first comma-separated hop of `X-Forwarded-Proto` if it is exactly `http`
   or `https`; otherwise `ROOT_URL`'s scheme; otherwise `http`.
2. **Host** — the `Host` header, if it is a plausible authority (registered name or bracketed
   IPv6 literal, optional port, and none of `/ \ # ? @`, whitespace or control characters)
   *and* `new URL()` accepts it. Otherwise `ROOT_URL`'s host, and finally `localhost`.

The path and query are then applied with the `URL` object's `pathname`/`search` setters, never
by string concatenation, so no part of the path can reach the authority.

#### Why you should not reimplement this

Deriving the routed URL looks like two lines of string handling, and it is not. It has to pick
the pathname out of three different request shapes webapp has used over time, reproduce
webapp's own categorization, keep the query string, and — most importantly — refuse to let the
client-supplied `Host` and `X-Forwarded-Proto` headers put a path into the URL. Getting that
last part wrong is not a cosmetic bug: it lets any client choose which route your server
renders (this package shipped exactly that bug through 7.0.1; see the
[changelog](CHANGELOG.md#710)).

A hand-written copy in an app also *drifts*. If your middleware decides on one pathname and the
renderer routes another, you get authorization checks and redirects that apply to a different
URL than the one that is actually rendered — a class of bug that survives code review because
both halves look correct in isolation. `createFetchRequest` inside this package calls
`requestRoutedUrl` too, so calling it from your app is the only way to be sure you are asking
the same question the renderer answers.

## Usage

This package renders and hydrates the **entire `<html>` document** — it produces its own
`<html>`, `<head>`, and `<body>`. You do **not** need a mount element (`<div id="…">`) or a
hand-written `<head>` in a static HTML file; anything you put there is replaced on hydration.
Configure the `<head>` from your components instead — see
[Managing the document head](#managing-the-document-head).

**Import React Router in your app and pass it to `renderWithSSR`.** Call it from shared code,
such as a `/both/main.jsx` file, or a file imported into your `mainModule` for both the client
and server.

```jsx
import * as ReactRouter from "react-router";
import { renderWithSSR } from "meteor/communitypackages:react-router-ssr";

import React from "react";
import DashboardPage from "./imports/ui/pages/dashboard";
import ProfilePage from "./imports/ui/pages/profile";
import LoginPage from "./imports/ui/pages/login";

const AppRoutes = [
  { path: "/", element: <DashboardPage /> },
  { path: "/profile/:username", element: <ProfilePage /> },
  { path: "/login", element: <LoginPage /> },
];

// Alternatively you can use a JSX fragment
// const AppRoutes = (
//   <>
//     <Route path="/" element={<DashboardPage />} />
//     <Route path="/profile/:username" element={<ProfilePage />} />
//     <Route path="/login" element={<LoginPage />} />
//   </>
// );

renderWithSSR(AppRoutes, { reactRouter: ReactRouter });
```

### Why does my app pass React Router in?

Meteor packages are compiled by Meteor's package build stack, which cannot consume React Router
7/8's ESM (it uses `import.meta`). Your app's code, however, is bundled by your app's bundler
(e.g. Rspack), which handles it fine. So instead of importing React Router itself, this package
takes the module you import in your app. A useful side effect: there is then only ever **one**
React Router instance (your app's), shared with the package by reference — so there is no
duplicate-context problem and **no bundler externals configuration is required**.

## Managing the document head

This package renders the entire `<html>` document and hydrates it with
`hydrateRoot(document, …)`. It deliberately does **not** render a `<title>` or
any `<meta>` tags of its own — instead it relies on
[React 19's native document metadata support](https://react.dev/reference/react-dom/components/title):
any `<title>`, `<meta>`, or `<link>` you render from a route or component is
hoisted into `<head>` automatically, on the server and on the client. This
replaces `react-helmet` entirely.

Just render the tags where it's convenient — typically at the top of each page
component:

```jsx
function ProfilePage() {
  const { username } = useParams();

  return (
    <>
      <title>{`${username} · MyApp`}</title>
      <meta name="description" content={`Profile page for ${username}`} />
      {/* …page content… */}
    </>
  );
}
```

During SSR the correct title/meta are streamed into the served HTML, and on
client-side navigation React updates them as the matched route changes — no
extra library or provider required.

## Bundler configuration

**None is required.** Because your app imports React Router and passes it in (see
[Usage](#usage)), there is a single React Router instance shared between your app and this
package, so there is nothing to deduplicate or externalize — this works with Meteor's Rspack
bundler and the classic bundler alike.

> Upgrading from v6? v6 required a `compileWithMeteor([...])` externals block in
> `rspack.config.js` to share a single react-router copy. With injection that's no longer
> needed — **delete it.**

### CSS under the Rspack bundler

If your app's CSS goes through Rspack (e.g. Tailwind via a `postcss-loader` rule, as in
Meteor's `--tailwind` skeleton), the Rspack integration delivers the compiled stylesheet as a
`<link>` in the boilerplate head fragment, which it contributes through `static-html`. This
package carries those links into the rendered document (since 7.0.1), but the fragment has to
exist for that to work: **keep the `static-html` package and a `client/main.html`** — an empty
`<head></head>` is enough. Everything else in that file is replaced by the rendered document,
so don't put content there; manage the head from your components instead (see
[Managing the document head](#managing-the-document-head)).

## Running the tests

The suite lives in a small Meteor application under `tests/app/`, which resolves this package
from the checkout through the symlink at `tests/app/packages/react-router-ssr`. `meteor
test-packages` cannot be used here: React Router 7/8 is not (and deliberately cannot be) an
`Npm.depends` of this package, so the tests need a real app to inject it.

```sh
cd tests/app
meteor npm install     # once
meteor npm test
```

That runs:

```sh
TEST_CLIENT=0 TEST_SERVER=1 meteor test --full-app --once \
  --port 3737 --driver-package meteortesting:mocha
```

Every test starts from a real socket, because the bugs they cover are invisible to a unit test
of an exported function. Hostile requests are written as raw bytes, since `fetch` and
`http.request` both refuse to send a `Host` header containing `/`.

Most tests then go all the way through webapp → `renderWithSSR` → React Router and assert on
the route that actually matched. The `requestRoutedUrl` tests are different: they call the
export from `WebApp.handlers` middleware — the way a consumer does — and terminate there
without reaching the renderer. A dedicated cross-check drives both paths for the same targets
and asserts they agree on pathname, search, origin and href, which is what makes the middleware
tests meaningful.

> **Note:** a Meteor boot failure prints `0 passing` with no failures, which reads as green.
> Always check the *count* — as of 7.1.0 the suite is **73 passing**.

### What the suite does not cover

- **Nothing on the client.** `TEST_CLIENT=0` is hard-coded in the script, so hydration,
  `hydrateRoot(document, …)`, client-side navigation and the `useSubscribeSuspense` client path
  are all unexercised; `TEST_CLIENT=1` would need a browser driver package that is not
  installed. Server rendering, request handling and URL derivation are covered; hydration is
  not.
- **Only recent Meteor releases.** The suite is run on **Meteor 3.5** (webapp 2.2.0) and
  **Meteor 3.4.1** (webapp 2.1.2) — 73 passing on both, which is what gives the
  webapp-version-dependent query behaviour described above real coverage.

  ⚠️ **`package.js` declares `api.versionsFrom('METEOR@3.0.1')`, and that floor does not
  work.** On METEOR@3.0.1 (webapp 2.0.4) `renderWithSSR` renders no app markup at all: the
  suite reports 23 passing / 50 failing on 7.1.0, and 5 passing / 68 failing on 7.0.1, so this
  predates 7.1.0 rather than being caused by it. The true minimum lies somewhere above 3.0.1
  and at or below 3.4.1; it has not been pinned down, because the intermediate releases could
  not be built in this environment. Treat 3.4.1 as the lowest *verified* release.

`meteor test` and a running dev server cannot share the app directory, so stop one before
starting the other.
