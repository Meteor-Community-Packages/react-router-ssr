# React-Router-SSR

Simple isomorphic React SSR for Meteor with subscribed data re-hydration

## Supporting the project ❤️

This project, like all of the projects maintained by the Meteor Community Packages org, takes time and hard work to keep updated. If you find this or any of our other packages useful, consider visiting the sponsor section of a repo and sending some love to the dedicated developers that keep your favorite packages up to date.

## Install

1. First install NPM dependencies

   ```sh
   npm install --save react@18 react-dom@18 react-router-dom@6 react-helmet@6 abort-controller@3
   ```

2. Install `communitypackages:react-router-ssr`

   ```sh
   meteor add communitypackages:react-router-ssr
   ```

## Package Exports 📦

**`renderWithSSR(routes, [options])`** - Isomorphic app rendering.

- `routes` - A JSX element or array of JSX elements that represent the routes of your app.

- `options` - An object of rendering options.

  - _`renderTarget`_ - A string specifying the `id` of the element to render your app into. Default is `react-target`

  ```js
  import { renderWithSSR } from "meteor/communitypackages:react-router-ssr";

  const AppRoutes = [
    { path: "/", element: <Home /> },
    { path: "/about", element: <About /> },
  ]

  renderWithSSR(AppRoutes, {
    renderTarget: 'react-app',
  });
  ```

**`useSubscribeSuspense(name, ...args)`** - A server enabled version of `react-meteor-data`'s suspendable `useSubscribe` hook. Arguments are same as `Meteor.subscribe`.

## Usage ⚙️

By default this package renders your app into an HTML element with an id of `react-target`, so add one to your main HTML file for your project like so, or specify a different id using the `renderTarget` option

```html
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="ie=edge" />
</head>
<body>
  <div id="react-target"></div>
</body>
```

In shared code, such as in a `/both/main.jsx` file, or in a file that is imported into your `mainModule` for both the client and server..

```jsx
import { renderWithSSR } from "meteor/communitypackages:react-router-ssr";

import React from "react";
import DashboardPage from "./imports/ui/pages/dashbaord";
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
