/* global Package, Npm */

Package.describe({
  name: 'communitypackages:react-router-ssr',
  version: '6.0.0-beta.1',
  summary: 'Simple isomorphic React SSR for Meteor with subscribed data re-hydration',
  git: 'https://github.com/Meteor-Community-Packages/react-router-ssr.git',
  documentation: 'README.md',
});

Npm.depends({
  'lodash.isequal': '4.5.0',
  'lodash.remove': '4.7.0',
  'stream-to-string': '1.2.1',
  'abort-controller': '3.0.0',
});

Package.onUse(function _ (api) {
  api.versionsFrom('2.3');
  api.use(['ecmascript', 'fetch', 'communitypackages:fast-render@5.0.0-beta.0', 'tmeasday:check-npm-versions@2.0.0']);

  api.mainModule('client.jsx', 'client');
  api.mainModule('server.jsx', 'server');
});
