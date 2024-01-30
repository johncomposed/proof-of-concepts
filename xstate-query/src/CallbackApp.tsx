import { useState } from "react";
import "./App.css";
import {
  useQuery,
  useQueryClient,
  useMutation,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  DefaultError,
  QueryClient,
  QueryKey,
  QueryObserver,
  QueryObserverOptions,
  QueryObserverResult,
  WithRequired,
  notifyManager,
} from "@tanstack/query-core";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { assign, fromPromise, fromCallback, sendTo, setup } from "xstate";
import { useActor } from "@xstate/react";

export interface UseQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> extends Omit<
    WithRequired<
      QueryObserverOptions<
        TQueryFnData,
        TError,
        TData,
        TQueryFnData,
        TQueryKey
      >,
      "queryKey"
    >,
    "suspense"
  > {}

async function getGreeting(name: string): Promise<{ greeting: string }> {
  return new Promise((res, rej) => {
    setTimeout(() => {
      if (Math.random() < 0.5) {
        rej();
        return;
      }
      res({
        greeting: `Hello, ${name}!`,
      });
    }, 1000);
  });
}

type FetchEvents =
  | {
      type: "updateOptions";
      data: UseQueryOptions;
    }
  | {
      type: string;
      data?: any;
    };

type FetchInput = UseQueryOptions;

const client = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => await getGreeting(queryKey.join("")),
    },
  },
});

const fetchUserActor = fromCallback<FetchEvents, FetchInput>(
  ({ sendBack, receive, input: options, self, system }) => {
    const defaultedOptions = client.defaultQueryOptions(options);
    const observer = new QueryObserver(client, defaultedOptions);
    const result = observer.getOptimisticResult(defaultedOptions);

    function sendStuff(res: QueryObserverResult) {
      console.log("Sending stuff", res, res.status);
      sendBack({ type: "update", status: res.status, data: res.data });
    }

    const removeListener = observer.subscribe(
      notifyManager.batchCalls(sendStuff),
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


    // This feels weird but I guess it's _a_ way to pass along the data. 
    // Otherwise result just isn't doing anything, which feels wrong. 
    sendBack({ type: "init", status: result.status, data: result.data });

    // Cleanup function
    return () => {
      console.log("Cleaning up");
      removeListener();
    };
  },
);


const greetingMachine = setup({
  types: {
    context: {} as {
      name: string;
      data: { greeting: string } | null;
    },
    input: { name: '' as string | null }
  },
  actors: {
    fetchUser: fetchUserActor,
  },
}).createMachine({
  initial: "idle",
  context: ({ input }) => ({
    name: input?.name ?? "World", 
    data: null,
  }),
  states: {
    idle: {
      on: {
        FETCH: "loading",
      },
    },
    loading: {
      invoke: {
        src: "fetchUser",
        input: ({ context }) => ({ queryKey: [context.name] }),
      },
      on: {
        update: {
          actions: [
            ({ event }) => console.log("update", event),
            assign(({event, context}) => {
              if (event.data) return {
                data: event.data
              }
              return context
            })
          ],
        },
      },
    },
  },
});

function Example() {
  const [count, setCount] = useState(0);
  const [state, send] = useActor(
    greetingMachine.provide({
      // actors: {
      //   fetchUser: fetchUserActor,
      // },
    }),
    {
      input: {
        name: "World2",
      },
    },
  );

  console.log("state", state);
  return (
    <>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => send({ type: "FETCH" })}>fetch</button>
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

export function App() {
  return (
    <QueryClientProvider client={client}>
      <Example />
      <ReactQueryDevtools initialIsOpen />
    </QueryClientProvider>
  );
}

export default App;
