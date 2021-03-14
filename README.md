# React-Router-SSR

Simple isomorphic React SSR for Meteor with subscribed data re-hydration

## Supporting the project

This project is published under the `communitypackages` namespace in hopes that it can become maintained through community effort. For now though it is maintained solely by me (@copleykj) and any support you give helps to fund the development and maintenance of almost 2 dozen Packages for Meteor or for use alongside Meteor.

![Litecoin](http://gdurl.com/xnOe)

[Patreon](https://www.patreon.com/user?u=4866588) / [Paypal](https://www.paypal.me/copleykj)

## Install

First install NPM dependencies

```sh
$ npm install --save react react-dom react-router react-router-dom react-helmet history
```

Then install `communitypackages:react-router-ssr`

```sh
$ meteor add communitypackages:react-router-ssr
```

## Package Exports

**`renderWithSSR(rootComponent, [options])`** - Isomorphic app rendering.

- `rootComponent` - The component that encompasses your application. Can be any React element. Routers and Switches are handled by the package so those aren't necessary inside your app.

- `options` - An object of rendering options. Currently there is only a single options, but there may be more options in the future.

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
  storeOptions: {
    rootReducer,
    initialState: { counter: 100 },
    middlewares: [thunk, logger]
  }
});
```

**`browserHistory`** - This is the history object in the router on the client. The team behind React Router, in all their infinite wisdom, decided to remove access to this in v4 and require you to pass history through props like a f#@%ing hot potato. This allows you to import the history object in a sane manor and use it in the way you have come to know and love :heart:. Enjoy!

```js
import { browserHistory } from "meteor/communitypackages:react-router-ssr";

browserHistory.replace("/login");
```

## Usage

This package renders your app into an HTML element with an id of `react-app`, so add one to your main HTML file for your project like so.

```html
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="ie=edge" />
</head>
<body>
  <div id="react-app"></div>
</body>
```

In shared code, such as in a `/both/main.jsx` file, or in a file that is imported into your `mainModule` for both the client and server..

```js
import { renderWithSSR } from "meteor/communitypackages:react-router-ssr";
import { withTracker } from "meteor/react-meteor-data";

import React from "react";
import { Route } from "react-router-dom";

import DashboardPage from "./imports/ui/pages/dashbaord";
import ProfilePage from "./imports/ui/pages/profile";
import LoginPage from "./imports/ui/pages/login";

const App = ({ user }) => {
  if (user) {
    return (
      <>
        <Route exact path="/" component={DashboardPage} />
        <Route path="/profile/:username" component={ProfilePage} />
      </>
    );
  }

  return <LoginPage />;
};

const AppContainer = withTracker(() => ({
  user: Meteor.user()
}))(App);

renderWithSSR(<AppContainer />);
```

## Styled Components

If the [styled-components](https://styled-components.com/) package is installed in your project, this package will detect it's presence, create a new `ServerStyleSheet`, collect all styles, and use them to render your app.
