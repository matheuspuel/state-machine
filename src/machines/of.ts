import { make } from '../definition.js'

export const of = <A>(initialState: A) =>
  make<A>()({
    initialState,
    actions: ({ Store }) => ({
      get: Store.get,
      update: (f: (previous: A) => A) => Store.update(f),
      set: (value: A) => Store.update(() => value),
    }),
  })
