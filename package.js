/* global Package, Npm */

Package.describe({
  name: 'communitypackages:react-router-ssr',
  version: '6.0.0',
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
    'tmeasday:check-npm-versions@2.0.0'
  ]);

  api.mainModule('client.jsx', 'client');
  api.mainModule('server.jsx', 'server');
});
