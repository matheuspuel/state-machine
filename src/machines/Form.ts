import {
  Data,
  Effect,
  Either,
  flow,
  Option,
  pipe,
  Record,
  Schema,
} from 'effect'
import { ParseError } from 'effect/ParseResult'
import {
  AnyStateMachineWithActions,
  make,
  mapActions,
  StateMachine,
} from '../definition.js'
import { Struct as StateMachineStruct } from '../machines/Struct.js'

export class ValidationError<E> extends Data.TaggedError(
  'FormValidationError',
)<{
  error: E
}> {}

export type FormField<A, I, E> = StateMachine<
  { value: I; error: E | null },
  {
    set: (value: I) => void
    update: (f: (previous: I) => I) => void
    error: { set: (error: E | null) => void }
    validate: () => Effect.Effect<A, ValidationError<E>>
    check: () => Promise<Either.Either<A, ValidationError<E>>>
    setStateFromData: (data: A) => void
  }
>

export type AnyFormField = FormField<any, any, any>

export const makeField = <A, I, E>(args: {
  initial: I
  validate: (value: I) => Effect.Effect<A, E>
  fromData: (data: A) => I
}): FormField<A, I, E> =>
  make<{ value: I; error: E | null }>()({
    initialState: { value: args.initial, error: null },
    actions: ({ Store }) => {
      const validate = () =>
        pipe(
          Store.get().value,
          args.validate,
          Effect.tap(() =>
            Effect.sync(() =>
              Store.update(_ => ({ value: _.value, error: null })),
            ),
          ),
          Effect.tapError(error =>
            Effect.sync(() => Store.update(_ => ({ value: _.value, error }))),
          ),
          Effect.mapError(error => new ValidationError({ error })),
        )
      return {
        set: value => Store.update(() => ({ value, error: null })),
        update: f => Store.update(_ => ({ value: f(_.value), error: null })),
        error: { set: error => Store.update(_ => ({ value: _.value, error })) },
        validate,
        check: () => validate().pipe(Effect.either, Effect.runPromise),
        setStateFromData: data =>
          Store.update(_ => ({
            ..._,
            value: args.fromData(data),
            error: null,
          })),
      }
    },
  })

export const field = <A>(initial: A): FormField<A, A, never> =>
  makeField<A, A, never>({
    initial: initial,
    validate: _ => Effect.succeed(_),
    fromData: _ => _,
  })

export const fieldWithError =
  <E>() =>
  <A, I, E1>(self: FormField<A, I, E1>): FormField<A, I, E | E1> =>
    self as FormField<A, I, E | E1>

export const transformField = <A, A1, I, E, E1>(
  self: FormField<A1, I, E1>,
  args: {
    validate: (value: NoInfer<A1>) => Effect.Effect<A, E>
    fromData: (data: A) => NoInfer<A1>
  },
): FormField<A, I, E | E1> =>
  mapActions(fieldWithError<E>()(self), (actions, { Store }) => {
    const validate = (): Effect.Effect<A, ValidationError<E | E1>, never> =>
      actions.validate().pipe(
        Effect.flatMap(
          flow(
            args.validate,
            Effect.tap(() =>
              Effect.sync(() =>
                Store.update(_ => ({ value: _.value, error: null })),
              ),
            ),
            Effect.tapError(error =>
              Effect.sync(() => Store.update(_ => ({ value: _.value, error }))),
            ),
            Effect.mapError(error => new ValidationError({ error })),
          ),
        ),
      )
    return {
      ...actions,
      validate,
      check: () => validate().pipe(Effect.either, Effect.runPromise),
      setStateFromData: data => actions.setStateFromData(args.fromData(data)),
    }
  })

export const transformFieldSchema = <A, A1, I, E1>(
  self: FormField<A1, I, E1>,
  schema: Schema.Schema<A, A1>,
): FormField<A, I, E1 | ParseError> =>
  transformField(self, {
    validate: Schema.decode(schema),
    fromData: Schema.encodeSync(schema),
  })

export const validateField = <A1, A extends A1, I, E, E1>(
  self: FormField<A1, I, E1>,
  validate: (value: NoInfer<A1>) => Effect.Effect<A, E>,
): FormField<A, I, E | E1> =>
  transformField(self, { validate, fromData: _ => _ })

export const Struct = <
  Fields extends Record<
    string,
    AnyStateMachineWithActions<{
      setStateFromData: (data: any) => void
      validate: () => Effect.Effect<any, ValidationError<any>>
    }>
  >,
>(
  fields: Fields,
): StateMachine<
  {
    [K in keyof Fields]: Fields[K] extends StateMachine<
      infer State,
      infer Actions
    >
      ? State
      : never
  },
  {
    [K in keyof Fields]: Fields[K] extends StateMachine<
      infer State,
      infer Actions
    >
      ? Actions
      : never
  } & {
    validate: () => Effect.Effect<
      {
        [K in keyof Fields]: Fields[K] extends StateMachine<
          infer State,
          {
            validate: () => Effect.Effect<infer A, ValidationError<infer E>>
          }
        >
          ? A
          : never
      },
      ValidationError<{
        [K in keyof Fields]: Fields[K] extends StateMachine<
          infer State,
          {
            validate: () => Effect.Effect<infer A, ValidationError<infer E>>
          }
        >
          ? Option.Option<E>
          : never
      }>
    >
    setStateFromData: (data: {
      [K in keyof Fields]: Fields[K] extends StateMachine<
        infer State,
        { setStateFromData: (data: infer A) => void }
      >
        ? A
        : never
    }) => void
  }
> =>
  mapActions(StateMachineStruct<Fields>(fields), actions => ({
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
  Variants extends Record<
    string,
    AnyStateMachineWithActions<{
      setStateFromData: (data: any) => void
      validate: () => Effect.Effect<any, ValidationError<any>>
    }>
  >,
>(
  tagKey: TagKey,
  variants: Variants,
): StateMachine<
  {
    [K in keyof Variants]: Variants[K] extends StateMachine<
      infer State,
      infer Actions
    >
      ? State
      : never
  } & {
    [K in TagKey]: { value: keyof Variants; error: null }
  },
  {
    [K in keyof Variants]: Variants[K] extends StateMachine<
      infer State,
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
  } & {
    validate: () => Effect.Effect<
      {
        [K in keyof Variants]: Variants[K] extends StateMachine<
          infer State,
          {
            validate: () => Effect.Effect<infer A, ValidationError<infer E>>
          }
        >
          ? A & { [TK in TagKey]: K }
          : never
      }[keyof Variants],
      ValidationError<any>
    >
    setStateFromData: (
      data: {
        [K in keyof Variants]: Variants[K] extends StateMachine<
          infer State,
          { setStateFromData: (data: infer A) => void }
        >
          ? A & { [TK in TagKey]: K }
          : never
      }[keyof Variants],
    ) => void
  }
> => {
  const variantKeys = Object.keys(variants) as (keyof Variants)[]
  const initialTag = variantKeys[0]!

  type InternalState = {
    [K in TagKey]: { value: keyof Variants; error: null }
  } & {
    [K in keyof Variants]: Variants[K] extends StateMachine<
      infer State,
      infer Actions
    >
      ? State
      : never
  }

  return mapActions(
    make<InternalState>()({
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
              Store: {
                get: () => Store.get()[key],
                update: (f: any) =>
                  Store.update(state => ({
                    ...state,
                    [key]: f(state[key]),
                  })),
              },
            })
            return [key, machineActions]
          }),
        )

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
            const variantAction = variantActions[tag] as any
            variantAction.setStateFromData(data)
          },
        }
      },
    }),
    actions => {
      const flatActions = Object.fromEntries(
        variantKeys.map(key => [key, actions[key as keyof typeof actions]]),
      )
      return {
        ...flatActions,
        [tagKey]: actions[tagKey as keyof typeof actions],
        validate: actions.validate,
        setStateFromData: actions.setStateFromData,
      } as any
    },
  ) as any
}

export const Array = <
  Item extends AnyStateMachineWithActions<{
    setStateFromData: (data: any) => void
    validate: () => Effect.Effect<any, ValidationError<any>>
  }>,
>(
  item: Item,
): StateMachine<
  Item extends StateMachine<infer State, infer Actions>
    ? ReadonlyArray<State>
    : never,
  {
    addItem: () => void
    removeItem: (index: number) => void
    index: (
      index: number,
    ) => Item extends StateMachine<infer State, infer Actions> ? Actions : never
    validate: () => Effect.Effect<
      Item extends StateMachine<
        infer State,
        { validate: () => Effect.Effect<infer A, ValidationError<infer E>> }
      >
        ? ReadonlyArray<A>
        : never,
      ValidationError<any>
    >
    setStateFromData: (
      data: Item extends StateMachine<
        infer State,
        { setStateFromData: (data: infer A) => void }
      >
        ? ReadonlyArray<A>
        : never,
    ) => void
  }
> => {
  type ItemState =
    Item extends StateMachine<infer State, infer Actions> ? State : never
  type ItemActions =
    Item extends StateMachine<infer State, infer Actions> ? Actions : never
  return make<ReadonlyArray<ItemState>>()({
    initialState: [],
    actions: ({ Store }) => {
      const getItemActions = (index: number): ItemActions =>
        item.actions({
          Store: {
            get: () => Store.get()[index]!,
            update: (f: any) =>
              Store.update(state => {
                const newState = [...state]
                newState[index] = f(state[index])
                return newState
              }),
          },
        }) as any
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

export const String = field('')

export const NonEmptyString = transformField(String, {
  validate: _ => Schema.decodeOption(Schema.NonEmptyString)(_),
  fromData: _ => _,
})

export const TrimNonEmptyString = transformField(String, {
  validate: _ =>
    Schema.decodeOption(Schema.compose(Schema.Trim, Schema.NonEmptyString))(_),
  fromData: _ => _,
})
