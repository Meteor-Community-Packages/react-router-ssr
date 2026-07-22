import { FastRender } from 'meteor/communitypackages:fast-render';

import React, { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import { resolveReactRouter } from './resolve-react-router';
import './version-check';

export * from './both';

// React Router is provided by the app (dependency injection) rather than imported by this
// package. The package is compiled by Meteor's package build stack, which cannot consume React
// Router v7+ ESM (it uses `import.meta`); the app's code is bundled by its own bundler (Rspack),
// which handles it fine. Passing the module in also guarantees a single React Router instance
// shared between the app and this package, so there is no duplicate-context/dual-instance issue
// and no bundler externals config is required. See the README.
const renderWithSSR = (routes, { reactRouter } = {}) => {
  const { RouterProvider, createRoutesFromElements, createBrowserRouter } = resolveReactRouter(reactRouter);

  if (!Array.isArray(routes)) {
    routes = createRoutesFromElements(routes);
  }

  const router = createBrowserRouter(routes);

  const styleTagUrls = window.styleTagUrls || [];
  const scriptTagUrls = window.scriptTagUrls || [];

  // Read the encoded inject-data payload back out of the DOM so we can re-render an
  // identical <script> during hydration. The value is URL-safe ASCII, so textContent
  // matches the server output byte-for-byte and whole-document hydration does not mismatch.
  // inject-data has already parsed this node into InjectData._data at Meteor.startup (before
  // FastRender.onPageLoad fires hydrateRoot), so re-rendering it here is inert.
  const injectData = document.querySelector('script[type="text/inject-data"]')?.textContent || '';

  const AppJSX = () => {
    return (
      <html>
        <head>
          {/*
            No <title>/<meta> here — React 19 hoists document metadata rendered by route
            components into <head>, matching what the server streamed. See server.jsx.
          */}
          {scriptTagUrls.map((url, index) => (<script defer type='text/javascript' key={index} src={url} />))}
          {styleTagUrls.map((url, index) => (<link rel='stylesheet' type='text/css' key={index} href={url} />))}
          <script type='text/inject-data' dangerouslySetInnerHTML={{ __html: injectData }} />
        </head>
        <body>
          <StrictMode>
            <RouterProvider router={router} />
          </StrictMode>
        </body>
      </html>
    );
  };

  FastRender.onPageLoad(() => {
    ReactDOM.hydrateRoot(document, <AppJSX />);
  });
};

export { renderWithSSR };
