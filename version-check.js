import { checkNpmVersions } from 'meteor/tmeasday:check-npm-versions';

// React Router is not checked here: it is provided by the app via the `reactRouter` option
// (dependency injection), so this package is agnostic to which major (v6/v7/v8) or package
// name (`react-router` vs `react-router-dom`) the app uses. See the README.
checkNpmVersions(
  {
    react: '19.x',
    'react-dom': '19.x',
  },
  'communitypackages:react-router-ssr',
);
