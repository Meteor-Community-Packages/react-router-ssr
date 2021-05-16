import { checkNpmVersions } from 'meteor/tmeasday:check-npm-versions';

checkNpmVersions(
  {
    react: '16.x || 17.x',
    'react-dom': '16.x || 17.x',
    'react-router-dom': '4.x || 5.x',
    'react-helmet': '6.x',
  },
  'communitypackages:react-router-ssr',
);
