import { Array as Array_, Record } from 'effect'
import {
  AnyStateActions,
  make,
  makeStore,
  StateMachine,
  StateMachineWithoutInitialState,
  type,
} from '../definition.js'

type BasicActions<A> = {
  get: () => A
  update: (f: (previous: A) => A) => void
  set: (value: A) => void
}

export const of: {
  <A>(): StateMachineWithoutInitialState<A, BasicActions<A>>
  <A>(initialState: A): StateMachine<A, BasicActions<A>>
} = <A>(...args: [A] | []) =>
  type<A>().make({
    initialState: args[0]!,
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

type ArrayActions<A, ItemActions extends AnyStateActions> = {
  append: (value: A) => void
  remove: (index: number) => void
  index: (index: number) => ItemActions | null
  find: (predicate: (item: A) => boolean) => ItemActions | null
}

export const Array: {
  <A, ItemActions extends AnyStateActions>(
    field: StateMachine<A, ItemActions>,
  ): StateMachine<
    readonly A[],
    ArrayActions<A, ItemActions> & { appendInitial: () => void }
  >
  <A, ItemActions extends AnyStateActions>(
    field: StateMachineWithoutInitialState<A, ItemActions>,
  ): StateMachine<readonly A[], ArrayActions<A, ItemActions>>
} = <A, ItemActions extends AnyStateActions>(
  field:
    | StateMachine<A, ItemActions>
    | StateMachineWithoutInitialState<A, ItemActions>,
) =>
  type<readonly A[]>().make({
    initialState: [],
    actions: ({ Store }) => ({
      append: (value: A) => Store.update(_ => [..._, value]),
      appendInitial: () =>
        Store.update(_ => [
          ..._,
          (field as Extract<typeof field, { initialState: unknown }>)
            .initialState,
        ]),
      remove: (index: number) =>
        Store.update(_ => [..._.slice(0, index), ..._.slice(index + 1)]),
      index: (index: number) => {
        const state = Store.get()
        if (index < 0 || index >= state.length) return null
        return field.actions({
          Store: makeStore<A>({
            get: () => state[index]!,
            update: f => Store.update(_ => Array_.modify(_, index, f)),
          }),
        })
      },
      find: (predicate: (item: A) => boolean) => {
        const state = Store.get()
        const index = state.findIndex(predicate)
        if (index === -1) return null
        return field.actions({
          Store: makeStore<A>({
            get: () => state[index]!,
            update: f => Store.update(_ => Array_.modify(_, index, f)),
          }),
        })
      },
    }),
  })
