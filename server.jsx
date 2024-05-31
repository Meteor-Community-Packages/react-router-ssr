import { FastRender } from 'meteor/communitypackages:fast-render';
import { Headers, Request } from 'meteor/fetch';

import React, { StrictMode } from 'react';
import { Helmet } from 'react-helmet';
import { createRoutesFromElements } from 'react-router-dom';
import { StaticRouterProvider, createStaticHandler, createStaticRouter } from 'react-router-dom/server';
import { renderToString } from 'react-dom/server';
// these 2 imports just silence warnings from the check-npm-versions package because the
// imports above have / server at the end and meteor won't bundle the package.json file for these.
import 'react-dom';
import AbortController from 'abort-controller';
import { isAppUrl } from './helpers';
import './version-check';

const helmetTags = [
  'base',
  'meta',
  'link',
  'script',
  'style',
  'title',
  'noscript',
];

export const renderWithSSR = (routes, { renderTarget = 'react-target' } = {}) => {
  if (!Array.isArray(routes)) {
    routes = createRoutesFromElements(routes);
  }

  const handler = createStaticHandler(routes);

  FastRender.onPageLoad(async sink => {
    if (!isAppUrl(sink.request)) {
      return;
    }

    const fetchRequest = createFetchRequest(sink);
    const context = await handler.query(fetchRequest);

    const router = createStaticRouter(
      handler.dataRoutes,
      context,
    );

    const AppJSX = <StrictMode><StaticRouterProvider router={router} context={context} /></StrictMode>;

    const renderedString = renderToString(AppJSX);

    sink.renderIntoElementById(renderTarget, renderedString);

    const helmet = Helmet.renderStatic();
    helmetTags.forEach(tag => {
      sink.appendToHead(helmet[tag].toString());
    });
  });
};

function createFetchRequest (sink) {
  const sinkHeaders = sink.getHeaders();
  const url = sink.request.url;

  const headers = new Headers();

  for (const [key, values] of Object.entries(sinkHeaders)) {
    if (values) {
      if (Array.isArray(values)) {
        for (const value of values) {
          headers.append(key, value);
        }
      } else {
        headers.set(key, values);
      }
    }
  }

  const controller = new AbortController();

  const init = {
    method: 'GET',
    headers,
    signal: controller.signal,
  };

  const href = url.href;
  const host = sinkHeaders['x-forwarded-host'];
  const proto = sinkHeaders['x-forwarded-proto'];

  const newUrl = new URL(`${proto}://${host}${href}`);
  return new Request(newUrl, init);
};
