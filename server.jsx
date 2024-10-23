import { Meteor } from 'meteor/meteor';
import { FastRender } from 'meteor/communitypackages:fast-render';
import { Headers, Request } from 'meteor/fetch';
import React, { StrictMode } from 'react';
import { Helmet } from 'react-helmet';
import { createRoutesFromElements } from 'react-router-dom';
import { StaticRouterProvider, createStaticHandler, createStaticRouter } from 'react-router-dom/server';
import { renderToPipeableStream } from 'react-dom/server';
import AbortController from 'abort-controller';
import { isAppUrl } from './helpers';

// This import just silences warnings from the check-npm-versions package because the
// import above has /server at the end and meteor won't bundle the package.json file for these.
import 'react-dom';
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

class ReactStreamCollector {
  constructor () {
    this.chunks = [];
    this.eventCallbacks = {};
    this.closed = false;
  }

  write (chunk, ...args) {
    this.chunks.push(Buffer.from(chunk).toString());
  }

  toString () {
    return this.chunks.join('');
  }

  finish () {
    this.finished = true;
    const finishCallbacks = this.eventCallbacks.finish || [];
    finishCallbacks.forEach(cb => cb());
  }

  close () {
    this.closed = true;
    const closeCallbacks = this.eventCallbacks.close || [];
    closeCallbacks.forEach(cb => cb());
  }

  drain () {
    console.log('drain');
  }

  on (event, cb) {
    if (!this.eventCallbacks[event]) {
      this.eventCallbacks[event] = [];
    }
    this.eventCallbacks[event].push(cb);
  }

  error (args) {
    console.error('there was an error', args);
  }

  end () {
    console.log('end');
  }
}

const renderToString = async (jsx) => {
  const collector = new ReactStreamCollector();
  return new Promise(Meteor.bindEnvironment((resolve, reject) => {
    const handle = setTimeout(() => {
      abort();
      reject(new Error('Timeout while trying to render pipable stream to string. Make sure all suspendable components are wrapped in a Suspense component.'));
    }, 10000);
    const { pipe, abort } = renderToPipeableStream(jsx, {
      onShellReady: () => {
        pipe(collector);
      },
      onAllReady: () => {
        clearTimeout(handle);
        resolve(collector.toString());
      },
      onError: (error) => {
        clearTimeout(handle);
        reject(error);
      },
      onShellError: (error) => {
        clearTimeout(handle);
        reject(error);
      },
    });
  }));
};

const renderWithSSR = async (routes, { renderTarget = 'react-target' } = {}) => {
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

    const renderedString = await renderToString(AppJSX);

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

  const baseUrl = getBaseUrlFromHeaders(sinkHeaders);
  const fullUrl = `${baseUrl}${url.pathname || ''}`;
  const newUrl = new URL(fullUrl);
  return new Request(newUrl, init);
};

const getBaseUrlFromHeaders = headers => {
  const protocol = headers['x-forwarded-proto'];
  const { host } = headers;
  // we need to have '//' to findOneByHost work as expected
  return `${protocol ? `${protocol}:` : ''}//${host}`;
};

export { renderWithSSR };
