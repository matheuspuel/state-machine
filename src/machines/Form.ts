import { Data, Effect, Either, Option, Record } from 'effect'
import { make, makeStore, Store } from '../definition.js'
import { AnyForm, FormField } from '../form/definition.js'

export type FormState<Form extends AnyForm> = {
  [K in keyof Form]: Form[K] extends FormField<infer A, infer I, infer E>
    ? { value: I; error: E | null }
    : Form[K] extends AnyForm
      ? FormState<Form[K]>
      : never
}

export type FormData<Form extends AnyForm> = {
  [K in keyof Form]: Form[K] extends FormField<infer A, infer I, infer E>
    ? A
    : Form[K] extends AnyForm
      ? FormData<Form[K]>
      : never
}

export type FormError<Form extends AnyForm> = {
  [K in keyof Form]: Form[K] extends FormField<infer A, infer I, infer E>
    ? Option.Option<E>
    : Form[K] extends AnyForm
      ? FormError<Form[K]>
      : never
}

export type FormActions<Form extends AnyForm> = {
  [K in keyof Form]: Form[K] extends FormField<infer A, infer I, infer E>
    ? {
        set: (value: I) => void
        update: (f: (previous: I) => I) => void
        validate: () => Promise<Either.Either<A, E | null>>
        error: { set: (error: E | null) => void }
      }
    : Form[K] extends AnyForm
      ? FormActions<Form[K]>
      : never
}

export class FormValidationError<Form extends AnyForm> extends Data.TaggedError(
  'FormValidationError',
)<{ errors: FormError<Form> }> {}

const isField = (
  value: AnyForm | FormField<any, any, any>,
): value is FormField<any, any, any> => typeof value.validate === 'function'

export const Form = <F extends AnyForm>(form: F) => {
  const getInitialState = <F extends AnyForm>(form: F): FormState<F> =>
    Record.map(form, _ =>
      isField(_) ? { value: _.initial, error: null } : getInitialState(_),
    ) as any
  const getActions = <F extends AnyForm>(
    form: F,
    Store: Store<FormState<F>>,
  ): FormActions<F> =>
    Record.map(form, (_, key) =>
      isField(_)
        ? {
            update: (f: (previous: any) => any) =>
              Store.update(_ => ({
                ..._,
                [key]: { value: f(_[key]!.value), error: null },
              })),
            validate: () =>
              Effect.gen(function* () {
                const result = yield* _.validate(Store.get()[key]!.value).pipe(
                  Effect.either,
                )
                const error = Option.getOrNull(Either.getLeft(result))
                Store.update(_ => ({
                  ..._,
                  [key]: { value: _[key]!.value, error },
                }))
                return result
              }).pipe(Effect.runPromise),
            set: (value: any) =>
              Store.update(_ => ({ ..._, [key]: { value, error: null } })),
            error: {
              set: (error: any) =>
                Store.update(_ => ({
                  ..._,
                  [key]: { value: _[key]!.value, error },
                })),
            },
          }
        : getActions(
            _,
            makeStore({
              get: () => Store.get()[key],
              update: f => Store.update(_ => ({ ..._, [key]: f(_[key]) })),
            }) as any,
          ),
    ) as any
  const validate = <F extends AnyForm>(
    form: F,
    Store: Store<FormState<F>>,
  ): Effect.Effect<FormData<F>, FormValidationError<F>> =>
    Effect.all(
      Record.map(form, (_, key) =>
        isField(_)
          ? _.validate(Store.get()[key]!.value).pipe(
              Effect.either,
              Effect.tap(e =>
                Store.update(_ => ({
                  ..._,
                  [key]: {
                    value: _[key]!.value,
                    error: Option.getOrNull(Either.getLeft(e)),
                  },
                })),
              ),
              Effect.flatten,
            )
          : validate(
              _,
              makeStore({
                get: () => Store.get()[key],
                update: f => Store.update(_ => ({ ..._, [key]: f(_[key]) })),
              }) as any,
            ).pipe(Effect.mapError(e => e.errors)),
      ),
      { mode: 'validate' },
    ).pipe(
      Effect.mapError(e => new FormValidationError({ errors: e as any })),
    ) as any
  return make<FormState<F>>()<
    FormActions<F> & {
      validate: () => Effect.Effect<FormData<F>, FormValidationError<F>>
      setStateFromData: (data: FormData<F>) => void
    }
  >({
    initialState: getInitialState(form),
    actions: ({ Store }) => ({
      ...getActions(form, Store),
      validate: () => validate(form, Store),
      setStateFromData: (data: FormData<F>) =>
        Store.update(() => {
          const updateState = <F extends AnyForm>(
            form: F,
            data: FormData<F>,
          ): any =>
            Record.map(form, (_, key) =>
              isField(_)
                ? { value: _.fromData(data[key]), error: null }
                : updateState(_, data[key]!),
            )
          return updateState(form, data)
        }),
    }),
  })
}
