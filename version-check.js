import { checkNpmVersions } from 'meteor/tmeasday:check-npm-versions';

checkNpmVersions(
  {
    react: '19.x',
    'react-dom': '19.x',
    'react-router-dom': '6.x',
  },
  'communitypackages:react-router-ssr',
);
