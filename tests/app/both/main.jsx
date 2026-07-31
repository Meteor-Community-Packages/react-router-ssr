import React from 'react';
import * as ReactRouter from 'react-router';
import { useLoaderData, useLocation, useParams } from 'react-router';
import { renderWithSSR } from 'meteor/communitypackages:react-router-ssr';

// Every page renders machine-readable markers describing the *routing outcome*:
// which route matched, the pathname/search React Router actually routed on, and
// the absolute URL the route loader was handed. The tests assert on these, never
// on an internal value of the package, so a test can only pass if the real router
// really matched the real route for the real URL.
const Markers = ({ route }) => {
  const location = useLocation();
  const params = useParams();
  const data = useLoaderData() || {};

  return (
    <>
      <title>{`route:${route}`}</title>
      <pre id='matched-route'>{route}</pre>
      <pre id='routed-pathname'>{location.pathname}</pre>
      <pre id='routed-search'>{location.search}</pre>
      <pre id='routed-params'>{JSON.stringify(params)}</pre>
      <pre id='loader-url'>{data.loaderUrl}</pre>
    </>
  );
};

// The static handler passes the fetch Request this package built straight to the
// loader, so `request.url` is the exact URL React Router routes on — origin
// included. That is the only way to observe the derived origin from outside.
const loader = ({ request }) => ({ loaderUrl: request.url });

const page = route => () => <Markers route={route} />;

export const AppRoutes = [
  { path: '/', loader, element: React.createElement(page('ROOT')) },
  { path: '/pricing', loader, element: React.createElement(page('DECOY-PRICING')) },
  { path: '/events/:eventId', loader, element: React.createElement(page('EVENT')) },
  { path: '/claim/:token', loader, element: React.createElement(page('CLAIM')) },
  { path: '*', loader, element: React.createElement(page('NOT-FOUND')) },
];

renderWithSSR(AppRoutes, { reactRouter: ReactRouter });
