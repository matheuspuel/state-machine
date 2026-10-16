import { Array as Array_, Effect, Option, pipe, Record, Result } from 'effect'
import {
  type AnyStateActions,
  makeStore,
  StateMachine,
  type Store,
  type,
} from '../../definition.js'
import { Struct as StateMachineStruct } from '../basic.js'
import { ValidationError } from './Error.js'

export type FormActions<A, _I, E> = {
  validate: () => Effect.Effect<A, ValidationError<E>>
  setStateFromData: (data: A) => void
}

export class Form<
  A,
  I,
  E,
  // oxlint-disable-next-line typescript/no-empty-object-type
  ExtraActions extends AnyStateActions = {},
> extends StateMachine<I, FormActions<A, I, E> & ExtraActions> {
  // Type-only marker so A, E and ExtraActions can be inferred exactly
  declare readonly _types: { A: A; E: E; ExtraActions: ExtraActions }

  mapActions<A2, NextActions extends AnyStateActions>(
    f: (
      actions: FormActions<A, I, E> & ExtraActions,
      machine: { Store: Store<I> },
    ) => FormActions<A2, I, E> & NextActions,
  ): Form<A2, I, E, NextActions> {
    return new Form<A2, I, E, NextActions>({
      ...this,
      actions: machine => f(this.actions(machine), machine),
    })
  }

  mapData: {
    <A2 extends A>(to: (value: NoInfer<A>) => A2): Form<A2, I, E, ExtraActions>
    <A2>(args: {
      to: (value: NoInfer<A>) => A2
      from: (data: A2) => NoInfer<A>
    }): Form<A2, I, E, ExtraActions>
  } = <A2>(
    args:
      | ((value: NoInfer<A>) => A2)
      | {
          to: (value: NoInfer<A>) => A2
          from: (data: A2) => NoInfer<A>
        },
  ): Form<A2, I, any, ExtraActions> => {
    let to
    let from
    if (typeof args === 'function') {
      to = args
      from = (data: A2) => data as unknown as A
    } else if ('to' in args) {
      to = args.to
      from = args.from
    } else {
      throw new Error('Invalid arguments')
    }
    return this.mapActions(actions => {
      const validate = (): Effect.Effect<A2, ValidationError<E>> =>
        Effect.map(actions.validate(), to)
      return {
        ...actions,
        validate,
        check: () => validate().pipe(Effect.result, Effect.runPromise),
        setStateFromData: (data: A2) => actions.setStateFromData(from(data)),
      }
    })
  }
}

export const make = <
  A,
  I,
  E,
  // oxlint-disable-next-line typescript/no-empty-object-type
  ExtraActions extends AnyStateActions = {},
>(
  machine: StateMachine<I, FormActions<A, I, E> & ExtraActions>,
): Form<A, I, E, ExtraActions> => new Form(machine)

export const Struct = <Fields extends Record<string, Form<any, any, any, any>>>(
  fields: Fields,
): Form<
  {
    [K in keyof Fields]: Fields[K] extends Form<any, any, any, any>
      ? Fields[K]['_types']['A']
      : never
  },
  {
    [K in keyof Fields]: Fields[K] extends Form<any, infer I, any, any>
      ? I
      : never
  },
  {
    [K in keyof Fields]: Fields[K] extends Form<any, any, any, any>
      ? Fields[K]['_types']['E']
      : never
  }[keyof Fields],
  {
    [K in keyof Fields]: Fields[K] extends Form<any, any, any, any>
      ? Fields[K]['_types']['ExtraActions']
      : never
  }
> =>
  make(
    StateMachineStruct<Fields>(fields).mapActions(actions => ({
      ...actions,
      setStateFromData: data => {
        Object.keys(fields).map(key =>
          (actions[key]!.setStateFromData as any)?.(data[key]),
        )
      },
      validate: () =>
        Effect.all(
          Record.map(fields, (_, key) =>
            (
              actions[key]!.validate as () => Effect.Effect<
                any,
                ValidationError<any>
              >
            )?.().pipe(Effect.mapError(_ => _.error)),
          ),
          { mode: 'result' },
        ).pipe(
          Effect.flatMap(results =>
            Result.all(results).pipe(
              Effect.fromResult,
              Effect.mapError(() => Record.map(results, Result.getSuccess)),
            ),
          ),
          Effect.mapError(error => new ValidationError({ error })),
        ),
    })) as any,
  )

export const TaggedUnion = <
  TagKey extends string,
  Variants extends Record<string, Form<any, any, any, any>>,
>(
  tagKey: TagKey,
  variants: Variants,
): Form<
  {
    [K in keyof Variants]: Variants[K] extends Form<any, any, any, any>
      ? Variants[K]['_types']['A'] & { [TK in TagKey]: K }
      : never
  }[keyof Variants],
  {
    [K in keyof Variants]: Variants[K] extends Form<any, infer I, any, any>
      ? I
      : never
  } & { [K in TagKey]: { value: keyof Variants; error: null } },
  {
    [K in keyof Variants]: Variants[K] extends Form<any, any, any, any>
      ? Variants[K]['_types']['E']
      : never
  }[keyof Variants],
  {
    [K in keyof Variants]: Variants[K] extends Form<any, any, any, any>
      ? Variants[K]['_types']['ExtraActions']
      : never
  } & {
    [K in TagKey]: {
      set: (tag: keyof Variants) => void
      validate: () => Effect.Effect<keyof Variants, ValidationError<never>>
      check: () => Promise<
        Result.Result<keyof Variants, ValidationError<never>>
      >
    }
  }
> => {
  const variantKeys = Object.keys(variants) as (keyof Variants)[]
  const initialTag = variantKeys[0]!

  type InternalState = {
    [K in TagKey]: { value: keyof Variants; error: null }
  } & {
    [K in keyof Variants]: Variants[K] extends Form<any, any, any, any>
      ? Variants[K]['_types']['A']
      : never
  }

  return make(
    type<InternalState>()
      .make({
        initialState: {
          [tagKey]: { value: initialTag, error: null },
          ...Object.fromEntries(
            variantKeys.map(key => [key, variants[key]!.initialState]),
          ),
        } as InternalState,
        actions: ({ Store }) => {
          const variantActions = Object.fromEntries(
            variantKeys.map(key => {
              const machine = variants[key]!
              const machineActions = machine.actions({
                Store: makeStore({
                  get: () => Store.get()[key],
                  update: (f: any) =>
                    Store.update(state => ({
                      ...state,
                      [key]: f(state[key]),
                    })),
                }),
              })
              return [key, machineActions]
            }),
          ) as { [k in keyof Variants]: any }

          return {
            ...variantActions,
            [tagKey]: {
              set: (tag: keyof Variants) =>
                Store.update(_ => ({
                  ..._,
                  [tagKey]: { value: tag, error: null },
                })),
              validate: () => Effect.succeed(Store.get()[tagKey].value),
              check: () =>
                Effect.succeed(Store.get()[tagKey].value).pipe(
                  Effect.result,
                  Effect.runPromise,
                ),
            },
            validate: () => {
              const tag = Store.get()[tagKey].value
              const variantAction = variantActions[tag]
              return pipe(
                variantAction.validate(),
                Effect.map((result: any) => ({ ...result, [tagKey]: tag })),
              )
            },
            setStateFromData: (data: any) => {
              const tag = data[tagKey]
              Store.update(_ => ({
                ..._,
                [tagKey]: { value: tag, error: null },
              }))
              const variantAction = variantActions[tag]
              variantAction.setStateFromData(data)
            },
          }
        },
      })
      .mapActions(actions => {
        const flatActions = Object.fromEntries(
          variantKeys.map(key => [key, actions[key as keyof typeof actions]]),
        )
        return {
          ...flatActions,
          [tagKey]: actions[tagKey as keyof typeof actions],
          validate: actions.validate,
          setStateFromData: actions.setStateFromData,
        } as any
      }) as any,
  )
}

export const Array = <Item extends Form<any, any, any, any>>(
  item: Item,
): Form<
  Item extends Form<any, any, any, any>
    ? ReadonlyArray<Item['_types']['A']>
    : never,
  Item extends Form<any, infer I, any, any> ? ReadonlyArray<I> : never,
  Item extends Form<any, any, any, any> ? Item['_types']['E'] : never,
  {
    addItem: () => void
    removeItem: (index: number) => void
    index: (
      index: number,
    ) => Item extends Form<any, any, any, any>
      ? Item['_types']['ExtraActions']
      : never
  }
> => {
  type ItemState = Item extends Form<any, infer I, any, any> ? I : never
  type ItemActions =
    Item extends Form<any, any, any, any>
      ? Item['_types']['ExtraActions']
      : never
  return make(
    type<ReadonlyArray<ItemState>>().make({
      initialState: [],
      actions: ({ Store }) => {
        const getItemActions = (index: number): ItemActions =>
          item.actions({
            Store: makeStore({
              get: () => Store.get()[index]!,
              update: f =>
                Store.update(state =>
                  Array_.modify(state, index, f).pipe(
                    Option.getOrElse(() => state),
                  ),
                ),
            }),
          })
        return {
          addItem: () =>
            Store.update(state => [...state, item.initialState as ItemState]),
          removeItem: (index: number) =>
            Store.update(state => state.filter((_, i) => i !== index)),
          index: (index: number) => getItemActions(index),
          validate: () =>
            Effect.all(
              Store.get().map((_, index) => {
                const actions = getItemActions(index) as any
                return actions
                  .validate()
                  .pipe(Effect.mapError((_: any) => _.error))
              }),
              { mode: 'result' },
            ).pipe(
              Effect.flatMap(results =>
                Result.all(results).pipe(
                  Effect.fromResult,
                  Effect.mapError(() => Array_.map(results, Result.getSuccess)),
                ),
              ),
              Effect.mapError(error => new ValidationError({ error })),
            ),
          setStateFromData: (data: any[]) => {
            Store.update(() => data.map(() => item.initialState as ItemState))
            data.forEach((itemData, index) => {
              const actions = getItemActions(index) as any
              actions.setStateFromData(itemData)
            })
          },
        }
      },
    }) as any,
  )
}
