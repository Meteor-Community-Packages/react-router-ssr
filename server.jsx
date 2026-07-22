import { Meteor } from 'meteor/meteor';
import { WebAppInternals } from 'meteor/webapp';
import { FastRender } from 'meteor/communitypackages:fast-render';
import { InjectData } from 'meteor/communitypackages:inject-data';
import { Headers, Request } from 'meteor/fetch';
import { Writable } from 'stream';
import React, { StrictMode } from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import AbortController from 'abort-controller';
import { isAppUrl } from './helpers';
import { resolveReactRouter } from './resolve-react-router';

// This import just silences warnings from the check-npm-versions package because the
// import above has /server at the end and meteor won't bundle the package.json file for these.
import 'react-dom';
import './version-check';

export * from './both';

// React Router is provided by the app (dependency injection) rather than imported here — see
// the note in client.jsx and the README for why.
const renderWithSSR = async (routes, { reactRouter } = {}) => {
  const { createRoutesFromElements, StaticRouterProvider, createStaticHandler, createStaticRouter } = resolveReactRouter(reactRouter);

  if (!Array.isArray(routes)) {
    routes = createRoutesFromElements(routes);
  }

  const handler = createStaticHandler(routes);

  WebAppInternals.disableBoilerplateResponse();

  FastRender.onPageLoadWithoutSink(async (request, data, arch, response) => {
    if (!isAppUrl(request)) {
      return;
    }

    const fetchRequest = createFetchRequest(request);
    const context = await handler.query(fetchRequest);

    const router = createStaticRouter(
      handler.dataRoutes,
      context,
    );

    const { meteorRuntimeConfig, css = [], js = [] } = data || {};

    const styleTagUrls = (css || []).map(file => file.url);
    const scriptTagUrls = (js || []).map(file => file.url);

    // When the app is built with the Rspack bundler in development, the app's client bundle is
    // served by the Rspack HMR dev server and the normal Meteor boilerplate loads it with a
    // final <script src="/__rspack__/…">. Because we render our own document from the js/css
    // manifest, that script would be dropped and the app would never hydrate (every link click
    // becomes a full page reload). The Rspack integration exposes the URL via this env var,
    // set only for `meteor run` in development; in production the bundle is baked into the
    // manifest's /app/app.js, so the var is unset and nothing extra is added. Appending it here
    // covers the served <head>, the window.scriptTagUrls config, and the client's hydration
    // render in one place, so server and client markup stay identical.
    if (process.env.METEOR_APP_CUSTOM_SCRIPT_URL) {
      scriptTagUrls.push(process.env.METEOR_APP_CUSTOM_SCRIPT_URL);
    }

    const styleConfig = `styleTagUrls = [${styleTagUrls.map(tag => `'${tag}'`).join(', ')}]; `;
    const scriptConfig = `scriptTagUrls = [${scriptTagUrls.map(tag => `'${tag}'`).join(', ')}]; `;
    const fullConfig = `${styleConfig}${scriptConfig}`;

    const runtimeConfig = meteorRuntimeConfig
      ? `__meteor_runtime_config__ = JSON.parse(decodeURIComponent(${meteorRuntimeConfig})); ${fullConfig}`
      : fullConfig;

    const AppJSX = () => {
      return (
        <html>
          <head>
            {/*
              No <title>/<meta> here on purpose. Under React 19, document metadata
              (<title>, <meta>, <link>) rendered by any route/component is hoisted into
              <head> natively — server and client — so apps own the head from their own
              components. Only the bundle's scripts/styles live here.
            */}
            {scriptTagUrls.map((url, index) => (<script defer type='text/javascript' key={index} src={url} />))}
            {styleTagUrls.map((url, index) => (<link rel='stylesheet' type='text/css' key={index} href={url} />))}
          </head>
          <body>
            <StrictMode>
              <StaticRouterProvider router={router} context={context} />
            </StrictMode>
          </body>
        </html>
      );
    };

    // Render the whole document to a string. We wait for onAllReady (not onShellReady) so
    // that every Suspense boundary resolves and every useSubscribeSuspense subscription is
    // captured by the FastRender context (via the overridden Meteor.subscribe) before we
    // serialize the collected data below. Because this runs inside the frContext.withValue
    // scope set up by onPageLoadWithoutSink, awaiting the full render keeps the fast-render
    // context active for the duration of rendering.
    const html = await new Promise((resolve, reject) => {
      const chunks = [];
      const collector = new Writable({
        write (chunk, encoding, callback) {
          chunks.push(Buffer.from(chunk));
          callback();
        },
      });
      collector.on('finish', () => resolve(Buffer.concat(chunks).toString('utf8')));
      collector.on('error', reject);

      const handle = setTimeout(() => {
        abort();
        reject(new Error('Timeout while server rendering. Ensure all suspendable components are wrapped in a Suspense component.'));
      }, 10000);

      const { pipe, abort } = renderToPipeableStream(<AppJSX />, {
        bootstrapScriptContent: runtimeConfig,
        onAllReady () {
          clearTimeout(handle);
          pipe(collector);
        },
        onError (error) {
          clearTimeout(handle);
          reject(error);
        },
        onShellError (error) {
          clearTimeout(handle);
          reject(error);
        },
      });
    });

    // Build the inject-data payload directly from the FastRender context. This mirrors the
    // single push FastRender._mergeFrData would make, using the exact keys the client boot
    // code reads ('fast-render-data' / 'fast-render-extra-data'). We build it ourselves
    // rather than relying on inject-data's boilerplate callback: in the without-sink path
    // that callback runs before the subscription data has been collected.
    const frContext = FastRender.frContext.get();
    const payload = { 'fast-render-data': frContext.getData() };
    const extraData = frContext.getExtraData();
    if (extraData) {
      payload['fast-render-extra-data'] = extraData;
    }

    const injectScript = `<script type="text/inject-data">${InjectData.encode(payload)}</script>`;
    // renderToPipeableStream already emits <!DOCTYPE html> for an <html> root, so we only
    // splice the inject-data payload into the streamed <head>.
    const finalHtml = html.replace('</head>', `${injectScript}</head>`);

    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.statusCode = context.statusCode || 200;
    response.end(finalHtml);
  });
};

function createFetchRequest (request) {
  const sinkHeaders = request.headers;
  const url = request.url;

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
  // `x-forwarded-proto` is only present when a proxy sets it (Meteor's dev proxy, Galaxy's
  // load balancer, etc.). When the app server is reached directly — a production bundle run
  // with `node main.js`, or a platform health check — it's absent. Falling back to a
  // protocol-relative base (`//host`) makes `new URL()` throw "Invalid URL", which 500s every
  // SSR request (and fails the deploy's health check). Default to 'http'; a comma-separated
  // value (chained proxies) uses the first hop. Only the host/pathname matter to the router.
  const forwardedProto = headers['x-forwarded-proto'];
  const protocol = (forwardedProto ? forwardedProto.split(',')[0].trim() : '') || 'http';
  const { host } = headers;
  return `${protocol}://${host}`;
};

export { renderWithSSR };
