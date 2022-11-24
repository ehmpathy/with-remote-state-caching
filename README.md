# with-remote-state-caching

![ci_on_commit](https://github.com/ehmpathy/with-remote-state-caching/workflows/ci_on_commit/badge.svg)
![deploy_on_tag](https://github.com/ehmpathy/with-remote-state-caching/workflows/deploy_on_tag/badge.svg)

A wrapper that makes it simple to add powerful caching of remote-state, to maximize performance without loosing accuracy.

Notable features:

- Leverages `remote-state` domain knowledge to maximize ease of use
- Declarative cache invalidation, updates, and optimistic updates
- Customizable cache data store (localstorage, s3, dynamodb, on-disk, etc)
- Wrapper pattern for simple and clean usage
- Built off of battle-tested [with-simple-caching](https://github.com/ehmpathy/with-simple-caching)

# Install

```sh
npm install --save with-remote-state-caching
```

# Examples

These examples will start at the basics and progress to the advanced features you're looking for.

### Imagine, if you will, this example

Imagine that you're creating a website which lets users search and upload recipes.

If you're using typescript, lets say the recipe looks something like this:
```ts
/**
 * a recipe
 */
type Recipe = {
  uuid?: string;
  title: string;
  description: string;
  ingredients: string[];
  steps: string[]
}
```

To let users search recipes, you'll probably have a function that looks something like this:
```ts
/**
 * a function which calls the remote-state api and looks up recipes, without caching
 */
const getRecipes = ({ searchFor }: { searchFor: string }): Promise<Recipe[]> => {
  // ...
}
```

To let users add new recipes, you'll probably have a function that looks something like this:
```ts
/**
 * a function which saves a recipe to the database
 */
const saveRecipe = ({ recipe }: { recipe: Recipe }): Promise<Required<Recipe>> => {
  // ...
}
```

### Setup remote-state caching

Before being able to use remote-state caching, we'll need to set up a remote-state caching context within which the queries and mutations will be registered

This context,
- tracks all of the queries and mutations registered with the wrapper functions it exposes
- triggers all interactions specified by the query and mutation options you defined
- provides additional data useful in defining the interactions between queries and mutations (e.g., currently cached keys)

In short, this is the glue that provides the additional information, i.e., context, needed for the remote-state caching to produce the powerful automations which make it so useful.

Let's get started

```ts
import { setupRemoteStateCaching } from 'with-remote-state-caching';
import { createCache } from 'simple-localstorage-cache';

// creates a shared context that all registered queries and mutations will be able to interact within
const { withRemoteStateQueryCaching, withRemoteStateMutationRegistration } = createRemoteStateCachingContext()
```

### Cache the response of a query

Lets add a cache on top of your query, so that subsequent calls resolve instantly without hitting the api, to speed up the results.

```ts
import { createCache } from 'simple-localstorage-cache';
import { withRemoteStateQueryCaching } from 'with-remote-state-caching';

// add remote-state caching to the query `getRecipesFromApi`
const queryGetRecipes = withRemoteStateQueryCaching(getRecipes, { cache: createCache() });

// now, when you execute that query, the result will be cached
await queryGetRecipes.execute({ searchFor: 'chocolate' }); // calls api
await queryGetRecipes.execute({ searchFor: 'chocolate' }); // does not call the api, fetches from cache
await queryGetRecipes.execute({ searchFor: 'bananas' }); // calls api
await queryGetRecipes.execute({ searchFor: 'bananas' }); // does not call the api, fetches from cache
```

note, in this particular example we're using [simple-localstorage-cache](https://github.com/ehmpathy/simple-localstorage-cache), but you can use any cache which works with [with-simple-caching](https://github.com/ehmpathy/with-simple-caching), for example
- [simple-on-disk-caching](https://github.com/ehmpathy/simple-on-disk-cache) for s3 and mounted persistance
- [simple-dynamodb-caching](https://github.com/ehmpathy/simple-dynamodb-cache) for dynamodb persistance
- [simple-localstorage-caching](https://github.com/ehmpathy/simple-localstorage-cache) for browser localstorage persistance
- [simple-in-memory-caching](https://github.com/ehmpathy/simple-in-memory-cache) for in-memory persistance
- etc


### Manually invalidate the cached response of a query

Now, lets say you find out that the remote-state was updated and you want to make sure you hit the api the next time you call the query. (Maybe your friend just told you he added another "banana" recipe 🙂)

You can easily do this by `invalidating` the cached value for a particular input, like this:
```ts
// before invalidation, the result for this input will still come from the cache
await queryGetRecipes.execute({ searchFor: 'bananas' }); // does not call the api, fetches from cache

// invalidate it
await queryGetRecipes.invalidate({ searchFor: 'bananas' })

// after invalidation, nothing will be cached for this input, and will call the api
await queryGetRecipes.execute({ searchFor: 'bananas' }); // calls api
```

### Manually update the cached response of a query

Now, lets say you you know exactly how the remote state for a query changed, and instead of `invalidating` the cached response you would like to `update` it instead.

You can easily do this by `updating` the cached value for a particular input, like this:
```ts
// before the update, show that there were only 2 recipes
const foundRecipes = await queryGetRecipes.execute({ searchFor: 'bananas' });

// now, update the cached response for "bananas", since we know that we just added another "bananas" recipe
const newBananasRecipe: Recipe = {/** ... */}
await queryGetRecipes.update({
  forInput: { searchFor: 'bananas' },
  toValue: ({ cachedValue: cachedRecipes }) => [...currentRecipes, newBananasRecipe], // add the new bananas recipe to the end of the list
})
```

### Automatically invalidate the cached response of a query

Given that we have a `mutation` in our app which updates the recipies in the remote-state, it's natural to wonder, can we just use that as a trigger for invalidating our cache? For example, can we trigger invalidating our `getRecipes` query whenever a new recipe is saved with the `saveRecipe` mutation?

Oh boy can we 😄

Not only can we trigger the invalidation automatically, but we can also narrow the invalidation to the specific set of cache keys that were affected.

First, we must first register the `mutation` with our remote-state caching system, so that it can detect when the mutation is called. This is easy to do:
```ts
// registers the mutation with our remote-state caching system, does not apply any caching to it
const mutationSaveRecipe = withRemoteStateMutationRegistration(saveRecipe);
```

Finally, you can define these invalidation triggers when wrapping your query withRemoteStateQueryCaching with the `invalidatedBy` option, like so:
```ts
// add remote-state caching, with automatic invalidation, to the query `getRecipesFromApi`
const queryGetRecipes = withRemoteStateQueryCaching(
  getRecipes,
  {
    cache: createCache(),
    invalidatedBy: [
      {
        mutation: mutationSaveRecipe,
        affects: ({ mutationInput, cachedQueryKeys }) => {
          return {
            // invalidate all of the keys which included the new recipe's title (new recipe being defined in the mutationInput)
            keys: cachedQueryKeys.filter((cachedQueryKey) =>
              cachedQueryKey.includes(mutationInput[0].title),
            ),
          };
        },
      },
    ]
  }
);
```

Easy peasy.

### Automatically update the cached response of a query

Now you may be thinking, if we can invalidate the cache based on a mutation firing, can we just update the cache based on the input and output of the mutation?

Spot on 🤓

We can easily automatically update the cached value of certain keys of a query triggered by a mutation, preventing the additional api call that invalidation would have produced 🚀

You can define these update triggers when wrapping your query withRemoteStateQueryCaching with the `updatedBy` option, like so:
```ts
// add remote-state caching, with automatic updates, to the query `getRecipesFromApi`
const queryGetRecipes = withRemoteStateQueryCaching(
  getRecipes,
  {
    cache: createCache(),
    updatedBy: [
      {
        mutation: mutationSaveRecipe,
        affects: ({ mutationInput, mutationOutput, cachedQueryKeys }) => {
          return {
            // update all of the cached values from keys which included the new recipe's title (new recipe being defined in the mutationInput)
            keys: cachedQueryKeys.filter((cachedQueryKey) =>
              cachedQueryKey.includes(mutationInput[0].title),
            ),
          };
        },
        update: ({ from: { cachedQueryOutput }, with: { mutationInput, mutationOutput } }) => {
          const cachedRecipies = cachedQueryOutput; // rename this for clarity
          const newRecipe = mutationInput[1];
          return [newRecipe, ...cachedRecipies] // update the cache to stick the new recipe at the beginning of the list
        }
      },
    ]
  }
);
```


# Upcoming Features

- domain-object reference caching
- mutation optimistic-response caching, resolution, and triggered updates
- remote-state update event subscriptions

