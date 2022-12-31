import { FastRender } from 'meteor/communitypackages:fast-render';

import React from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter } from 'react-router-dom';

import './version-check';

let Provider;
let applyMiddleware;
let createStore;

/* eslint-disable */
try {
    ({ Provider } = require('react-redux'));
    ({ createStore, applyMiddleware } = require('redux'));
} catch (e) {}

const renderWithSSR = (component, { renderTarget = 'react-target', storeOptions } = {}) => {

    let ReactRouterSSR = () => (
        <BrowserRouter>
            {component}
        </BrowserRouter>
    );

    if (storeOptions) {
        const { rootReducer, middlewares } = storeOptions;
        const appliedMiddlewares = middlewares ? applyMiddleware(...middlewares) : null;
        const store = createStore(rootReducer, window.__PRELOADED_STATE__, appliedMiddlewares);

        delete window.__PRELOADED_STATE__;

        ReactRouterSSR = () => (
            <Provider store={store}>
                <BrowserRouter>
                    {component}
                </BrowserRouter>
            </Provider>
        );
    }

    FastRender.onPageLoad(() => {
        ReactDOM.hydrate(<ReactRouterSSR />, document.getElementById(renderTarget));
    });
};


export { renderWithSSR };
