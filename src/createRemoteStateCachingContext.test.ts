import { createCache } from 'simple-in-memory-cache';
import { HasMetadata } from 'type-fns';
import uuid from 'uuid';
import { SimpleCache } from 'with-simple-caching';
import { createRemoteStateCachingContext } from './createRemoteStateCachingContext';

/**
 * a recipe
 */
type Recipe = {
  uuid?: string;
  title: string;
  description: string;
  ingredients: string[];
  steps: string[];
};

describe('createRemoteStateCachingContext', () => {
  it('should be possible to add extended caching to a query', async () => {
    // start the context
    const { withRemoteStateQueryCaching } = createRemoteStateCachingContext({
      cache: createCache(),
    });

    // define a query that we'll be caching
    const apiCalls = [];
    const queryGetRecipes = withRemoteStateQueryCaching(
      async ({ searchFor }: { searchFor: string }): Promise<Recipe[]> => {
        apiCalls.push(searchFor);
        return [{ uuid: uuid(), title: '__TITLE__', description: '__DESCRIPTION__', ingredients: [], steps: [] }];
      },
      {
        name: 'queryGetRecipes',
      },
    );

    // make a few requests
    const result1 = await queryGetRecipes.execute({ searchFor: 'steak' });
    const result2 = await queryGetRecipes.execute({ searchFor: 'smoothie' });
    const result3 = await queryGetRecipes.execute({ searchFor: 'steak' });
    const result4 = await queryGetRecipes.execute({ searchFor: 'smoothie' });

    // prove that subsequent duplicate requests returned the same result
    expect(result3).toEqual(result1);
    expect(result4).toEqual(result2);

    // prove that we only called the api twice, once per unique request, since dupe request responses should have come from cache
    expect(apiCalls.length).toEqual(2);

    // invalidate a request
    await queryGetRecipes.invalidate({ forInput: [{ searchFor: 'steak' }] });

    // now make the query again and prove that it hits the api
    const result5 = await queryGetRecipes.execute({ searchFor: 'steak' });
    expect(result5).not.toEqual(result1);
    expect(apiCalls.length).toEqual(3);

    // update a request
    await queryGetRecipes.update({
      forKey: JSON.stringify([{ searchFor: 'smoothie' }]), // update by key, instead of input
      toValue: async ({ cachedValue }) => [
        ...((await cachedValue) ?? []),
        { title: 'new smoothie', description: 'great smothie', ingredients: [], steps: [] }, // add a new recipe to it
      ],
    });

    // now make a query again and prove that it doesn't hit the api, but returned the updated value
    const result6 = await queryGetRecipes.execute({ searchFor: 'smoothie' });
    expect(apiCalls.length).toEqual(3); // no increase
    expect(result6).not.toEqual(result2); // new value
    expect(result6.length).toEqual(2); // should have 2 recipes now
    expect(result6[1]).toMatchObject({ title: 'new smoothie' }); // the second should be the one we explicitly added
  });
  it('should be possible to automatically invalidate and update a query cache from mutations', async () => {
    // start the context
    const { withRemoteStateQueryCaching, withRemoteStateMutationRegistration } = createRemoteStateCachingContext({ cache: createCache() });

    // define a mutation which we'll have as a trigger for cache invalidation
    const mutationAddRecipe = withRemoteStateMutationRegistration(async ({ recipe }: { recipe: Recipe }) => recipe, { name: 'mutationAddRecipe' });

    // define a mutation which we'll have as a trigger for cache update
    const mutationDeleteRecipe = withRemoteStateMutationRegistration(async (_: { recipeUuid: string }) => {}, {
      name: 'mutationDeleteRecipe',
    });

    // define a query that we'll be caching
    const apiCalls = [];
    const queryGetRecipes = withRemoteStateQueryCaching(
      async ({ searchFor }: { searchFor: string }): Promise<HasMetadata<Recipe>[]> => {
        apiCalls.push(searchFor);
        return [{ uuid: uuid(), title: '__TITLE__', description: '__DESCRIPTION__', ingredients: [], steps: [] }];
      },
      {
        name: 'queryGetRecipes',
      },
    );

    // assign the invalidatedBy and updatedBy triggers
    queryGetRecipes.addTrigger({
      invalidatedBy: {
        mutation: mutationAddRecipe,
        affects: ({ mutationInput }) => ({
          inputs: mutationInput[0].recipe.title.split(' ').map((substring) => [{ searchFor: substring }]), // invalidate every query that was run on a word in the title of the recipe (note: this is not a good real-world example, but does the job for testing)
        }),
      },
    });
    queryGetRecipes.addTrigger({
      updatedBy: {
        mutation: mutationDeleteRecipe,
        affects: ({ cachedQueryKeys }) => ({ keys: cachedQueryKeys }), // update _all_ keys, since we dont know which ones will have included this recipe
        update: ({ from: { cachedQueryOutput }, with: { mutationInput } }) =>
          cachedQueryOutput.then((recipes) => recipes.filter((recipe) => recipe.uuid !== mutationInput[0].recipeUuid)),
      },
    });

    // make a few requests
    const result1 = await queryGetRecipes.execute({ searchFor: 'steak' });
    const result2 = await queryGetRecipes.execute({ searchFor: 'smoothie' });
    const result3 = await queryGetRecipes.execute({ searchFor: 'steak' });
    const result4 = await queryGetRecipes.execute({ searchFor: 'smoothie' });

    // prove that subsequent duplicate requests returned the same result
    expect(result3).toEqual(result1);
    expect(result4).toEqual(result2);

    // prove that we only called the api twice, once per unique request, since dupe request responses should have come from cache
    expect(apiCalls.length).toEqual(2);

    // execute mutation to add a recipe which includes the word 'steak' in the title
    await mutationAddRecipe.execute({
      recipe: {
        title: 'perfect, jalapeno t-bone steak',
        description: 'a juicy, perfectly cooked, spicy, jalapeno t-bone steak',
        ingredients: [],
        steps: [],
      },
    });

    // prove that we invalidated the request
    const result5 = await queryGetRecipes.execute({ searchFor: 'steak' });
    expect(result5).not.toEqual(result1); // should have gotten a different result after cache invalidation
    expect(apiCalls.length).toEqual(3); // and should have called the api after cache invalidation

    // execute mutation to delete a recipe we've previously found for smoothie
    await mutationDeleteRecipe.execute({ recipeUuid: result2[0].uuid });

    // prove that we updated the cached value for that request
    const result6 = await queryGetRecipes.execute({ searchFor: 'smoothie' });
    expect(result2.length).toEqual(1);
    expect(result6.length).toEqual(0); // should no longer have any results, since our updatedBy trigger should have removed the recipe by uuid
    expect(apiCalls.length).toEqual(3); // should not have had another api call, since we updated the cache, not invalidated it
  });
  it('should be possible to invalidate and update a query cache from mutation, when cache is pulled from input at runtime', async () => {
    // start the context
    const { withRemoteStateQueryCaching, withRemoteStateMutationRegistration } = createRemoteStateCachingContext({
      cache: ({ fromInput }) => fromInput[1].cache,
    });

    // define a mutation which we'll have as a trigger for cache invalidation
    const mutationAddRecipe = withRemoteStateMutationRegistration(async ({ recipe }: { recipe: Recipe }, _: { cache: SimpleCache<any> }) => recipe, {
      name: 'mutationAddRecipe',
    });

    // define a mutation which we'll have as a trigger for cache update
    const mutationDeleteRecipe = withRemoteStateMutationRegistration(async (_: { recipeUuid: string }, __: { cache: SimpleCache<any> }) => {}, {
      name: 'mutationDeleteRecipe',
    });

    // define a query that we'll be caching
    const apiCalls = [];
    const queryGetRecipes = withRemoteStateQueryCaching(
      async ({ searchFor }: { searchFor: string }, _: { cache: SimpleCache<any> }): Promise<HasMetadata<Recipe>[]> => {
        apiCalls.push(searchFor);
        return [{ uuid: uuid(), title: '__TITLE__', description: '__DESCRIPTION__', ingredients: [], steps: [] }];
      },
      {
        name: 'queryGetRecipes',
      },
    );

    // assign the invalidatedBy and updatedBy triggers
    queryGetRecipes.addTrigger({
      invalidatedBy: {
        mutation: mutationAddRecipe,
        affects: ({ mutationInput }) => ({
          inputs: mutationInput[0].recipe.title.split(' ').map((substring) => [{ searchFor: substring }, { cache: mutationInput[1].cache }]), // invalidate every query that was run on a word in the title of the recipe (note: this is not a good real-world example, but does the job for testing)
        }),
      },
    });
    queryGetRecipes.addTrigger({
      updatedBy: {
        mutation: mutationDeleteRecipe,
        affects: ({ cachedQueryKeys }) => ({ keys: cachedQueryKeys }), // update _all_ keys, since we dont know which ones will have included this recipe
        update: ({ from: { cachedQueryOutput }, with: { mutationInput } }) =>
          cachedQueryOutput.then((recipes) => recipes.filter((recipe) => recipe.uuid !== mutationInput[0].recipeUuid)),
      },
    });

    // initialize a cache we'll use for the requests in input
    const cache = createCache();

    // make a few requests
    const result1 = await queryGetRecipes.execute({ searchFor: 'steak' }, { cache });
    const result2 = await queryGetRecipes.execute({ searchFor: 'smoothie' }, { cache });
    const result3 = await queryGetRecipes.execute({ searchFor: 'steak' }, { cache });
    const result4 = await queryGetRecipes.execute({ searchFor: 'smoothie' }, { cache });

    // prove that subsequent duplicate requests returned the same result
    expect(result3).toEqual(result1);
    expect(result4).toEqual(result2);

    // prove that we only called the api twice, once per unique request, since dupe request responses should have come from cache
    expect(apiCalls.length).toEqual(2);

    // execute mutation to add a recipe which includes the word 'steak' in the title
    await mutationAddRecipe.execute(
      {
        recipe: {
          title: 'perfect, jalapeno t-bone steak',
          description: 'a juicy, perfectly cooked, spicy, jalapeno t-bone steak',
          ingredients: [],
          steps: [],
        },
      },
      { cache },
    );

    // prove that we invalidated the request
    const result5 = await queryGetRecipes.execute({ searchFor: 'steak' }, { cache });
    expect(result5).not.toEqual(result1); // should have gotten a different result after cache invalidation
    expect(apiCalls.length).toEqual(3); // and should have called the api after cache invalidation

    // execute mutation to delete a recipe we've previously found for smoothie
    await mutationDeleteRecipe.execute({ recipeUuid: result2[0].uuid }, { cache });

    // prove that we updated the cached value for that request
    const result6 = await queryGetRecipes.execute({ searchFor: 'smoothie' }, { cache });
    expect(result2.length).toEqual(1);
    expect(result6.length).toEqual(0); // should no longer have any results, since our updatedBy trigger should have removed the recipe by uuid
    expect(apiCalls.length).toEqual(3); // should not have had another api call, since we updated the cache, not invalidated it
  });
  it.todo('should be possible to invalidate and update a query cache from mutation, when multiple contexts are used, simulating separate processes');
});
