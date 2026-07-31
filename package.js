/* global Package, Npm */

Package.describe({
  name: 'communitypackages:react-router-ssr',
  version: '7.1.0',
  summary: 'Simple isomorphic React SSR for Meteor with subscribed data re-hydration',
  git: 'https://github.com/Meteor-Community-Packages/react-router-ssr.git',
  documentation: 'README.md',
});

Npm.depends({
  'abort-controller': '3.0.0',
});

Package.onUse(function _ (api) {
  api.versionsFrom('METEOR@3.0.1');
  api.use([
    'ecmascript',
    'fetch',
    'react-meteor-data@4.0.0',
    'communitypackages:fast-render@5.0.0',
    'communitypackages:inject-data@3.0.0',
    'tmeasday:check-npm-versions@2.0.0',
  ]);

  // Used by the server half only (request categorization and route policy).
  // Both were previously relied on transitively; declared explicitly now that
  // request-url.js depends on webapp directly.
  api.use(['webapp', 'routepolicy'], 'server');

  api.mainModule('client.jsx', 'client');
  api.mainModule('server.jsx', 'server');
});
