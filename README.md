# React-Router-SSR

Simple isomorphic React SSR for Meteor with subscribed data re-hydration


## Supporting the project

This project is published under the `communitypackages` namespace in hopes that it can become maintained through community effort. For now though it is maintained solely by me (@copleykj) and any support you give helps to fund the development and maintenance of almost 2 dozen Packages for Meteor or for use alongside Meteor.

![Litecoin](http://gdurl.com/xnOe)

[Patreon](https://www.patreon.com/user?u=4866588) / [Paypal](https://www.paypal.me/copleykj)

## Install

First install NPM dependencies

```sh
$ npm install --save react react-dom react-router react-helmet history
```

Then install  `communitypackages:react-router-ssr`

```sh
$ meteor add communitypackages:react-router-ssr
```

## Package Exports

**`renderWithSSR(rootComponent, [options])`** - Isomorphic app rendering.

- `rootComponent` - The component that encompasses your application. Can be any React element. Routers and Switches are handled by the package so those aren't necessary inside your app.

- `options` - An object of rendering options. Currently there is only a single options, but there may be more options in the future.

  - _`store`_ - A redux store. If a store is provided as this option, this package will wrap the Router in a Provider component and pass it the store.

```js
import { renderWithSSR } from 'meteor/communitypackages:react-router-ssr';
```

**`browserHistory`** - This is the history object in the router on the client. The team behind React Router, in all their infinite wisdom, decided to remove access to this in v4 and require you to pass history through props like a f#@%ing hot potato. This allows you to import the history object in a sane manor and use it in the way you have come to know and love :heart:. Enjoy!


## Usage

In shared code, such as in a `/both/main.jsx` file, or in a file that is imported into your `mainModule` for both the client and server..

```js
import { renderWithSSR } from 'meteor/communitypackages:react-router-ssr';
import { withTracker } from 'meteor/react-meteor-data';


import React, { Fragment } from 'react';
import { Route } from 'react-router-dom';

import DashboardPage from './imports/ui/pages/dashbaord';
import ProfilePage from './imports/ui/pages/profile';
import LoginPage from './imports/ui/pages/login';


export default App = ({ user }) => {
  if (user) {
    return (
      <Fragment>
        <Route path="/" component={DashboardPage} />
        <Route path="/profile/:username" component={ProfilePage} />
      <Fragment/>
    );
  }

  return (<LoginPage />);
};

const AppContainer = withTracker(() => ({
    user: Meteor.user(),
}))(App);



renderWithSSR(AppContainer);
```
