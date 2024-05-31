import { FastRender } from 'meteor/communitypackages:fast-render';

import React, { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createRoutesFromElements, createBrowserRouter } from 'react-router-dom';

import './version-check';

const renderWithSSR = (routes, { renderTarget = 'react-target' } = {}) => {
  if (!Array.isArray(routes)) {
    routes = createRoutesFromElements(routes);
  }

  const router = createBrowserRouter(routes);

  const AppJSX = <StrictMode><RouterProvider router={router} /></StrictMode>;

  FastRender.onPageLoad(() => {
    ReactDOM.hydrateRoot(document.getElementById(renderTarget), AppJSX);
  });
};

export { renderWithSSR };
