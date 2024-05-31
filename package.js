/* global Package */

Package.describe({
  name: 'communitypackages:react-router-ssr',
  version: '5.0.0',
  summary: 'Simple isomorphic React SSR for Meteor with subscribed data re-hydration',
  git: 'https://github.com/Meteor-Community-Packages/react-router-ssr.git',
  documentation: 'README.md',
});

Package.onUse(function _ (api) {
  api.versionsFrom('2.3');
  api.use(['ecmascript', 'fetch', 'communitypackages:fast-render@4.0.0', 'tmeasday:check-npm-versions@1.0.2']);

  api.mainModule('client.jsx', 'client');
  api.mainModule('server.jsx', 'server');
});
