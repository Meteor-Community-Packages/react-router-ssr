import { Meteor } from 'meteor/meteor';
import { FastRender } from 'meteor/communitypackages:fast-render';
import { useSubscribe as useSubscribeClient } from 'meteor/react-meteor-data/suspense';

// react-meteor-data's Suspense-aware useSubscribe is a no-op on the server
// (useSubscribeSuspenseServer just returns undefined), so fast-render never observes the
// subscription and cannot capture its documents for hydration. On the server we therefore
// call Meteor.subscribe ourselves — fast-render overrides Meteor.subscribe to run the
// publication and record its documents into the current FastRender context — and we suspend
// (throw the pending promise) until the publication signals ready. Suspending guarantees the
// data has been collected into the context before the surrounding render completes and
// server.jsx serializes it into the inject-data payload.
//
// The per-subscription state is cached on a WeakMap keyed by the FastRender context so that
// (a) React's suspense retries of the same render return the resolved result instead of
// re-subscribing forever, and (b) the cache is scoped to a single request and never leaks a
// resolved subscription into a different request's context.
const perContextCache = new WeakMap();

const useSubscribeServer = (name, ...params) => {
  const frContext = FastRender.frContext.get();
  // Rendering outside a FastRender context (should not happen during SSR) — nothing to
  // capture, so behave as "ready".
  if (!frContext) {
    return () => false;
  }

  let cache = perContextCache.get(frContext);
  if (!cache) {
    cache = new Map();
    perContextCache.set(frContext, cache);
  }

  const key = JSON.stringify([name, params]);
  const cached = cache.get(key);
  if (cached) {
    if ('error' in cached) throw cached.error;
    if (cached.ready) return () => false;
    throw cached.promise;
  }

  const entry = {};
  entry.promise = new Promise((resolve, reject) => {
    Meteor.subscribe(name, ...params, {
      onReady () {
        entry.ready = true;
        resolve();
      },
      onStop (error) {
        if (error) {
          entry.error = error;
          reject(error);
        } else {
          entry.ready = true;
          resolve();
        }
      },
    });
  });
  cache.set(key, entry);
  throw entry.promise;
};

// The return value mirrors react-meteor-data's useSubscribe: a function returning whether the
// subscription is still loading. On the server the data is already captured, so it is ready.
export const useSubscribeSuspense = Meteor.isServer
  ? useSubscribeServer
  : useSubscribeClient;
