/**
 * an invalidation trigger for the cache of a remote-state-query
 * - allows the user to specify which keys become invalid when a specific mutation fires
 * - exposes full context needed to specify the invalidated keys conviniently
 */
export interface RemoteStateQueryInvalidationTrigger<Q extends (...args: any) => any, M extends (...args: any) => any> {
  /**
   * a reference to the mutation which triggers this
   *
   * note, you can extract the `name` of a function w/ it's `name` property
   * - e.g., `createCampaign.name === 'createCampaign'` for `const createCampaign = () => {...}`
   * - why? this will ensure if you rename the function, the referenced name will automatically get updated
   */
  mutation: M;

  /**
   * a method which specifies which cache keys for the query were affected by this triggered mutation
   *
   * gives you all the context needed to conviniently specify which keys of the query were affected
   * - provides the input and output of the mutation which triggered this
   * - provides the list of all currently cached query strings
   */
  affects: (args: {
    mutationInput: Parameters<M>;
    mutationOutput: ReturnType<M>;
    cachedQueryStrings: string[];
  }) => {
    inputs?: Parameters<Q>[];
    keys?: string[];
  };
}

/**
 * an update trigger for the cache of a remote-state-query
 * - allows the user to specify which keys are to be updated when a specific mutation fires
 * - exposes full context needed to specify the invalidated keys conviniently
 * - allows the user to specify what operation to run to update each key
 * - exposes the current cached value and mutation args for each operation
 */
export interface RemoteStateQueryUpdateTrigger<Q extends (...args: any) => any, M extends (...args: any) => any>
  extends RemoteStateQueryInvalidationTrigger<Q, M> {
  /**
   * a method which specifies which how to update the cached value of query output from current value for a particular mutation
   *
   * gives you all the context needed to conviniently how to transform the cached state from current output for the mutation
   * - provides current cached query output, to change the result from
   * - provides the mutation input and output, to change the value for
   */
  update: (args: {
    /**
     * the cached query state to update from
     */
    from: {
      /**
       * the current cached output of the query
       *
       * note
       * - this will be undefined if there is no valid cached state for the query at the time
       */
      cachedQueryOutput: ReturnType<Q> | undefined;
    };
    /**
     * the mutation this update was triggered with
     */
    with: {
      /**
       * the input the triggering mutation was invoked with
       */
      mutationInput: Parameters<M>;
      /**
       * the output the triggering mutation produced
       */
      mutationOutput: ReturnType<M>;
    };
  }) => ReturnType<Q>;
}

/**
 * options for the remote-state-query-cache which maximize performance+accuracy
 *
 * enables
 * - user to specify cache invalidations of the query triggered by mutations
 * - user to specify cache updates of the query, triggered by mutations
 */
export interface WithRemoteStateQueryCachingOptions<Q extends (...args: any) => any> {
  /**
   * specifies that we must invalidate the cached response of the query, for certain inputs, when one of these triggers fires, signaling that the remote state has changed
   *
   * for example
   * - invalidate `getAllCampaigns` when `createCampaign` is fired, but only for the account the new campaign was created in
   * - invalidate `getCampaign` when `updateCampaign` is fired, but only for the campaign that was updated
   */
  invalidatedBy?: RemoteStateQueryInvalidationTrigger<Q, any>[];

  /**
   * specifies that we must, and how to, update the cached response of the query, for certain inputs, when one of these triggers fires, signaled that the remote state has changed
   *
   * for example
   * - update `getAllCampaigns` when `createCampaign` is fired by adding the campaign, but only for the account the new campaign was created in
   * - invalidate `getCampaign` when `updateCampaign` is fired by using the new state, but only for the campaign that was updated
   */
  updatedBy?: RemoteStateQueryUpdateTrigger<Q, any>[];
}
