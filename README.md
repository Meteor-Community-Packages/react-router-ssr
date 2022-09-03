# React-Router-SSR

Simple isomorphic React SSR for Meteor with subscribed data re-hydration

## Supporting the project ❤️

This project, like all of the projects maintained by the Meteor Community Packages org, takes time and hard work to keep updated. If you find this or any of our other packages useful, consider visiting the sponsor section of a repo and sending some love to the dedicated developers that keep your favorite packages up to date.

## Upgrades

### Upgrading from v2 to v3

To better align with the default app that is created by the `meteor create` command. This package by default now renders into an element with an id of `react-target` where it used to render to and id of `react-app`, but is also now configurable. If your are upgrading from v2, you will need to either change the id in your html file, or use the `renderTarget` configuration option to set the renderTarget id to `react-app`.

```js
  renderWithSSR(<App />, {
    renderTarget: 'react-app',
  });
```

### Upgrading from v3 to v4

Update to `react-router-dom` to v6

## Install

1. First install NPM dependencies

   ```sh
   npm install --save react react-dom react-router-dom react-helmet
   ```

2. Install `communitypackages:react-router-ssr`

   ```sh
   meteor add communitypackages:react-router-ssr
   ```

> For `react-router-dom` v5 use v3 `communitypackages:react-router-ssr`.
>
> For `react-router-dom` v6 use v4 `communitypackages:react-router-ssr`.

## Package Exports 📦

**`renderWithSSR(rootComponent, [options])`** - Isomorphic app rendering.

- `rootComponent` - The component that encompasses your application. Can be any React element. Routers and Switches are handled by the package so those aren't necessary inside your app.

- `options` - An object of rendering options. Currently there is only a single options, but there may be more options in the future.

  - _`renderTarget`_ - A string specifying the `id` of the element to render your app into. Default is `react-target`

  - _`storeOptions`_ - An object that contains the options for a redux store.

    - `rootReducer` - Your apps root reducer.
    - `initialState` - The initial state.
    - `middlewares` - An array of middlewares to apply.

  ```js
  import { renderWithSSR } from "meteor/communitypackages:react-router-ssr";

  import thunk from "redux-thunk";
  import { createLogger } from "redux-logger";

  import rootReducer from "./reducers/root";

  const logger = createLogger({ diff: true });

  renderWithSSR(<App />, {
    renderTarget: 'react-app',
    storeOptions: {
      rootReducer,
      initialState: { counter: 100 },
      middlewares: [thunk, logger]
    }
  });
  ```

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

```js
import { renderWithSSR } from "meteor/communitypackages:react-router-ssr";
import { useTracker } from "meteor/react-meteor-data";

import React from "react";
import { Route, Routes } from "react-router-dom";
import DashboardPage from "./imports/ui/pages/dashbaord";
import ProfilePage from "./imports/ui/pages/profile";
import LoginPage from "./imports/ui/pages/login";

const App = () => {
  const { user } = useTracker(() => ({
    user: Meteor.user()
  }));
  if (user) {
    return (
      <Routes>
        <Route exact path="/" element={DashboardPage} />
        <Route path="/profile/:username" element={ProfilePage} />
      </Routes>
    );
  }

  return <LoginPage />;
};

renderWithSSR(<App />);
```

## Styled Components 💅

If the [styled-components](https://styled-components.com/) package is installed in your project, this package will detect it is present, create a new `ServerStyleSheet`, collect all styles, and use them to render your app.
