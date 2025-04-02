import { useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import isEqual from 'lodash.isequal';
import remove from 'lodash.remove';

/**
 * This hook was taken directly from react-meteor-data meteor package.
 * The current react-meteor data implementation sets this hook as a noop
 * on the server and is thus incompatible with server rendering.
**/

const cachedSubscriptions = [];

export const useSubscribeSuspense = (name, ...params) => {
  const cachedSubscription =
    cachedSubscriptions.find(x => x.name === name && isEqual(x.params, params));

  useEffect(() =>
    () => {
      setTimeout(() => {
        const cachedSubscription =
          cachedSubscriptions.find(x => x.name === name && isEqual(x.params, params));
        if (cachedSubscription) {
          cachedSubscription.handle?.stop();
          remove(cachedSubscriptions,
            x =>
              x.name === cachedSubscription.name &&
              isEqual(x.params, cachedSubscription.params));
        }
      }, 0);
    }, [name, ...params]);

  if (cachedSubscription != null) {
    if ('error' in cachedSubscription) throw cachedSubscription.error;
    if ('result' in cachedSubscription) return cachedSubscription.result;
    throw cachedSubscription.promise;
  }

  const subscription = {
    name,
    params,
    promise: new Promise((resolve, reject) => {
      const h = Meteor.subscribe(name, ...params, {
        onReady () {
          subscription.result = null;
          subscription.handle = h;
          resolve(h);
        },
        onStop (error) {
          subscription.error = error;
          subscription.handle = h;
          reject(error);
        },
      });
    }),
  };

  cachedSubscriptions.push(subscription);

  throw subscription.promise;
};
