/* eslint-disable react/prop-types */
import { FastRender } from 'meteor/communitypackages:fast-render';

import React from 'react';
import { Helmet } from 'react-helmet';
import { StaticRouter } from 'react-router';
import ReactDom from 'react-dom'; // eslint-disable-line no-unused-vars
import { renderToString } from 'react-dom/server';

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

let Provider;
let applyMiddleware;
let createStore;
let ServerStyleSheet;

/* eslint-disable */
try {
  ({ Provider } = require('react-redux'));
  ({ createStore, applyMiddleware } = require('redux'));
} catch (e) { }

try {
  ({ ServerStyleSheet } = require('styled-components'));
} catch (e) { }

/* eslint-enable */

export const renderWithSSR = (component, { renderTarget = 'react-target', storeOptions } = {}) => {
  FastRender.onPageLoad(sink => {
    if (!isAppUrl(sink.request)) {
      return;
    }

    let ReactRouterSSR = ({ location }) => (
      <StaticRouter location={ location } context={ {} }>
        { component }
      </StaticRouter>
    );

    if (storeOptions) {
      const { rootReducer, initialState, middlewares } = storeOptions;
      const appliedMiddlewares = middlewares
        ? applyMiddleware(...middlewares)
        : null;

      const store = createStore(rootReducer, initialState, appliedMiddlewares);

      ReactRouterSSR = ({ location }) => (
        <Provider store={ store }>
          <StaticRouter location={ location } context={ {} }>
            { component }
          </StaticRouter>
        </Provider>
      );

      /* eslint-disable */
      sink.appendToHead(`
          <script>
              window.__PRELOADED_STATE__ = ${JSON.stringify(
        store.getState()
      ).replace(/</g, '\\u003c')}
          </script>
      `);
      /* eslint-enable */
    }

    let AppJSX;

    if (ServerStyleSheet) {
      const sheet = new ServerStyleSheet();
      AppJSX = sheet.collectStyles(
        <ReactRouterSSR location={ sink.request.url } />,
      );
    } else {
      AppJSX = <ReactRouterSSR location={ sink.request.url } />;
    }

    const renderedString = renderToString(AppJSX);

    sink.renderIntoElementById(renderTarget, renderedString);

    const helmet = Helmet.renderStatic();
    helmetTags.forEach(tag => {
      sink.appendToHead(helmet[tag].toString());
    });
  });
};
