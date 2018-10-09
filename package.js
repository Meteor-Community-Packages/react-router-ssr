/* global Package */

Package.describe({
    name: 'communitypackages:react-router-ssr',
    version: '1.1.1',
    summary: 'Simple isomorphic React SSR for Meteor with subscribed data re-hydration',
    git: 'https://github.com/Meteor-Community-Packages/react-router-ssr.git',
    documentation: 'README.md',
});

Package.onUse(function _(api) {
    api.versionsFrom('1.5.1');
    api.use([
        'ecmascript',
        'staringatlights:fast-render@3.0.4',
        'tmeasday:check-npm-versions@0.3.2',
    ]);


    api.mainModule('client.jsx', 'client');
    api.mainModule('server.jsx', 'server');
});
