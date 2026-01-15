import { Record } from 'effect'
import {
  AnyStateActions,
  make,
  makeStore,
  StateMachine,
} from '../definition.js'

export const Struct = <
  A extends Record<string, StateMachine<any, AnyStateActions>>,
>(
  fields: A,
) =>
  make<{
    [K in keyof A]: A[K] extends StateMachine<infer State, any> ? State : never
  }>()<{
    [K in keyof A]: A[K] extends StateMachine<any, infer Actions>
      ? Actions
      : never
  }>({
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
    // TODO implement other options
  })
