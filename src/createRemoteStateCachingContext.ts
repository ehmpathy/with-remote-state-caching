import { isAFunction } from 'type-fns';
import {
  WithSimpleCachingOptions,
  LogicWithExtendableCaching,
  SimpleCacheOnSetHook,
  WithSimpleCachingOnSetTrigger,
  withExtendableCaching,
  SimpleCache,
} from 'with-simple-caching';
import { createCache } from 'simple-in-memory-cache';
import { RemoteStateCacheContext, RemoteStateCacheContextQueryRegistration } from './RemoteStateCacheContext';
import { WithRemoteStateQueryCachingOptions } from './RemoteStateQueryCachingOptions';
import { BadRequestError } from './errors/BadRequestError';

interface WithRemoteStateCachingOptions {
  /**
   * a manually specified name, to be used if the function does not have a name defined of its own
   *
   * relevance
   * - if you define an arrow function within the wrapper, no name will be assigned to it, and you will need to manually specify one
   * - otherwise, a name will automatically be specified, and this is unnessesary
   */
  name?: string;
}

/**
 * enumerates the types of operations which can be executed against remote state
 */
export enum RemoteStateOperation {
  /**
   * a mutation is an operation which updates (i.e., mutates) the remote state
   */
  MUTATION = 'MUTATION',

  /**
   * a query is an operation that reads (i.e., queries) the remote state
   */
  QUERY = 'QUERY',
}

/**
 * a function capable of safely and reliably extracting the name of the operation from registration inputs
 */
export const extractNameFromRegistrationInputs = ({
  operation,
  logic,
  options,
}: {
  operation: RemoteStateOperation;
  logic: (...args: any) => any;
  options: WithRemoteStateCachingOptions;
}) => {
  // define the name
  const nameFromFunctionReference = logic.name;
  const nameFromExplicitOptions = options.name;
  if (nameFromExplicitOptions && nameFromFunctionReference && nameFromExplicitOptions !== nameFromFunctionReference)
    throw new BadRequestError(
      `a ${operation.toLowerCase()} was attempted to be registered to remote-state caching with a name explicitly defined which differed from the name property of the wrapped logic function reference. this is ambiguous, so we do not allow this. must use function reference name`,
      {
        nameFromFunctionReference,
        nameFromExplicitOptions,
      },
    );
  const name = nameFromFunctionReference || nameFromExplicitOptions; // fallback to name from explicit options if logic reference does not have a name assigned
  if (!name)
    throw new BadRequestError(
      `name was not defined on ${operation.toLowerCase()} registration. can not register ${operation.toLowerCase()} to remote state context`,
      {
        name,
      },
    );
  return name;
};

/**
 * this method sets up remote0state caching for an application
 * - instantiates a remote-state caching context to register all queries and mutations to
 * - creates the wrapper functions used to leverage the cache within the remote-state caching context
 * - manages tracking and triggering interactions between queries and mutations (invalidations, updates, etc)
 */
export const createRemoteStateCachingContext = () => {
  /**
   * the context we'll be using for the application
   */
  const context: RemoteStateCacheContext = {
    registered: {
      queries: {},
      mutations: {},
    },
  };

  /**
   * a function which is able to register a query to the context
   */
  const registerQueryToRemoteStateContext = ({ registration }: { registration: RemoteStateCacheContextQueryRegistration<any, any, any> }) => {
    // sanity check that a query with that name is not already registered
    if (registration.name in context.registered.queries)
      throw new BadRequestError('a query with this name was already registered to the context. these names should be unique', {
        name: registration.name,
      });

    // add it to the context
    context.registered.queries[registration.name] = registration;
  };

  /**
   * a wrapper which adds remote-state caching to a query
   *
   * enables
   * - caching the response of any query
   * - automatically invalidating or updating the cached response for a query, triggered by mutations
   * - manually invalidating or updating the cached response for a query
   */
  const withRemoteStateQueryCaching = <LR extends Promise<any>, CR extends any, L extends (...args: any[]) => LR>(
    logic: L,
    options: WithSimpleCachingOptions<LR, CR, L> & WithRemoteStateQueryCachingOptions<L> & WithRemoteStateCachingOptions,
  ): LogicWithExtendableCaching<LR, CR, L> => {
    // create an in memory cache to store the valid keys for this query
    const keys = createCache<string[]>();
    const getKeys = () => keys.get('keys') ?? [];
    const setKeys = (value: string[]) => keys.set('keys', value);

    // define the hook used to manage the valid keys tracked for this query's cache
    const onSetHook: SimpleCacheOnSetHook<LR, CR, L> = ({ trigger, forKey }) => {
      // determine if the key already exists in the cache
      const keyIsAlreadyMarkedAsValid = getKeys().some((key) => key === forKey);

      // if this was triggered by invalidation, make sure the key is not marked as valid
      if (trigger === WithSimpleCachingOnSetTrigger.INVALIDATE && keyIsAlreadyMarkedAsValid) setKeys(getKeys().filter((key) => key !== forKey));

      // otherwise, make sure the key is marked as valid if not already so
      if (!keyIsAlreadyMarkedAsValid) setKeys([...getKeys(), forKey]);
    };

    // extend the logic with caching
    const logicExtendedWithCaching = withExtendableCaching(logic, {
      ...options,
      hook: { onSet: onSetHook },
    });

    // register this query
    const registration: RemoteStateCacheContextQueryRegistration<LR, CR, L> = {
      name: extractNameFromRegistrationInputs({ operation: RemoteStateOperation.QUERY, logic, options }),
      query: logicExtendedWithCaching,
      keys: { get: getKeys },
      options: {
        // note: we pick out only the ones we care about specifically, because options could actually be implemented with a superset object, and typically is - so this prevents having a massive recursive structure in the context
        invalidatedBy: options.invalidatedBy,
        updatedBy: options.updatedBy,
      },
    };
    registerQueryToRemoteStateContext({ registration });

    // and return the extended logic
    return logicExtendedWithCaching;
  };

  /**
   * define a method which is able to kick off all registered query invalidations and query updates, on the execution of a mutation
   */
  const onMutationOutput = async <LR extends any, CR extends any, M extends (...args: any) => any>({
    mutationName,
    mutationInput,
    mutationOutput,
    cache,
  }: {
    mutationName: string;
    mutationInput: Parameters<M>;
    mutationOutput: ReturnType<M>;
    cache: SimpleCache<CR>;
  }) => {
    const registrations = Object.values(context.registered.queries);

    // for each registered query, handle invalidation if needed
    await Promise.all(
      registrations.map(async (registration) => {
        // if invalidated by wasn't defined, do nothing
        if (!registration.options.invalidatedBy) return;

        // if invalidated by wasn't defined for this mutation, do nothing
        const invalidatedByThisMutationDefinition = registration.options.invalidatedBy.find((definition) => definition.mutation === mutationName);
        if (!invalidatedByThisMutationDefinition) return;

        // otherwise, define what to invalidate
        const invalidate = invalidatedByThisMutationDefinition.affects({
          mutationInput,
          mutationOutput,
          cachedQueryStrings: registration.keys.get(),
        });

        // execute the invalidations
        if (invalidate.keys) await Promise.all(invalidate.keys.map((forKey) => registration.query.invalidate({ forKey, cache })));
        if (invalidate.inputs) await Promise.all(invalidate.inputs.map((forInput) => registration.query.invalidate({ forInput })));
      }),
    );

    // for each registered query, handle updates if needed
    await Promise.all(
      registrations.map(async (registration) => {
        // if updated by wasn't defined, do nothing
        if (!registration.options.updatedBy) return;

        // if updated by wasn't defined for this mutation, do nothing
        const updatedByThisMutationDefinition = registration.options.updatedBy.find((definition) => definition.mutation === mutationName);
        if (!updatedByThisMutationDefinition) return;

        // otherwise, define what to update
        const affected = updatedByThisMutationDefinition.affects({
          mutationInput,
          mutationOutput,
          cachedQueryStrings: registration.keys.get(),
        });

        // define the function that will be used to update the cache with
        const toValue: (args: { cachedValue: CR | undefined }) => LR = ({ cachedValue }) =>
          updatedByThisMutationDefinition.update({
            from: { cachedQueryOutput: cachedValue },
            with: {
              mutationInput,
              mutationOutput,
            },
          });

        // execute the updates
        if (affected.keys) await Promise.all(affected.keys.map((forKey) => registration.query.update({ forKey, cache, toValue })));
        if (affected.inputs) await Promise.all(affected.inputs.map((forInput) => registration.query.update({ forInput, toValue })));
      }),
    );
  };

  /**
   * a wrapper which registers a mutation into the remote-state caching context, without adding caching to the mutation
   *
   * relevance
   * - this enables the mutation to trigger invalidation and updates of queries
   */
  const withRemoteStateMutationRegistration = <LR extends Promise<any>, CR extends any, L extends (...args: any[]) => LR>(
    logic: L,
    options: WithRemoteStateCachingOptions,
  ): { execute: L } => {
    // define the mutation name
    const mutationName = extractNameFromRegistrationInputs({ operation: RemoteStateOperation.QUERY, logic, options });

    // define the execute function, with triggers onMutationOutput
    const execute: L = (async (...args: Parameters<L>): Promise<ReturnType<L>> => {
      const result = (await logic(...args)) as ReturnType<L>;
      const cache = isAFunction(options.cache) ? options.cache({ fromInput: args }) : options.cache; // TODO: store a reference to the queries cache on the query registration, to ensure its the same cache. this is easier for now, but not as reliable (since mutation could use a different cache)
      await onMutationOutput({ mutationName, mutationInput: args, mutationOutput: result, cache });
      return result;
    }) as L;

    // return the extended logic
    return { execute };
  };

  /**
   * return the wrappers
   */
  return {
    withRemoteStateQueryCaching,
    withRemoteStateMutationRegistration,
  };
};
