import { Array as Array_, Record as Record_ } from 'effect'
import { ReadonlyRecord } from 'effect/Record'
import {
  AnyStateActions,
  make,
  makeStore,
  StateMachine,
  StateMachineWithoutInitialState,
  Store,
  type,
} from '../definition.js'

type BasicActions<A> = {
  get: () => A
  update: (f: (previous: A) => A) => void
  set: (value: A) => void
}

const makeBasicActions = <A>({ Store }: { Store: Store<A> }) => ({
  get: Store.get,
  update: Store.update,
  set: (value: A) => Store.update(() => value),
})

export const of: {
  <A>(): StateMachineWithoutInitialState<A, BasicActions<A>>
  <A>(initialState: A): StateMachine<A, BasicActions<A>>
} = <A>(...args: [A] | []) =>
  type<A>().make({
    initialState: args[0]!,
    actions: ({ Store }) => makeBasicActions({ Store }),
  })

type BooleanActions = BasicActions<boolean> & {
  toggle: () => void
}

export const Boolean = (initialState: boolean = false) =>
  of(initialState).mapActions(
    (actions): BooleanActions => ({
      ...actions,
      toggle: () => actions.update(_ => !_),
    }),
  )

export const String = (initialState: string = '') => of(initialState)

export const Number = (initialState: number = 0) => of(initialState)

export const Struct: {
  <Fields extends Record<string, StateMachine<any, AnyStateActions>>>(
    fields: Fields,
  ): StateMachine<
    {
      [K in keyof Fields]: Fields[K] extends StateMachine<infer State, any>
        ? State
        : never
    },
    BasicActions<{
      [K in keyof Fields]: Fields[K] extends StateMachine<infer State, any>
        ? State
        : never
    }> &
      Omit<
        {
          [K in keyof Fields]: Fields[K] extends StateMachine<
            any,
            infer Actions
          >
            ? Actions
            : never
        },
        keyof BasicActions<unknown>
      >
  >
  <
    Fields extends Partial<
      Record<string, StateMachineWithoutInitialState<any, AnyStateActions>>
    >,
  >(
    fields: Fields,
  ): StateMachineWithoutInitialState<
    {
      [K in keyof Fields]: Fields[K] extends StateMachineWithoutInitialState<
        infer State,
        any
      >
        ? State
        : never
    },
    BasicActions<{
      [K in keyof Fields]: Fields[K] extends StateMachineWithoutInitialState<
        infer State,
        any
      >
        ? State
        : never
    }> &
      Omit<
        {
          [K in keyof Fields]: Fields[K] extends StateMachineWithoutInitialState<
            any,
            infer Actions
          >
            ? Actions
            : never
        },
        keyof BasicActions<unknown>
      >
  >
} & {
  type: typeof Struct_type
} = (
  fields: Record<string, StateMachineWithoutInitialState<any, AnyStateActions>>,
) =>
  make({
    initialState: Record_.map(fields, _ =>
      'initialState' in _ ? _.initialState : undefined,
    ) as any,
    actions: ({ Store }) => ({
      ...(Record_.map(fields, (_, key) =>
        _.actions({
          Store: makeStore({
            get: () => Store.get()[key],
            update: f => Store.update(_ => ({ ..._, [key]: f(_[key]) })),
          }) as any,
        }),
      ) as any),
      ...makeBasicActions({ Store }),
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

const Struct_type =
  <A>() =>
  <
    Fields extends Partial<{
      [K in keyof A]: StateMachineWithoutInitialState<A[K], any>
    }>,
  >(
    fields: Fields,
  ): StateMachineWithoutInitialState<
    A,
    BasicActions<A> &
      Omit<
        {
          [K in keyof Fields &
            keyof A]: Fields[K] extends StateMachineWithoutInitialState<
            any,
            infer Actions
          >
            ? Actions
            : never
        },
        keyof BasicActions<unknown>
      >
  > =>
    Struct(fields) as any

Struct.type = Struct_type

type ArrayActions<A, ItemActions extends AnyStateActions> = BasicActions<
  readonly A[]
> & {
  append: (value: A) => void
  prepend: (value: A) => void
  remove: {
    (index: number): void
    // eslint-disable-next-line @typescript-eslint/unified-signatures
    (predicate: (item: A, index: number) => boolean): void
  }
  index: (index: number) => ItemActions | null
  find: (predicate: (item: A) => boolean) => ItemActions | null
}

export const Array: {
  <A, ItemActions extends AnyStateActions>(
    field: StateMachine<A, ItemActions>,
  ): StateMachine<
    readonly A[],
    ArrayActions<A, ItemActions> & {
      appendInitial: () => void
      prependInitial: () => void
    }
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
      ...makeBasicActions({ Store }),
      append: (value: A) => Store.update(_ => [..._, value]),
      prepend: (value: A) => Store.update(_ => [value, ..._]),
      appendInitial: () =>
        Store.update(_ => [
          ..._,
          (field as Extract<typeof field, { initialState: unknown }>)
            .initialState,
        ]),
      prependInitial: () =>
        Store.update(_ => [
          (field as Extract<typeof field, { initialState: unknown }>)
            .initialState,
          ..._,
        ]),
      remove: (
        indexOrPredicate: number | ((item: A, index: number) => boolean),
      ) =>
        typeof indexOrPredicate === 'number'
          ? Store.update(_ => Array_.remove(_, indexOrPredicate))
          : Store.update(_ => _.filter((v, i) => !indexOrPredicate(v, i))),
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

type RecordActions<
  K extends string | symbol,
  A,
  ItemActions extends AnyStateActions,
> = BasicActions<ReadonlyRecord<K, A>> & {
  insert: (key: K, value: A) => void
  remove: (key: K) => void
  key: (key: K) => ItemActions | null
  find: (predicate: (item: A, key: K) => boolean) => ItemActions | null
}

type RecordWithKeyExtractorActions<
  K extends string | symbol,
  A,
  ItemActions extends AnyStateActions,
> = BasicActions<ReadonlyRecord<K, A>> & {
  insert: (value: A) => void
  remove: (key: K) => void
  key: (key: K) => ItemActions | null
  find: (predicate: (item: A, key: K) => boolean) => ItemActions | null
}

export const Record: {
  <K extends string | symbol, A, ItemActions extends AnyStateActions>(
    field: StateMachineWithoutInitialState<A, ItemActions>,
    options: { getKey: (item: A) => K },
  ): StateMachine<
    ReadonlyRecord<K, A>,
    RecordWithKeyExtractorActions<K, A, ItemActions>
  >
  <K extends string | symbol, A, ItemActions extends AnyStateActions>(
    field: StateMachineWithoutInitialState<A, ItemActions>,
  ): StateMachine<ReadonlyRecord<K, A>, RecordActions<K, A, ItemActions>>
} & {
  keyType: <K extends string | symbol>() => <
    A,
    ItemActions extends AnyStateActions,
  >(
    field: StateMachineWithoutInitialState<A, ItemActions>,
  ) => StateMachine<ReadonlyRecord<K, A>, RecordActions<K, A, ItemActions>>
} = <K extends string | symbol, A, ItemActions extends AnyStateActions>(
  field: StateMachineWithoutInitialState<A, ItemActions>,
  options?: { getKey?: (item: A) => K },
): StateMachine<
  ReadonlyRecord<K, A>,
  RecordActions<K, A, ItemActions> &
    RecordWithKeyExtractorActions<K, A, ItemActions>
> =>
  type<ReadonlyRecord<K, A>>().make({
    initialState: {} as ReadonlyRecord<K, A>,
    actions: ({ Store }) => ({
      ...makeBasicActions({ Store }),
      ...((options?.getKey
        ? {
            insert: (value: A) =>
              Store.update(_ => ({ ..._, [options.getKey!(value)]: value })),
          }
        : {
            insert: (key: K, value: A) =>
              Store.update(_ => ({ ..._, [key]: value })),
          }) as { insert: (key: K, value: A) => void } & {
        insert: (value: A) => void
      }),
      remove: (key: K) =>
        Store.update(_ => Record_.remove(_, key) as ReadonlyRecord<K, A>),
      key: (key: K) => {
        const state = Store.get()
        if (!(key in state)) return null
        return field.actions({
          Store: makeStore<A>({
            get: () => state[key],
            update: f => Store.update(_ => ({ ..._, [key]: f(state[key]) })),
          }),
        })
      },
      find: (predicate: (item: A, key: K) => boolean) => {
        const state = Store.get()
        const key = (Object.keys(state) as K[]).find(k =>
          predicate(state[k], k),
        )
        if (key === undefined) return null
        return field.actions({
          Store: makeStore<A>({
            get: () => state[key],
            update: f => Store.update(_ => ({ ..._, [key]: f(state[key]) })),
          }),
        })
      },
    }),
  })

Record.keyType =
  <K extends string | symbol>() =>
  <A, ItemActions extends AnyStateActions>(
    field: StateMachineWithoutInitialState<A, ItemActions>,
  ) =>
    Record<K, A, ItemActions>(field)
