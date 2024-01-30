# React Query + XState
Date: _01/23/2024_  
License: _MIT_  
Status: _promising early results_


## Summary
This proof of concept explores combining XState with TanStack's react-query. The goal is to get the benefits of react-query's handling of asynchronous state of fetchers/queries/mutations all within the nice state management framework that XState provides by using `@tanstack/core-query`, the underlying library that powers react-query.


## Problem
React query is pretty neat. It's really efficient at handling data fetching, caching, and state synchronization. XState is pretty neat. It makes state transitions predictable and manageable.But react-query's hook structure doesn't really play well with other state management libraries. And XState's general way of handling asynchronous operations is just wrapping `fetch`. So I wanted to know if they could be combined to leverage both the robust data management of React Query and the structured state control of state machines.


## Research / Prior Art
The key idea is that react-query is just one of multiple tanstack "query" libraries. Which implied that there was a nice stable core underneath them. Sure enough, react-query is built off of [@tanstack/query-core](https://github.com/TanStack/query/tree/main/packages/query-core), which is undocumented but has its own npm package. 

In fact, query-core is also what's used by [jotai-tanstack-query](https://github.com/jotaijs/jotai-tanstack-query), a pretty mature project for the jotai state management library. This project, along with the [react-query source](https://github.com/TanStack/query/blob/main/packages/react-query/src/useBaseQuery.ts) were pretty essential to figuring out how things worked under the react-query hood. 

Interestingly, somebody else had the idea of xstate + react-query before with `xstate-fetcher`, posted about in [this Stately.ai thread](https://github.com/statelyai/xstate/discussions/3537). However, `xstate-fetcher` appears to be more of an inspired re-implementation of react-query and has no apparent users. Or documentation beyond that thread.  


## Approach & Results
I used XState's Callback Actor for ease of use. So far it seems to work. The heart of it is this bit of code from `CallbackApp.tsx`:
```ts
const fetchActor = fromCallback<FetchEvents, FetchInput>(
  ({ sendBack, receive, input: options, self, system }) => {
    const defaultedOptions = client.defaultQueryOptions(options);
    const observer = new QueryObserver(client, defaultedOptions);
    const result = observer.getOptimisticResult(defaultedOptions);

    function sendEvent(res: QueryObserverResult) {
      console.log("Sending stuff", res, res.status);
      sendBack({ type: "update", status: res.status, data: res.data });
    }

    const removeListener = observer.subscribe(
      notifyManager.batchCalls(sendEvent),
    );

    receive((event) => {
      if (event.type === "updateOptions") {
        observer.setOptions(event.data, { listeners: false });
      }

      if (event.type === "stopListening") {
        console.log("Stopping listening");
        removeListener();
      }
    });


    sendBack({ type: "init", status: result.status, data: result.data });

    // Cleanup function
    return () => {
      console.log("Cleaning up");
      removeListener();
    };
  },
);

```


## Current Status / Limitations 
Status:
- This approach seems viable.

Limitations:
- The Callback Actor seems to be generally disliked? At least that's the vibe from the docs. 
- I'm not really sure how to integrate this into a broader machine. 
- xstate itself seems to be somewhat in flux with v5 and changes around documentation and best practices. 
- A lot of the react-query guts is dealing with `Suspense`, which I do absolutely none of. 


## Further work
- [ ] Building out mutations and InfiniteQueries
- [ ] Obvious cleanup
- [ ] Setting up a lite but more real-world usage like [todomvc](https://codesandbox.io/p/devbox/bold-cherry-7fng6v?file=%2Fsrc%2FTodo.tsx%3A58%2C10) (see also: [this codesandbox](https://codesandbox.io/s/xstate-todomvc-33wr94qv1?file=/todoMachine.js))
- [ ] Wrapping up the callback actor inside another machine. 
 


## Usage
N/A. 


## License
MIT

