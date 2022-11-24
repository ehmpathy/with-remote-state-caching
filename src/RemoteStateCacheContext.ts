import { LogicWithExtendableCaching } from 'with-simple-caching';
import { WithRemoteStateQueryCachingOptions } from './RemoteStateQueryCachingOptions';

/**
 * tracks all of the info required for managing the remote-state cache for a query
 *
 * includes
 * - the queries name
 * - the query itself, wrapped with extended caching, so that we can execute, invalidate, and update it
 * - options that the query was provisioned with
 */
export interface RemoteStateCacheContextQueryRegistration<L extends (...args: any[]) => any, CV extends any> {
  /**
   * the name of the query
   */
  name: string;

  /**
   * the query with extended caching which can be used
   */
  query: LogicWithExtendableCaching<L, CV>;

  /**
   * the remote-state caching options this query was registered with
   */
  options: WithRemoteStateQueryCachingOptions<L>;
}

/**
 * the context within which remote state cache is managed
 *
 * specifically
 * - defines a registry of all of the queries and mutations registered w/ remote-state caching
 *
 * relevance
 * - used to trigger cache invalidations
 */
export interface RemoteStateCacheContext {
  registered: {
    queries: {
      [index: string]: RemoteStateCacheContextQueryRegistration<any, any>; // note: we use a map here to ensure there's only one query with a given name at a time + to speed up lookups
    };
    mutations: {
      // TODO
    };
  };
}
