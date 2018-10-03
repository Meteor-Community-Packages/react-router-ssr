/* eslint-disable react/prop-types */
import { FastRender } from 'meteor/staringatlights:fast-render';

import React from 'react';
import { Helmet } from 'react-helmet';
import { StaticRouter } from 'react-router';
import { renderToString } from 'react-dom/server';

import { isAppUrl } from './helpers';

let Provider;
let ServerStyleSheet;

/* eslint-disable */
try {
    ({ Provider } = require('react-redux'));
} catch (e) {}

try {
    ({ ServerStyleSheet } = require('styled-components'));
} catch (e) {}

/* eslint-enable */

export const renderWithSSR = (routes, options = {}) => {
    FastRender.onPageLoad((sink) => {
        if (!isAppUrl(sink.request)) {
            return;
        }

        const { store } = options;

        let App = ({ location }) => (
            <StaticRouter location={location} context={{}}>
                {routes}
            </StaticRouter>
        );

        if (store) {
            App = ({ location }) => (
                <Provider store={store}>
                    <StaticRouter location={location} context={{}}>
                        {routes}
                    </StaticRouter>
                </Provider>
            );


            sink.appendToBody(`
                <script>
                window.__PRELOADED_STATE__ = ${JSON.stringify(store.getState()).replace(/</g, '\\u003c')}
                </script>
            `);
        }

        let AppJSX;

        if (ServerStyleSheet) {
            const sheet = new ServerStyleSheet();
            AppJSX = sheet.collectStyles(
                <App location={sink.request.url} />,
            );
        } else {
            AppJSX = (<App location={sink.request.url} />);
        }


        sink.renderIntoElementById('react-app', renderToString(AppJSX));

        const helmet = Helmet.renderStatic();
        sink.appendToHead(helmet.meta.toString());
        sink.appendToHead(helmet.title.toString());
    });
};
