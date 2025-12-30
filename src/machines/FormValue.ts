import { make } from '../definition'

export type FormValue<A, E> = { value: A; error: E | null }

export const FormValue = <A, E>(initialValue: A) =>
  make<FormValue<A, E>>()({
    initialState: { value: initialValue, error: null },
    actions: ({ Store }) => ({
      update: (f: (previous: A) => A) =>
        Store.update(_ => ({ value: f(_.value), error: null })),
      set: (value: A) => Store.update(() => ({ value, error: null })),
      error: {
        set: (error: E | null) =>
          Store.update(_ => ({ value: _.value, error })),
      },
    }),
  })
