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
import { requestRoutedUrl } from './request-url';
import { resolveReactRouter } from './resolve-react-router';

// This import just silences warnings from the check-npm-versions package because the
// import above has /server at the end and meteor won't bundle the package.json file for these.
import 'react-dom';
import './version-check';

export * from './both';
export { requestRoutedUrl } from './request-url';

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
      endDeclinedRequest(response);
      return;
    }

    const fetchRequest = createFetchRequest(request);
    const context = await handler.query(fetchRequest);

    const router = createStaticRouter(
      handler.dataRoutes,
      context,
    );

    const { meteorRuntimeConfig, css = [], js = [], head = '' } = data || {};

    const styleTagUrls = (css || []).map(file => file.url);
    const scriptTagUrls = (js || []).map(file => file.url);

    // The Rspack bundler integration delivers the app's compiled CSS as a
    // <link> in the boilerplate *head fragment* (via static-html), not in
    // the css manifest — in development it points at the dev server
    // (/build-chunks/main.css → /__rspack__/…). Because we render our own
    // document from the manifest, that link would be dropped and the app
    // would render unstyled. Carry stylesheet links from the head fragment
    // into styleTagUrls; this also reaches the client via the
    // window.styleTagUrls config, so hydration markup stays identical.
    if (head) {
      const linkTags = head.match(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi) || [];
      for (const tag of linkTags) {
        const href = tag.match(/href=["']([^"']+)["']/i);
        if (href && !styleTagUrls.includes(href[1])) {
          styleTagUrls.push(href[1]);
        }
      }
    }

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
        // suppressHydrationWarning: apps may set attributes on <html>
        // (theming's data-theme/data-org, lang) from inline scripts before
        // hydration; React 19 leaves unknown attributes in place, so the
        // mismatch warning is noise.
        <html suppressHydrationWarning>
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

// Answer a request the renderer has declined.
//
// By the time a boilerplate data callback runs, webapp has already committed to
// serving app HTML for this request: nothing downstream will handle it, and
// `disableBoilerplateResponse()` (called above, unavoidably global) means webapp
// will never write a body of its own. Returning without responding therefore
// left the socket open forever — one held connection per request, unauthenticated,
// so `GET /__cordova/x` was trivial socket exhaustion. Since the URL is one this
// package has explicitly refused to render, 404 is the honest answer.
//
// webapp still calls `res.writeHead()` after the data callbacks return;
// fast-render guards that call once the response has been sent, so ending here
// is safe.
const DECLINED_BODY = 'Not Found';

function endDeclinedRequest (response) {
  if (!response || response.writableEnded) {
    return;
  }

  if (!response.headersSent) {
    response.statusCode = 404;
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Content-Length', Buffer.byteLength(DECLINED_BODY));
    // Nothing here is a real resource; don't let a proxy or CDN remember it.
    response.setHeader('Cache-Control', 'no-store');
  }

  response.end(DECLINED_BODY);
}

function createFetchRequest (request) {
  const sinkHeaders = request.headers;

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

  // The URL React Router routes on. Derived by the exported `requestRoutedUrl`
  // helper so that there is exactly one implementation of this — the same one
  // consumers call from their own middleware. It validates the header-derived
  // origin and composes the path via URL setters rather than string
  // concatenation; see request-url.js for why both halves of that matter.
  return new Request(requestRoutedUrl(request), init);
};

export { renderWithSSR };
