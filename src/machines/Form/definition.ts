/* eslint-disable @typescript-eslint/no-unused-vars */

import { Array as Array_, Effect, Either, pipe, Record } from 'effect'
import {
  AnyStateActions,
  makeStore,
  StateMachine,
  Store,
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
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  ExtraActions extends AnyStateActions = {},
> extends StateMachine<I, FormActions<A, I, E> & ExtraActions> {
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
}

export const Struct = <Fields extends Record<string, Form<any, any, any, any>>>(
  fields: Fields,
): Form<
  {
    [K in keyof Fields]: Fields[K] extends Form<
      infer A,
      infer I,
      infer E,
      infer Actions
    >
      ? A
      : never
  },
  {
    [K in keyof Fields]: Fields[K] extends Form<
      infer A,
      infer I,
      infer E,
      infer Actions
    >
      ? I
      : never
  },
  {
    [K in keyof Fields]: Fields[K] extends Form<
      infer A,
      infer I,
      infer E,
      infer Actions
    >
      ? E
      : never
  }[keyof Fields],
  {
    [K in keyof Fields]: Fields[K] extends Form<
      infer A,
      infer I,
      infer E,
      infer Actions
    >
      ? Actions
      : never
  }
> =>
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
        { mode: 'validate' },
      ).pipe(Effect.mapError(error => new ValidationError({ error }))),
  })) as any

export const TaggedUnion = <
  TagKey extends string,
  Variants extends Record<string, Form<any, any, any, any>>,
>(
  tagKey: TagKey,
  variants: Variants,
): Form<
  {
    [K in keyof Variants]: Variants[K] extends Form<
      infer A,
      infer I,
      infer E,
      infer Actions
    >
      ? A & { [TK in TagKey]: K }
      : never
  }[keyof Variants],
  {
    [K in keyof Variants]: Variants[K] extends Form<
      infer A,
      infer I,
      infer E,
      infer Actions
    >
      ? I
      : never
  } & { [K in TagKey]: { value: keyof Variants; error: null } },
  {
    [K in keyof Variants]: Variants[K] extends Form<
      infer A,
      infer I,
      infer E,
      infer Actions
    >
      ? E
      : never
  }[keyof Variants],
  {
    [K in keyof Variants]: Variants[K] extends Form<
      infer A,
      infer I,
      infer E,
      infer Actions
    >
      ? Actions
      : never
  } & {
    [K in TagKey]: {
      set: (tag: keyof Variants) => void
      validate: () => Effect.Effect<keyof Variants, ValidationError<never>>
      check: () => Promise<
        Either.Either<keyof Variants, ValidationError<never>>
      >
    }
  }
> => {
  const variantKeys = Object.keys(variants) as (keyof Variants)[]
  const initialTag = variantKeys[0]!

  type InternalState = {
    [K in TagKey]: { value: keyof Variants; error: null }
  } & {
    [K in keyof Variants]: Variants[K] extends Form<
      infer A,
      infer I,
      infer E,
      infer Actions
    >
      ? A
      : never
  }

  return type<InternalState>()
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
                Effect.either,
                Effect.runPromise,
              ),
          },
          validate: () => {
            const tag = Store.get()[tagKey].value
            const variantAction = variantActions[tag] as any
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
    }) as any
}

export const Array = <Item extends Form<any, any, any, any>>(
  item: Item,
): Form<
  Item extends Form<infer A, infer I, infer E, infer Actions>
    ? ReadonlyArray<A>
    : never,
  Item extends Form<infer A, infer I, infer E, infer Actions>
    ? ReadonlyArray<I>
    : never,
  Item extends Form<infer A, infer I, infer E, infer Actions> ? E : never,
  {
    addItem: () => void
    removeItem: (index: number) => void
    index: (
      index: number,
    ) => Item extends Form<infer A, infer I, infer E, infer Actions>
      ? Actions
      : never
  }
> => {
  type ItemState =
    Item extends Form<infer A, infer I, infer E, infer Actions> ? I : never
  type ItemActions =
    Item extends Form<infer A, infer I, infer E, infer Actions>
      ? Actions
      : never
  return type<ReadonlyArray<ItemState>>().make({
    initialState: [],
    actions: ({ Store }) => {
      const getItemActions = (index: number): ItemActions =>
        item.actions({
          Store: makeStore({
            get: () => Store.get()[index]!,
            update: f => Store.update(state => Array_.modify(state, index, f)),
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
            { mode: 'validate' },
          ).pipe(Effect.mapError(error => new ValidationError({ error }))),
        setStateFromData: (data: any[]) => {
          Store.update(() => data.map(() => item.initialState as ItemState))
          data.forEach((itemData, index) => {
            const actions = getItemActions(index) as any
            actions.setStateFromData(itemData)
          })
        },
      }
    },
  }) as any
}
