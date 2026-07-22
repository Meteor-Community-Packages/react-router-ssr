// Validates the app-provided React Router module and returns it. Kept in its own file (with no
// Meteor server-only imports) so it can be safely imported by both the client and server entry
// points. React Router is injected by the app rather than imported by this package — see the
// note in client.jsx and the README for why.

// The named exports this package needs from React Router. All of them live on the
// `react-router` module in v7/v8, and on `react-router-dom` + `react-router-dom/server` in v6.
const REQUIRED_EXPORTS = [
  'createRoutesFromElements',
  'createBrowserRouter',
  'RouterProvider',
  'createStaticHandler',
  'createStaticRouter',
  'StaticRouterProvider',
];

export const resolveReactRouter = function resolveReactRouter (reactRouter) {
  if (!reactRouter) {
    throw new Error(
      'communitypackages:react-router-ssr: renderWithSSR requires a `reactRouter` option. ' +
      'Pass your app\'s React Router module, e.g.\n\n' +
      "  import * as ReactRouter from 'react-router';\n" +
      '  renderWithSSR(routes, { reactRouter: ReactRouter });\n\n' +
      'React Router must be imported by your app (bundled by your app\'s bundler), not by this package.',
    );
  }

  // A single module (react-router in v7/v8) provides all of these exports, so we validate the
  // full set to catch a wrong object (e.g. a default export, or only react-router-dom without
  // /server on v6).
  const missing = REQUIRED_EXPORTS.filter(name => typeof reactRouter[name] !== 'function');
  if (missing.length === REQUIRED_EXPORTS.length) {
    throw new Error(
      'communitypackages:react-router-ssr: the `reactRouter` option does not look like a React ' +
      'Router module (none of its expected exports were found). Pass the module namespace, e.g. ' +
      "`import * as ReactRouter from 'react-router'`.",
    );
  }

  return reactRouter;
};
