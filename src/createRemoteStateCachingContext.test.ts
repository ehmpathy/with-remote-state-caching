import { createCache } from 'simple-in-memory-cache';
import uuid from 'uuid';
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
    const { withRemoteStateQueryCaching } = createRemoteStateCachingContext();

    // define a query that we'll be caching
    const apiCalls = [];
    const queryGetRecipes = withRemoteStateQueryCaching(
      async ({ searchFor }: { searchFor: string }): Promise<Recipe[]> => {
        apiCalls.push(searchFor);
        return [{ uuid: uuid(), title: '__TITLE__', description: '__DESCRIPTION__', ingredients: [], steps: [] }];
      },
      {
        name: 'queryGetRecipes',
        cache: createCache<Recipe[]>(),
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
        ...(cachedValue ?? []),
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
  it('should be possible to automatically invalidate query cache on mutation', async () => {
    // start the context
    const { withRemoteStateQueryCaching, withRemoteStateMutationRegistration } = createRemoteStateCachingContext();

    // define a mutation which we'll have as a trigger for cache invalidation
    const mutationAddRecipe = withRemoteStateMutationRegistration(async ({ recipe }: { recipe: Recipe }) => {}, { name: 'mutationAddRecipe' });

    // define a query that we'll be caching
    const apiCalls = [];
    const queryGetRecipes = withRemoteStateQueryCaching(
      async ({ searchFor }: { searchFor: string }): Promise<Recipe[]> => {
        apiCalls.push(searchFor);
        return [{ uuid: uuid(), title: '__TITLE__', description: '__DESCRIPTION__', ingredients: [], steps: [] }];
      },
      {
        name: 'queryGetRecipes',
        cache: createCache<Recipe[]>(),
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
  });
});
