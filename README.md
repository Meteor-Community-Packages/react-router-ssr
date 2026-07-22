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

