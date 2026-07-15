# React-Router-SSR

Simple isomorphic React SSR for Meteor with subscribed data re-hydration

## Supporting the project ❤️

This project, like all of the projects maintained by the Meteor Community Packages org, takes time and hard work to keep updated. If you find this or any of our other packages useful, consider visiting the sponsor section of a repo and sending some love to the dedicated developers that keep your favorite packages up to date.

## Install

1. First install NPM dependencies

   ```sh
   npm install --save react@19 react-dom@19 react-router-dom@6
   ```

   > **React 19 is required.** This package renders and hydrates the whole
   > document, and relies on React 19's native document-metadata hoisting for the
   > `<head>` (see [Managing the document head](#managing-the-document-head)). It
   > will refuse to load on React 18. No `react-helmet` is needed or supported.

2. Install `communitypackages:react-router-ssr`

   ```sh
   meteor add communitypackages:react-router-ssr
   ```

## Upgrading from v5

v6 is a rewrite around React 19 and whole-document rendering. Coming from v5, there are four
changes to make — most are deletions.

1. **Move to React 19.** React 18 is no longer supported (the package won't load on it). Bump
   React and drop two packages v5 required that v6 no longer needs:

   ```sh
   npm install --save react@19 react-dom@19 react-router-dom@6
   npm uninstall react-helmet abort-controller
   ```

   `react-router-dom` stays on v6. `abort-controller` is now bundled by the package, and
   `react-helmet` is replaced by native head management (next).

2. **Replace react-helmet with native document metadata.** v6 renders and hydrates the whole
   document and uses [React 19's metadata hoisting](#managing-the-document-head) instead of
   react-helmet — render `<title>` / `<meta>` directly in your components:

   ```diff
   -import { Helmet } from "react-helmet";
   -
    function ProfilePage() {
      return (
        <>
   -      <Helmet>
   -        <title>Profile</title>
   -      </Helmet>
   +      <title>Profile</title>
          {/* … */}
        </>
      );
    }
   ```

3. **Remove the mount element and static `<head>`.** v6 renders the entire `<html>` document,
   so a `<div id="react-target">` or a hand-written `<head>` in a static HTML file is no longer
   used — delete them. `renderWithSSR` no longer takes an options argument; the `renderTarget`
   option has been removed:

   ```diff
   -renderWithSSR(AppRoutes, { renderTarget: "react-app" });
   +renderWithSSR(AppRoutes);
   ```

4. **Using the Rspack bundler?** Add one bit of server config so react-router isn't duplicated
   during SSR — see [Using with the Rspack bundler](#using-with-the-rspack-bundler).

## Package Exports 📦

**`renderWithSSR(routes)`** - Isomorphic app rendering. Renders and hydrates the whole
`<html>` document, so there is no mount element to configure.

- `routes` - A JSX element or array of JSX elements that represent the routes of your app.

  ```js
  import { renderWithSSR } from "meteor/communitypackages:react-router-ssr";

  const AppRoutes = [
    { path: "/", element: <Home /> },
    { path: "/about", element: <About /> },
  ]

  renderWithSSR(AppRoutes);
  ```

**`useSubscribeSuspense(name, ...args)`** - A server enabled version of `react-meteor-data`'s suspendable `useSubscribe` hook. Arguments are same as `Meteor.subscribe`.

## Usage ⚙️

This package renders and hydrates the **entire `<html>` document** — it produces its own
`<html>`, `<head>`, and `<body>`. You do **not** need a mount element (`<div id="…">`) or a
hand-written `<head>` in a static HTML file; anything you put there is replaced on hydration.
Configure the `<head>` from your components instead — see
[Managing the document head](#managing-the-document-head).

Call `renderWithSSR` from shared code, such as a `/both/main.jsx` file, or a file that is
imported into your `mainModule` for both the client and server.

```jsx
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

renderWithSSR(AppRoutes);
```

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

## Using with the Rspack bundler

If your app uses Meteor's [Rspack bundler](https://docs.meteor.com/about/modern-build-stack/rspack-bundler-integration)
(`@meteorjs/rspack`), one small piece of configuration is required for SSR to work.

Rspack bundles your app's code separately from this Meteor-compiled package, in its own
module registry. That means Rspack bundles its own copy of `react-router`, distinct from the
copy this package loads. React Router shares its routing state through React context, and
React context only works across a *single* shared instance — so with two copies the package's
`<RouterProvider>` / `<StaticRouterProvider>` can't supply context to a `<Link>` / `<NavLink>`
in your components. This breaks **both** builds:

- **Server:** SSR fails with `TypeError: Cannot destructure property 'future' of 'useContext(...)' as it is null`.
- **Client:** after hydration, `<NavLink>` throws and React Router renders its error boundary.

Rspack already externalizes `react` and `react-dom` for exactly this reason — `react-router`
just isn't in its default list. Add it yourself in `rspack.config.js` with Meteor's
[`compileWithMeteor`](https://docs.meteor.com/about/modern-build-stack/rspack-bundler-integration)
helper, which tells Rspack to let Meteor provide these packages at runtime (one shared instance
instead of a bundled duplicate). Apply it to **both** the client and server builds:

```js
const { defineConfig } = require("@meteorjs/rspack");

module.exports = defineConfig((Meteor) => ({
  // Externalize react-router so it isn't duplicated across the Meteor/Rspack build
  // boundary (see above). Needed on both client and server.
  ...Meteor.compileWithMeteor([
    "react-router",
    "react-router-dom",
    "@remix-run/router",
  ]),
}));
```

> This only affects apps using the Rspack bundler. With Meteor's classic bundler your app
> code and this package share one module registry, so there is nothing to configure.

