/* global Package */

Package.describe({
    name: 'communitypackages:react-router-ssr',
    version: '1.0.0',
    summary: 'Simple Isomorphic SSR for Meteor',
    git: 'https://github.com/copleykj/meteor-react-router-ssr.git',
    documentation: 'README.md',
});

Package.onUse(function _(api) {
    api.versionsFrom('1.5.1');
    api.use([
        'ecmascript',
        'staringatlights:fast-render@3.0.4',
        'tmeasday:check-npm-versions@0.3.2',
    ]);


    api.mainModule('lib/client.jsx', 'client');
    api.mainModule('lib/server.jsx', 'server');
});
