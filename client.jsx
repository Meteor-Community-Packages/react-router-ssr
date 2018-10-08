import { FastRender } from 'meteor/staringatlights:fast-render';

import React from 'react';
import ReactDOM from 'react-dom';
import { Router } from 'react-router';
import { Switch } from 'react-router-dom';

import history from './history.js';

let Provider;
let applyMiddleware;
let createStore;

/* eslint-disable */
try {
    ({ Provider } = require('react-redux'));
    ({ createStore, applyMiddleware } = require('redux'));
} catch (e) {}

const renderWithSSR = (component, { storeOptions } = {}) => {

    let ReactRouterSSR = () => (
        <Router history={history}>
            <Switch>
                {component}
            </Switch>
        </Router>
    );

    if (storeOptions) {
        const { rootReducer, middlewares } = storeOptions;
        const appliedMiddlewares = middlewares ? applyMiddleware(...middlewares) : null;
        const store = createStore(rootReducer, window.__PRELOADED_STATE__, appliedMiddlewares);

        delete window.__PRELOADED_STATE__;

        ReactRouterSSR = () => (
            <Provider store={store}>
                <Router history={history}>
                    <Switch>
                        {component}
                    </Switch>
                </Router>
            </Provider>
        );
    }

    FastRender.onPageLoad(() => {
        ReactDOM.hydrate(<ReactRouterSSR />, document.getElementById('react-app'));
    });
};


export { renderWithSSR, history as browserHistory };
