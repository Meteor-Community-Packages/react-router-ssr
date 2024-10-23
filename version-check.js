import { checkNpmVersions } from 'meteor/tmeasday:check-npm-versions';

checkNpmVersions(
  {
    react: '18.x',
    'react-dom': '18.x',
    'react-router-dom': '6.x',
    'react-helmet': '6.x',
  },
  'communitypackages:react-router-ssr',
);
