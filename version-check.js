import { checkNpmVersions } from 'meteor/tmeasday:check-npm-versions';

checkNpmVersions({
    'react-helmet': '5.x',
    'react-dom': '16.x',
    'react-router-dom': '4.x',
    history: '4.x',
}, 'communitypackages:react-router-ssr');
