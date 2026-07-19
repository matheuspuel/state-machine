/* eslint-disable @typescript-eslint/no-unused-vars */

import { Effect, Either, flow, Option, pipe, Schema } from 'effect'
import { NoSuchElementException } from 'effect/Cause'
import { ParseError } from 'effect/ParseResult'
import { AnyStateActions, Store } from '../../../definition.js'
import { ValidationError } from '../Error.js'
import { Form, FormActions } from '../definition.js'

type FormFieldState<A, I, E> = { value: I; error: E | null }

type FormFieldBasicActions<A, I, E> = FormActions<A, I, E> & {
  set: (value: I) => void
  update: (f: (previous: I) => I) => void
  error: { set: (error: E | null) => void }
  check: () => Promise<Either.Either<A, ValidationError<E>>>
}

export class FormField<
  A,
  I,
  E,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  ExtraActions extends AnyStateActions = {},
> extends Form<
  A,
  FormFieldState<A, I, E>,
  E,
  FormFieldBasicActions<A, I, E> & ExtraActions
> {
  withError<E2>(): FormField<A, I, E2 | E> {
    return this as FormField<A, I, E2 | E>
  }

  mapActions<A2, NextActions extends AnyStateActions>(
    f: (
      actions: FormFieldBasicActions<A, I, E> & ExtraActions,
      machine: { Store: Store<FormFieldState<A2, I, E>> },
    ) => FormFieldBasicActions<A2, I, E> & NextActions,
  ): FormField<A2, I, E, NextActions> {
    return new FormField<A2, I, E, NextActions>({
      ...this,
      actions: (machine: any) => f(this.actions(machine), machine),
    } as any)
  }

  parse: {
    <A2 extends A, E2>(
      to: (value: NoInfer<A>) => Effect.Effect<A2, E2>,
    ): FormField<A2, I, E2 | E>
    <A2, E2>(args: {
      to: (value: NoInfer<A>) => Effect.Effect<A2, E2>
      from: (data: A2) => NoInfer<A>
    }): FormField<A2, I, E2 | E>
  } = <A2, E2>(
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
    return this.withError<E2>().mapActions((actions, { Store }) => {
      const validate = (): Effect.Effect<A2, ValidationError<E2 | E>, never> =>
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
    })
  }

  mapData: {
    <A2 extends A>(to: (value: NoInfer<A>) => A2): FormField<A2, I, E>
    <A2>(args: {
      to: (value: NoInfer<A>) => A2
      from: (data: A2) => NoInfer<A>
    }): FormField<A2, I, E>
  } = <A2>(
    args:
      | ((value: NoInfer<A>) => A2)
      | {
          to: (value: NoInfer<A>) => A2
          from: (data: A2) => NoInfer<A>
        },
  ): FormField<A2, I, any> => {
    if (typeof args === 'function') {
      const to = args
      return this.parse({
        to: _ => Effect.succeed(to(_)),
        from: (_: A2) => _ as unknown as A,
      })
    } else if ('to' in args) {
      const { to, from } = args
      return this.parse({
        to: _ => Effect.succeed(to(_)),
        from: from,
      })
    } else {
      throw new Error('Invalid arguments')
    }
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
  } = <A2, E2>(
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
      return this.parse({
        to: value =>
          Effect.mapError(Schema.decode(schema)(value), parseError =>
            (makeError ?? (_ => _))(parseError),
          ),
        from: Schema.encodeSync(schema),
      })
    } else if (typeof args === 'function') {
      const to = args
      return this.parse({
        to: _ => Effect.succeed(to(_)),
        from: (_: A2) => _ as unknown as A,
      })
    } else if ('to' in args) {
      const { to, from } = args
      return this.parse({
        to: _ => Effect.succeed(to(_)),
        from: from,
      })
    } else {
      throw new Error('Invalid arguments')
    }
  }

  filter: {
    <A2 extends A, E2>(
      refinement: (value: A) => value is A2,
      onFail: (value: A) => E2,
    ): FormField<A2, I, E | E2>
    <E2>(
      predicate: (value: A) => boolean,
      onFail: (value: A) => E2,
    ): FormField<A, I, E | E2>
  } = <A2 extends A, E2>(
    predicate: ((value: A) => value is A2) | ((value: A) => boolean),
    onFail: (value: A) => E2,
  ) =>
    this.parse(value =>
      predicate(value) ? Effect.succeed(value) : Effect.fail(onFail(value)),
    )

  required(): FormField<NonNullable<A>, I, E | NoSuchElementException> {
    return this.parse(Option.fromNullable)
  }
}

export type AnyFormField = FormField<any, any, any>

export const make = <A, I, E>(args: {
  initial: I
  validate: (value: I) => Effect.Effect<A, E>
  fromData: (data: A) => I
}): FormField<A, I, E> =>
  new FormField<A, I, E>({
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
  })

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
