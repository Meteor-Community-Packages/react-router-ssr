import { FastRender } from 'meteor/communitypackages:fast-render';

import React from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter as Router, Switch } from 'react-router-dom';

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
        <Router>
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
                <Router>
                    <Switch>
                        {component}
                    </Switch>
                </Router>
            </Provider>
        );
    }

    FastRender.onPageLoad(() => {
        ReactDOM.hydrate(<ReactRouterSSR />, document.getElementById(renderTarget));
    });
};


export { renderWithSSR };
