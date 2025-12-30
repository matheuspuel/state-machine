import { Record } from 'effect'
import {
  AnyStateActions,
  make,
  makeStore,
  StateMachine,
  Store,
} from '../definition'

export const Struct = <
  A extends Record<string, StateMachine<any, AnyStateActions>>,
  ExtraActions extends AnyStateActions = {},
>(
  fields: A,
  options?: {
    extraActions?: (machine: {
      Store: Store<{
        [K in keyof A]: A[K] extends StateMachine<infer State, any>
          ? State
          : never
      }>
    }) => ExtraActions
  },
) =>
  make<{
    [K in keyof A]: A[K] extends StateMachine<infer State, any> ? State : never
  }>()<
    {
      [K in keyof A]: A[K] extends StateMachine<any, infer Actions>
        ? Actions
        : never
    } & ExtraActions
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
      ...options?.extraActions?.({ Store }),
    }),
    // TODO implement other options
  })
