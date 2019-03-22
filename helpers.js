import { RoutePolicy } from 'meteor/routepolicy';
import nodeurl from 'url';

export const isAppUrl = function isAppUrl (req) {
  const url = nodeurl.parse(req.url).pathname;
  if (url === '/favicon.ico' || url === '/robots.txt') {
    return false;
  }

  if (url === '/app.manifest') {
    return false;
  }

  if (url.startsWith('/__cordova')) {
    return false;
  }

  // Avoid serving app HTML for declared routes such as /sockjs/.
  if (RoutePolicy.classify(url)) {
    return false;
  }
  return true;
};
