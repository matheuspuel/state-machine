/* eslint-disable @typescript-eslint/no-unused-vars */

import { Effect, Either, flow, Option, pipe, Schema } from 'effect'
import { NoSuchElementException } from 'effect/Cause'
import { ParseError } from 'effect/ParseResult'
import * as StateMachine from '../../../definition.js'
import { ValidationError } from '../Error.js'

type FormFieldBase<A, I, E> = StateMachine.StateMachine<
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

export type FormField<A, I, E> = FormFieldBase<A, I, E> & {
  withError: <E2>() => FormField<A, I, E2 | E>
  parse: {
    <A2 extends A, E2>(
      to: (value: NoInfer<A>) => Effect.Effect<A2, E2>,
    ): FormField<A2, I, E2 | E>
    <A2, E2>(args: {
      to: (value: NoInfer<A>) => Effect.Effect<A2, E2>
      from: (data: A2) => NoInfer<A>
    }): FormField<A2, I, E2 | E>
  }
  transform: {
    <A2 extends A>(to: (value: NoInfer<A>) => A2): FormField<A2, I, E>
    <A2>(args: {
      to: (value: NoInfer<A>) => A2
      from: (data: A2) => NoInfer<A>
    }): FormField<A2, I, E>
    <A2>(schema: Schema.Schema<A2, A>): FormField<A2, I, E | ParseError>
    <A2, E2>(
      schema: Schema.Schema<A2, A>,
      makeError: (error: ParseError) => E2,
    ): FormField<A2, I, E | E2>
  }
  filter: <E2>(
    predicate: (value: A) => boolean,
    onFail: (value: A) => E2,
  ) => FormField<A, I, E | E2>
  required: () => FormField<NonNullable<A>, I, E | NoSuchElementException>
}

export type AnyFormField = FormField<any, any, any>

const addExtraProperties = <A, I, E>(
  self: FormFieldBase<A, I, E>,
): FormField<A, I, E> => {
  const withError = <E2>(): FormField<A, I, E2 | E> =>
    self as FormField<A, I, E2 | E>

  const parse: FormField<A, I, E>['parse'] = <A2, E2>(
    args:
      | ((value: NoInfer<A>) => Effect.Effect<A2, E2>)
      | {
          to: (value: NoInfer<A>) => Effect.Effect<A2, E2>
          from: (data: A2) => NoInfer<A>
        },
  ): FormField<A2, I, E2 | E> => {
    const to = typeof args === 'function' ? args : args.to
    const from =
      typeof args === 'function' ? (_: A2) => _ as unknown as A : args.from
    return addExtraProperties<A2, I, E2 | E>(
      StateMachine.mapActions(withError<E2>(), (actions, { Store }) => {
        const validate = (): Effect.Effect<
          A2,
          ValidationError<E2 | E>,
          never
        > =>
          actions.validate().pipe(
            Effect.flatMap(
              flow(
                to,
                Effect.tap(() =>
                  Effect.sync(() =>
                    Store.update(_ => ({ value: _.value, error: null })),
                  ),
                ),
                Effect.tapError(error =>
                  Effect.sync(() =>
                    Store.update(_ => ({ value: _.value, error })),
                  ),
                ),
                Effect.mapError(error => new ValidationError({ error })),
              ),
            ),
          )
        return {
          ...actions,
          validate,
          check: () => validate().pipe(Effect.either, Effect.runPromise),
          setStateFromData: data => actions.setStateFromData(from(data)),
        }
      }),
    )
  }

  const transform: FormField<A, I, E>['transform'] = <A2, E2>(
    args:
      | ((value: NoInfer<A>) => A2)
      | {
          to: (value: NoInfer<A>) => A2
          from: (data: A2) => NoInfer<A>
        }
      | Schema.Schema<A2, A>,
    makeError?: (error: ParseError) => E2,
  ): FormField<A2, I, any> => {
    if (Schema.isSchema(args)) {
      const schema = args as Schema.Schema<A2, A>
      return parse({
        to: value =>
          Effect.mapError(Schema.decode(schema)(value), parseError =>
            (makeError ?? (_ => _))(parseError),
          ),
        from: Schema.encodeSync(schema),
      })
    } else if (typeof args === 'function') {
      const to = args
      return parse({
        to: _ => Effect.succeed(to(_)),
        from: (_: A2) => _ as unknown as A,
      })
    } else if ('to' in args) {
      const { to, from } = args
      return parse({
        to: _ => Effect.succeed(to(_)),
        from: from,
      })
    } else {
      throw new Error('Invalid arguments')
    }
  }

  const filter: FormField<A, I, E>['filter'] = (predicate, onFail) =>
    parse(value =>
      predicate(value) ? Effect.succeed(value) : Effect.fail(onFail(value)),
    )

  return {
    ...self,
    withError,
    parse,
    transform,
    filter,
    required: () => parse(Option.fromNullable),
  }
}

export const make = <A, I, E>(args: {
  initial: I
  validate: (value: I) => Effect.Effect<A, E>
  fromData: (data: A) => I
}): FormField<A, I, E> =>
  addExtraProperties(
    StateMachine.withState<{ value: I; error: E | null }>().make({
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
          error: {
            set: error => Store.update(_ => ({ value: _.value, error })),
          },
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
    }),
  )

export const of = <A>(initial: A): FormField<A, A, never> =>
  make<A, A, never>({
    initial: initial,
    validate: _ => Effect.succeed(_),
    fromData: _ => _,
  })

export const nullOr = <A>(initial?: A | null) => of<A | null>(initial ?? null)

// eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents
export const undefinedOr = <A>(initial?: A | undefined) =>
  of<A | undefined>(initial)

export const String = of('')

export const TrimString = String.transform(_ => _.trim())

export const TrimStringOrNull = TrimString.transform({
  to: _ => _ || null,
  from: _ => _ ?? '',
})

export const TrimStringOrUndefined = TrimString.transform({
  to: _ => _ || undefined,
  from: _ => _ ?? '',
})

export const NonEmptyString = String.parse({
  to: _ => Schema.decodeOption(Schema.NonEmptyString)(_),
  from: _ => _,
})

export const TrimNonEmptyString = String.parse({
  to: _ =>
    Schema.decodeOption(Schema.compose(Schema.Trim, Schema.NonEmptyString))(_),
  from: _ => _,
})
