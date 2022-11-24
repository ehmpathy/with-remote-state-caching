import { isAFunction, PickOne } from 'type-fns';
import {
  WithSimpleCachingOptions,
  LogicWithExtendableCaching,
  withExtendableCaching,
  SimpleCacheResolutionMethod,
  defaultValueDeserializationMethod,
  defaultKeySerializationMethod,
  KeySerializationMethod,
} from 'with-simple-caching';
import { RemoteStateCacheContext, RemoteStateCacheContextQueryRegistration } from './RemoteStateCacheContext';
import { RemoteStateQueryInvalidationTrigger, RemoteStateQueryUpdateTrigger } from './RemoteStateQueryCachingOptions';
import { BadRequestError } from './errors/BadRequestError';
import { RemoteStateCache } from './RemoteStateCache';

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
 * a method which makes it convinient and safe to add cache triggers to queries
 *
 * relevance
 * - triggers can not be defined through wrapper options with full type information, as typescript is not able to infer both the query type and the mutation type at the same time
 * - this method gives us the type information both the query and mutation, making it a lot more convinient to define
 */
export type QueryWithRemoteStateCachingAddTriggerMethod<Q extends (...args: any[]) => any> = <M extends (...args: any[]) => any>(
  args: PickOne<{
    invalidatedBy: RemoteStateQueryInvalidationTrigger<Q, M>;
    updatedBy: RemoteStateQueryUpdateTrigger<Q, M>;
  }>,
) => void;

/**
 * the shape of a query extended with remote state caching
 */
export interface QueryWithRemoteStateCaching<L extends (...args: any) => any, CV extends any> extends LogicWithExtendableCaching<L, CV> {
  /**
   * the registered name of this query
   */
  name: string;

  /**
   * a method which makes it easy to add cache triggers to queries
   *
   * relevance
   * - triggers can not be defined through wrapper options, as typescript is not able to infer both the query type and the mutation type at the same time
   * - this method gives us both, by leveraging the factory pattern
   */
  addTrigger: QueryWithRemoteStateCachingAddTriggerMethod<L>;
}

/**
 * the shape of a query extended with remote state registration
 */
export interface MutationWithRemoteStateRegistration<L extends (...args: any) => any> {
  /**
   * the registered name of this query
   */
  name: string;

  /**
   * a method which executes the mutation, with all remote state triggers invoked
   */
  execute: L;
}

/**
 * this method sets up remote0state caching for an application
 * - instantiates a remote-state caching context to register all queries and mutations to
 * - creates the wrapper functions used to leverage the cache within the remote-state caching context
 * - manages tracking and triggering interactions between queries and mutations (invalidations, updates, etc)
 */
export const createRemoteStateCachingContext = <
  /**
   * specifies the inputs common across all methods, which may be used to extract the cache at runtime, if relevant
   */
  SLI extends any[],
  /**
   * specifies the shared types that can be set to the cache
   *
   * note:
   * - if it is too restrictive, you can define a serialize + deserialize method for your function's output w/ options
   */
  SCV extends any = any // SCV = shared cache value
>({
  cache,
  ...defaultOptions
}: {
  /**
   * specify the cache to use across operations in this remote-state cache context
   */
  cache: RemoteStateCache<SCV> | SimpleCacheResolutionMethod<SLI, SCV, RemoteStateCache<SCV>>;

  /**
   * allow specifying default serialization options
   */
  serialize?: {
    /**
     * allow specifying a default serialization key
     */
    key: KeySerializationMethod<SLI>;
  };
}) => {
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
  const registerQueryToRemoteStateContext = ({ registration }: { registration: RemoteStateCacheContextQueryRegistration<any, any> }) => {
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
  const withRemoteStateQueryCaching = <L extends (...args: any[]) => any, CV extends any = ReturnType<L>>(
    logic: L,
    options: Omit<WithSimpleCachingOptions<L, CV>, 'cache'> & WithRemoteStateCachingOptions,
  ): QueryWithRemoteStateCaching<L, CV> => {
    // grab the name of this query
    const name = extractNameFromRegistrationInputs({ operation: RemoteStateOperation.QUERY, logic, options });

    // define a key serialization method which prefixes the key with the queries name (to give each query it's own namespace), edtending the user inputted serialization method
    const keySerializationMethodFromOptions =
      options.serialize?.key ?? ((defaultOptions.serialize?.key as any) as KeySerializationMethod<Parameters<L>>) ?? defaultKeySerializationMethod;
    const keySerializationMethodWithNamespace: KeySerializationMethod<Parameters<L>> = (...args) =>
      [name, keySerializationMethodFromOptions(...args)].join('.');

    // extend the logic with caching
    const logicExtendedWithCaching = withExtendableCaching(logic, {
      ...options,
      serialize: {
        ...options.serialize,
        key: keySerializationMethodWithNamespace,
      },
      cache: cache as WithSimpleCachingOptions<L, CV>['cache'], // we've asserted that CV is a subset of SCV, so this in reality will work; // TODO: determine why typescript is not happy here
    });

    // register this query
    const registration: RemoteStateCacheContextQueryRegistration<L, CV> = {
      name,
      query: logicExtendedWithCaching,
      options: {
        invalidatedBy: [],
        updatedBy: [],
        deserialize: { value: options.deserialize?.value ?? defaultValueDeserializationMethod },
      },
    };
    registerQueryToRemoteStateContext({ registration });

    // define a method the user can use to add triggers (since defining them on inputs does not give good type safety)
    const addTrigger: QueryWithRemoteStateCachingAddTriggerMethod<L> = <M extends (...args: any[]) => any>({
      invalidatedBy,
      updatedBy,
    }: PickOne<{
      invalidatedBy: RemoteStateQueryInvalidationTrigger<L, M>;
      updatedBy: RemoteStateQueryUpdateTrigger<L, M>;
    }>) => {
      if (invalidatedBy) registration.options.invalidatedBy.push(invalidatedBy);
      if (updatedBy) registration.options.updatedBy.push(updatedBy);
    };

    // and return the extended logic
    return { ...logicExtendedWithCaching, addTrigger, name: registration.name };
  };

  /**
   * define a method which is able to kick off all registered query invalidations and query updates, on the execution of a mutation
   */
  const onMutationOutput = async <LO extends any, CV extends any, M extends (...args: any) => any>({
    mutationName,
    mutationInput,
    mutationOutput,
  }: {
    mutationName: string;
    mutationInput: Parameters<M>;
    mutationOutput: ReturnType<M>;
  }) => {
    const registrations = Object.values(context.registered.queries);

    // define the cache from mutation input, if needed
    const mutationCache = isAFunction(cache) ? cache({ fromInput: mutationInput }) : cache;

    // for each registered query, handle invalidation if needed
    await Promise.all(
      registrations.map(async (registration) => {
        // if invalidated by wasn't defined, do nothing
        if (!registration.options.invalidatedBy) return;

        // if invalidated by wasn't defined for this mutation, do nothing
        const invalidatedByThisMutationDefinition = registration.options.invalidatedBy.find(
          (definition) => definition.mutation.name === mutationName,
        );
        if (!invalidatedByThisMutationDefinition) return;

        // grab the cached query keys for this query
        const cachedQueryKeys = (await mutationCache.keys()).filter((key) => key.startsWith(registration.name)); // keys are namespaced by query name

        // otherwise, define what to invalidate
        const invalidate = invalidatedByThisMutationDefinition.affects({
          mutationInput,
          mutationOutput,
          cachedQueryKeys,
        });

        // execute the invalidations
        if (invalidate.keys) await Promise.all(invalidate.keys.map((forKey) => registration.query.invalidate({ forKey, cache: mutationCache })));
        if (invalidate.inputs) await Promise.all(invalidate.inputs.map((forInput) => registration.query.invalidate({ forInput })));
      }),
    );

    // for each registered query, handle updates if needed
    await Promise.all(
      registrations.map(async (registration) => {
        // if updated by wasn't defined, do nothing
        if (!registration.options.updatedBy) return;

        // if updated by wasn't defined for this mutation, do nothing
        const updatedByThisMutationDefinition = registration.options.updatedBy.find((definition) => definition.mutation.name === mutationName);
        if (!updatedByThisMutationDefinition) return;

        // grab the cached query keys for this query
        const cachedQueryKeys = (await mutationCache.keys()).filter((key) => key.startsWith(registration.name)); // keys are namespaced by query name

        // otherwise, define what to update
        const affected = updatedByThisMutationDefinition.affects({
          mutationInput,
          mutationOutput,
          cachedQueryKeys,
        });

        // define the function that will be used to update the cache with
        const toValue: (args: { cachedValue: CV | undefined }) => LO = ({ cachedValue }) =>
          cachedValue // only run the update if the cache is still valid for this key; otherwise, it shouldn't have been called; i.e., sheild the trigger function from invalidated, undefined, cache values
            ? updatedByThisMutationDefinition.update({
                from: {
                  cachedQueryOutput: Promise.resolve(cachedValue).then(registration.options.deserialize.value), // ensure to wrap it in a promise, so that even if a sync cache is used, the result is consistent w/ output type
                },
                with: {
                  mutationInput,
                  mutationOutput,
                },
              })
            : undefined;

        // execute the updates
        if (affected.keys) await Promise.all(affected.keys.map((forKey) => registration.query.update({ forKey, cache: mutationCache, toValue })));
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
  const withRemoteStateMutationRegistration = <L extends (...args: any[]) => any, CV extends any>(
    logic: L,
    options: WithRemoteStateCachingOptions,
  ): MutationWithRemoteStateRegistration<L> => {
    // define the mutation name
    const mutationName = extractNameFromRegistrationInputs({ operation: RemoteStateOperation.QUERY, logic, options });

    // define the execute function, with triggers onMutationOutput
    const execute: L = (async (...args: Parameters<L>): Promise<ReturnType<L>> => {
      const result = (await logic(...args)) as ReturnType<L>;
      await onMutationOutput({ mutationName, mutationInput: args, mutationOutput: result });
      return result;
    }) as L;

    // return the extended logic
    return { execute, name: mutationName };
  };

  /**
   * return the wrappers
   */
  return {
    withRemoteStateQueryCaching,
    withRemoteStateMutationRegistration,
  };
};
