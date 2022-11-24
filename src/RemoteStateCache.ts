import { SimpleCache } from 'with-simple-caching';

/**
 * any simple-cache can be used as a remote-state-cache as long as it also implements a `keys` method which returns all of the currently valid keys for the cache
 *
 * relevance
 * - in order to trigger updates/invalidations, we need to expose all of the keys the user may want to choose from to the user
 */
export interface RemoteStateCache<CV extends any> extends SimpleCache<CV> {
  keys: () => Promise<string[]> | string[];
}
