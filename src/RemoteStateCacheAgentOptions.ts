import { RemoteStateCacheContext } from './RemoteStateCacheContext';

/**
 * the options with which the remote-state cache agent should operate the remote-state cache
 */
export interface RemoteStateCacheAgentOptions {
  /**
   * the context within which the remote state cache should be managed
   */
  context: RemoteStateCacheContext;
}
