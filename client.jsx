import { FastRender } from 'meteor/staringatlights:fast-render';

import React from 'react';
import ReactDOM from 'react-dom';
import { Router } from 'react-router';
import { Switch } from 'react-router-dom';

import history from './history.js';

let Provider;

/* eslint-disable */
try {
    Provider = require('react-redux').Provider;
} catch (e) {}
/* eslint-enable */

const renderWithSSR = (component, options = {}) => {
    const { store } = options;

    store && delete window.__PRELOADED_STATE__;

    let App = () => (
        <Router history={history}>
            <Switch>
                {component}
            </Switch>
        </Router>
    );

    if (store) {
        App = () => (
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
        ReactDOM.hydrate(<App />, document.getElementById('react-app'));
    });
};


export { renderWithSSR, history as browserHistory };
