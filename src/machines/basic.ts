import { Record } from 'effect'
import {
  AnyStateActions,
  make,
  makeStore,
  StateMachine,
  withState,
} from '../definition.js'

export const of = <A>(initialState: A) =>
  withState<A>().make({
    initialState,
    actions: ({ Store }) => ({
      get: Store.get,
      update: (f: (previous: A) => A) => Store.update(f),
      set: (value: A) => Store.update(() => value),
    }),
  })

export const Struct = <
  A extends Record<string, StateMachine<any, AnyStateActions>>,
>(
  fields: A,
) =>
  make<
    {
      [K in keyof A]: A[K] extends StateMachine<infer State, any>
        ? State
        : never
    },
    {
      [K in keyof A]: A[K] extends StateMachine<any, infer Actions>
        ? Actions
        : never
    }
  >({
    initialState: Record.map(fields, _ => _.initialState) as any,
    actions: ({ Store }) => ({
      ...(Record.map(fields, (_, key) =>
        _.actions({
          Store: makeStore({
            get: () => Store.get()[key],
            update: f => Store.update(_ => ({ ..._, [key]: f(_[key]) })),
          }) as any,
        }),
      ) as any),
    }),
    start: ({ Store }) =>
      Promise.all(
        Object.keys(fields).map(async key => {
          const field = fields[key]!
          return field.start?.({
            Store: makeStore({
              get: () => Store.get()[key],
              update: f => Store.update(_ => ({ ..._, [key]: f(_[key]) })),
            }) as any,
          })
        }),
      ),
    onUpdate: async state => {
      await Promise.all(
        Object.keys(fields).map(async key => {
          const field = fields[key]!
          return field.onUpdate?.(state[key])
        }),
      )
    },
  })
